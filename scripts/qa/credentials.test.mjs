import test from 'node:test';
import assert from 'node:assert/strict';
import {savedSecret,storeCredential,pruneCredentials,validCredentials} from '../../app/src/credentials.ts';
import {connectionRoute,SshRouteRun} from '../../app/src/ssh-route.ts';
const host={id:'target',name:'Target',host:'target.test',port:22,username:'test',authMethod:'password'};
const workspace={version:1,hosts:[host],snippets:[]};
test('old workspace loads without credentials; opt-in survives serialized reopen',()=>{
 assert.equal(validCredentials(undefined),true);
 assert.equal(savedSecret(workspace,host),undefined);
 const saved=JSON.parse(JSON.stringify(storeCredential(workspace,host,true,'fixture-password')));
 assert.equal(savedSecret(saved,host),'fixture-password');
 assert.equal('secret' in saved.hosts[0],false);
 assert.equal(savedSecret(storeCredential(workspace,host,false,'transient'),host),undefined);
});
test('blank edit preserves saved value, replacement updates it, opt-out removes it',()=>{
 let d=storeCredential(workspace,host,true,'old');
 d=storeCredential(d,host,true,'');assert.equal(savedSecret(d,host),'old');
 d=storeCredential(d,host,true,'new');assert.equal(savedSecret(d,host),'new');
 d=storeCredential(d,host,false,'');assert.equal(savedSecret(d,host),undefined);
});
test('changed destination, account, route or method cannot reuse a saved secret',()=>{
 const d=storeCredential(workspace,host,true,'fixture');
 for(const change of [{id:'copy'},{host:'other.test'},{port:2222},{username:'root'},{authMethod:'key'},{authMethod:'agent'},{bastionHostId:'gateway'}]){
  const other={...host,...change};assert.equal(savedSecret(d,other),undefined);
 }
 const key={...host,authMethod:'key',keyPath:'/fixture/key'};
 const k=storeCredential({...workspace,hosts:[key]},key,true,'passphrase');
 assert.equal(savedSecret(k,key),'passphrase');
 assert.equal(savedSecret(k,{...key,keyPath:'/fixture/other'}),undefined);
 assert.equal(savedSecret(storeCredential(workspace,{...host,authMethod:'agent'},true,'secret'),host),undefined);
});
test('deleting hosts and changing identity prunes credentials, grouping does not',()=>{
 const d=storeCredential(workspace,host,true,'fixture');
 assert.deepEqual(pruneCredentials({...d,hosts:[]}).credentials,[]);
 assert.deepEqual(pruneCredentials({...d,hosts:[{...host,username:'other'}]}).credentials,[]);
 assert.equal(savedSecret(pruneCredentials({...d,hosts:[{...host,group:'new',favorite:true}]}),host),'fixture');
});
test('bastion and target use separate secrets; temporary target secret never reaches bastion',()=>{
 const gateway={...host,id:'gateway',host:'gateway.test'};
 const target={...host,bastionHostId:gateway.id};
 let d={...workspace,hosts:[gateway,target]};
 d=storeCredential(d,gateway,true,'gateway-secret');d=storeCredential(d,target,true,'target-secret');
 const run=new SshRouteRun(connectionRoute(target,d.hosts),'one-time-target');
 const first=run.next([]);assert.equal(run.takeSecret()??savedSecret(d,first),'gateway-secret');
 run.complete('gateway-session');const second=run.next([]);
 assert.equal(run.takeSecret()??savedSecret(d,second),'one-time-target');
 assert.equal(savedSecret(d,second),'target-secret');run.clear();assert.equal(run.secret,undefined);
});
test('malformed persisted credentials are rejected',()=>{
 for(const value of [null,{},[{hostId:'x',scope:'s',secret:123}],[{hostId:'x',scope:'s',secret:'x'.repeat(16385)}]])assert.equal(validCredentials(value),false);
});
