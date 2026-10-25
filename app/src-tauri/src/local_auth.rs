use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_foundation::{NSError, NSString};
use objc2_local_authentication::{LAContext, LAPolicy};
use serde::Serialize;
use std::{sync::mpsc, time::Duration};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Availability {
    pub touch_id: bool,
    pub owner_auth: bool,
}

pub fn availability() -> Availability {
    // A fresh context is used only for capability checks; no authentication UI is shown.
    unsafe {
        let context = LAContext::new();
        Availability {
            touch_id: context
                .canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
                .is_ok(),
            owner_auth: context
                .canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthentication)
                .is_ok(),
        }
    }
}

#[tauri::command]
pub async fn authentication_availability() -> Result<Availability, String> {
    tauri::async_runtime::spawn_blocking(availability)
        .await
        .map_err(|_| "인증 장치 확인 실패".into())
}

/// Called from the Vault's blocking worker, before any Keychain key is read.
/// The system owns all Touch ID and password input; credentials never enter this process.
pub fn authenticate() -> Result<(), String> {
    unsafe {
        let context = LAContext::new();
        context.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthentication)
            .map_err(|_|"macOS 사용자 인증을 사용할 수 없습니다. 로그인 상태와 시스템 설정을 확인하세요.")?;
        context.setLocalizedCancelTitle(Some(&NSString::from_str("취소")));
        context.setLocalizedFallbackTitle(Some(&NSString::from_str("Mac 로그인 암호 사용")));
        let (tx, rx) = mpsc::channel();
        // The sendable callback captures only a channel. No borrowed Objective-C values escape.
        let reply = RcBlock::new(move |success: Bool, error: *mut NSError| {
            let code = if error.is_null() { 0 } else { (*error).code() };
            let _ = tx.send((success.as_bool(), code));
        });
        context.evaluatePolicy_localizedReason_reply(
            LAPolicy::DeviceOwnerAuthentication,
            &NSString::from_str("로컬 Vault의 호스트와 저장 명령을 잠금 해제합니다."),
            &reply,
        );
        let result = rx.recv_timeout(Duration::from_secs(120));
        context.invalidate();
        match result {
            Ok((true, _)) => Ok(()),
            Ok((false, -2 | -4 | -9)) => {
                Err("인증이 취소되었습니다. Vault는 잠긴 상태로 유지됩니다.".into())
            }
            Ok((false, _)) => {
                Err("인증하지 못했습니다. Touch ID 또는 Mac 로그인 암호로 다시 시도하세요.".into())
            }
            Err(_) => Err("인증 대기 시간이 지났습니다. 다시 시도하세요.".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn macos_capability_check_does_not_prompt() {
        let result = super::availability();
        println!(
            "Touch ID available: {}; owner authentication available: {}",
            result.touch_id, result.owner_auth
        );
        // Touch ID is optional; the test exercises the real framework, without assuming hardware.
    }
}
