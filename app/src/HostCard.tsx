import {ArrowUpRight,Folder,MoreHorizontal,Network,Server,Star} from 'lucide-react';
import type {Host} from './types';

export function HostCard({host,selecting,selected,busy,connected,bastionName,onToggle,onFavorite,onEdit,onOpen}:{
 host:Host;selecting:boolean;selected:boolean;busy:boolean;connected:boolean;bastionName?:string;
 onToggle:()=>void;onFavorite:()=>void;onEdit:()=>void;onOpen:()=>void;
}) {
 const name=host.name||host.host;
 return <article className={`host-card ${selecting?'selection-mode':''} ${selected?'is-selected':''}`}>
  {selecting&&<button className="host-selection-target" aria-label={`${name} 선택`} aria-pressed={selected} disabled={busy} onClick={onToggle}/>}
  <div className="host-card-top"><div className="host-glyph"><Server size={22}/></div>
   {!selecting&&<div className="host-card-actions"><button className={`icon-button favorite ${host.favorite?'is-favorite':''}`} aria-label={`${name} 즐겨찾기 ${host.favorite?'해제':'추가'}`} disabled={busy} onClick={onFavorite}><Star size={17} fill={host.favorite?'currentColor':'none'}/></button><button className="icon-button" aria-label={`${name} 편집`} onClick={onEdit}><MoreHorizontal size={18}/></button></div>}
  </div>
  {selecting?<h2 className="host-title">{name}</h2>:<button className="host-title" onClick={onOpen}>{name}</button>}
  <p className="host-address">{host.username}@{host.host}<span>:{host.port}</span></p>
  <div className="host-tags">{host.bastionHostId&&<span className="route-chip"><Network size={11}/>via {bastionName||'Bastion'}</span>}{host.group&&<span className="group-chip"><Folder size={11}/>{host.group}</span>}{host.tags?.map(t=><span key={t}>#{t}</span>)}</div>
  <div className="host-card-bottom"><span><span className={`status-dot ${connected?'online':''}`}/>{connected?'연결됨':'연결 대기'}</span>{!selecting&&<button onClick={onOpen}>{connected?'세션 열기':'연결'}<ArrowUpRight size={15}/></button>}</div>
 </article>;
}
