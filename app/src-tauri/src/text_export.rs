use std::path::Path;
#[tauri::command]
pub async fn save_text_file(path:String,text:String)->Result<(),String>{
 if !Path::new(&path).is_absolute()||text.len()>8*1024*1024{return Err("파일 경로나 크기를 확인하세요.".into());}
 tokio::fs::write(path,text.as_bytes()).await.map_err(|e|e.to_string())
}
