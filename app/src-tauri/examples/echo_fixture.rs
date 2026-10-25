//! Local synthetic SSH echo server. Does not execute shell commands.
use russh::{
    ChannelId, Pty,
    keys::{Algorithm, PrivateKey},
    server,
};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
struct Echo {
    channels: std::collections::HashMap<ChannelId, russh::Channel<server::Msg>>,
    streaming: std::collections::HashSet<ChannelId>,
    root: Option<String>,
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
        if host != "inside.fixture.test" || port == 0 || port > 65535 {
            return Ok(());
        }
        let mut target = tokio::net::TcpStream::connect(("127.0.0.1", port as u16)).await?;
        self.streaming.insert(channel.id());
        reply.accept().await;
        tokio::spawn(async move {
            let _ = tokio::io::copy_bidirectional(&mut channel.into_stream(), &mut target).await;
        });
        Ok(())
    }
    async fn auth_publickey(&mut self, user: &str, key: &russh::keys::PublicKey) -> Result<server::Auth, Self::Error> {
        let expected = std::env::var("HARBOR_AGENT_PUBLIC_KEY").ok().and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| russh::keys::PublicKey::from_openssh(&s).ok());
        Ok(if user == "fixture" && expected.as_ref().map(|k| k.key_data()) == Some(key.key_data()) { server::Auth::Accept } else { server::Auth::reject() })
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
    async fn channel_open_session(
        &mut self,
        channel: russh::Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
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
    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        name: &str,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        if name != "sftp" || self.root.is_none() {
            session.channel_failure(channel)?;
            return Ok(());
        }
        let stream = self.channels.remove(&channel).unwrap();
        self.streaming.insert(channel);
        session.channel_success(channel)?;
        let root = self.root.clone().unwrap();
        tokio::spawn(async move {
            use std::process::Stdio;
            let mut child = tokio::process::Command::new("/usr/libexec/sftp-server")
                .args(["-d", &root])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .spawn()
                .unwrap();
            let mut process =
                tokio::io::join(child.stdout.take().unwrap(), child.stdin.take().unwrap());
            let mut transport = stream.into_stream();
            let _ = tokio::io::copy_bidirectional(&mut process, &mut transport).await;
        });
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

#[tokio::main]
async fn main() {
    let key = PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).unwrap();
    let fingerprint = key.public_key().fingerprint(russh::keys::HashAlg::Sha256);
    let config = Arc::new(server::Config {
        keys: vec![key],
        auth_rejection_time: Duration::from_millis(1),
        ..Default::default()
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    println!(
        "PORT={} FINGERPRINT={fingerprint}",
        listener.local_addr().unwrap().port()
    );
    println!("Synthetic account: fixture / synthetic-only. Echo only, no shell execution.");
    let mut sessions = tokio::task::JoinSet::new();
    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let config = config.clone();
        sessions.spawn(async move {
            if let Ok(s) = server::run_stream(
                config,
                stream,
                Echo {
                    channels: Default::default(),
                    streaming: Default::default(),
                    root: std::env::var("HARBOR_FIXTURE_ROOT").ok(),
                    auth_count: Arc::new(AtomicUsize::new(0)),
                    dimensions: Arc::new(Mutex::new((0, 0))),
                },
            )
            .await
            {
                let _ = s.await;
            }
        });
    }
}
