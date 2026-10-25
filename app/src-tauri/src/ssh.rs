use russh::{client, keys::PublicKeyOrCertificate};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use zeroize::Zeroizing;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub auth_method: String,
    pub key_path: String,
    pub fingerprint: Option<String>,
    pub cols: u32,
    pub rows: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConnectError {
    Invalid { message: String },
    HostKey { fingerprint: String, changed: bool },
    Authentication,
    Network { message: String },
    Timeout,
}

pub struct VerifiedClient {
    expected: Option<String>,
    observed: Arc<Mutex<Option<String>>>,
}

impl client::Handler for VerifiedClient {
    type Error = russh::Error;
    async fn check_server_key(
        &mut self,
        key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let fingerprint = key
            .public_key()
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string();
        if let Ok(mut observed) = self.observed.lock() {
            *observed = Some(fingerprint.clone());
        }
        Ok(self.expected.as_deref() == Some(fingerprint.as_str()))
    }
}

pub fn validate(request: &ConnectRequest) -> Result<(), ConnectError> {
    if request.host.trim().is_empty()
        || request.host.len() > 253
        || request.host.chars().any(char::is_whitespace)
        || request.host.contains('\0')
        || request.username.trim().is_empty()
        || request.username.len() > 256
        || request.username.contains('\0')
        || request.port == 0
        || request.password.len() > 16384
    {
        return Err(ConnectError::Invalid {
            message: "호스트, 포트, 사용자 이름을 확인하세요.".into(),
        });
    }
    if !(1..=500).contains(&request.cols) || !(1..=300).contains(&request.rows) {
        return Err(ConnectError::Invalid {
            message: "터미널 크기가 허용 범위를 벗어났습니다.".into(),
        });
    }
    if !matches!(request.auth_method.as_str(), "password" | "key" | "agent")
        || (request.auth_method == "key" && !std::path::Path::new(&request.key_path).is_absolute())
    {
        return Err(ConnectError::Invalid {
            message: "인증 방식과 개인 키의 절대 경로를 확인하세요.".into(),
        });
    }
    Ok(())
}

