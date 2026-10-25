//! Explicit local fixture only. Never reads user SSH configuration or credentials.
#[path = "../src/ssh.rs"]
mod ssh;
use std::time::Duration;
#[tokio::main]
async fn main() {
    let port = std::env::var("HARBOR_FIXTURE_PORT")
        .unwrap()
        .parse()
        .unwrap();
    let fingerprint = std::env::var("HARBOR_FIXTURE_FINGERPRINT").unwrap();
    let mut request = ssh::ConnectRequest {
        host: "127.0.0.1".into(),
        port,
        username: "fixture".into(),
        password: "synthetic-only".into(),
        auth_method: "password".into(),
        key_path: String::new(),
        fingerprint: Some(fingerprint),
        cols: 80,
        rows: 24,
    };
    let parent = if let Ok(port) = std::env::var("HARBOR_BASTION_PORT") {
        let (parent, _) = ssh::connect(
            ssh::ConnectRequest {
                host: "127.0.0.1".into(),
                port: port.parse().unwrap(),
                username: "fixture".into(),
                password: "synthetic-only".into(),
                auth_method: "password".into(),
                key_path: String::new(),
                fingerprint: Some(std::env::var("HARBOR_BASTION_FINGERPRINT").unwrap()),
                cols: 80,
                rows: 24,
            },
            None,
        )
        .await
        .unwrap();
        request.host = "inside.fixture.test".into();
        Some(std::sync::Arc::new(parent))
    } else {
        None
    };
    if std::env::var_os("HARBOR_AGENT_TEST").is_some() {request.auth_method="agent".into();request.password.clear();}
    tokio::time::timeout(Duration::from_secs(20),async {
        let (session,mut terminal)=ssh::connect(request, parent.clone()).await.unwrap();
        terminal.data(&b"polar-smoke\n"[..]).await.unwrap();
        loop {if let Some(russh::ChannelMsg::Data{data})=terminal.wait().await{assert_eq!(&data[..],b"polar-smoke\n");break;}}
        let channel=session.channel_open_session().await.unwrap();channel.request_subsystem(true,"sftp").await.unwrap();
        let sftp=russh_sftp::client::SftpSession::new(channel.into_stream()).await.unwrap();
        let root=sftp.canonicalize(".").await.unwrap();assert!(root.ends_with("/.tools/qa-sftp"));
        let content=sftp.read(format!("{root}/reports/readme.txt")).await.unwrap();assert_eq!(content,b"Synthetic SFTP fixture. No user data.\n");
        let folder=format!("{root}/smoke-{}",uuid::Uuid::new_v4());sftp.create_dir(&folder).await.unwrap();sftp.remove_dir(&folder).await.unwrap();
        sftp.close().await.unwrap();session.disconnect(russh::Disconnect::ByApplication,"Smoke complete","en").await.unwrap();
        if let Some(parent)=parent {parent.disconnect(russh::Disconnect::ByApplication,"Smoke complete","en").await.unwrap();println!("PASS: all target SSH and SFTP traffic tunneled through authenticated Bastion");}
        println!("PASS: verified SSH authentication + PTY echo + second-channel SFTP negotiation + OpenSSH file read + mkdir/rmdir");
    }).await.expect("Local smoke test timeout");
}
