//! Local forwarding over an existing verified SSH transport.
use crate::{Sessions, sender};
use serde::Serialize;
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use tauri::State;
use tokio::{net::TcpListener, sync::watch, task::JoinSet};
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct TunnelInfo { id:String, session_id:String, local_port:u16, remote:bool, dynamic:bool, host:String, port:u16, error:Option<String> }
struct Tunnel { info:TunnelInfo, cancel:watch::Sender<bool> }
#[derive(Clone, Default)]
pub struct Tunnels(Arc<Mutex<HashMap<String,Tunnel>>>);
#[tauri::command]
pub fn list_tunnels(state:State<'_,Tunnels>)->Result<Vec<TunnelInfo>,String>{Ok(state.0.lock().map_err(|_|"터널 상태 오류")?.values().map(|t|t.info.clone()).collect())}
#[tauri::command]
pub fn stop_tunnel(id:String,state:State<'_,Tunnels>)->Result<(),String>{if let Some(t)=state.0.lock().map_err(|_|"터널 상태 오류")?.remove(&id){let _=t.cancel.send(true);}Ok(())}
#[tauri::command]
pub async fn start_tunnel(session_id:String,local_port:u16,host:String,port:u16,dynamic:Option<bool>,remote:Option<bool>,sessions:State<'_,Sessions>,state:State<'_,Tunnels>)->Result<TunnelInfo,String>{
 let dynamic=dynamic.unwrap_or(false);
 let remote=remote.unwrap_or(false);
 if remote&&dynamic{return Err("터널 방식이 잘못되었습니다.".into());}
 if !dynamic&&(host.is_empty()||host.len()>253||host.chars().any(|c|c.is_whitespace()||c.is_control())||port==0){return Err("대상 주소와 포트를 확인하세요.".into());}
 let control=sender(&sessions,&session_id)?;
 if *control.cancel.borrow(){return Err("SSH 연결이 종료되었습니다.".into());}
 let transport=control.transport.clone().ok_or("SSH 연결 후 사용할 수 있습니다.")?;
 if remote{return start_remote(session_id,local_port,host,port,control,state.inner().clone()).await;}
 let listener=TcpListener::bind(("127.0.0.1",local_port)).await.map_err(|e|e.to_string())?;
 let info=TunnelInfo{id:uuid::Uuid::new_v4().to_string(),session_id,remote:false,dynamic,local_port:listener.local_addr().map_err(|e|e.to_string())?.port(),host:host.clone(),port,error:None};
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
      let (target,target_port)=if dynamic{tokio::time::timeout(Duration::from_secs(10),crate::socks::negotiate(&mut socket)).await.map_err(|_|"SOCKS 협상 시간 초과".to_string())??}else{(host,port)};
      let opened=tokio::time::timeout(Duration::from_secs(15),transport.channel_open_direct_tcpip(target,target_port as u32,peer.ip().to_string(),peer.port() as u32)).await;
      let channel=match opened{Ok(Ok(channel))=>channel,other=>{if dynamic{let _=crate::socks::reply(&mut socket,5).await;}return Err(match other{Ok(Err(error))=>error.to_string(),_=>"터널 연결 시간 초과".into()});}};
      if dynamic{crate::socks::reply(&mut socket,0).await?;}
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

async fn start_remote(session_id:String,listen_port:u16,host:String,port:u16,control:crate::SessionControl,state:Tunnels)->Result<TunnelInfo,String>{
 if listen_port==0{return Err("원격 리슨 포트는 1–65535로 지정하세요.".into());}
 let transport=control.transport.clone().ok_or("SSH 연결이 필요합니다.")?;
 let (cancel,mut cancelled)=watch::channel(false);
 let info=TunnelInfo{id:uuid::Uuid::new_v4().to_string(),session_id,local_port:listen_port,remote:true,dynamic:false,host:host.clone(),port,error:None};
 {let mut all=state.0.lock().map_err(|_|"터널 상태 오류")?;if all.len()>=32{return Err("최대 32개 터널을 지원합니다.".into());}let mut routes=control.remote_routes.lock().map_err(|_|"경로 상태 오류")?;if routes.contains_key(&(listen_port as u32)){return Err("이미 사용 중인 원격 포트입니다.".into());}routes.insert(listen_port as u32,crate::remote_forward::Route{host,port,cancel:cancel.clone(),limit:Arc::new(tokio::sync::Semaphore::new(64))});all.insert(info.id.clone(),Tunnel{info:info.clone(),cancel:cancel.clone()});}
 let started=tokio::time::timeout(Duration::from_secs(15),transport.tcpip_forward("127.0.0.1",listen_port as u32)).await;
 if !matches!(started,Ok(Ok(_))){let _=cancel.send(true);if let Ok(mut map)=control.remote_routes.lock(){map.remove(&(listen_port as u32));}if let Ok(mut map)=state.0.lock(){map.remove(&info.id);}let _=tokio::time::timeout(Duration::from_secs(3),transport.cancel_tcpip_forward("127.0.0.1",listen_port as u32)).await;return Err("서버가 원격 포워딩을 허용하지 않거나 포트가 사용 중입니다.".into());}
 let id=info.id.clone();let mut parent=control.cancel.subscribe();
 tokio::spawn(async move{if !*parent.borrow()&&!*cancelled.borrow(){tokio::select!{_=parent.changed()=>{},_=cancelled.changed()=>{}}}let _=cancel.send(true);if let Ok(mut map)=control.remote_routes.lock(){map.remove(&(listen_port as u32));}let _=tokio::time::timeout(Duration::from_secs(3),transport.cancel_tcpip_forward("127.0.0.1",listen_port as u32)).await;if let Ok(mut map)=state.0.lock(){map.remove(&id);}});
 Ok(info)
}
