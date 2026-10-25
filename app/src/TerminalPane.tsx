import './inline-suggestions.css';
import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Session,Snippet} from './types';
import {Maximize2,Minimize2,X} from 'lucide-react';
import {InlineSuggestions} from './InlineSuggestions';
import {SnippetCompletion} from './SnippetCompletion';
export function TerminalPane({ onReconnect,session, active, slot, onError, snippets, onUnlockSnippets,snippetsBusy,snippetsError,onManageSnippets,onSnippet, focused=active&&slot!=='right',paneNumber,paneStyle,onPaneDrag,onPaneFocus,onPaneRemove,onPaneZoom,zoomed }: {onReconnect?:()=>void;session: Session; active: boolean; slot?:'left'|'right'; onError: (s:string)=>void; snippets?:Snippet[];onUnlockSnippets?:()=>void;snippetsBusy?:boolean;snippetsError?:string;onManageSnippets?:()=>void; onSnippet?:(snippet:Snippet,session:Session)=>void;focused?:boolean;paneNumber?:number;paneStyle?:CSSProperties;onPaneDrag?:(e:PointerEvent<HTMLElement>)=>void;onPaneFocus?:()=>void;onPaneRemove?:()=>void;onPaneZoom?:()=>void;zoomed?:boolean}) {
  const hasHeader=!!slot||!!paneNumber;
  const element = useRef<HTMLDivElement>(null);
  const [completion,setCompletion]=useState<{left:number;top:number}|null>(null);
  const closeCompletion=(restore=true)=>{setCompletion(null);if(restore)session.terminal.focus();};
  const openCompletion=()=>{
    if(!active||session.status!=='connected'||session.closed)return;
    const root=element.current!;const buffer=session.terminal.buffer.active;
    const rowHeight=root.clientHeight/Math.max(1,session.terminal.rows);
    const row=Math.max(0,Math.min(session.terminal.rows-1,buffer.baseY+buffer.cursorY-buffer.viewportY));
    setCompletion({left:Math.max(0,Math.min(buffer.cursorX*root.clientWidth/session.terminal.cols,root.clientWidth-420)),top:Math.max(hasHeader?32:0,Math.min((row+1)*rowHeight+(hasHeader?31:0),root.clientHeight-292))});
  };
  useEffect(()=>{if(!active||session.status!=='connected')setCompletion(null);},[active,session.status,snippets]);
  useEffect(() => {
    if (!element.current) return;
    session.terminal.open(element.current);
    const input = session.terminal.onData(data => {
      if (session.status !== 'connected') return;
      const bytes = new TextEncoder().encode(data);
      if(session.queuedInputBytes + bytes.length>1024*1024) {onError('붙여넣기는 한 번에 1 MiB 이하로 입력하세요.');return;}
      session.queuedInputBytes += bytes.length;
      session.inputQueue = session.inputQueue.then(async () => {
        for(let i=0; i<bytes.length; i+=16384) {
          if(session.closed) return;
          await invoke('send_input', {id: session.id, bytes: Array.from(bytes.slice(i,i+16384))});
        }
      }).catch(e => onError(String(e))).finally(()=>{session.queuedInputBytes -= bytes.length;});
    });
    let timer: ReturnType<typeof setTimeout>;
    const resize = () => { clearTimeout(timer); timer = setTimeout(() => {
      if (!element.current?.offsetWidth) return;
      session.fit.fit();
      if(session.status === 'connected') void invoke('resize_terminal', {id:session.id, cols:Math.min(500,session.terminal.cols), rows:Math.min(300,session.terminal.rows)}).catch(e => onError(String(e)));
    },100); };
    const observer = new ResizeObserver(resize); observer.observe(element.current);
    resize();
    return () => {clearTimeout(timer); observer.disconnect(); input.dispose();};
  }, [session]);
  useEffect(() => {if(active) {session.fit.fit(); if(focused&&!document.querySelector('[role="dialog"]'))session.terminal.focus();if(session.status==='connected')void invoke('resize_terminal',{id:session.id,cols:Math.max(1,Math.min(500,session.terminal.cols)),rows:Math.max(1,Math.min(300,session.terminal.rows))}).catch(e=>onError(String(e)));}}, [active, focused, session, slot, session.status]);
  return <div className={`terminal-pane ${active ? 'active' : ''} ${slot?`split-${slot}`:''} ${paneStyle?'docked-pane':''} ${focused?'pane-focused':''} ${paneNumber?'with-pane-header':''}`} data-pane-id={active?session.id:undefined} style={paneStyle} onFocusCapture={onPaneFocus} onPointerDownCapture={e=>{onPaneFocus?.();if(e.metaKey&&e.altKey&&e.shiftKey&&onPaneDrag){e.preventDefault();e.stopPropagation();onPaneDrag(e);}}} aria-label={`${session.host.name || session.host.host} 터미널`} onKeyDownCapture={e=>{if(e.metaKey&&e.key.toLowerCase()==='j'){e.preventDefault();e.stopPropagation();if(completion)closeCompletion();else openCompletion();}}}>{paneNumber?<div className="dock-pane-header" onPointerDown={e=>{if(!(e.target as HTMLElement).closest('button'))onPaneDrag?.(e);}} title="끌어서 다른 영역에 배치"><span className="pane-number">{paneNumber}</span><span className="pane-protocol">{session.kind==='local'?'LOCAL':'SSH'}</span><strong>{session.host.name||session.host.host}</strong><span className="pane-location" title={session.kind==='local'?'셸 시작 폴더':undefined}>{session.kind==='local'?session.localCwd:session.host.host}</span><button aria-label={`${session.host.name} ${zoomed?'분할 복원':'영역 확대'}`} onClick={onPaneZoom}>{zoomed?<Minimize2 size={13}/>:<Maximize2 size={13}/>}</button><button aria-label={`${session.host.name} 세션 닫기`} title="세션 닫기" onClick={onPaneRemove}><X size={13}/></button></div>:slot&&<div className="pane-title">{session.kind==='local'?'LOCAL':'SSH'} · {session.host.name||session.host.host}<span>{session.kind==='local'?session.localCwd:`${session.host.username}@${session.host.host}`}</span></div>}<div ref={element} className="terminal-surface" /><InlineSuggestions session={session} snippets={snippets} enabled={active&&focused&&!completion&&session.status==='connected'&&!session.closed} surface={element}/>{active&&session.kind!=='local'&&session.status==='closed'&&onReconnect&&<button className="reconnect-session" disabled={session.reconnecting} onClick={onReconnect}>{session.reconnecting?'다시 연결 중…':'SSH 다시 연결'}</button>}{active&&onSnippet&&session.status==='connected'&&!completion&&<button className="completion-hint" onClick={openCompletion} title="저장 명령 자동완성 · ⌘ J">⌘ J <span>저장 명령</span></button>}{completion&&<SnippetCompletion snippets={snippets||[]} locked={!snippets} busy={snippetsBusy} error={snippetsError} onUnlock={onUnlockSnippets} onManage={onManageSnippets?()=>{setCompletion(null);onManageSnippets();}:undefined} {...completion} onClose={closeCompletion} onChoose={snippet=>{setCompletion(null);onSnippet?.(snippet,session);}}/>}</div>;
}
