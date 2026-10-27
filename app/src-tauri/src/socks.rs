use tokio::io::{AsyncRead,AsyncReadExt,AsyncWrite,AsyncWriteExt};
/// SOCKS5 CONNECT with no authentication, exposed only through a loopback listener.
pub async fn negotiate<S:AsyncRead+AsyncWrite+Unpin>(stream:&mut S)->Result<(String,u16),String>{
 let version=stream.read_u8().await.map_err(|e|e.to_string())?;let count=stream.read_u8().await.map_err(|e|e.to_string())?;
 if version!=5||count==0{return Err("SOCKS5 협상 오류".into());}
 let mut methods=vec![0;count as usize];stream.read_exact(&mut methods).await.map_err(|e|e.to_string())?;
 if !methods.contains(&0){stream.write_all(&[5,255]).await.map_err(|e|e.to_string())?;return Err("SOCKS 인증 방식 미지원".into());}
 stream.write_all(&[5,0]).await.map_err(|e|e.to_string())?;
 let mut header=[0;4];stream.read_exact(&mut header).await.map_err(|e|e.to_string())?;
 if header[0]!=5||header[1]!=1||header[2]!=0{reply(stream,7).await?;return Err("SOCKS CONNECT만 지원합니다.".into());}
 let host=match header[3]{
  1=>{let mut bytes=[0;4];stream.read_exact(&mut bytes).await.map_err(|e|e.to_string())?;std::net::Ipv4Addr::from(bytes).to_string()},
  3=>{let length=stream.read_u8().await.map_err(|e|e.to_string())?;let mut bytes=vec![0;length as usize];stream.read_exact(&mut bytes).await.map_err(|e|e.to_string())?;String::from_utf8(bytes).map_err(|_|"SOCKS 주소 오류")?},
  4=>{let mut bytes=[0;16];stream.read_exact(&mut bytes).await.map_err(|e|e.to_string())?;std::net::Ipv6Addr::from(bytes).to_string()},
  _=>{reply(stream,8).await?;return Err("SOCKS 주소 형식 미지원".into());}
 };
 let port=stream.read_u16().await.map_err(|e|e.to_string())?;
 if host.is_empty()||host.chars().any(|c|c.is_whitespace()||c.is_control())||port==0{reply(stream,8).await?;return Err("SOCKS 대상 주소 오류".into());}
 Ok((host,port))
}
pub async fn reply<S:AsyncWrite+Unpin>(stream:&mut S,status:u8)->Result<(),String>{stream.write_all(&[5,status,0,1,0,0,0,0,0,0]).await.map_err(|e|e.to_string())}
#[cfg(test)]
mod tests{
 use super::*;
 #[tokio::test]
 async fn domain_connect(){let(mut client,mut server)=tokio::io::duplex(256);let task=tokio::spawn(async move{negotiate(&mut server).await});client.write_all(&[5,1,0]).await.unwrap();let mut response=[0;2];client.read_exact(&mut response).await.unwrap();assert_eq!(response,[5,0]);client.write_all(&[5,1,0,3,4,b't',b'e',b's',b't',1,187]).await.unwrap();assert_eq!(task.await.unwrap().unwrap(),("test".into(),443));}
 #[tokio::test]
 async fn unsupported_auth(){let(mut client,mut server)=tokio::io::duplex(256);let task=tokio::spawn(async move{negotiate(&mut server).await});client.write_all(&[5,1,2]).await.unwrap();let mut response=[0;2];client.read_exact(&mut response).await.unwrap();assert_eq!(response,[5,255]);assert!(task.await.unwrap().is_err());}
}
