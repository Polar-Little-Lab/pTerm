import {useEffect,useRef,useState} from 'react';
import {Channel,invoke,isTauri} from '@tauri-apps/api/core';
import {open} from '@tauri-apps/plugin-dialog';
import type {Session} from './types';
import {scriptSession,type ScriptRequest} from './script-session';
export function ScriptTools({current,disabled=false,onBusy}:{current:Session;disabled?:boolean;onBusy?:(busy:boolean)=>void}){
 const [engine,setEngine]=useState('python'),[path,setPath]=useState(''),[executable,setExecutable]=useState(''),[args,setArgs]=useState('[]'),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[log,setLog]=useState('');
 useEffect(()=>{onBusy?.(busy);return()=>onBusy?.(false);},[busy,onBusy]);
 const run=useRef<{id:string;abort:AbortController}|null>(null);
 const stop=()=>{const value=run.current;value?.abort.abort();if(value)void invoke('stop_script',{id:value.id}).catch(()=>{});};
 useEffect(()=>{setReview(false);const timer=setInterval(()=>{if(current.closed||current.status!=='connected')stop();},250);return()=>{clearInterval(timer);stop();};},[current]);
 async function execute(){
  if(!review){setReview(true);return;}
  const id=crypto.randomUUID(),abort=new AbortController();run.current={id,abort};setBusy(true);setLog('');let queue=Promise.resolve();const evaluate=scriptSession(current,abort.signal);
  const output=new Channel<{type:'request';request:ScriptRequest}|{type:'log';text:string}|{type:'closed';message:string}>();
  output.onmessage=event=>{if(run.current?.id!==id)return;if(event.type==='closed'){abort.abort();run.current=null;setBusy(false);setReview(false);setLog(s=>(s+'\n'+event.message).slice(-65536));}else if(event.type==='log')setLog(s=>(s+event.text).slice(-65536));else queue=queue.then(async()=>{let response;try{response={seq:event.request.seq,value:await evaluate(event.request)};}catch(error){response={seq:event.request.seq,error:String(error)};}if(!abort.signal.aborted)await invoke('script_response',{id,response:JSON.stringify(response)});}).catch(error=>{setLog(s=>(s+'\n'+String(error)).slice(-65536));stop();});};
  try{const extra=JSON.parse(args);if(!Array.isArray(extra)||!extra.every(x=>typeof x==='string'))throw new Error('인자는 JSON 문자열 배열이어야 합니다.');await invoke('start_script',{id,request:{mode:engine,script:path,executable:executable||undefined,args:extra},output});if(abort.signal.aborted)await invoke('stop_script',{id});}catch(error){abort.abort();run.current=null;setBusy(false);setReview(false);setLog(String(error));}
 }
 return <details><summary>Python / JavaScript로 현재 세션 자동화</summary><p>대상: <strong>{current.host.name||current.host.host}</strong>. 스크립트는 이 Mac에서 실행되고 선택한 세션에 실제 입력을 보냅니다. 신뢰하는 스크립트만 실행하세요. 화면을 닫거나 연결이 끊어지면 중지합니다.</p>
 <label>실행 언어<select disabled={busy} value={engine} onChange={e=>{setEngine(e.target.value);setReview(false);}}><option value="python">Python 3</option><option value="javascript">Node.js</option></select></label>
 <label>스크립트 파일<div className="tools-row"><input disabled={busy} value={path} onChange={e=>{setPath(e.target.value);setReview(false);}}/><button disabled={busy||!isTauri()} onClick={()=>void open({multiple:false}).then(value=>{if(typeof value==='string'){setPath(value);setReview(false);}}).catch(e=>setLog(String(e)))}>파일 선택</button></div></label>
 <label>인자 · JSON 배열<input disabled={busy} value={args} onChange={e=>{setArgs(e.target.value);setReview(false);}}/></label><label>실행 엔진 절대 경로 · 비우면 자동 탐색<input disabled={busy} value={executable} onChange={e=>{setExecutable(e.target.value);setReview(false);}}/></label>
 <pre className="tools-output">{engine==='python'?'import pterm\npterm.send("echo ready\\n")\npterm.expect("ready", timeout=10000)':'// .mjs 파일: default async 함수 또는 top-level await\nexport default async (pterm) => {\n  await pterm.send("echo ready\\n");\n  await pterm.expect("ready", 10000);\n};'}</pre>
 {review&&<p role="status">{path}를 {current.host.name} 세션에 연결해 실행합니다. 기존 Xshell 스크립트는 pterm API로 변환해야 합니다.</p>}<div className="tools-row"><button disabled={disabled||busy||!isTauri()||!path||current.closed||current.status!=='connected'} onClick={()=>void execute()}>{review?'확인한 스크립트 실행':'스크립트 실행 확인'}</button><button disabled={!busy} onClick={stop}>스크립트 중지</button></div><pre className="tools-output" aria-live="polite">{log}</pre></details>;
}
