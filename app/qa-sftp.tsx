import './src/useAppearance';
// Development-only in-memory adapter. No filesystem, SSH, or authentication.
import {createRoot} from 'react-dom/client';
import {FilesPane,type FilesApi,type Entry} from './src/FilesPane';
import './src/style.css';import './src/terminal-layout.css';import './src/themes.css';
const entries=(names:string[]):Entry[]=>names.map(name=>({name,isDir:name==='projects',isLink:false,size:4096,modified:1792800000}));
const local=entries(['projects','notes.txt','config.json','.env']),remote=entries(['projects','server.log','README.md']);
const cancelled=new Set<string>();
const api:FilesApi={list:async(l,path)=>({path:path||(l?'/Users/fixture/Downloads':'/home/deploy'),entries:[...(l?local:remote)]}),choose:async()=>'/Users/fixture/Documents',mkdir:async(path)=>{remote.push({name:path.split('/').at(-1)!,isDir:true,isLink:false,size:0});},cancel:async id=>{cancelled.add(id);},transfer:async(lp,rp,upload,id,progress)=>{for(let i=0;i<=4;i++){await new Promise(r=>setTimeout(r,200));if(cancelled.has(id))throw Error('전송 취소됨');progress({bytes:i*1024,total:4096});}const target=upload?remote:local,name=(upload?rp:lp).split('/').at(-1)!;if(target.some(e=>e.name===name))throw Error('동일한 이름의 파일이 있습니다.');target.push({name,isDir:false,isLink:false,size:4096});}};
createRoot(document.getElementById('root')!).render(<div className="files-deck" style={{position:'relative',inset:0,width:new URLSearchParams(location.search).has('narrow')?900:1280,height:new URLSearchParams(location.search).has('narrow')?620:820,maxWidth:'100vw'}}><FilesPane id="fixture" name="Development API · deploy@dev.example.test" api={api} onTerminal={()=>{}}/></div>);
