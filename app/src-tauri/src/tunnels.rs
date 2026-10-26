//! Local forwarding over an existing verified SSH transport.
use crate::{Sessions, sender};
use serde::Serialize;
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use tauri::State;
use tokio::{net::TcpListener, sync::watch, task::JoinSet};
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct TunnelInfo { id:String, session_id:String, local_port:u16, host:String, port:u16, error:Option<String> }
struct Tunnel { info:TunnelInfo, cancel:watch::Sender<bool> }
#[derive(Clone, Default)]
pub struct Tunnels(Arc<Mutex<HashMap<String,Tunnel>>>);
#[tauri::command]
pub fn list_tunnels(state:State<'_,Tunnels>)->Result<Vec<TunnelInfo>,String>{Ok(state.0.lock().map_err(|_|"터널 상태 오류")?.values().map(|t|t.info.clone()).collect())}
#[tauri::command]
pub fn stop_tunnel(id:String,state:State<'_,Tunnels>)->Result<(),String>{if let Some(t)=state.0.lock().map_err(|_|"터널 상태 오류")?.remove(&id){let _=t.cancel.send(true);}Ok(())}
#[tauri::command]
pub async fn start_tunnel(session_id:String,local_port:u16,host:String,port:u16,sessions:State<'_,Sessions>,state:State<'_,Tunnels>)->Result<TunnelInfo,String>{
 if host.is_empty()||host.len()>253||host.chars().any(|c|c.is_whitespace()||c.is_control())||port==0{return Err("대상 주소와 포트를 확인하세요.".into());}
 let control=sender(&sessions,&session_id)?;
 if *control.cancel.borrow(){return Err("SSH 연결이 종료되었습니다.".into());}
 let transport=control.transport.clone().ok_or("SSH 연결 후 사용할 수 있습니다.")?;
 let listener=TcpListener::bind(("127.0.0.1",local_port)).await.map_err(|e|e.to_string())?;
 let info=TunnelInfo{id:uuid::Uuid::new_v4().to_string(),session_id,local_port:listener.local_addr().map_err(|e|e.to_string())?.port(),host:host.clone(),port,error:None};
 let (cancel,mut cancelled)=watch::channel(false);
 {let mut map=state.0.lock().map_err(|_|"터널 상태 오류")?;if map.len()>=32{return Err("최대 32개 터널을 지원합니다.".into());}map.insert(info.id.clone(),Tunnel{info:info.clone(),cancel});}
 let registry=state.inner().clone();let id=info.id.clone();let mut parent=control.cancel.subscribe();
 tauri::async_runtime::spawn(async move {
  let mut tasks=JoinSet::new();
  if *parent.borrow(){if let Ok(mut map)=registry.0.lock(){map.remove(&id);}return;}
  loop{tokio::select!{
   _=cancelled.changed()=>break,
   _=parent.changed()=>break,
   _=tasks.join_next(),if !tasks.is_empty()=>{},
   accepted=listener.accept()=>{
    let (mut socket,peer)=match accepted{Ok(v)=>v,Err(_)=>break};
    if tasks.len()>=64{drop(socket);continue;}
    let transport=transport.clone();let host=host.clone();let registry=registry.clone();let id=id.clone();
    tasks.spawn(async move {
     let result=async {
      let channel=tokio::time::timeout(Duration::from_secs(15),transport.channel_open_direct_tcpip(host,port as u32,peer.ip().to_string(),peer.port() as u32)).await.map_err(|_|"터널 연결 시간 초과".to_string())?.map_err(|e|e.to_string())?;
      tokio::io::copy_bidirectional(&mut socket,&mut channel.into_stream()).await.map_err(|e|e.to_string())?;
      Ok::<(),String>(())
     }.await;
     if let Err(error)=result{if let Ok(mut map)=registry.0.lock(){if let Some(t)=map.get_mut(&id){t.info.error=Some(error);}}}
    });
   }
  }}
  tasks.abort_all();while tasks.join_next().await.is_some(){}
  if let Ok(mut map)=registry.0.lock(){map.remove(&id);}
 });
 Ok(info)
}
