import {useEffect,useRef,useState} from 'react';
import {Search, ArrowUpRight} from 'lucide-react';
import {Modal} from './components';

export type QuickAction = {id:string; title:string; detail:string; group:string; run:()=>void};

export function QuickSwitch({actions,onClose}:{actions:QuickAction[];onClose:()=>void}) {
 const [query,setQuery]=useState('');
 const [index,setIndex]=useState(0);
 const list=useRef<HTMLDivElement>(null);
 const results=actions.filter(a=>`${a.title} ${a.detail} ${a.group}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const selected=Math.min(index,Math.max(0,results.length-1));
 useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[selected,query]);
 const run=(action:QuickAction)=>{onClose();action.run();};
 return <Modal title="빠른 전환" eyebrow="JUMP TO YOUR WORK" onClose={onClose}>
  <div className="quick-switch">
   <label className="quick-search"><Search size={18}/><input autoComplete="off" aria-label="세션, 호스트 또는 작업 검색" role="combobox" aria-expanded="true" aria-controls="quick-results" aria-activedescendant={results.length?`quick-${results[selected].id}`:undefined} placeholder="세션, 호스트 또는 작업 검색…" value={query} onChange={e=>{setQuery(e.target.value);setIndex(0);}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,Math.min(results.length-1,i+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'&&results[selected]){e.preventDefault();run(results[selected]);}}}/><kbd>esc</kbd></label>
   <div ref={list} id="quick-results" role="listbox" aria-label="빠른 전환 결과" className="quick-results">
    {results.map((action,i)=><button id={`quick-${action.id}`} role="option" aria-selected={i===selected} className={i===selected?'selected':''} key={action.id} onClick={()=>run(action)}><span className="quick-group">{action.group}</span><span><strong>{action.title}</strong><small>{action.detail}</small></span><ArrowUpRight size={16}/></button>)}
    {!results.length&&<p className="quick-empty">일치하는 항목이 없습니다.</p>}
   </div><div className="quick-help">↑ ↓ 선택 <span>↵ 열기</span><span>⌘ K 빠른 전환</span></div>
  </div>
 </Modal>;
}
