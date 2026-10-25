import {useRef,type RefObject} from 'react';
import {paneIds} from './pane-layout';
import {dragDestination,type TerminalTab} from './terminal-tabs';
import type {TabDrag} from './useTabDrag';
export function useDragTabSwitch(tabs:RefObject<TerminalTab[]>,active:string|null,activate:(id:string)=>void){
 const origin=useRef<string|null>(null);
 const cancel=()=>{const id=origin.current;origin.current=null;if(id&&tabs.current.some(t=>paneIds(t.tree).includes(id)))activate(id);};
 return {
  cancel,
  onStart:(drag:TabDrag)=>{
   origin.current=active;
   if(drag.kind==='pane')return;
   const destination=dragDestination(tabs.current,drag.id,active);
   if(destination)activate(destination);
  },
  onHoverTab:(id:string,drag:TabDrag)=>{
   const source=tabs.current.find(t=>paneIds(t.tree).includes(drag.id)),target=tabs.current.find(t=>paneIds(t.tree).includes(id));
   if(target&&target!==source)activate(target.focused);
  },
  onCancel:cancel,
 };
}
