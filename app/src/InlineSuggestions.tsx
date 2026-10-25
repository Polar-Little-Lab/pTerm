import {useEffect,useRef,useState} from 'react';
import type {Session,Snippet} from './types';
import {shellPrefix,suggestCommands} from './command-suggestions';

export function InlineSuggestions({session,snippets,enabled,surface}:{session:Session;snippets?:Snippet[];enabled:boolean;surface:React.RefObject<HTMLDivElement|null>}) {
 const [candidate,setCandidate]=useState<{prefix:string;items:Snippet[];left:number;top:number}|null>(null);
 const current=useRef(candidate);current.current=candidate;
 const eligible=useRef(false);
 function readPrefix(){
  const terminal=session.terminal, b=terminal.buffer.active;
  if(b.type!=='normal'||b.viewportY!==b.baseY)return null;
  const line=b.getLine(b.baseY+b.cursorY);
  if(!line)return null;
  return shellPrefix(line.translateToString(false,0,b.cursorX),line.translateToString(true,b.cursorX),line.isWrapped);
 }
 function accept(snippet:Snippet){
  const c=current.current;
  // Re-read the cursor and line so a delayed click cannot append to stale input.
  if(!enabled||!snippets||!c||readPrefix()!==c.prefix)return;
  eligible.current=false;current.current=null;setCandidate(null);
  session.terminal.input(snippet.command.slice(c.prefix.length),true);
  session.terminal.focus();
 }
 const acceptRef=useRef(accept);acceptRef.current=accept;
 useEffect(()=>{
  eligible.current=false;current.current=null;setCandidate(null);
  if(!enabled||!snippets?.length)return;
  const terminal=session.terminal;
  const hide=()=>{current.current=null;setCandidate(null);};
  const input=terminal.onData(data=>{
   if(/^[^\x00-\x1f\x7f]+$/u.test(data)||data==='\x7f'||data==='\b')eligible.current=true;
   else eligible.current=false;
   hide();
  });
  const parsed=terminal.onWriteParsed(()=>{
   if(!eligible.current)return;
   const prefix=readPrefix(),root=surface.current;
   const items=prefix?suggestCommands(snippets,prefix):[];
   if(!prefix||!items.length||!root){hide();return;}
   const b=terminal.buffer.active,rowHeight=root.clientHeight/terminal.rows;
   const next={prefix,items,left:Math.max(0,Math.min(b.cursorX*root.clientWidth/terminal.cols,root.clientWidth-380)),top:root.offsetTop+Math.max(0,Math.min((b.cursorY+1)*rowHeight,root.clientHeight-210))};
   current.current=next;setCandidate(next);
  });
  const scroll=terminal.onScroll(()=>{eligible.current=false;hide();});
  const key=(e:KeyboardEvent)=>{
   if(e.isComposing||!current.current)return;
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();eligible.current=false;hide();}
   else if(e.key==='Tab'&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
    e.preventDefault();e.stopImmediatePropagation();acceptRef.current(current.current.items[0]);
   } else if(e.key==='Enter'||e.key.startsWith('Arrow')||e.key==='Home'||e.key==='End'||e.ctrlKey||e.metaKey){eligible.current=false;hide();}
  };
  const root=surface.current;root?.addEventListener('keydown',key,true);
  const blur=()=>{eligible.current=false;hide();};root?.addEventListener('focusout',blur);
  return()=>{input.dispose();parsed.dispose();scroll.dispose();root?.removeEventListener('keydown',key,true);root?.removeEventListener('focusout',blur);};
 },[enabled,snippets,session]);
 if(!enabled||!snippets||!candidate)return null;
 return <div className="inline-suggestions" style={{left:candidate.left,top:candidate.top}} aria-label="저장 명령 제안">
  <div className="inline-suggestions-label">저장 명령 <span>Tab으로 채우기 · Esc 닫기</span></div>
  {candidate.items.map((s,i)=><button key={s.id} onMouseDown={e=>e.preventDefault()} onClick={()=>accept(s)} title={s.name}><code><span>{candidate.prefix}</span>{s.command.slice(candidate.prefix.length)}</code>{i===0&&<kbd>Tab</kbd>}</button>)}
 </div>;
}
