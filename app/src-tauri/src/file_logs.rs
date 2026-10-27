//! Per-run log directories avoid overwriting unrelated files. Rotation deletes only this run's files.
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    fs::{File, OpenOptions},
    io::Write,
    os::unix::fs::{DirBuilderExt, OpenOptionsExt},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::State;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    pub directory: String,
    pub max_mib: u64,
    pub files: usize,
}
#[derive(Clone, Serialize)]
pub struct Info {
    pub directory: String,
    pub path: String,
    pub bytes: u64,
    pub rotations: u64,
}
struct Writer {
    directory: PathBuf,
    file: File,
    paths: VecDeque<PathBuf>,
    size: u64,
    total: u64,
    limit: u64,
    keep: usize,
    index: u64,
}
impl Writer {
    fn create(options: Options) -> Result<Self, String> {
        if !Path::new(&options.directory).is_absolute()
            || !(1..=100).contains(&options.max_mib)
            || !(1..=100).contains(&options.files)
        {
            return Err("로그 경로와 보존 설정을 확인하세요.".into());
        }
        let parent = std::fs::canonicalize(&options.directory).map_err(|e| e.to_string())?;
        if !parent.is_dir() {
            return Err("로그 저장 폴더가 아닙니다.".into());
        }
        let directory = parent.join(format!("pterm-{}", uuid::Uuid::new_v4()));
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&directory)
            .map_err(|e| e.to_string())?;
        let path = directory.join("000001.log");
        let file = Self::file(&path)?;
        Ok(Self {
            directory,
            file,
            paths: VecDeque::from([path]),
            size: 0,
            total: 0,
            limit: options.max_mib * 1024 * 1024,
            keep: options.files,
            index: 1,
        })
    }
    fn file(path: &Path) -> Result<File, String> {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(path)
            .map_err(|e| e.to_string())
    }
    fn append(&mut self, bytes: &[u8]) -> Result<Info, String> {
        if bytes.len() > 65536 {
            return Err("로그 청크는 최대 64 KiB입니다.".into());
        }
        if self.size + bytes.len() as u64 > self.limit {
            self.file.sync_data().map_err(|e| e.to_string())?;
            let index = self.index + 1;
            let path = self.directory.join(format!("{index:06}.log"));
            let file = Self::file(&path)?;
            self.file = file;
            self.index = index;
            self.size = 0;
            self.paths.push_back(path);
            while self.paths.len() > self.keep {
                let old = self.paths.front().unwrap();
                std::fs::remove_file(old).map_err(|e| e.to_string())?;
                self.paths.pop_front();
            }
        }
        self.file.write_all(bytes).map_err(|e| e.to_string())?;
        self.size += bytes.len() as u64;
        self.total += bytes.len() as u64;
        Ok(self.info())
    }
    fn info(&self) -> Info {
        Info {
            directory: self.directory.to_string_lossy().into(),
            path: self.paths.back().unwrap().to_string_lossy().into(),
            bytes: self.total,
            rotations: self.index - 1,
        }
    }
}
#[derive(Clone, Default)]
pub struct Logs(Arc<Mutex<HashMap<String, Writer>>>);
impl Logs {
    pub fn is_empty(&self) -> bool {
        self.0.try_lock().map(|m| m.is_empty()).unwrap_or(false)
    }
    pub fn finish(&self) {
        if let Ok(mut map) = self.0.lock() {
            for writer in map.values() {
                let _ = writer.file.sync_data();
            }
            map.clear();
        }
    }
}
#[tauri::command]
pub async fn start_file_log(
    id: String,
    options: Options,
    state: State<'_, Logs>,
) -> Result<Info, String> {
    uuid::Uuid::parse_str(&id).map_err(|_| "잘못된 로그 ID")?;
    let registry = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = registry.0.lock().map_err(|_| "로그 상태 오류")?;
        if map.len() >= 32 || map.contains_key(&id) {
            return Err("로그 실행 제한 초과".into());
        }
        let writer = Writer::create(options)?;
        let info = writer.info();
        map.insert(id, writer);
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn append_file_log(
    id: String,
    bytes: Vec<u8>,
    state: State<'_, Logs>,
) -> Result<Info, String> {
    let registry = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut map = registry.0.lock().map_err(|_| "로그 상태 오류")?;
        let result = map
            .get_mut(&id)
            .ok_or("로그가 종료되었습니다.")?
            .append(&bytes);
        if result.is_err() {
            map.remove(&id);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn stop_file_log(id: String, state: State<'_, Logs>) -> Result<(), String> {
    let registry = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(writer) = registry.0.lock().map_err(|_| "로그 상태 오류")?.remove(&id) {
            writer.file.sync_data().map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rotates_only_owned_files_and_preserves_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let unrelated = dir.path().join("keep.log");
        std::fs::write(&unrelated, b"keep").unwrap();
        let mut w = Writer::create(Options {
            directory: dir.path().to_str().unwrap().into(),
            max_mib: 1,
            files: 2,
        })
        .unwrap();
        w.limit = 6;
        w.append("한글".as_bytes()).unwrap();
        w.append(b"second").unwrap();
        w.append(b"third").unwrap();
        assert_eq!(w.paths.len(), 2);
        assert!(!w.directory.join("000001.log").exists());
        assert_eq!(std::fs::read(w.paths.front().unwrap()).unwrap(), b"second");
        assert_eq!(std::fs::read(w.paths.back().unwrap()).unwrap(), b"third");
        assert_eq!(std::fs::read(unrelated).unwrap(), b"keep");
        assert_eq!(w.info().rotations, 2);
    }
    #[test]
    fn separate_runs_do_not_overwrite_each_other() {
        let d = tempfile::tempdir().unwrap();
        let options = || Options {
            directory: d.path().to_str().unwrap().into(),
            max_mib: 1,
            files: 1,
        };
        let a = Writer::create(options()).unwrap();
        let b = Writer::create(options()).unwrap();
        assert_ne!(a.directory, b.directory);
        assert!(
            Writer::create(Options {
                directory: "relative".into(),
                max_mib: 1,
                files: 1
            })
            .is_err()
        );
    }
    #[test]
    fn refuses_existing_rotation_target_and_oversize_write() {
        let d = tempfile::tempdir().unwrap();
        let mut w = Writer::create(Options {
            directory: d.path().to_str().unwrap().into(),
            max_mib: 1,
            files: 1,
        })
        .unwrap();
        assert!(w.append(&vec![0; 65537]).is_err());
        w.limit = 1;
        w.append(b"x").unwrap();
        let path = w.directory.join("000002.log");
        std::fs::write(&path, b"preserved").unwrap();
        assert!(w.append(b"y").is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"preserved");
    }
}

#[derive(Default)]
pub struct ExitReady(pub std::sync::atomic::AtomicBool);
#[tauri::command]
pub fn finish_log_shutdown(state: State<'_, ExitReady>) {
    state.0.store(true, std::sync::atomic::Ordering::SeqCst);
}
