use std::{collections::HashMap,sync::{Arc,Mutex},time::Duration};
use tokio::sync::{watch,Semaphore};
#[derive(Clone)]
pub struct Route{pub host:String,pub port:u16,pub cancel:watch::Sender<bool>,pub limit:Arc<Semaphore>}
pub type Routes=Arc<Mutex<HashMap<u32,Route>>>;
pub fn accept(channel:russh::Channel<russh::client::Msg>,reply:russh::client::ChannelOpenHandle,route:Route){
 let Ok(permit)=route.limit.clone().try_acquire_owned() else{return;};
 tokio::spawn(async move{let _permit=permit;let mut cancel=route.cancel.subscribe();if *cancel.borrow(){return;}
  tokio::select!{_=cancel.changed()=>{},_=async{
   if let Ok(Ok(mut socket))=tokio::time::timeout(Duration::from_secs(10),tokio::net::TcpStream::connect((route.host.as_str(),route.port))).await{reply.accept().await;let _=tokio::io::copy_bidirectional(&mut socket,&mut channel.into_stream()).await;}
  }=>{}}
 });
}
