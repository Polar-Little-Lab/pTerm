import {useRef,useState} from 'react';
import {paneIds,type PaneNode} from './pane-layout';
import {newTab,setTabTree,removeSession,type TerminalTab} from './terminal-tabs';
export function useTerminalTabs(active:string|null){
 const [tabs,setTabs]=useState<TerminalTab[]>([]),ref=useRef(tabs);ref.current=tabs;
 const selected=tabs.find(t=>active&&paneIds(t.tree).includes(active));
 const update=(fn:(tabs:TerminalTab[])=>TerminalTab[])=>{const next=fn(ref.current);ref.current=next;setTabs(next);};
 const setLayout=(next:PaneNode|null|((tree:PaneNode|null)=>PaneNode|null))=>{
  const owner=ref.current.find(t=>active&&paneIds(t.tree).includes(active));
  if(!owner)return;
  update(items=>setTabTree(items,owner.id,typeof next==='function'?next(owner.tree):next));
 };
 return {tabs,ref,update,layout:selected?.tree||null,setLayout,
  add:(id:string)=>update(tabs=>tabs.some(t=>paneIds(t.tree).includes(id))?tabs:[...tabs,newTab(id,new Set(tabs.map(t=>t.id)))]),
  remove:(id:string)=>update(tabs=>removeSession(tabs,id)),
  focus:(id:string)=>update(tabs=>tabs.map(t=>paneIds(t.tree).includes(id)?{...t,focused:id}:t)),
 };
}
