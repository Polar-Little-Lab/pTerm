#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod files;
mod local;
mod ssh;
mod session_end;
use session_end::SessionEnd;
mod vault;
mod keychain_migration;
mod keychain_prompt;
use russh::{ChannelMsg, Disconnect};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{State, ipc::Channel};
use tokio::sync::{mpsc, watch};

enum Input {
    Data(Vec<u8>),
    Resize(u32, u32),
    Ack,
}
#[derive(Clone)]
struct SessionControl {
    input: mpsc::Sender<Input>,
    cancel: watch::Sender<bool>,
    transport: Option<Arc<russh::client::Handle<ssh::VerifiedClient>>>,
}
#[derive(Clone, Default)]
struct Sessions(Arc<Mutex<HashMap<String, SessionControl>>>);
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Event {
    Data { bytes: Vec<u8> },
    Closed { message: String, retryable: bool },
}

#[tauri::command]
async fn connect_ssh(
    id: String,
    request: ssh::ConnectRequest,
    bastion_session_id: Option<String>,
    output: Channel<Event>,
    state: State<'_, Sessions>,
) -> Result<String, ssh::ConnectError> {
    // Reserve a slot before network work so concurrent connection attempts stay bounded.
    uuid::Uuid::parse_str(&id).map_err(|_| ssh::ConnectError::Invalid {
        message: "잘못된 세션 ID".into(),
    })?;
    ssh::validate(&request)?;
    let parent = match bastion_session_id.as_deref() {
        Some(parent_id) => {
            if parent_id == id {
                return Err(ssh::ConnectError::Invalid {
                    message: "자기 자신을 경유할 수 없습니다.".into(),
                });
            }
            let parent = sender(&state, parent_id)
                .map_err(|message| ssh::ConnectError::Invalid { message })?;
            if parent.transport.is_none() || *parent.cancel.borrow() {
                return Err(ssh::ConnectError::Invalid {
                    message: "Bastion 연결을 먼저 완료하세요.".into(),
                });
            }
            Some(parent)
        }
        None => None,
    };
    let mut parent_cancelled = parent.as_ref().map(|p| p.cancel.subscribe());
    let (tx, mut rx) = mpsc::channel(64);
    let (cancel, mut cancelled) = watch::channel(false);
    {
        let mut sessions = state.0.lock().map_err(|_| ssh::ConnectError::Network {
            message: "세션 상태 오류".into(),
        })?;
        if sessions.contains_key(&id) {
            return Err(ssh::ConnectError::Invalid {
                message: "중복 세션 ID".into(),
            });
        }
        if sessions.len() >= 16 {
            return Err(ssh::ConnectError::Invalid {
                message: "최대 16개 세션을 지원합니다.".into(),
            });
        }
        sessions.insert(
            id.clone(),
            SessionControl {
                input: tx,
                cancel,
                transport: None,
            },
        );
    }
    let connection = tokio::select! {
        result = ssh::connect(request, parent.as_ref().and_then(|p| p.transport.clone())) => result,
        _ = parent_closed(&mut parent_cancelled) => Err(ssh::ConnectError::Invalid {message: "Bastion 연결이 종료되었습니다.".into()}),
        _ = cancelled.changed() => Err(ssh::ConnectError::Invalid { message: "연결이 취소되었습니다.".into() }),
    };
    let (session, mut channel) = match connection {
        Ok(x) => x,
        Err(e) => {
            if let Ok(mut s) = state.0.lock() {
                s.remove(&id);
            }
            return Err(e);
        }
    };
    let session = Arc::new(session);
    if let Ok(mut map) = state.0.lock()
        && let Some(control) = map.get_mut(&id)
    {
        control.transport = Some(session.clone());
    }
    let sessions = state.inner().clone();
    let session_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let mut credits = 8usize;
        let mut end = SessionEnd::Closed;
        loop {
            tokio::select! {
                _ = cancelled.changed() => break,
                _ = parent_closed(&mut parent_cancelled) => {end = SessionEnd::Parent; break;},
                input = rx.recv() => match input {
                    Some(Input::Data(bytes)) => {
                        match tokio::time::timeout(Duration::from_secs(10), channel.data(&bytes[..])).await {
                            Ok(Ok(())) => {}, _ => {end.input_failed(); break;}
                        }
                    },
                    Some(Input::Resize(cols, rows)) => {
                        if !matches!(tokio::time::timeout(Duration::from_secs(5), channel.window_change(cols, rows, 0, 0)).await, Ok(Ok(()))) {break;}
                    },
                    Some(Input::Ack) => { credits = (credits + 1).min(8); },
                    None => break,
                },
                incoming = channel.wait(), if credits > 0 => match incoming {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        credits -= 1;
                        if output.send(Event::Data { bytes: data.to_vec() }).is_err() { break; }
                    },
                    Some(ChannelMsg::Failure) => {end = SessionEnd::Rejected; break;},
                    Some(ChannelMsg::ExitStatus { exit_status }) => { end = SessionEnd::Process(exit_status); },
                    Some(ChannelMsg::ExitSignal { .. }) => {end = SessionEnd::Signal;},
                    Some(ChannelMsg::Close) => break,
                    None => {end.transport_lost(); break;},
                    _ => {},
                }
            }
        }
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            session.disconnect(Disconnect::ByApplication, "Session closed", "en"),
        )
        .await;
        if let Ok(mut s) = sessions.0.lock()
            && let Some(control) = s.remove(&session_id)
        {
            let _ = control.cancel.send(true);
        }
        let _ = output.send(Event::Closed { message: end.message(), retryable: end.retryable() });
    });
    Ok(id)
}
async fn parent_closed(receiver: &mut Option<watch::Receiver<bool>>) {
    match receiver {
        Some(rx) => {
            if !*rx.borrow() {
                let _ = rx.changed().await;
            }
        }
        None => std::future::pending::<()>().await,
    }
}
fn sender(state: &Sessions, id: &str) -> Result<SessionControl, String> {
    state
        .0
        .lock()
        .map_err(|_| "세션 상태 오류")?
        .get(id)
        .cloned()
        .ok_or_else(|| "연결이 종료되었습니다.".into())
}
#[tauri::command]
fn send_input(id: String, bytes: Vec<u8>, state: State<'_, Sessions>) -> Result<(), String> {
    if bytes.len() > 16384 {
        return Err("입력 크기 제한 초과".into());
    }
    sender(&state, &id)?
        .input
        .try_send(Input::Data(bytes))
        .map_err(|_| "전송 대기열이 가득 찼습니다. 입력을 다시 시도하세요.".into())
}
#[tauri::command]
fn resize_terminal(
    id: String,
    cols: u32,
    rows: u32,
    state: State<'_, Sessions>,
) -> Result<(), String> {
    if !(1..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("터미널 크기 오류".into());
    }
    sender(&state, &id)?
        .input
        .try_send(Input::Resize(cols, rows))
        .map_err(|_| "크기 변경 대기열이 가득 찼습니다.".into())
}
#[tauri::command]
async fn ack_output(id: String, state: State<'_, Sessions>) -> Result<(), String> {
    let tx = sender(&state, &id)?.input;
    tx.send(Input::Ack).await.map_err(|_| "연결 종료".into())
}
#[tauri::command]
fn disconnect_ssh(id: String, state: State<'_, Sessions>) -> Result<(), String> {
    sender(&state, &id)?
        .cancel
        .send(true)
        .map_err(|_| "연결 종료".into())
}
struct DemoRequest(std::sync::atomic::AtomicBool);
#[tauri::command]
fn take_demo_request(state: State<'_, DemoRequest>) -> bool {
    state.0.swap(false, std::sync::atomic::Ordering::SeqCst)
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Sessions::default())
        .manage(DemoRequest(std::sync::atomic::AtomicBool::new(
            std::env::args().any(|arg| arg == "--demo-hosts"),
        )))
        .manage(vault::Vault::default())
        .manage(files::Transfers::default())
        .invoke_handler(tauri::generate_handler![
            take_demo_request,
            connect_ssh,
            local::start_local,
            send_input,
            resize_terminal,
            ack_output,
            disconnect_ssh,
            vault::unlock_vault,
            vault::save_vault,
            vault::lock_vault,
            files::list_files,
            files::list_local_files,
            files::make_directory,
            files::transfer_file,
            files::cancel_transfer
        ])
        .build(tauri::generate_context!())
        .expect("Polar Terminal could not start")
        .run(|app, event| {
            use tauri::Manager;
            static EXITING: std::sync::atomic::AtomicBool =
                std::sync::atomic::AtomicBool::new(false);
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if EXITING.swap(true, std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                api.prevent_exit();
                let sessions = app.state::<Sessions>().inner().clone();
                if let Ok(map) = sessions.0.lock() {
                    for session in map.values() {
                        let _ = session.cancel.send(true);
                    }
                }
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    for _ in 0..150 {
                        if sessions.0.lock().map(|map| map.is_empty()).unwrap_or(true) {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(20)).await;
                    }
                    app.exit(0);
                });
            }
        });
}
