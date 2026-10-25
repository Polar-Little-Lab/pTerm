import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
export type TabDrag={id:string;kind?:'tab'|'pane';x:number;y:number};
export function useTabDrag(onDrop:(drag:TabDrag)=>void,options:{onStart?:(drag:TabDrag)=>void;onHoverTab?:(id:string,drag:TabDrag)=>void;onCancel?:()=>void}={}){
 const [drag,setDrag]=useState<TabDrag|null>(null);
 const pending=useRef<{id:string;kind?:'tab'|'pane';x:number;y:number;pointerId:number;moving:boolean}|null>(null);
 const callbacks=useRef(options);callbacks.current=options;
 const droppedAt=useRef(0);const drop=useRef(onDrop);drop.current=onDrop;
 useEffect(()=>{
  let hoverTimer:ReturnType<typeof setTimeout>|undefined,hoverId:string|null=null;
  const clearHover=()=>{clearTimeout(hoverTimer);hoverTimer=undefined;hoverId=null;};
  const move=(e:PointerEvent)=>{
   const p=pending.current;if(!p||p.pointerId!==e.pointerId)return;
   if(!p.moving&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<7)return;
   const value={id:p.id,kind:p.kind,x:e.clientX,y:e.clientY};
   if(!p.moving){p.moving=true;callbacks.current.onStart?.(value);}
   e.preventDefault();setDrag(value);
   const tab=[...document.querySelectorAll<HTMLElement>('[data-tab-session]')].find(el=>{const r=el.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});
   const id=tab?.dataset.tabSession||null;
   if(id!==hoverId){clearHover();hoverId=id;if(id&&id!==p.id)hoverTimer=setTimeout(()=>{if(pending.current===p&&p.moving)callbacks.current.onHoverTab?.(id,value);},450);}
  };
  const end=(e:PointerEvent)=>{const p=pending.current;if(!p||p.pointerId!==e.pointerId)return;clearHover();pending.current=null;setDrag(null);if(p.moving){droppedAt.current=Date.now();drop.current({id:p.id,kind:p.kind,x:e.clientX,y:e.clientY});}};
  const cancel=()=>{const moving=pending.current?.moving;clearHover();if(moving)droppedAt.current=Date.now();pending.current=null;setDrag(null);if(moving)callbacks.current.onCancel?.();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&pending.current){e.preventDefault();cancel();}};
  window.addEventListener('pointermove',move,{passive:false,capture:true});window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('blur',cancel);window.addEventListener('keydown',key);
  return()=>{clearHover();window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);};
 },[]);
 return {drag,start:(id:string,e:ReactPointerEvent<HTMLElement>,kind:'tab'|'pane'='tab')=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);pending.current={id,kind,x:e.clientX,y:e.clientY,pointerId:e.pointerId,moving:false};},ignoreClick:()=>Date.now()-droppedAt.current<250};
}
