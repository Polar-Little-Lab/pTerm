//! Local Python/Node process with a bounded, cancellable terminal RPC channel.
use crate::programs::{ProgramRequest, plan};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    process::Stdio,
    sync::{Arc, Mutex},
};
use tauri::{State, ipc::Channel};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{mpsc, watch},
};
#[derive(Clone)]
struct Control {
    cancel: watch::Sender<bool>,
    responses: mpsc::Sender<String>,
}
#[derive(Clone, Default)]
pub struct Scripts(Arc<Mutex<HashMap<String, Control>>>);
#[derive(Clone, Deserialize, Serialize)]
pub struct Request {
    pub seq: u32,
    pub operation: String,
    pub value: serde_json::Value,
    pub timeout: Option<u32>,
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ScriptEvent {
    Request { request: Request },
    Log { text: String },
    Closed { message: String },
}
fn decode(line: &[u8]) -> Result<ScriptEvent, String> {
    let prefix = b"\x1ePTERM ";
    if line.starts_with(prefix) {
        let r: Request =
            serde_json::from_slice(&line[prefix.len()..]).map_err(|e| e.to_string())?;
        let valid = match r.operation.as_str() {
            "send" => r.value.as_str().is_some_and(|s| s.len() <= 16384),
            "expect" => {
                r.value
                    .as_str()
                    .is_some_and(|s| !s.is_empty() && s.len() <= 256)
                    && r.timeout.unwrap_or(10000) > 0
                    && r.timeout.unwrap_or(10000) <= 60000
            }
            "sleep" => r.value.as_u64().is_some_and(|n| n <= 30000),
            _ => false,
        };
        if !valid {
            return Err("스크립트 요청 형식 또는 제한을 확인하세요.".into());
        }
        Ok(ScriptEvent::Request { request: r })
    } else {
        Ok(ScriptEvent::Log {
            text: String::from_utf8_lossy(line).into_owned(),
        })
    }
}
#[tauri::command]
pub async fn start_script(
    id: String,
    request: ProgramRequest,
    output: Channel<ScriptEvent>,
    state: State<'_, Scripts>,
) -> Result<(), String> {
    uuid::Uuid::parse_str(&id).map_err(|_| "잘못된 실행 ID")?;
    if !matches!(request.mode.as_str(), "python" | "javascript") {
        return Err("Python과 Node.js만 세션 API를 지원합니다.".into());
    }
    let plan = plan(&request)?;
    let mut args = plan.args;
    if request.mode == "python" {
        args.splice(
            0..1,
            [
                "-u".into(),
                "-c".into(),
                include_str!("script_api/python.py").into(),
            ],
        );
    } else {
        args.splice(
            0..0,
            [
                "-e".into(),
                include_str!("script_api/javascript.cjs").into(),
            ],
        );
    }
    let mut command = tokio::process::Command::new(plan.executable);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(cwd) = request.cwd.filter(|s| !s.is_empty()) {
        command.current_dir(cwd);
    } else if let Some(parent) = request
        .script
        .as_deref()
        .and_then(|s| std::path::Path::new(s).parent())
    {
        command.current_dir(parent);
    }
    command.env("PYTHONIOENCODING", "utf-8");
    let (cancel, mut cancelled) = watch::channel(false);
    let (tx, mut rx) = mpsc::channel::<String>(8);
    {
        let mut map = state.0.lock().map_err(|_| "스크립트 상태 오류")?;
        if map.len() >= 4 || map.contains_key(&id) {
            return Err("동시에 최대 4개 스크립트를 실행할 수 있습니다.".into());
        }
        map.insert(
            id.clone(),
            Control {
                cancel,
                responses: tx,
            },
        );
    }
    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            state.0.lock().map_err(|_| "상태 오류")?.remove(&id);
            return Err(e.to_string());
        }
    };
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let registry = state.inner().clone();
    tokio::spawn(async move {
        let mut out = [0; 8192];
        let mut err = [0; 8192];
        let mut pending = Vec::new();
        let mut out_done = false;
        let mut err_done = false;
        let mut total = 0usize;
        let result=async{loop{tokio::select!{
 _=cancelled.changed()=>return Err("스크립트를 중지했습니다.".to_string()),
 response=rx.recv()=>{if let Some(response)=response{stdin.write_all(response.as_bytes()).await.map_err(|e|e.to_string())?;stdin.write_all(b"\n").await.map_err(|e|e.to_string())?;}else{return Err("응답 채널 종료".into());}},
 n=stdout.read(&mut out),if !out_done=>{let n=n.map_err(|e|e.to_string())?;if n==0{out_done=true;if !pending.is_empty(){output.send(decode(&pending)?).map_err(|e|e.to_string())?;pending.clear();}}else{total+=n;if total>4*1024*1024{return Err("스크립트 출력 제한 4 MiB 초과".into());}pending.extend_from_slice(&out[..n]);while let Some(end)=pending.iter().position(|b|*b==b'\n'){let line:Vec<_>=pending.drain(..=end).collect();output.send(decode(&line)?).map_err(|e|e.to_string())?;}if pending.len()>65536{return Err("스크립트 출력 한 줄 제한 64 KiB 초과".into());}}},
 n=stderr.read(&mut err),if !err_done=>{let n=n.map_err(|e|e.to_string())?;if n==0{err_done=true;}else{total+=n;if total>4*1024*1024{return Err("스크립트 출력 제한 초과".into());}output.send(ScriptEvent::Log{text:String::from_utf8_lossy(&err[..n]).into_owned()}).map_err(|e|e.to_string())?;}},
 status=child.wait(),if out_done&&err_done=>{let status=status.map_err(|e|e.to_string())?;return if status.success(){Ok(())}else{Err(format!("스크립트 종료: {status}"))};}
 }}}.await;
        let _ = child.kill().await;
        let _ = child.wait().await;
        if let Ok(mut map) = registry.0.lock() {
            map.remove(&id);
        }
        let _ = output.send(ScriptEvent::Closed {
            message: result.err().unwrap_or_else(|| "스크립트 완료".into()),
        });
    });
    Ok(())
}
#[tauri::command]
pub async fn script_response(
    id: String,
    response: String,
    state: State<'_, Scripts>,
) -> Result<(), String> {
    if response.len() > 65536 {
        return Err("응답 크기 초과".into());
    }
    let control = state
        .0
        .lock()
        .map_err(|_| "스크립트 상태 오류")?
        .get(&id)
        .cloned()
        .ok_or("스크립트가 종료되었습니다.")?;
    control
        .responses
        .try_send(response)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn stop_script(id: String, state: State<'_, Scripts>) -> Result<(), String> {
    if let Some(control) = state.0.lock().map_err(|_| "스크립트 상태 오류")?.get(&id) {
        let _ = control.cancel.send(true);
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_rejects_invalid_operations_and_bounds() {
        assert!(decode(b"\x1ePTERM {\"seq\":1,\"operation\":\"expect\",\"value\":\"ready\",\"timeout\":1000}").is_ok());
        assert!(decode(b"\x1ePTERM {\"seq\":1,\"operation\":\"sleep\",\"value\":30001}").is_err());
        assert!(
            decode(b"\x1ePTERM {\"seq\":1,\"operation\":\"delete\",\"value\":\"all\"}").is_err()
        );
        assert!(matches!(
            decode(b"ordinary script log").unwrap(),
            ScriptEvent::Log { .. }
        ));
    }
}
