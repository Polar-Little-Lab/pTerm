use crate::{Event,Input,SessionControl,Sessions};
use serde::{Deserialize,Serialize};
use std::{collections::VecDeque,fs::{File,OpenOptions},os::unix::{fs::OpenOptionsExt,io::AsRawFd}};
use tauri::{State,ipc::Channel};
use tokio::sync::{mpsc,watch};
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct SerialRequest{pub path:String,pub baud:u32,pub data_bits:u8,pub stop_bits:u8,pub parity:String,pub flow:String}
#[derive(Serialize)]
pub struct SerialInfo{pub path:String,pub baud:u32}
#[tauri::command]
pub fn list_serial_ports()->Result<Vec<String>,String>{let mut ports=Vec::new();for item in std::fs::read_dir("/dev").map_err(|e|e.to_string())?{let item=item.map_err(|e|e.to_string())?;if item.file_name().to_string_lossy().starts_with("cu."){ports.push(item.path().to_string_lossy().to_string());}}ports.sort();Ok(ports)}
struct SerialPort{file:File,original:libc::termios}
impl Drop for SerialPort{fn drop(&mut self){unsafe{libc::tcsetattr(self.file.as_raw_fd(),libc::TCSANOW,&self.original);libc::ioctl(self.file.as_raw_fd(),libc::TIOCNXCL as libc::c_ulong);}}}
fn open(request:&SerialRequest)->Result<SerialPort,String>{
 if !request.path.starts_with("/dev/cu.")||request.path[5..].contains('/')||!matches!(request.baud,1200|2400|4800|9600|19200|38400|57600|115200|230400)||!matches!(request.data_bits,7|8)||!matches!(request.stop_bits,1|2)||!matches!(request.parity.as_str(),"none"|"even"|"odd")||!matches!(request.flow.as_str(),"none"|"software"|"hardware"){return Err("시리얼 설정을 확인하세요.".into());}
 let file=OpenOptions::new().read(true).write(true).custom_flags(libc::O_NOCTTY|libc::O_NONBLOCK|libc::O_NOFOLLOW).open(&request.path).map_err(|e|e.to_string())?;
 let fd=file.as_raw_fd();let mut original=unsafe{std::mem::zeroed::<libc::termios>()};
 if unsafe{libc::tcgetattr(fd,&mut original)}!=0{return Err(std::io::Error::last_os_error().to_string());}
 if unsafe{libc::ioctl(fd,libc::TIOCEXCL as libc::c_ulong)}!=0{return Err(std::io::Error::last_os_error().to_string());}let port=SerialPort{file,original};
 let mut settings=original;unsafe{libc::cfmakeraw(&mut settings);if libc::cfsetspeed(&mut settings,request.baud as libc::speed_t)!=0{return Err(std::io::Error::last_os_error().to_string());}}
 settings.c_cflag|=libc::CLOCAL|libc::CREAD;settings.c_cflag&=!(libc::CSIZE|libc::PARENB|libc::PARODD|libc::CSTOPB|libc::CRTSCTS);settings.c_cflag|=if request.data_bits==7{libc::CS7}else{libc::CS8};
 if request.parity!="none"{settings.c_cflag|=libc::PARENB;settings.c_iflag|=libc::INPCK;}if request.parity=="odd"{settings.c_cflag|=libc::PARODD;}if request.stop_bits==2{settings.c_cflag|=libc::CSTOPB;}if request.flow=="hardware"{settings.c_cflag|=libc::CRTSCTS;}if request.flow=="software"{settings.c_iflag|=libc::IXON|libc::IXOFF;}
 if unsafe{libc::tcsetattr(fd,libc::TCSANOW,&settings)}!=0{return Err(std::io::Error::last_os_error().to_string());}Ok(port)
}
#[tauri::command]
pub async fn start_serial(id:String,request:SerialRequest,output:Channel<Event>,state:State<'_,Sessions>)->Result<SerialInfo,String>{
 uuid::Uuid::parse_str(&id).map_err(|_|"잘못된 세션 ID")?;let(tx,mut rx)=mpsc::channel(64);let(cancel,receiver)=watch::channel(false);
 {let mut map=state.0.lock().map_err(|_|"세션 상태 오류")?;if map.len()>=16||map.contains_key(&id){return Err("세션 제한 초과".into());}map.insert(id.clone(),SessionControl{remote_routes:Default::default(),input:tx,cancel,transport:None});}
 let sessions=state.inner().clone();let(ready,wait)=tokio::sync::oneshot::channel();
 tauri::async_runtime::spawn_blocking(move||{
 let port=match open(&request){Ok(port)=>port,Err(error)=>{let _=ready.send(Err(error.clone()));if let Ok(mut map)=sessions.0.lock(){map.remove(&id);}let _=output.send(Event::Closed{message:error,retryable:false});return;}};
 let _=ready.send(Ok(SerialInfo{path:request.path,baud:request.baud}));let fd=port.file.as_raw_fd();let mut credits=8usize;let mut pending=VecDeque::new();let mut bytes=[0u8;16384];
 let result=(||->Result<(),String>{loop{
 if *receiver.borrow()||receiver.has_changed().is_err(){return Ok(());}
 for _ in 0..8{match rx.try_recv(){Ok(Input::Data(data))=>{if pending.len()+data.len()>1024*1024{return Err("입력 대기열 제한 초과".into());}pending.extend(data);},Ok(Input::Ack)=>credits=(credits+1).min(8),Ok(Input::Resize(..))=>{},Err(mpsc::error::TryRecvError::Empty)=>break,Err(_)=>return Ok(())}}
 if !pending.is_empty(){let data=pending.make_contiguous();let n=unsafe{libc::write(fd,data.as_ptr().cast(),data.len())};if n>0{pending.drain(..n as usize);}else if n<0&&!matches!(std::io::Error::last_os_error().kind(),std::io::ErrorKind::WouldBlock|std::io::ErrorKind::Interrupted){return Err(std::io::Error::last_os_error().to_string());}}
 if credits>0{let n=unsafe{libc::read(fd,bytes.as_mut_ptr().cast(),bytes.len())};if n>0{credits-=1;output.send(Event::Data{bytes:bytes[..n as usize].to_vec()}).map_err(|e|e.to_string())?;}else if n<0&&!matches!(std::io::Error::last_os_error().kind(),std::io::ErrorKind::WouldBlock|std::io::ErrorKind::Interrupted){return Err(std::io::Error::last_os_error().to_string());}}
 let mut poll=libc::pollfd{fd,events:if credits>0{libc::POLLIN}else{0},revents:0};unsafe{libc::poll(&mut poll,1,20);}if poll.revents&(libc::POLLHUP|libc::POLLERR|libc::POLLNVAL)!=0{return Err("시리얼 장치 연결이 종료되었습니다.".into());}
 }})();drop(port);if let Ok(mut map)=sessions.0.lock(){map.remove(&id);}let _=output.send(Event::Closed{message:result.err().unwrap_or_else(||"시리얼 연결 종료".into()),retryable:false});
 });wait.await.map_err(|_|"시리얼 시작 실패".to_string())?
}
#[cfg(test)]mod tests{use super::*;#[test]fn reject_regular_files_and_invalid_settings(){let r=SerialRequest{path:"/tmp/a".into(),baud:9600,data_bits:8,stop_bits:1,parity:"none".into(),flow:"none".into()};assert!(open(&r).is_err());}}
