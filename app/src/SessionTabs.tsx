import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {Plus,Search,PanelLeft,FolderSync,PanelsTopLeft,X} from 'lucide-react';
import {tabDropTarget} from './tab-drop';
import type {TabDrag} from './useTabDrag';
import type {Session} from './types';

export function SessionTabs({sessions,active,drag,sidebarOpen,onSelect,onClose,onSidebar,onNew,onSearch,onFiles,filesOpen,onLayout,layoutOpen,onTabPointerDown,ignoreTabClick}:{
 sessions:Session[];active:string|null;drag?:TabDrag|null;sidebarOpen:boolean;
 onSelect:(id:string)=>void;onClose:(session:Session)=>void;onSidebar:()=>void;
 onLayout?:()=>void;layoutOpen?:boolean;onTabPointerDown?:(id:string,e:PointerEvent<HTMLButtonElement>)=>void;ignoreTabClick?:()=>boolean;
 onFiles?:()=>void;filesOpen?:boolean;
 onNew:()=>void;onSearch:()=>void;
}) {
 const [slot,setSlot]=useState<ReturnType<typeof tabDropTarget>>(null);
 useLayoutEffect(()=>{setSlot(drag?tabDropTarget(drag.x,drag.y):null);},[drag,sessions]);
 const current=sessions.find(s=>s.id===active);
 const list=useRef<HTMLDivElement>(null);
 useEffect(()=>{list.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active]);
 return <nav className="terminal-tabs" aria-label="터미널 탭">
  {active&&<button className="chrome-button" aria-label={sidebarOpen?'탐색 패널 접기':'탐색 패널 펼치기'} title="탐색 패널 · ⌘ B" aria-expanded={sidebarOpen} onClick={onSidebar}><PanelLeft size={17}/></button>}
  <div ref={list} className="terminal-tab-scroll">
   {sessions.map(s=><div className={`terminal-tab ${active===s.id?'is-active':''}`} key={s.id}>
    <button data-tab-session={s.id} draggable={false} onDragStart={e=>e.preventDefault()} className="terminal-tab-select" aria-pressed={active===s.id} onPointerDown={e=>onTabPointerDown?.(s.id,e)} onClick={()=>{if(!ignoreTabClick?.())onSelect(s.id);}} title={s.kind==='local'?`${s.host.name} · 시작 폴더 ${s.localCwd||''}`:`${s.host.name} · ${s.host.username}@${s.host.host}`}><span className={`status-dot ${s.status==='connected'?'online':''}`}/><span className="tab-protocol">{s.kind==='local'?'LOCAL':'SSH'}</span><span className="tab-name">{s.host.name||s.host.host}{s.status==='connecting'?' · 연결 중':''}</span></button>
    <button className="terminal-tab-close" aria-label={`${s.host.name||s.host.host} 탭 닫기`} onClick={()=>onClose(s)}><X size={13}/></button>
   </div>)}
  </div>
  <button data-new-terminal className="chrome-button" aria-label="새 로컬 탭" title="새 로컬 탭 · ⌘ T" onClick={onNew}><Plus size={18}/></button>
  {slot&&drag&&<div className="tab-insertion-marker" style={{left:slot.x,top:slot.top,height:slot.height}}><span>{drag.kind==='pane'?'새 탭으로 분리':'여기로 탭 이동'}</span></div>}
  <div className="terminal-tab-actions">
   {active&&onLayout&&<button data-layout-toggle className={`chrome-button ${layoutOpen?'is-selected':''}`} aria-label="터미널 배치" title="탭을 가장자리로 끌어 분할 · 배치 선택" aria-expanded={layoutOpen} onClick={onLayout}><PanelsTopLeft size={17}/></button>}
   <button className="chrome-button" aria-label="빠른 전환" title="세션 · 호스트 검색 · ⌘ K" onClick={onSearch}><Search size={16}/></button>
   {current?.kind==='ssh'&&onFiles&&<button className={`sftp-tab-button ${filesOpen?'is-selected':''}`} aria-label={filesOpen?'터미널로 돌아가기':'SFTP 파일 전송'} aria-pressed={filesOpen} disabled={current.status!=='connected'} title={current.status==='connected'?'SFTP · 로컬과 원격 파일 전송':'SSH 연결 후 SFTP를 사용할 수 있습니다.'} onClick={onFiles}><FolderSync size={16}/>SFTP</button>}
  </div>
 </nav>;
}
