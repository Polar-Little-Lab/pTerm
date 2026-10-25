import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionRoute,SshRouteRun,reusableSession} from '../../app/src/ssh-route.ts';
const host=(id,bastionHostId)=>({id,name:id,host:id+'.test',port:22,username:'fixture',bastionHostId});
const gateway=host('gateway'),middle=host('middle','gateway'),target=host('target','middle'),hosts=[target,gateway,middle];
const live=(host,id,parent)=>({host,id,bastionSessionId:parent,kind:'ssh',status:'connected',closed:false});
test('route resolves outermost bastion first without mutating host records',()=>{
 const route=connectionRoute(target,hosts);assert.deepEqual(route.map(h=>h.id),['gateway','middle','target']);route[0].fingerprint='test';assert.equal(gateway.fingerprint,undefined);
});
test('missing host and cycles fail before any connection',()=>{
 assert.throws(()=>connectionRoute(target,[target]),/찾을 수/);
 assert.throws(()=>connectionRoute({...gateway,bastionHostId:'target'},hosts),/순환/);
});
test('multi-hop advances once per successful connection and secrets only reach target',()=>{
 const run=new SshRouteRun(connectionRoute(target,hosts),'target-secret');
 assert.equal(run.next([]).id,'gateway');assert.equal(run.takeSecret(),undefined);
 run.complete('s1');assert.equal(run.next([]).id,'middle');assert.equal(run.takeSecret(),undefined);
 run.complete('s2');assert.equal(run.next([]).id,'target');assert.equal(run.takeSecret(),'target-secret');assert.equal(run.takeSecret(),undefined);
 run.complete('s3');assert.equal(run.next([]),undefined);assert.equal(run.parentId,'s3');
});
test('connected ancestors and target are reused without new tabs',()=>{
 const sessions=[live(gateway,'s1'),live(middle,'s2','s1'),live(target,'s3','s2')];
 const run=new SshRouteRun(connectionRoute(target,hosts));assert.equal(run.next(sessions),undefined);assert.equal(run.parentId,'s3');assert.equal(run.created.size,0);
});
test('reuse requires matching transport, identity and parent session',()=>{
 const base=live(target,'target-session','parent');
 for(const change of [{status:'closed'},{closed:true},{kind:'local'},{bastionSessionId:'other'},{host:{...target,host:'other.test'}},{host:{...target,username:'root'}},{host:{...target,port:2222}},{host:{...target,fingerprint:'changed'}},{host:{...target,keyPath:'/other'}}])assert.equal(reusableSession(target,'parent',[{...base,...change}]),undefined);
 assert.equal(reusableSession(target,'parent',[base])?.id,'target-session');
});
test('failed authentication does not advance; cleanup only tracks new sessions',()=>{
 const run=new SshRouteRun(connectionRoute(target,hosts),'secret');assert.equal(run.next([live(gateway,'existing')]).id,'middle');
 run.created.add('attempt');assert.equal(run.next([live(gateway,'existing')]).id,'middle');assert.equal(run.created.has('existing'),false);run.clear();assert.equal(run.secret,undefined);
});
