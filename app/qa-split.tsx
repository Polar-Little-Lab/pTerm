import {TerminalMark} from './src/components';
import {useAppearance,terminalTheme} from './src/useAppearance';
import {tabDropTarget} from './src/tab-drop';
// Development-only visual fixture. No authentication, IPC, or network connection.
import {useEffect,useState} from 'react';
import {useTerminalTabs} from './src/useTerminalTabs';
import {dockBranch,dropOnTabStrip,reorderTabs,setTabTree,newTab} from './src/terminal-tabs';
import {createRoot} from 'react-dom/client';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {TerminalDeck,dropTarget} from './src/TerminalDeck';
import {PaneLayoutMenu} from './src/PaneLayoutMenu';
import {useDragTabSwitch} from './src/useDragTabSwitch';
import {useTabDrag,type TabDrag} from './src/useTabDrag';
import {leaf,placeSession,planDock,paneIds,removePane,replacePane,presetLayout,type PaneNode} from './src/pane-layout';
import {SessionTabs} from './src/SessionTabs';
import type {Session} from './src/types';
import '@xterm/xterm/css/xterm.css';
import './src/style.css';
import './src/terminal-layout.css';
import './src/themes.css';
const fixtures:Session[]=['zsh · 1','Development API','Bastion','Database staging','zsh · 2','Worker queue','Production API','Observability'].slice(0,new URLSearchParams(location.search).get('tabs')==='2'?2:8).map((name,i)=>{
 const terminal=new Terminal({theme:{background:'#101d30',foreground:'#d6e5f7'},fontSize:13,fontFamily:'Menlo, monospace'});const fit=new FitAddon();terminal.loadAddon(fit);
 if(!new URLSearchParams(location.search).has('welcome')){terminal.writeln('\x1b[36mDISPLAY FIXTURE / no live session\x1b[0m\r\n');
 terminal.writeln('fixture ~ % git status\r\nOn branch main\r\nnothing to commit, working tree clean\r\n');
 terminal.writeln('fixture ~ % npm run build\r\n\x1b[32m✓ build complete\x1b[0m\r\n');
 }terminal.write('fixture ~ % ');
 return {id:String(i),kind:i%4===0?'local':'ssh',localCwd:'/Users/fixture',host:{id:String(i),name,host:'display.fixture.test',username:'fixture',port:22},terminal,fit,status:'closed',closed:false,inputQueue:Promise.resolve(),queuedInputBytes:0};
});
function QA(){
 const appearance=useAppearance();useEffect(()=>{for(const s of fixtures)s.terminal.options.theme=terminalTheme();},[appearance.resolved]);
 const [sidebar,setSidebar]=useState(false),[library,setLibrary]=useState(false);
 const [active,setActive]=useState<string|null>('0'),[menu,setMenu]=useState(false);
 const tabs=useTerminalTabs(active);
 useEffect(()=>{tabs.update(()=>[newTab('0'),newTab('1'),newTab('2')]);},[]);
 const current=tabs.layout;
 const [frozenDrag,setFrozenDrag]=useState<TabDrag|null>(null);
 const activate=(id:string)=>{setLibrary(false);tabs.focus(id);setActive(id);};
 const visible=tabs.tabs.map(t=>fixtures.find(s=>s.id===(paneIds(t.tree).includes(active||'')?active:t.focused))!);
 const plan=(drag:{id:string;kind?:'tab'|'pane'},target:{id:string;edge:import('./src/pane-layout').PaneEdge;scope:'pane'|'workspace'})=>{
  const source=tabs.ref.current.find(t=>paneIds(t.tree).includes(drag.id)),owner=tabs.ref.current.find(t=>paneIds(t.tree).includes(target.id));
  return source&&owner?dockBranch(owner.tree,drag.kind==='pane'?leaf(drag.id):source.tree,target.id,target.edge,target.scope):null;
 };
 const dragSwitch=useDragTabSwitch(tabs.ref,active,activate);
 const drag=useTabDrag(d=>{
  const slot=tabDropTarget(d.x,d.y);
  if(slot){
   tabs.update(items=>dropOnTabStrip(items,d.id,d.kind,slot));activate(d.id);return;
  }
  const target=dropTarget(d.x,d.y);if(!target){dragSwitch.cancel();return;}const next=plan(d,target),owner=tabs.ref.current.find(t=>paneIds(t.tree).includes(target.id));if(next&&owner&&next!==owner.tree){tabs.update(items=>setTabTree(items,owner.id,next));activate(d.id);}else dragSwitch.cancel();
 },dragSwitch);
 const add=(edge?:import('./src/pane-layout').PaneEdge)=>{const id=fixtures.find(s=>!tabs.tabs.some(t=>paneIds(t.tree).includes(s.id)))?.id;if(!id)return;if(edge&&active)tabs.setLayout(tree=>placeSession(tree,active,id,edge));else tabs.add(id);activate(id);setMenu(false);};
 const shownDrag=drag.drag||frozenDrag;
 return <><div className={`app-shell ${library?'':'session-focused'} ${sidebar?'':'sidebar-collapsed'}`} style={{width:1280,height:820,maxWidth:'100vw',maxHeight:'calc(100vh - 44px)'}}>
 <aside className="sidebar"><div className="brand"><div className="brand-mark terminal-brand"><TerminalMark/></div><div>Polarsh<span>SSH &amp; LOCAL SHELL</span></div></div><div className="sidebar-navigation"><div className="nav-label">워크스페이스</div><nav aria-label="주 탐색"><button className={library?'selected':''} onClick={()=>setLibrary(true)}>모든 호스트</button><button onClick={()=>setLibrary(true)}>저장 명령</button></nav><div className="nav-label group-label">그룹</div><nav className="group-nav" aria-label="호스트 그룹">{Array.from({length:30},(_,i)=><button key={i} onClick={()=>setLibrary(true)}><span className="group-name">개발 서버 그룹 {i+1}</span></button>)}</nav></div><div className="sidebar-bottom"><div className="vault-indicator"><strong>저장된 항목 잠김</strong></div><p>호스트와 저장 명령을 함께 보호합니다.</p></div></aside><main>
 {library&&<header className="topbar"><strong>워크스페이스 / 모든 호스트</strong></header>}

 <SessionTabs drag={shownDrag} sessions={visible} active={library?null:active} sidebarOpen={sidebar} onSelect={activate} onClose={s=>{tabs.remove(s.id);setActive(tabs.ref.current[0]?.focused||null);}} onSidebar={()=>setSidebar(v=>!v)} onNew={()=>add()} onSearch={()=>{}} onLayout={()=>setMenu(!menu)} layoutOpen={menu} onTabPointerDown={drag.start} ignoreTabClick={drag.ignoreClick}/>
 {menu&&<PaneLayoutMenu count={paneIds(current).length} onAdd={add} onClose={()=>setMenu(false)} onChoose={p=>{tabs.setLayout(presetLayout(p,[...new Set([active,...paneIds(current)].filter((s):s is string=>!!s))]));setMenu(false);}}/>}
 <section className={`workspace ${library?'':'terminal-workspace'}`}>{library&&<div className="library"><div className="library-heading"><h1>모든 호스트</h1></div><p>사이드바 전환 검증 · 실제 사용자 데이터 없음</p></div>}<TerminalDeck dragSourceTree={tabs.tabs.find(t=>paneIds(t.tree).includes(shownDrag?.id||''))?.tree} sessions={fixtures} tree={current} active={active} visible={!library} drag={shownDrag} planDrop={plan} dragIds={shownDrag?.kind==='pane'?[shownDrag.id]:paneIds(tabs.tabs.find(t=>paneIds(t.tree).includes(shownDrag?.id||''))?.tree||null)} onLayoutChange={tabs.setLayout} onPaneDrag={(id,e)=>drag.start(id,e,'pane')} onFocus={activate} onRemove={id=>{tabs.remove(id);setActive(tabs.ref.current[0]?.focused||null);}} onError={console.error}/></section></main></div>
 <div style={{height:44,padding:8,background:'#eaf0f7'}}><button onClick={()=>appearance.choose('arctic')}>Arctic 스페셜</button><button onClick={()=>appearance.choose('light')}>라이트 테마</button> <button onClick={()=>appearance.choose('dark')}>다크 테마</button> 표시 테스트 · 실제 세션 아님 · 탭 {tabs.tabs.map(t=>paneIds(t.tree).join('+')).join(' / ')} · 활성 {active} <button onClick={()=>{if(frozenDrag){setFrozenDrag(null);return;}const r=document.querySelector('[data-tab-session]')!.getBoundingClientRect();setFrozenDrag({id:active!,kind:'pane',x:r.left+8,y:r.top+10});}}>분리 미리보기 {frozenDrag?'닫기':'확인'}</button></div></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
