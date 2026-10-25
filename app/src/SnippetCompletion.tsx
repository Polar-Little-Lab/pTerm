import {useEffect,useRef,useState} from 'react';
import {Code2,Search,X,LockKeyhole} from 'lucide-react';
import type {Snippet} from './types';

export function SnippetCompletion({snippets,left,top,onChoose,onClose,locked=false,busy=false,error,onUnlock,onManage}:{snippets:Snippet[];locked?:boolean;busy?:boolean;error?:string;onUnlock?:()=>void;onManage?:()=>void;left:number;top:number;onChoose:(snippet:Snippet)=>void;onClose:(restoreFocus?:boolean)=>void}) {
 const [query,setQuery]=useState('');const [index,setIndex]=useState(0);
 const root=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);
 const results=snippets.filter(s=>`${s.name} ${s.command}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const selected=Math.min(index,Math.max(0,results.length-1));
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{(input.current||root.current?.querySelector<HTMLButtonElement>('button'))?.focus();const dismiss=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))close.current(false);};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss);},[locked]);
 useEffect(()=>{root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[selected,query]);
 return <div ref={root} className="snippet-completion" role="dialog" aria-label="저장 명령 자동완성" style={{left,top}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose(true);}}}>
  {locked?<div className="completion-locked"><LockKeyhole size={20}/><strong>저장 명령 잠금 해제</strong><p>암호화된 저장 명령을 불러옵니다.<br/>터미널 연결은 그대로 유지됩니다.</p>{error&&<p role="alert">{error}</p>}<button disabled={busy||!onUnlock} onClick={onUnlock}>{busy?'키체인 확인 중…':'키체인으로 저장 명령 열기'}</button><button className="completion-cancel" onClick={()=>onClose(true)}>닫기</button></div>:<><div className="completion-search"><Search size={15}/><input ref={input} role="combobox" aria-label="저장 명령 검색" aria-expanded="true" aria-controls="snippet-completion-results" aria-activedescendant={results[selected]?`snippet-result-${results[selected].id}`:undefined} autoComplete="off" placeholder="명령어나 이름으로 검색…" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'||(e.key==='Tab'&&!e.shiftKey)){e.preventDefault();if(results[selected])onChoose(results[selected]);}}}/><button aria-label="자동완성 닫기" onClick={()=>onClose(true)}><X size={14}/></button></div>
  <div role="listbox" id="snippet-completion-results" aria-label="저장 명령 검색 결과" className="completion-results">{results.map((s,i)=><button key={s.id} id={`snippet-result-${s.id}`} role="option" aria-selected={i===selected} className={i===selected?'selected':''} onClick={()=>onChoose(s)}><Code2 size={16}/><span><strong>{s.name}</strong><code>{s.command}</code></span></button>)}{!results.length&&<p>{snippets.length?'일치하는 저장 명령이 없습니다.':'아직 저장된 명령이 없습니다.'}</p>}</div>
  {onManage&&<button className="completion-manage" onClick={onManage}>명령 추가·관리</button>}<div className="completion-footer"><span>↑ ↓ 선택 · ↵ / Tab 삽입</span><span>실행은 직접 Enter</span></div></>}
 </div>;
}
