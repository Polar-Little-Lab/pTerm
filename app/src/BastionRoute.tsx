import {useState} from 'react';
import {ArrowRight,Check,Monitor,Network,Search,Server} from 'lucide-react';
import type {Host,Session} from './types';
import {validBastion} from './bastion-route';
import './bastion-route.css';
type Props={host:Host;hosts:Host[];sessions:Session[];via:boolean;busy:boolean;onMode:(via:boolean)=>void;onSelect:(host:Host,sessionId:string)=>void};
export function BastionRoute({host,hosts,sessions,via,busy,onMode,onSelect}:Props){
 const [query,setQuery]=useState(''),[changing,setChanging]=useState(false);
 const live=sessions.filter(s=>s.kind!=='local'&&s.status==='connected');
 const all=[...hosts,...live.map(s=>s.host)].filter((h,i,a)=>a.findIndex(v=>v.id===h.id)===i);
 const selected=all.find(h=>h.id===host.bastionHostId);
 const connected=live.some(s=>s.host.id===host.bastionHostId);
 const candidates=all.filter(h=>validBastion(h,host.id,all)).filter(h=>`${h.name} ${h.host} ${h.username} ${h.group||''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(live.some(s=>s.host.id===b.id))-Number(live.some(s=>s.host.id===a.id)));
 return <fieldset className="bastion-route" disabled={busy}><legend>접속 경로</legend>
  <div className="route-modes">{[{value:false,title:'직접 연결',hint:'이 Mac에서 서버로',Icon:Server},{value:true,title:'배스천 경유',hint:'중계 서버를 통해 연결',Icon:Network}].map(({value,title,hint,Icon})=><label key={title} className={via===value?'chosen':''}><input type="radio" name="connection-route" checked={via===value} onChange={()=>{onMode(value);setChanging(false);setQuery('');}}/><Icon size={19}/><span><strong>{title}</strong><small>{hint}</small></span><span className="route-radio">{via===value&&<Check size={11}/>}</span></label>)}</div>
  {via&&<div className="bastion-picker">
   <div className="bastion-heading"><strong>배스천 호스트</strong>{selected&&!changing&&<button type="button" onClick={()=>setChanging(true)}>변경</button>}{changing&&selected&&<button type="button" onClick={()=>setChanging(false)}>선택 유지</button>}</div>
   {selected&&!changing?<div className="bastion-selected"><Network size={20}/><div><strong>{selected.name||selected.host}</strong><small>{selected.username}@{selected.host}:{selected.port}{selected.group?` · ${selected.group}`:''}</small></div><span className={connected?'route-status connected':'route-status'}>{connected?'연결됨':'연결 필요'}</span></div>:<><label className="bastion-search"><Search size={15}/><input aria-label="배스천 호스트 검색" placeholder="이름, 주소, 그룹 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="bastion-options" role="group" aria-label="배스천 호스트 선택">{candidates.map(candidate=>{const session=live.find(s=>s.host.id===candidate.id);return <button type="button" key={candidate.id} aria-pressed={candidate.id===host.bastionHostId} onClick={()=>{onSelect(candidate,session?.id||'');setChanging(false);setQuery('');}}><Server size={17}/><span><strong>{candidate.name||candidate.host}</strong><small>{candidate.username}@{candidate.host}:{candidate.port}{candidate.group?` · ${candidate.group}`:''}</small></span><span className={session?'route-status connected':'route-status'}>{session?'연결됨':'저장됨'}</span>{candidate.id===host.bastionHostId&&<Check size={14}/>}</button>;})}{!candidates.length&&<p className="bastion-empty">{query?'일치하는 호스트가 없습니다.':'선택 가능한 호스트가 없습니다. 배스천 서버를 먼저 호스트로 등록해 주세요.'}</p>}</div></>}
   {host.bastionHostId&&!selected&&<p className="bastion-warning">기존 배스천 호스트를 찾을 수 없습니다. 다른 호스트를 선택해 주세요.</p>}
   <div className="route-preview" aria-label="접속 경로 미리보기"><span><Monitor size={15}/><strong>이 Mac</strong></span><ArrowRight size={14}/><span><Network size={15}/><strong>{selected?.name||selected?.host||'배스천 선택'}</strong></span><ArrowRight size={14}/><span><Server size={15}/><strong>{host.name||host.host||'대상 서버'}</strong><small>{host.host||'내부 주소'}:{host.port}</small></span></div>
   <p className="bastion-help">{selected?(connected?'연결된 배스천 세션을 통해 접속합니다.':'접속 시 배스천부터 순서대로 연결합니다. 필요한 단계에서 인증 정보를 입력하세요.'):'저장된 호스트를 선택하세요. 지금 연결되어 있지 않아도 경로를 저장할 수 있습니다.'}<br/>대상 서버 주소는 배스천에서 접근 가능한 내부 주소를 입력하세요.</p>
  </div>}
 </fieldset>;
}
