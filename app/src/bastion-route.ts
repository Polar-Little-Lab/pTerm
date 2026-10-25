import type {Host} from './types';
// Reject a route that leads back to the target, or already contains a cycle.
export function validBastion(candidate:Host,targetId:string,hosts:Host[]):boolean{
 const visited=new Set([targetId]);let current:Host|undefined=candidate;
 while(current){if(visited.has(current.id))return false;visited.add(current.id);current=hosts.find(h=>h.id===current!.bastionHostId);}
 return true;
}
