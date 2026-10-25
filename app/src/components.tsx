import {useEffect, useRef, type ReactNode} from 'react';
import {X} from 'lucide-react';

export function TerminalMark(){
 return <img className="terminal-mark" src={new URL('../icon.svg', import.meta.url).href} alt="" aria-hidden="true"/>;
}

export function PolarBear({className=''}:{className?:string}) {
  return <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M13 29C6 17 19 8 28 20M52 20C62 8 75 18 67 30" fill="#fff" stroke="currentColor" strokeWidth="3"/><path d="M12 40C12 23 24 17 40 17S68 25 68 42C68 61 57 70 40 70S12 60 12 40Z" fill="#fff" stroke="currentColor" strokeWidth="3"/><circle cx="28" cy="38" r="3" fill="currentColor"/><circle cx="52" cy="38" r="3" fill="currentColor"/><ellipse cx="40" cy="51" rx="16" ry="12" fill="#EBF1F8"/><path d="M34 47Q40 43 46 47Q46 53 40 55Q34 53 34 47Z" fill="currentColor"/><path d="M40 55V59M35 59Q40 62 45 59" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function Modal({title,eyebrow,children,onClose,busy=false}:{title:string;eyebrow:string;children:ReactNode;onClose:()=>void;busy?:boolean}) {
 const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement;const root=ref.current!;
 const first=root.querySelector<HTMLElement>('input,select,textarea')||root.querySelector<HTMLElement>('button');first?.focus();
 const keyboard=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.preventDefault();close.current();}if(e.key==='Tab'){const nodes=[...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select:not(:disabled),[tabindex="0"]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
 root.addEventListener('keydown',keyboard);return()=>{root.removeEventListener('keydown',keyboard);previous?.focus();};},[busy]);
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div><button className="icon-button" aria-label="창 닫기" disabled={busy} onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
