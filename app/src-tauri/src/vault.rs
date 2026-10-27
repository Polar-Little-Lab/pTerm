use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use rusqlite::{Connection, params};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tauri::{Emitter, Manager, State};
use zeroize::Zeroizing;

const KEYCHAIN_LABEL: &str = "pTerm — 호스트와 저장 명령";
const ACCOUNT: &str = "local-master-key";
const AAD: &[u8] = b"harbor-vault:v1:workspace";
#[derive(Default)]
pub struct Vault {
    key: Mutex<Option<Zeroizing<Vec<u8>>>>,
    epoch: AtomicU64,
    authenticating: Arc<AtomicBool>,
}
struct AuthPermit(Arc<AtomicBool>);
impl Drop for AuthPermit {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn database(path: &PathBuf) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "Vault 디렉터리 생성 실패")?;
    }
    let db = Connection::open(path).map_err(|_| "Vault 데이터베이스 열기 실패")?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), payload BLOB NOT NULL);").map_err(|_| "Vault 초기화 실패")?;
    Ok(db)
}
fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "앱 저장 경로 오류")?
        .join("vault-v1.sqlite"))
}
fn seal(key: &[u8], text: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; 24];
    getrandom::getrandom(&mut nonce).map_err(|_| "난수 생성 실패")?;
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| "Vault 키 오류")?;
    let encrypted = cipher
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: text,
                aad: AAD,
            },
        )
        .map_err(|_| "암호화 실패")?;
    Ok([nonce.as_slice(), encrypted.as_slice()].concat())
}
fn unseal(key: &[u8], bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    if bytes.len() < 40 {
        return Err("Vault 데이터가 손상되었습니다.".into());
    }
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| "Vault 키 오류")?;
    cipher
        .decrypt(
            &XNonce::from(<[u8; 24]>::try_from(&bytes[..24]).map_err(|_| "Invalid nonce")?),
            Payload {
                msg: &bytes[24..],
                aad: AAD,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| "Vault 무결성 검증 실패. 데이터를 덮어쓰지 않습니다.".into())
}
fn keychain_error(code: i32) -> String {
    let reason = match code {
        -128 => "키체인 접근 승인이 취소되었습니다.",
        -25293 => "키체인 인증이 거부되었거나 완료되지 않았습니다.",
        -25308 => "macOS에서 키체인 인증창을 표시할 수 없습니다.",
        -25300 => "저장된 항목을 여는 암호화 키를 키체인에서 찾지 못했습니다.",
        _ => "키체인에 접근하지 못했습니다.",
    };
    format!("{reason} 호스트와 저장 명령은 변경하지 않았습니다. (오류 {code})")
}
/// Only a cold/explicitly locked workspace reads Keychain. Never persist this cache.
fn workspace_with_key(
    cached: Option<&[u8]>,
    existing: Option<&[u8]>,
    load_key: impl FnOnce() -> Result<Zeroizing<Vec<u8>>, String>,
) -> Result<(Zeroizing<Vec<u8>>, String), String> {
    let key = match cached {
        Some(key) => Zeroizing::new(key.to_vec()),
        None => load_key()?,
    };
    if key.len() != 32 {
        return Err("Vault 키 형식 오류. 기존 데이터는 유지됩니다.".into());
    }
    let text = match existing {
        Some(bytes) => {
            String::from_utf8(unseal(&key, bytes)?.to_vec()).map_err(|_| "Vault 형식 오류")?
        }
        None => "{\"version\":1,\"hosts\":[],\"snippets\":[]}".into(),
    };
    Ok((key, text))
}
#[tauri::command]
pub async fn unlock_vault(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (service, legacy_service) = crate::keychain_migration::service_names(&app.config().identifier);
        let state = app.state::<Vault>();
        if state
            .authenticating
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err("이미 인증을 진행하고 있습니다.".into());
        }
        let _permit = AuthPermit(state.authenticating.clone());
        let epoch = state.epoch.load(Ordering::SeqCst);
        let mut guard = state.key.lock().map_err(|_| "Vault 잠금 오류")?;
        if epoch != state.epoch.load(Ordering::SeqCst) {
            return Err("잠금 요청으로 인증을 취소했습니다.".into());
        }
        let db = database(&path(&app)?)?;
        db.execute_batch("BEGIN IMMEDIATE")
            .map_err(|_| "Vault is busy")?;
        let existing: Option<Vec<u8>> = db
            .query_row("SELECT payload FROM workspace WHERE id=1", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|_| "Vault 읽기 실패")?;
        let mut used_legacy = false;
        // Unlock only reads the secret. Branding/ACL mutations can cause extra
        // macOS authorization prompts and do not belong in authentication.
        let (key, text) = workspace_with_key(
            guard.as_ref().map(|key| key.as_slice()),
            existing.as_deref(),
            || {
                let _ = app.emit("vault-auth-stage", "keychain");
                match crate::keychain_migration::read_current_or_legacy(&service, &legacy_service, |name| {
                    security_framework::passwords::get_generic_password(name, ACCOUNT)
                        .map(Zeroizing::new).map_err(|e| e.code())
                }) {
                    Ok((key, legacy)) => { used_legacy = legacy; Ok(key) },
                    Err(-25300) if existing.is_none() => {
                        let mut key = Zeroizing::new(vec![0u8; 32]);
                        getrandom::getrandom(&mut key).map_err(|_| "난수 생성 실패")?;
                        crate::keychain_migration::add_key(&service, ACCOUNT, KEYCHAIN_LABEL, &key)
                            .map_err(keychain_error)?;
                        Ok(key)
                    }
                    Err(code) => Err(keychain_error(code)),
                }
            },
        )?;
        db.execute_batch("COMMIT")
            .map_err(|_| "Vault transaction failed")?;
        if used_legacy {
            // Only copy a key after it successfully decrypted the existing Vault.
            // Keep the legacy item as a recovery copy. Add-only prevents overwrite.
            if let Err(code) = crate::keychain_migration::add_key(&service, ACCOUNT, KEYCHAIN_LABEL, &key) {
                let _ = app.emit("vault-keychain-notice", format!("저장된 항목은 열렸지만 키체인 이름 전환을 완료하지 못했습니다. 다음 잠금 해제 때 다시 시도합니다. (오류 {code})"));
            }
        }
        *guard = Some(key);
        let _ = app.emit("vault-auth-stage", "ready");
        Ok(text)
    })
    .await
    .map_err(|_| "Vault 작업 오류")?
}
use rusqlite::OptionalExtension;
#[tauri::command]
pub async fn save_vault(app: tauri::AppHandle, data: String) -> Result<(), String> {
    if data.len() > 4 * 1024 * 1024 {
        return Err("Vault 크기 제한은 4 MiB입니다.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let data=Zeroizing::new(data);
        let value:serde_json::Value=serde_json::from_str(&data).map_err(|_| "Vault 형식 오류")?;
        if value["version"]!=1 || !value["hosts"].is_array() || !value["snippets"].is_array() {return Err("Vault 스키마 오류".into());}
        let state=app.state::<Vault>();let guard=state.key.lock().map_err(|_| "Vault 잠금 오류")?;
        let key=guard.as_ref().ok_or("Vault가 잠겨 있습니다.")?;
        let bytes=seal(key,data.as_bytes())?;
        database(&path(&app)?)?.execute("INSERT INTO workspace(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",params![bytes]).map_err(|_| "Vault 저장 실패")?;
        Ok(())
    }).await.map_err(|_| "Vault 작업 오류")?
}
#[tauri::command]
pub fn lock_vault(state: State<'_, Vault>) -> Result<(), String> {
    let mut guard = state.key.lock().map_err(|_| "Vault 잠금 오류")?;
    state.epoch.fetch_add(1, Ordering::SeqCst);
    *guard = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_workspace_open_uses_cached_key_until_cleared() {
        use std::cell::Cell;
        let reads = Cell::new(0);
        let payload = seal(&[7; 32], b"saved workspace").unwrap();
        let loader = || {
            reads.set(reads.get() + 1);
            Ok(Zeroizing::new(vec![7; 32]))
        };
        let (key, text) = workspace_with_key(None, Some(&payload), loader).unwrap();
        assert_eq!(text, "saved workspace");
        for _ in 0..5 {
            let (_, text) = workspace_with_key(Some(&key), Some(&payload), loader).unwrap();
            assert_eq!(text, "saved workspace");
        }
        assert_eq!(reads.get(), 1, "warm workspace must not access Keychain");
        drop(key);
        workspace_with_key(None, Some(&payload), loader).unwrap();
        assert_eq!(
            reads.get(),
            2,
            "a cleared cache requires a fresh Keychain read"
        );
    }

    #[test]
    fn cached_key_or_corrupt_workspace_never_triggers_authentication_fallback() {
        let payload = seal(&[7; 32], b"saved workspace").unwrap();
        assert!(
            workspace_with_key(Some(&[8; 32]), Some(&payload), || {
                panic!("must not retry Keychain for a decryption failure")
            })
            .is_err()
        );
        assert!(
            workspace_with_key(Some(&[7; 32]), Some(b"corrupt"), || {
                panic!("must not request authentication for corrupt data")
            })
            .is_err()
        );
    }

    #[test]
    fn cancelled_keychain_read_does_not_create_an_open_workspace() {
        assert!(workspace_with_key(None, None, || Err("cancelled".into())).is_err());
        assert!(workspace_with_key(None, None, || Ok(Zeroizing::new(vec![1; 4]))).is_err());
    }

    #[test]
    fn sqlite_contains_ciphertext_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.sqlite");
        let key = [3u8; 32];
        let secret = b"host-sensitive.example.test";
        let db = database(&path).unwrap();
        db.execute(
            "INSERT INTO workspace(id,payload) VALUES(1,?1)",
            params![seal(&key, secret).unwrap()],
        )
        .unwrap();
        let blob: Vec<u8> = db
            .query_row("SELECT payload FROM workspace WHERE id=1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(&**unseal(&key, &blob).unwrap(), secret);
        drop(db);
        assert!(
            !std::fs::read(path)
                .unwrap()
                .windows(secret.len())
                .any(|v| v == secret)
        );
    }
    #[test]
    fn saved_credentials_survive_encrypted_database_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.sqlite");
        let key = [9u8; 32];
        let secret = "synthetic-ssh-password-only";
        let workspace = serde_json::json!({"version":1,"hosts":[{"id":"fixture"}],"snippets":[],
            "credentials":[{"hostId":"fixture","scope":"fixture-scope","secret":secret}]}).to_string();
        {
            let db = database(&path).unwrap();
            db.execute("INSERT INTO workspace(id,payload) VALUES(1,?1)",params![seal(&key,workspace.as_bytes()).unwrap()]).unwrap();
        }
        let disk = std::fs::read(&path).unwrap();
        assert!(!disk.windows(secret.len()).any(|v| v == secret.as_bytes()));
        let db = database(&path).unwrap();
        let blob:Vec<u8> = db.query_row("SELECT payload FROM workspace WHERE id=1",[],|r|r.get(0)).unwrap();
        let (_, restored) = workspace_with_key(Some(&key),Some(&blob),||panic!("unlocked vault must not prompt again")).unwrap();
        let value:serde_json::Value = serde_json::from_str(&restored).unwrap();
        assert_eq!(value["credentials"][0]["secret"],secret);
        assert!(unseal(&[8u8;32], &blob).is_err());
    }

    #[test]
    #[ignore = "Explicit isolated macOS Keychain integration check"]
    fn macos_keychain_roundtrip() {
        let service = format!("dev.harbor.ssh.test.{}", uuid::Uuid::new_v4());
        let key = [5u8; 32];
        security_framework::passwords::set_generic_password(&service, "fixture", &key).unwrap();
        let loaded = security_framework::passwords::get_generic_password(&service, "fixture");
        security_framework::passwords::delete_generic_password(&service, "fixture").unwrap();
        assert_eq!(loaded.unwrap(), key);
    }
    #[test]
    fn encrypted_roundtrip_and_random_nonce() {
        let key = [9u8; 32];
        let data = b"private.example.com secret";
        let a = seal(&key, data).unwrap();
        let b = seal(&key, data).unwrap();
        assert_ne!(a, b);
        assert!(!a.windows(data.len()).any(|v| v == data));
        assert_eq!(&**unseal(&key, &a).unwrap(), data);
    }
    #[test]
    fn tamper_and_wrong_key_rejected() {
        let mut a = seal(&[1; 32], b"workspace").unwrap();
        assert!(unseal(&[2; 32], &a).is_err());
        a[25] ^= 1;
        assert!(unseal(&[1; 32], &a).is_err());
        assert!(unseal(&[1; 32], b"short").is_err());
    }
}
