import type {Host,Session} from './types';
export function connectionRoute(target:Host,hosts:Host[]):Host[]{
 const seen=new Set<string>(),steps:Host[]=[];let host:Host|undefined=target;
 while(host){
  if(seen.has(host.id))throw new Error('배스천 경로가 순환합니다. 호스트의 접속 경로를 수정하세요.');
  seen.add(host.id);steps.unshift({...host});
  if(!host.bastionHostId)break;
  const parent=hosts.find(h=>h.id===host!.bastionHostId);
  if(!parent)throw new Error('배스천 호스트를 찾을 수 없습니다. 저장된 접속 경로를 확인하세요.');
  host=parent;
 }
 return steps;
}
type LiveSession=Pick<Session,'id'|'kind'|'host'|'status'|'closed'|'bastionSessionId'>;
export function reusableSession(host:Host,parentId:string|undefined,sessions:LiveSession[]){
 return sessions.find(s=>s.kind!=='local'&&!s.closed&&s.status==='connected'&&s.bastionSessionId===parentId&&s.host.id===host.id&&s.host.host===host.host&&s.host.port===host.port&&s.host.username===host.username&&s.host.bastionHostId===host.bastionHostId&&s.host.fingerprint===host.fingerprint&&s.host.authMethod===host.authMethod&&s.host.keyPath===host.keyPath);
}
export class SshRouteRun{
 index=0;parentId:string|undefined;created=new Set<string>();secret:string|undefined;
 steps:Host[];
 constructor(steps:Host[],secret?:string){this.steps=steps;this.secret=secret;}
 next(sessions:LiveSession[]){
  while(this.index<this.steps.length){const host=this.steps[this.index],existing=reusableSession(host,this.parentId,sessions);if(!existing)return host;this.complete(existing.id);}
  return undefined;
 }
 complete(id:string){this.parentId=id;this.index++;}
 takeSecret(){if(this.index!==this.steps.length-1)return undefined;const secret=this.secret;this.secret=undefined;return secret;}
 clear(){this.secret=undefined;}
}
