import {useEffect,useRef,useState,type RefObject} from 'react';
import {splitHandles,resizeSplit,constrainedRatio,type PaneNode} from './pane-layout';

export function PaneResizers({tree,root,onChange}:{tree:PaneNode;root:RefObject<HTMLDivElement|null>;onChange:(tree:PaneNode)=>void}){
 const [resizing,setResizing]=useState<string|null>(null);
 const pending=useRef<{path:string;tree:PaneNode;pointer:number}|null>(null);
 const change=useRef(onChange);change.current=onChange;
 useEffect(()=>{const cancel=()=>{if(!pending.current)return;change.current(pending.current.tree);pending.current=null;setResizing(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&pending.current){e.preventDefault();cancel();}};window.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);};},[]);
 return <>{splitHandles(tree).map((h,i)=>{
  const vertical=h.axis==='x';
  const style=vertical?{left:`calc(${(h.x+h.width*h.ratio)*100}% - 5px)`,top:`${h.y*100}%`,width:10,height:`${h.height*100}%`}:{left:`${h.x*100}%`,top:`calc(${(h.y+h.height*h.ratio)*100}% - 5px)`,width:`${h.width*100}%`,height:10};
  const apply=(ratio:number)=>{const box=root.current?.getBoundingClientRect();if(!box)return;const pixels=vertical?box.width*h.width:box.height*h.height;onChange(resizeSplit(tree,h.path,constrainedRatio(h,ratio,pixels)));};
  return <div key={h.path} role="separator" tabIndex={0} aria-label={`터미널 ${vertical?'너비':'높이'} 조절 ${i+1}`} aria-orientation={vertical?'vertical':'horizontal'} aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(h.ratio*100)}
   className={`pane-resizer ${vertical?'vertical':'horizontal'} ${resizing===h.path?'resizing':''}`} style={style} title="드래그하여 크기 조절 · 더블클릭하여 균등 분할"
   onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();pending.current={path:h.path,tree,pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);setResizing(h.path);}}
   onPointerMove={e=>{if(pending.current?.path!==h.path)return;const box=root.current?.getBoundingClientRect();if(!box)return;apply(vertical?((e.clientX-box.left)/box.width-h.x)/h.width:((e.clientY-box.top)/box.height-h.y)/h.height);}}
   onPointerUp={e=>{if(pending.current?.pointer!==e.pointerId)return;pending.current=null;setResizing(null);e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{if(pending.current)onChange(pending.current.tree);pending.current=null;setResizing(null);}}
   onLostPointerCapture={()=>{pending.current=null;setResizing(null);}}
   onDoubleClick={()=>apply(.5)}
   onKeyDown={e=>{if(e.key==='Escape'&&pending.current){onChange(pending.current.tree);pending.current=null;setResizing(null);e.preventDefault();return;}const keys=vertical?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];if(keys.includes(e.key)){e.preventDefault();apply(h.ratio+(e.key===keys[0]?-1:1)*(e.shiftKey?.1:.02));}else if(e.key==='Enter'||e.key==='Home'){e.preventDefault();apply(.5);}}}
  ><span/></div>;
 })}</>;
}
