use crate::{Sessions, sender};
use russh_sftp::{
    client::SftpSession,
    protocol::{FileAttributes, OpenFlags},
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tauri::{State, ipc::Channel};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::watch,
};

#[derive(Default)]
pub struct Transfers(Mutex<HashMap<String, watch::Sender<bool>>>);
async fn open(state: &Sessions, id: &str) -> Result<SftpSession, String> {
    let transport = sender(state, id)?
        .transport
        .ok_or("SSH 연결이 준비되지 않았습니다.")?;
    tokio::time::timeout(Duration::from_secs(15), async {
        let channel = transport
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("SFTP를 시작하지 못했습니다: {e}"))?;
        sftp.set_timeout(15);
        Ok(sftp)
    })
    .await
    .map_err(|_| "SFTP 시작 시간 초과")?
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    is_dir: bool,
    is_link: bool,
    size: u64,
    modified: Option<u32>,
}
#[derive(Serialize)]
pub struct Listing {
    path: String,
    entries: Vec<Entry>,
}
fn local_listing(path: std::path::PathBuf) -> Result<Listing, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for item in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        if entries.len() >= 10000 {
            return Err("폴더 항목이 10,000개를 초과합니다.".into());
        }
        let name = item
            .file_name()
            .into_string()
            .map_err(|_| "지원하지 않는 파일 이름 인코딩입니다.")?;
        let meta = std::fs::symlink_metadata(item.path()).map_err(|e| e.to_string())?;
        entries.push(Entry {
            name,
            is_dir: meta.is_dir(),
            is_link: meta.is_symlink(),
            size: meta.len(),
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .and_then(|d| u32::try_from(d.as_secs()).ok()),
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(Listing {
        path: path
            .to_str()
            .ok_or("지원하지 않는 경로 인코딩입니다.")?
            .into(),
        entries,
    })
}
#[tauri::command]
pub async fn list_local_files(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<Listing, String> {
    use tauri::Manager;
    let path = match path.filter(|p| !p.is_empty()) {
        Some(p) => {
            let p = std::path::PathBuf::from(p);
            if !p.is_absolute() {
                return Err("로컬 절대 경로가 필요합니다.".into());
            }
            p
        }
        None => app.path().home_dir().map_err(|e| e.to_string())?,
    };
    tokio::task::spawn_blocking(move || local_listing(path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn list_files(
    id: String,
    path: String,
    state: State<'_, Sessions>,
) -> Result<Listing, String> {
    let sftp = open(&state, &id).await?;
    let result = async {
        let path = sftp.canonicalize(path).await.map_err(|e| e.to_string())?;
        let files = sftp
            .read_dir(path.clone())
            .await
            .map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        for entry in files {
            let name = entry.file_name();
            if name == "." || name == ".." || name.contains('/') || name.contains('\0') {
                continue;
            }
            if entries.len() >= 10000 {
                return Err("폴더 항목이 10,000개를 초과합니다. 더 작은 경로를 여세요.".into());
            }
            let meta = entry.metadata();
            entries.push(Entry {
                name,
                is_dir: entry.file_type().is_dir(),
                is_link: entry.file_type().is_symlink(),
                size: meta.size.unwrap_or(0),
                modified: meta.mtime,
            });
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(Listing { path, entries })
    }
    .await;
    let _ = sftp.close().await;
    result
}
#[tauri::command]
pub async fn make_directory(
    id: String,
    path: String,
    state: State<'_, Sessions>,
) -> Result<(), String> {
    let sftp = open(&state, &id).await?;
    let result = sftp.create_dir(path).await.map_err(|e| e.to_string());
    let _ = sftp.close().await;
    result
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transfer {
    id: String,
    session_id: String,
    remote_path: String,
    local_path: String,
    upload: bool,
}
#[derive(Clone, Serialize)]
pub struct Progress {
    bytes: u64,
    total: u64,
}
#[tauri::command]
pub async fn transfer_file(
    request: Transfer,
    progress: Channel<Progress>,
    state: State<'_, Sessions>,
    transfers: State<'_, Transfers>,
) -> Result<(), String> {
    uuid::Uuid::parse_str(&request.id).map_err(|_| "전송 ID 오류")?;
    if !std::path::Path::new(&request.local_path).is_absolute() {
        return Err("로컬 절대 경로가 필요합니다.".into());
    }
    let (cancel, mut cancelled) = watch::channel(false);
    {
        let mut map = transfers.0.lock().map_err(|_| "전송 상태 오류")?;
        if map.len() >= 4 || map.contains_key(&request.id) {
            return Err("최대 4개 파일을 동시에 전송할 수 있습니다.".into());
        }
        map.insert(request.id.clone(), cancel);
    }
    let result = transfer(&request, progress, &state, &mut cancelled).await;
    if let Ok(mut map) = transfers.0.lock() {
        map.remove(&request.id);
    }
    result
}
async fn transfer(
    request: &Transfer,
    progress: Channel<Progress>,
    state: &Sessions,
    cancelled: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    let sftp = tokio::select! {r=open(state,&request.session_id)=>r?,_=cancelled.changed()=>return Err("전송 취소됨".into())};
    transfer_on(sftp, request, progress, cancelled).await
}
async fn transfer_on(
    sftp: SftpSession,
    request: &Transfer,
    progress: Channel<Progress>,
    cancelled: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    let mut created = false;
    let temporary = format!("{}.harbor-{}.part", request.local_path, request.id);
    let operation = async {
        let mut buffer = vec![0u8; 32768];
        let mut bytes = 0u64;
        if request.upload {
            let meta = tokio::fs::metadata(&request.local_path)
                .await
                .map_err(|e| e.to_string())?;
            if !meta.is_file() {
                return Err("일반 파일만 업로드할 수 있습니다.".into());
            }
            let mut local = tokio::fs::File::open(&request.local_path)
                .await
                .map_err(|e| e.to_string())?;
            // Exclusive creation: never truncate an existing remote file.
            let mut remote = sftp
                .open_with_flags_and_attributes(
                    &request.remote_path,
                    OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::EXCLUDE,
                    FileAttributes {
                        permissions: Some(0o600),
                        ..FileAttributes::empty()
                    },
                )
                .await
                .map_err(|e| format!("새 파일 생성 실패 (기존 파일은 덮어쓰지 않습니다): {e}"))?;
            created = true;
            loop {
                let n = local.read(&mut buffer).await.map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                remote
                    .write_all(&buffer[..n])
                    .await
                    .map_err(|e| e.to_string())?;
                bytes += n as u64;
                let _ = progress.send(Progress {
                    bytes,
                    total: meta.len(),
                });
            }
            remote.shutdown().await.map_err(|e| e.to_string())?;
        } else {
            let meta = sftp
                .symlink_metadata(&request.remote_path)
                .await
                .map_err(|e| e.to_string())?;
            if !meta.is_regular() {
                return Err(
                    "일반 파일만 다운로드할 수 있습니다. 링크는 직접 다운로드하지 않습니다.".into(),
                );
            }
            let mut remote = sftp
                .open(&request.remote_path)
                .await
                .map_err(|e| e.to_string())?;
            let mut local = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&temporary)
                .await
                .map_err(|e| e.to_string())?;
            created = true;
            loop {
                let n = remote.read(&mut buffer).await.map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                local
                    .write_all(&buffer[..n])
                    .await
                    .map_err(|e| e.to_string())?;
                bytes += n as u64;
                let _ = progress.send(Progress {
                    bytes,
                    total: meta.size.unwrap_or(0),
                });
            }
            local.sync_all().await.map_err(|e| e.to_string())?;
            drop(local);
            // Same directory hard-link publishes without overwriting any existing destination.
            tokio::fs::hard_link(&temporary, &request.local_path)
                .await
                .map_err(|e| format!("저장 실패 (기존 파일은 덮어쓰지 않습니다): {e}"))?;
            tokio::fs::remove_file(&temporary)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    };
    let result = tokio::select! {r=operation=>r,_=cancelled.changed()=>Err("전송 취소됨".into())};
    if result.is_err() && created {
        if request.upload {
            if sftp.remove_file(&request.remote_path).await.is_err() {
                let _ = sftp.close().await;
                return Err(format!(
                    "전송 중단. 원격 부분 파일을 정리하지 못했습니다: {}",
                    request.remote_path
                ));
            }
        } else {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
    }
    let _ = sftp.close().await;
    result
}
#[tauri::command]
pub fn cancel_transfer(id: String, state: State<'_, Transfers>) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "전송 상태 오류")?
        .get(&id)
        .ok_or("전송이 이미 종료되었습니다.")?
        .send(true)
        .map_err(|_| "전송 종료".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Stdio;
    async fn server() -> (SftpSession, tokio::process::Child) {
        let mut child = tokio::process::Command::new("/usr/libexec/sftp-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let stream = tokio::io::join(child.stdout.take().unwrap(), child.stdin.take().unwrap());
        (SftpSession::new(stream).await.unwrap(), child)
    }
    fn request(local: &std::path::Path, remote: &std::path::Path, upload: bool) -> Transfer {
        Transfer {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: "test".into(),
            remote_path: remote.to_str().unwrap().into(),
            local_path: local.to_str().unwrap().into(),
            upload,
        }
    }
    #[tokio::test]
    async fn openssh_sftp_upload_download_no_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        let remote = dir.path().join("remote");
        let destination = dir.path().join("download");
        let content = "북극곰 ❄️\n".repeat(20000).into_bytes();
        std::fs::write(&source, &content).unwrap();
        let (_cancel, mut receiver) = watch::channel(false);
        let (sftp, _child) = server().await;
        transfer_on(
            sftp,
            &request(&source, &remote, true),
            Channel::new(|_| Ok(())),
            &mut receiver,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&remote).unwrap(), content);
        let (sftp, _child2) = server().await;
        assert!(
            transfer_on(
                sftp,
                &request(&source, &remote, true),
                Channel::new(|_| Ok(())),
                &mut receiver
            )
            .await
            .is_err()
        );
        assert_eq!(std::fs::read(&remote).unwrap(), content);
        let (sftp, _child3) = server().await;
        transfer_on(
            sftp,
            &request(&destination, &remote, false),
            Channel::new(|_| Ok(())),
            &mut receiver,
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read(&destination).unwrap(), content);
        std::fs::write(&destination, b"keep me").unwrap();
        let (sftp, _child4) = server().await;
        assert!(
            transfer_on(
                sftp,
                &request(&destination, &remote, false),
                Channel::new(|_| Ok(())),
                &mut receiver
            )
            .await
            .is_err()
        );
        assert_eq!(std::fs::read(&destination).unwrap(), b"keep me");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 3);
    }
    #[tokio::test]
    async fn openssh_sftp_cancel_removes_partial_and_directory_ops() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        let remote = dir.path().join("partial");
        std::fs::write(&source, vec![7; 8 * 1024 * 1024]).unwrap();
        let (sftp, _child) = server().await;
        let folder = dir.path().join("folder").to_str().unwrap().to_owned();
        sftp.create_dir(&folder).await.unwrap();
        assert!(
            sftp.read_dir(dir.path().to_str().unwrap())
                .await
                .unwrap()
                .any(|e| e.file_name() == "folder" && e.file_type().is_dir())
        );
        let (cancel, mut receiver) = watch::channel(false);
        let progress = Channel::new(move |_| {
            let _ = cancel.send(true);
            Ok(())
        });
        assert!(
            transfer_on(
                sftp,
                &request(&source, &remote, true),
                progress,
                &mut receiver
            )
            .await
            .is_err()
        );
        assert!(!remote.exists());
    }
}

#[cfg(test)]
mod local_listing_tests {
    use super::*;
    #[test]
    fn lists_directories_first_and_does_not_follow_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("z.txt"), b"abc").unwrap();
        std::fs::create_dir(dir.path().join("folder")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("folder"), dir.path().join("link")).unwrap();
        let listing = local_listing(dir.path().to_path_buf()).unwrap();
        assert_eq!(listing.entries[0].name, "folder");
        let link = listing.entries.iter().find(|e| e.name == "link").unwrap();
        assert!(link.is_link);
        assert!(!link.is_dir);
        assert_eq!(
            listing
                .entries
                .iter()
                .find(|e| e.name == "z.txt")
                .unwrap()
                .size,
            3
        );
    }
    #[test]
    fn listing_a_file_or_missing_directory_fails() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("file"), b"a").unwrap();
        assert!(local_listing(dir.path().join("file")).is_err());
        assert!(local_listing(dir.path().join("missing")).is_err());
    }
}
