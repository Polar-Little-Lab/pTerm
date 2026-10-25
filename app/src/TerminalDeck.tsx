import {tabDropTarget} from './tab-drop';
import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {PaneResizers} from './PaneResizers';
import {TerminalPane} from './TerminalPane';
import {planDock,dockingEdge,workspaceEdge,removePane,paneIds,paneRects,type PaneNode,type PaneEdge} from './pane-layout';
import type {TabDrag} from './useTabDrag';
import type {Session,Snippet} from './types';
function locatePane(x:number,y:number){
 const deck=[...document.querySelectorAll<HTMLElement>('.terminal-deck')].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
 if(!deck||deck.hasAttribute('data-dock-zoomed'))return null;
 const panes=[...deck.querySelectorAll<HTMLElement>('[data-pane-id]')].map(pane=>({pane,box:pane.getBoundingClientRect()})).filter(({box})=>box.width>0&&box.height>0);
 const distance=(r:DOMRect)=>Math.hypot(Math.max(r.left-x,0,x-r.right),Math.max(r.top-y,0,y-r.bottom));
 panes.sort((a,b)=>distance(a.box)-distance(b.box));const hit=panes[0];if(!hit)return null;
 const box=deck.getBoundingClientRect(),outer=workspaceEdge(x-box.left,y-box.top,box.width,box.height);
 return {id:hit.pane.dataset.paneId!,box:outer?box:hit.box,scope:outer?'workspace' as const:'pane' as const,edge:outer||dockingEdge((x-hit.box.left)/hit.box.width,(y-hit.box.top)/hit.box.height)};
}
export function dropTarget(x:number,y:number):{id:string;edge:PaneEdge;scope:'pane'|'workspace'}|null{
 const hit=locatePane(x,y);return hit?.edge?{id:hit.id,edge:hit.edge,scope:hit.scope}:null;
}
export function TerminalDeck({onReconnect,sessions,tree,active,visible,drag,dragSourceTree,dragIds,planDrop,onLayoutChange,onPaneDrag,snippets,onUnlockSnippets,snippetsBusy,snippetsError,onManageSnippets,onSnippet,onFocus,onRemove,onError}:{onReconnect?:(session:Session)=>void;sessions:Session[];tree:PaneNode|null;active:string|null;visible:boolean;drag:TabDrag|null;dragSourceTree?:PaneNode;dragIds?:string[];planDrop?:(drag:TabDrag,target:{id:string;edge:PaneEdge;scope:'pane'|'workspace'})=>PaneNode|null;onLayoutChange?:(tree:PaneNode)=>void;onPaneDrag?:(id:string,e:PointerEvent<HTMLElement>)=>void;snippets?:Snippet[];onUnlockSnippets?:()=>void;snippetsBusy?:boolean;snippetsError?:string;onManageSnippets?:()=>void;onSnippet?:(s:Snippet,session:Session)=>void;onFocus:(id:string)=>void;onRemove:(id:string)=>void;onError:(error:string)=>void}){
 const [zoom,setZoom]=useState<string|null>(null);const root=useRef<HTMLDivElement>(null);
 const [preview,setPreview]=useState<{left:number;top:number;width:number;height:number;label:string}|null>(null);
 const [guide,setGuide]=useState<{left:number;top:number;width:number;height:number;edge:PaneEdge|null}|null>(null);
 const ids=paneIds(tree),rects=tree?paneRects(tree):[];const multi=ids.length>1;
 useEffect(()=>{if(zoom&&(!ids.includes(zoom)||active!==zoom))setZoom(null);},[active,zoom,ids.join('|')]);
 useLayoutEffect(()=>{
  setPreview(null);setGuide(null);
  if(!drag||!visible||zoom||!root.current||!tree)return;
  const hit=locatePane(drag.x,drag.y);if(!hit)return;
  const parent=root.current.getBoundingClientRect();
  setGuide({left:hit.box.left-parent.left,top:hit.box.top-parent.top,width:hit.box.width,height:hit.box.height,edge:hit.edge});
  if(!hit.edge)return;
  const next=planDrop?planDrop(drag,{id:hit.id,edge:hit.edge,scope:hit.scope}):planDock(tree,drag.id,hit.id,hit.edge,sessions.map(s=>s.id),hit.scope);if(!next||next===tree)return;
  const moved=paneRects(next).filter(r=>(dragIds||[drag.id]).includes(r.id));if(!moved.length)return;
  const x=Math.min(...moved.map(r=>r.x)),y=Math.min(...moved.map(r=>r.y));
  const incoming={x,y,width:Math.max(...moved.map(r=>r.x+r.width))-x,height:Math.max(...moved.map(r=>r.y+r.height))-y};
  setPreview({left:incoming.x*root.current.clientWidth+3,top:incoming.y*root.current.clientHeight+3,width:incoming.width*root.current.clientWidth-6,height:incoming.height*root.current.clientHeight-6,label:(hit.scope==='workspace'?'전체 화면 ':'이 영역 ')+({left:'왼쪽',right:'오른쪽',top:'위쪽',bottom:'아래쪽'})[hit.edge]+'으로 분할'});
 },[drag,visible,zoom,tree,sessions]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(visible&&active&&e.metaKey&&e.shiftKey&&e.key==='Enter'&&!document.querySelector('[role="dialog"]')){e.preventDefault();e.stopPropagation();setZoom(value=>value===active?null:active);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[visible,active]);
 const tabSlot=drag?tabDropTarget(drag.x,drag.y):null;
 const remaining=drag?.kind==='pane'&&tabSlot&&dragSourceTree&&paneIds(dragSourceTree).length>1?removePane(dragSourceTree,drag.id):null;
 const reflow=remaining?paneRects(remaining):[];
 const sourceVisible=!!remaining&&!!drag&&ids.includes(drag.id);
 const dragged=sessions.find(s=>s.id===drag?.id);

 return <div ref={root} data-dock-zoomed={zoom?'true':undefined} className={`terminal-deck ${multi?'has-panes':''} ${drag?'is-dragging':''}`} style={{display:visible?'block':'none'}}>
  {sessions.map(s=>{const rect=rects.find(r=>r.id===s.id);const shown=visible&&!!rect&&(!zoom||zoom===s.id);const area=zoom===s.id?{x:0,y:0,width:1,height:1}:rect;
   return <TerminalPane onReconnect={onReconnect?()=>onReconnect(s):undefined} key={s.id} session={s} active={shown} focused={shown&&active===s.id} paneNumber={multi?ids.indexOf(s.id)+1:undefined} onPaneDrag={onPaneDrag?e=>onPaneDrag(s.id,e):undefined} onPaneFocus={()=>onFocus(s.id)} onPaneRemove={()=>onRemove(s.id)} onPaneZoom={()=>setZoom(zoom===s.id?null:s.id)} zoomed={zoom===s.id} paneStyle={area?{left:`calc(${area.x*100}% + 3px)`,top:`calc(${area.y*100}% + 3px)`,width:`calc(${area.width*100}% - 6px)`,height:`calc(${area.height*100}% - 6px)`,right:'auto',bottom:'auto'}:undefined} snippets={snippets} onUnlockSnippets={onUnlockSnippets} snippetsBusy={snippetsBusy} snippetsError={snippetsError} onManageSnippets={onManageSnippets} onSnippet={onSnippet} onError={onError}/>;
  })}
  {tree&&visible&&!zoom&&!drag&&onLayoutChange&&<PaneResizers tree={tree} root={root} onChange={onLayoutChange}/>}
  {sourceVisible&&<div className="pane-reflow-preview" aria-label="분리 후 남은 터미널 배치"><span className="reflow-caption">분리 후 이 탭의 배치</span>{reflow.map(r=><div key={r.id} className="reflow-pane" style={{left:`calc(${r.x*100}% + 3px)`,top:`calc(${r.y*100}% + 3px)`,width:`calc(${r.width*100}% - 6px)`,height:`calc(${r.height*100}% - 6px)`}}><span>{sessions.find(s=>s.id===r.id)?.host.name||'터미널'}</span></div>)}</div>}
  {guide&&<div className="dock-guides" style={{left:guide.left,top:guide.top,width:guide.width,height:guide.height}}>{(['left','right','top','bottom'] as const).map(edge=><div key={edge} className={`dock-zone dock-zone-${edge} ${guide.edge===edge&&preview?'selected':''}`}><span>{({left:'← 좌우 분할',right:'좌우 분할 →',top:'↑ 상하 분할',bottom:'↓ 상하 분할'})[edge]}</span></div>)}</div>}
  {preview&&<div className="pane-drop-preview" style={{left:preview.left,top:preview.top,width:preview.width,height:preview.height}}><span>{preview.label}<small>놓으면 이 위치에 배치됩니다</small></span></div>}
  {drag&&<div className="dock-drag-tab" style={{left:Math.min(drag.x+16,window.innerWidth-230),top:Math.min(tabSlot?tabSlot.top+tabSlot.height+48:drag.y+18,window.innerHeight-(remaining?150:72))}}><span>{dragged?.kind==='local'?'LOCAL':'SSH'}</span><strong>{dragged?.host.name||'터미널'}</strong><small>{tabSlot?(remaining?'놓으면 새 탭으로 분리됩니다':'놓으면 탭 순서가 바뀝니다'):preview?'놓아서 분할':zoom?'확대를 해제해 주세요':sessions.length<2?'다른 탭을 먼저 열어주세요':'가장자리의 분할 영역으로 이동'} · Esc 취소</small>{remaining&&<div className="drag-remainder"><span>기존 탭에 남는 영역</span><div>{reflow.map(r=><i key={r.id} style={{left:`${r.x*100}%`,top:`${r.y*100}%`,width:`calc(${r.width*100}% - 2px)`,height:`calc(${r.height*100}% - 2px)`}} title={sessions.find(s=>s.id===r.id)?.host.name}/>)}</div></div>}</div>}

 </div>;
}