pub async fn connect(
    mut request: ConnectRequest,
    bastion: Option<Arc<client::Handle<VerifiedClient>>>,
) -> Result<(client::Handle<VerifiedClient>, russh::Channel<client::Msg>), ConnectError> {
    let valid = validate(&request);
    let password = Zeroizing::new(std::mem::take(&mut request.password));
    valid?;
    let observed = Arc::new(Mutex::new(None));
    let handler = VerifiedClient {
        expected: request.fingerprint.clone(),
        observed: observed.clone(),
    };
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(20)),
        keepalive_max: 3,
        window_size: 256 * 1024,
        maximum_packet_size: 32 * 1024,
        ..Default::default()
    });
    let handshake = tokio::time::timeout(Duration::from_secs(15), async {
        match bastion {
            Some(parent) => {
                let tunnel = parent
                    .channel_open_direct_tcpip(
                        request.host.clone(),
                        u32::from(request.port),
                        "127.0.0.1",
                        0,
                    )
                    .await?;
                client::connect_stream(config, tunnel.into_stream(), handler).await
            }
            None => client::connect(config, (request.host.as_str(), request.port), handler).await,
        }
    })
    .await;
    let mut session = match handshake {
        Ok(Ok(session)) => session,
        Err(_) => return Err(ConnectError::Timeout),
        Ok(Err(error)) => {
            if let Some(fingerprint) = observed.lock().ok().and_then(|x| x.clone())
                && request.fingerprint.as_deref() != Some(&fingerprint)
            {
                return Err(ConnectError::HostKey {
                    fingerprint,
                    changed: request.fingerprint.is_some(),
                });
            }
            return Err(ConnectError::Network {
                message: error.to_string(),
            });
        }
    };
    let auth = tokio::time::timeout(Duration::from_secs(20), async {
        if request.auth_method == "agent" {
            use russh::keys::agent::{client::AgentClient, AgentIdentity};
            let mut agent = AgentClient::connect_env().await.map_err(|_| ConnectError::Invalid { message: "SSH Agent에 연결할 수 없습니다. SSH_AUTH_SOCK 설정을 확인하세요.".into() })?;
            let identities = agent.request_identities().await.map_err(|_| ConnectError::Invalid { message: "SSH Agent의 키 목록을 읽지 못했습니다.".into() })?;
            let algorithm = session.best_supported_rsa_hash().await.map_err(|_| ConnectError::Authentication)?.flatten();
            // Bounded attempts: never request or export private key material.
            for identity in identities.into_iter().take(6) {
                if let AgentIdentity::PublicKey { key, .. } = identity {
                    let result = session.authenticate_publickey_with(&request.username, key, algorithm, &mut agent).await.map_err(|_| ConnectError::Authentication)?;
                    if result.success() { return Ok(result); }
                }
            }
            return Err(ConnectError::Invalid { message: "SSH Agent의 키로 인증하지 못했습니다. ssh-add로 등록한 키와 서버 권한을 확인하세요.".into() });
        } else if request.auth_method == "key" {
            let key_path = request.key_path.clone();
            let key = tokio::task::spawn_blocking(move || {
                use std::io::Read;
                // Bound reads even if the selected file changes after opening.
                let file = std::fs::File::open(key_path).map_err(|_| ConnectError::Invalid {
                    message: "개인 키 파일을 열 수 없습니다.".into(),
                })?;
                if !file.metadata().map(|m| m.is_file()).unwrap_or(false) {
                    return Err(ConnectError::Invalid {
                        message: "일반 개인 키 파일을 선택하세요.".into(),
                    });
                }
                let mut bytes = Zeroizing::new(Vec::new());
                file.take(262145)
                    .read_to_end(&mut bytes)
                    .map_err(|_| ConnectError::Authentication)?;
                if bytes.len() > 262144 {
                    return Err(ConnectError::Invalid {
                        message: "키 파일 크기가 너무 큽니다.".into(),
                    });
                }
                let text = std::str::from_utf8(&bytes).map_err(|_| ConnectError::Authentication)?;
                russh::keys::decode_secret_key(
                    text,
                    if password.is_empty() {
                        None
                    } else {
                        Some(password.as_str())
                    },
                )
                .map_err(|_| ConnectError::Invalid {
                    message: "개인 키 형식 또는 키 암호를 확인하세요.".into(),
                })
            })
            .await
            .map_err(|_| ConnectError::Authentication)??;
            let algorithm = session
                .best_supported_rsa_hash()
                .await
                .map_err(|_| ConnectError::Authentication)?
                .flatten();
            session
                .authenticate_publickey(
                    &request.username,
                    russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key), algorithm),
                )
                .await
        } else {
            session
                .authenticate_password(&request.username, password.as_str())
                .await
        }
        .map_err(|_| ConnectError::Authentication)
    })
    .await
    .map_err(|_| ConnectError::Timeout)??;
    if !auth.success() {
        return Err(ConnectError::Authentication);
    }
    let channel = tokio::time::timeout(Duration::from_secs(10), async {
        let channel = session.channel_open_session().await?;
        channel
            .request_pty(
                true,
                "xterm-256color",
                request.cols,
                request.rows,
                0,
                0,
                &[],
            )
            .await?;
        channel.request_shell(true).await?;
        Ok::<_, russh::Error>(channel)
    })
    .await
    .map_err(|_| ConnectError::Timeout)?
    .map_err(|e| ConnectError::Network {
        message: e.to_string(),
    })?;
    Ok((session, channel))
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::{
        ChannelId, ChannelMsg, Pty,
        keys::{Algorithm, PrivateKey},
        server,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Echo {
        forwarding: bool,
        streaming: std::collections::HashSet<ChannelId>,
        allowed_key: russh::keys::PublicKey,
        auth_count: Arc<AtomicUsize>,
        dimensions: Arc<Mutex<(u32, u32)>>,
    }
    impl server::Handler for Echo {
        type Error = russh::Error;
        async fn channel_open_direct_tcpip(
            &mut self,
            channel: russh::Channel<server::Msg>,
            host: &str,
            port: u32,
            _origin: &str,
            _origin_port: u32,
            reply: server::ChannelOpenHandle,
            _session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            // Synthetic internal DNS exists only on this fixture Bastion.
            if !self.forwarding || host != "inside.fixture.test" {
                return Ok(());
            }
            let mut target = tokio::net::TcpStream::connect(("127.0.0.1", port as u16)).await?;
            self.streaming.insert(channel.id());
            reply.accept().await;
            tokio::spawn(async move {
                let _ =
                    tokio::io::copy_bidirectional(&mut channel.into_stream(), &mut target).await;
            });
            Ok(())
        }
        async fn auth_password(
            &mut self,
            user: &str,
            password: &str,
        ) -> Result<server::Auth, Self::Error> {
            self.auth_count.fetch_add(1, Ordering::SeqCst);
            Ok(if user == "fixture" && password == "synthetic-only" {
                server::Auth::Accept
            } else {
                server::Auth::reject()
            })
        }
        async fn auth_publickey(
            &mut self,
            user: &str,
            key: &russh::keys::PublicKey,
        ) -> Result<server::Auth, Self::Error> {
            self.auth_count.fetch_add(1, Ordering::SeqCst);
            Ok(if user == "fixture" && key == &self.allowed_key {
                server::Auth::Accept
            } else {
                server::Auth::reject()
            })
        }
        async fn channel_open_session(
            &mut self,
            _channel: russh::Channel<server::Msg>,
            reply: server::ChannelOpenHandle,
            _session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            reply.accept().await;
            Ok(())
        }
        async fn pty_request(
            &mut self,
            channel: ChannelId,
            _term: &str,
            cols: u32,
            rows: u32,
            _width: u32,
            _height: u32,
            _modes: &[(Pty, u32)],
            session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            *self.dimensions.lock().unwrap() = (cols, rows);
            session.channel_success(channel)?;
            Ok(())
        }
        async fn shell_request(
            &mut self,
            channel: ChannelId,
            session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            session.channel_success(channel)?;
            Ok(())
        }
        async fn data(
            &mut self,
            channel: ChannelId,
            data: &[u8],
            session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            if !self.streaming.contains(&channel) {
                session.data(channel, data.to_vec())?;
            }
            Ok(())
        }
        async fn window_change_request(
            &mut self,
            _channel: ChannelId,
            cols: u32,
            rows: u32,
            _width: u32,
            _height: u32,
            _session: &mut server::Session,
        ) -> Result<(), Self::Error> {
            *self.dimensions.lock().unwrap() = (cols, rows);
            Ok(())
        }
    }
    struct Fixture {
        client_key: PrivateKey,
        port: u16,
        fingerprint: String,
        auth: Arc<AtomicUsize>,
        dimensions: Arc<Mutex<(u32, u32)>>,
        task: tokio::task::JoinHandle<()>,
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            self.task.abort();
        }
    }
    async fn fixture() -> Fixture {
        fixture_forwarding(false).await
    }
    async fn fixture_forwarding(forwarding: bool) -> Fixture {
        let client_key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
        let allowed_key = client_key.public_key().clone();
        let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
        let fingerprint = key
            .public_key()
            .fingerprint(russh::keys::HashAlg::Sha256)
            .to_string();
        let config = Arc::new(server::Config {
            keys: vec![key],
            auth_rejection_time: Duration::from_millis(1),
            ..Default::default()
        });
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        let auth = Arc::new(AtomicUsize::new(0));
        let dimensions = Arc::new(Mutex::new((0, 0)));
        let count = auth.clone();
        let dims = dimensions.clone();
        let task = tokio::spawn(async move {
            let mut tasks = tokio::task::JoinSet::new();
            while let Ok((stream, _)) = listener.accept().await {
                let config = config.clone();
                let handler = Echo {
                    forwarding,
                    streaming: Default::default(),
                    allowed_key: allowed_key.clone(),
                    auth_count: count.clone(),
                    dimensions: dims.clone(),
                };
                tasks.spawn(async move {
                    if let Ok(session) = server::run_stream(config, stream, handler).await {
                        let _ = session.await;
                    }
                });
            }
        });
        Fixture {
            client_key,
            port,
            fingerprint,
            auth,
            dimensions,
            task,
        }
    }
    fn request(f: &Fixture) -> ConnectRequest {
        ConnectRequest {
            host: "127.0.0.1".into(),
            port: f.port,
            username: "fixture".into(),
            password: "synthetic-only".into(),
            auth_method: "password".into(),
            key_path: String::new(),
            fingerprint: Some(f.fingerprint.clone()),
            cols: 80,
            rows: 24,
        }
    }
    #[tokio::test]
    async fn unknown_host_key_rejected_before_password() {
        let f = fixture().await;
        let mut req = request(&f);
        req.fingerprint = None;
        assert!(matches!(
            connect(req, None).await,
            Err(ConnectError::HostKey { changed: false, .. })
        ));
        assert_eq!(f.auth.load(Ordering::SeqCst), 0);
    }
    #[tokio::test]
    async fn changed_host_key_rejected_before_password() {
        let f = fixture().await;
        let mut req = request(&f);
        req.fingerprint = Some("SHA256:wrong".into());
        assert!(matches!(
            connect(req, None).await,
            Err(ConnectError::HostKey { changed: true, .. })
        ));
        assert_eq!(f.auth.load(Ordering::SeqCst), 0);
    }
    #[tokio::test]
    async fn wrong_password_fails() {
        let f = fixture().await;
        let mut req = request(&f);
        req.password = "wrong".into();
        assert!(matches!(
            connect(req, None).await,
            Err(ConnectError::Authentication)
        ));
        assert_eq!(f.auth.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn authenticated_pty_echo_and_resize() {
        let f = fixture().await;
        let (session, mut channel) = connect(request(&f), None).await.unwrap();
        let payload = "hello 한글 🐚\r\n".as_bytes();
        channel.data(payload).await.unwrap();
        let received = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some(ChannelMsg::Data { data }) = channel.wait().await {
                    return data.to_vec();
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(received, payload);
        assert_eq!(*f.dimensions.lock().unwrap(), (80, 24));
        channel.window_change(120, 40, 0, 0).await.unwrap();
        tokio::time::timeout(Duration::from_secs(2), async {
            while *f.dimensions.lock().unwrap() != (120, 40) {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        session
            .disconnect(russh::Disconnect::ByApplication, "test finished", "en")
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn invalid_input_never_authenticates() {
        let f = fixture().await;
        let mut req = request(&f);
        req.host = "invalid host".into();
        assert!(matches!(
            connect(req, None).await,
            Err(ConnectError::Invalid { .. })
        ));
        assert_eq!(f.auth.load(Ordering::SeqCst), 0);
    }
    #[tokio::test]
    async fn encrypted_private_key_authentication() {
        let f = fixture().await;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("synthetic_key");
        let encrypted = f
            .client_key
            .encrypt(&mut rand::rng(), "synthetic-passphrase")
            .unwrap();
        encrypted
            .write_openssh_file(&path, russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let mut req = request(&f);
        req.auth_method = "key".into();
        req.key_path = path.to_string_lossy().into_owned();
        req.password = "synthetic-passphrase".into();
        let (session, _) = connect(req, None).await.unwrap();
        assert_eq!(f.auth.load(Ordering::SeqCst), 1);
        session
            .disconnect(russh::Disconnect::ByApplication, "test finished", "en")
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn wrong_key_passphrase_does_not_authenticate() {
        let f = fixture().await;
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("synthetic_key");
        f.client_key
            .encrypt(&mut rand::rng(), "correct")
            .unwrap()
            .write_openssh_file(&path, russh::keys::ssh_key::LineEnding::LF)
            .unwrap();
        let mut req = request(&f);
        req.auth_method = "key".into();
        req.key_path = path.to_string_lossy().into_owned();
        req.password = "wrong".into();
        assert!(matches!(
            connect(req, None).await,
            Err(ConnectError::Invalid { .. })
        ));
        assert_eq!(f.auth.load(Ordering::SeqCst), 0);
    }
    async fn assert_echo(channel: &mut russh::Channel<client::Msg>) {
        let payload = "through bastion / 내부 서버 ❄️".as_bytes();
        channel.data(payload).await.unwrap();
        let data = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match channel.wait().await {
                    Some(ChannelMsg::Data { data }) => break data.to_vec(),
                    None => panic!("tunnel closed"),
                    _ => {}
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(data, payload);
    }
    #[tokio::test]
    async fn bastion_tunnel_pty_nested_hop_and_independent_channels() {
        let bastion = fixture_forwarding(true).await;
        let target = fixture_forwarding(true).await;
        let deepest = fixture().await;
        let (parent, mut parent_terminal) = connect(request(&bastion), None).await.unwrap();
        let parent = Arc::new(parent);
        let mut req = request(&target);
        req.host = "inside.fixture.test".into();
        let (child, mut child_terminal) = connect(req, Some(parent.clone())).await.unwrap();
        assert_echo(&mut child_terminal).await;
        assert_echo(&mut parent_terminal).await;
        let child = Arc::new(child);
        let mut req = request(&deepest);
        req.host = "inside.fixture.test".into();
        let (last, mut last_terminal) = connect(req, Some(child.clone())).await.unwrap();
        assert_echo(&mut last_terminal).await;
        // SFTP opens a second channel on this same target transport; exercise multiplexing here.
        let mut second = child.channel_open_session().await.unwrap();
        assert_echo(&mut second).await;
        last.disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
        child
            .disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
        assert_echo(&mut parent_terminal).await;
        parent
            .disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn bastion_target_key_is_verified_before_target_password() {
        let bastion = fixture_forwarding(true).await;
        let target = fixture().await;
        let (parent, _) = connect(request(&bastion), None).await.unwrap();
        let parent = Arc::new(parent);
        for pin in [None, Some("SHA256:changed".into())] {
            let mut req = request(&target);
            req.host = "inside.fixture.test".into();
            req.fingerprint = pin.clone();
            assert!(
                matches!(connect(req,Some(parent.clone())).await,Err(ConnectError::HostKey{changed,..}) if changed==pin.is_some())
            );
            assert_eq!(target.auth.load(Ordering::SeqCst), 0);
        }
        let mut req = request(&target);
        req.host = "inside.fixture.test".into();
        req.password = "wrong".into();
        assert!(matches!(
            connect(req, Some(parent.clone())).await,
            Err(ConnectError::Authentication)
        ));
        assert_eq!(target.auth.load(Ordering::SeqCst), 1);
        parent
            .disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn denied_bastion_forwarding_never_falls_back_to_direct_tcp() {
        let bastion = fixture().await;
        let target = fixture().await;
        let (parent, mut terminal) = connect(request(&bastion), None).await.unwrap();
        let parent = Arc::new(parent);
        // A directly reachable target must still fail when the Bastion denies forwarding.
        assert!(matches!(
            connect(request(&target), Some(parent.clone())).await,
            Err(ConnectError::Network { .. })
        ));
        assert_eq!(target.auth.load(Ordering::SeqCst), 0);
        assert_echo(&mut terminal).await;
        parent
            .disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn closing_bastion_closes_child_transport() {
        let bastion = fixture_forwarding(true).await;
        let target = fixture().await;
        let (parent, _) = connect(request(&bastion), None).await.unwrap();
        let parent = Arc::new(parent);
        let mut req = request(&target);
        req.host = "inside.fixture.test".into();
        let (_child, mut terminal) = connect(req, Some(parent.clone())).await.unwrap();
        parent
            .disconnect(russh::Disconnect::ByApplication, "test", "en")
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            while terminal.wait().await.is_some() {}
        })
        .await
        .unwrap();
    }
    #[tokio::test]
    #[ignore = "Explicit real keepalive timeout fault injection"]
    async fn blackholed_tcp_is_detected_by_real_keepalives_and_new_connection_works() {
        let f = fixture().await;
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let proxy_port = listener.local_addr().unwrap().port();
        let upstream_port = f.port;
        let (stall, stalled) = tokio::sync::oneshot::channel::<()>();
        let proxy = tokio::spawn(async move {
            let (mut downstream, _) = listener.accept().await.unwrap();
            let mut upstream = tokio::net::TcpStream::connect(("127.0.0.1", upstream_port)).await.unwrap();
            tokio::select! {
                _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream) => {},
                _ = stalled => { std::future::pending::<()>().await; }
            }
        });
        let mut req = request(&f);req.port = proxy_port;
        let (handle, mut terminal) = connect(req, None).await.unwrap();
        terminal.data(&b"before-stall"[..]).await.unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {loop {if let Some(russh::ChannelMsg::Data {data})=terminal.wait().await {assert_eq!(&data[..],b"before-stall");break;}}}).await.unwrap();
        stall.send(()).unwrap();let start=std::time::Instant::now();
        let detected=tokio::time::timeout(Duration::from_secs(110),async {while terminal.wait().await.is_some() {}}).await;
        proxy.abort();let _=proxy.await;drop(handle);
        assert!(detected.is_ok(), "keepalive failed to detect blackholed TCP");
        assert!(start.elapsed()>=Duration::from_secs(10), "proxy unexpectedly closed instead of stalling");
        let (recovered, mut channel)=connect(request(&f),None).await.unwrap();
        channel.data(&b"after-recovery"[..]).await.unwrap();
        tokio::time::timeout(Duration::from_secs(5),async {loop {if let Some(russh::ChannelMsg::Data {data})=channel.wait().await {assert_eq!(&data[..],b"after-recovery");break;}}}).await.unwrap();
        recovered.disconnect(russh::Disconnect::ByApplication,"fixture complete","en").await.unwrap();
    }

}
