// Run the production App connection handlers with an isolated IPC/terminal adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../../app/node_modules/typescript/lib/typescript.js';
import {paneIds,replacePane,removePane} from '../../app/src/pane-layout.ts';
import {setTabTree,newTab,removeSession} from '../../app/src/terminal-tabs.ts';
import {connectionRoute,SshRouteRun} from '../../app/src/ssh-route.ts';
import {savedSecret,storeCredential,pruneCredentials} from '../../app/src/credentials.ts';
const source=ts.createSourceFile('main.tsx',readFileSync(new URL('../../app/src/main.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const wanted=new Set(['abortRoute','startRoute','openHost','connect','reconnect','close','saveHost']);const parts=[];
function visit(n){if(ts.isVariableDeclaration(n)&&wanted.has(n.name.getText(source)))parts.push('const '+n.getText(source)+';');if(ts.isExpressionStatement(n)&&n.getText(source).startsWith('advanceRoute.current='))parts.push(n.getText(source));ts.forEachChild(n,visit);}visit(source);
const production=ts.transpileModule(parts.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const factory=new Function('connectionRoute','SshRouteRun','hosts','adapter','layout','credentials',`
 const {savedSecret,storeCredential,pruneCredentials}=credentials;const {paneIds,replacePane,removePane,setTabTree,newTab,removeSession}=layout;const state={};const reconnectTarget={current:null};const sessionsRef={items:[],get current(){return this.items},set current(items){this.items=items;for(const s of items)s.terminal??={dispose(){}}}},dataRef={current:{hosts}},routeRun={current:null},connecting={current:false},advanceRoute={current:()=>{}};
 const desktop=true,unlocked=true,quickConnect=true,activeRef={current:null};let password='',bastionSessionId='',rememberSecret=false;const setRememberSecret=v=>rememberSecret=v;const update=async fn=>{dataRef.current=pruneCredentials(fn(dataRef.current));return true;};
 const setPending=v=>state.pending=v,setError=v=>state.error=v,setNotice=()=>{},setMode=()=>{},setLayoutOpen=()=>{},setSidebar=()=>{},setActive=v=>state.active=typeof v==='function'?v(state.active):v,setSection=()=>{},setShowPassword=()=>{},setQuickConnect=()=>{},setVerified=()=>{};
 const setSelected=v=>state.selected=v,setPassword=v=>{password=v;state.password=v},setBastionSessionId=v=>{bastionSessionId=v},setShowConnection=v=>state.prompt=v,setTrust=v=>state.trust=v;
 const recoveryTimers={current:new Map()},recoverLatest={current:()=>{}};const activate=id=>state.active=id,navigate=()=>{},refresh=()=>{},updateSessions=v=>sessionsRef.current=v,tabState={ref:{current:[]},update(fn){this.ref.current=fn(this.ref.current)},add(id){this.ref.current.push(newTab(id))},remove(id){this.update(t=>removeSession(t,id))}};
 const layoutRef={current:null};
 const terminalTheme=()=>({});
 class Terminal{cols=80;rows=24;loadAddon(){}writeln(){}write(){}dispose(){}}class FitAddon{}class Channel{}
 const invoke=(cmd,args)=>cmd==='connect_ssh'?adapter(args):Promise.resolve();
 ${production}
 return {state,dataRef,setRememberSecret,tabState,sessionsRef,routeRun,recoveryTimers,recoverLatest,close,reconnect,openHost,startRoute,abortRoute,submit:secret=>connect(state.selected,secret),trust:()=>{const h={...state.trust.host,fingerprint:state.trust.fingerprint};routeRun.current.steps[routeRun.current.index]=h;setTrust(null);return connect(h,password);}};
`);
const gateway={id:'g',name:'Gateway',host:'gateway.test',username:'ops',port:22};
const target={id:'t',name:'Target',host:'target.test',username:'app',port:22,bastionHostId:'g'};
const tick=()=>new Promise(r=>setImmediate(r));
function harness(adapter){return factory(connectionRoute,SshRouteRun,[gateway,target],adapter,{paneIds,replacePane,removePane,setTabTree,newTab,removeSession},{savedSecret,storeCredential,pruneCredentials});}
test('actual handlers prompt each hop, reuse sessions, and ignore duplicate submit',async()=>{
 const calls=[];let release;const app=harness(a=>{calls.push(a);return new Promise(r=>release=r)});
 app.openHost(target);assert.equal(app.state.selected.id,'g');assert.equal(app.state.prompt,true);
 const first=app.submit('gateway-pass');await app.submit('duplicate');assert.equal(calls.length,1);release();await first;
 assert.equal(app.state.selected.id,'t');assert.equal(app.state.password,'');
 const second=app.submit('target-pass');assert.equal(calls[1].bastionSessionId,calls[0].id);release();await second;
 assert.equal(app.routeRun.current,null);assert.equal(app.sessionsRef.current.length,2);
 app.openHost(target);assert.equal(calls.length,2);assert.equal(app.state.active,calls[1].id);
});
test('auth retry and host-key approval retain the correct hop without failed tabs',async()=>{
 let count=0;const calls=[];const app=harness(async a=>{calls.push(a);if(++count===1)throw {kind:'authentication'};if(count===2)throw {kind:'hostKey',fingerprint:'SHA256:fixture'};});
 app.openHost(target);await app.submit('wrong');assert.equal(app.state.prompt,true);assert.equal(app.sessionsRef.current.length,0);assert.equal(app.state.selected.id,'g');
 await app.submit('right');assert.equal(app.state.trust.host.id,'g');assert.equal(app.sessionsRef.current.length,0);
 await app.trust();assert.equal(calls[2].request.fingerprint,'SHA256:fixture');assert.equal(app.state.selected.id,'t');
});
test('cancel while connecting prevents late completion from advancing or adding tabs',async()=>{
 let release;const app=harness(()=>new Promise(r=>release=r));app.openHost(target);const attempt=app.submit('secret');app.abortRoute();release();await attempt;await tick();
 assert.equal(app.routeRun.current,null);assert.equal(app.sessionsRef.current.length,0);assert.equal(app.state.prompt,false);assert.equal(app.state.password,'');
});
test('fatal target failure removes newly opened ancestors but preserves reused sessions',async()=>{
 const app=harness(async a=>{if(a.request.host===target.host)throw {kind:'timeout'};});app.openHost(target);await app.submit('g');await app.submit('t');assert.equal(app.sessionsRef.current.length,0);assert.equal(app.routeRun.current,null);
 const reused={id:'existing',kind:'ssh',host:gateway,status:'connected',closed:false};app.sessionsRef.current=[reused];app.openHost(target);await app.submit('t');assert.deepEqual(app.sessionsRef.current,[reused]);
});
test('reconnection returns to the original split without adding a duplicate tab',async()=>{
 const app=harness(async()=>{});
 const parent={id:'existing',kind:'ssh',host:gateway,status:'connected',closed:false};
 const old={id:'old',kind:'ssh',host:target,status:'closed',closed:false,bastionSessionId:'existing'};
 const local={id:'local',kind:'local',host:{id:'local'},status:'connected',closed:false};
 app.sessionsRef.current=[parent,old,local];app.tabState.ref.current=[{id:'split',focused:'old',tree:{kind:'split',axis:'x',ratio:.65,first:{kind:'leaf',id:'local'},second:{kind:'leaf',id:'old'}}},newTab('existing')];
 app.reconnect(old);await app.submit('password');
 assert.equal(app.tabState.ref.current.length,2);assert.equal(app.tabState.ref.current[0].tree.ratio,.65);assert.equal(app.tabState.ref.current[0].tree.first.id,'local');assert.notEqual(app.tabState.ref.current[0].tree.second.id,'old');assert.equal(app.sessionsRef.current.length,3);assert.equal(old.closed,true);
});
test('closing the original pane during reconnect cancels late connection completion',async()=>{
 let release;const app=harness(()=>new Promise(r=>release=r));
 const old={id:'old',kind:'ssh',host:gateway,status:'closed',closed:false};app.sessionsRef.current=[old];app.tabState.ref.current=[newTab('old')];
 app.reconnect(old);const attempt=app.submit('password');app.close(old);release();await attempt;
 assert.equal(app.routeRun.current,null);assert.equal(app.sessionsRef.current.length,0);assert.equal(app.tabState.ref.current.length,0);
});
test('a full workspace can reconnect one closed pane without requiring a spare tab',async()=>{
 let calls=0;const app=harness(async()=>{calls++});
 const old={id:'old',kind:'ssh',host:gateway,status:'closed',closed:false};
 const locals=Array.from({length:15},(_,i)=>({id:'local'+i,kind:'local',host:{id:'local'+i},status:'connected',closed:false}));
 app.sessionsRef.current=[old,...locals];app.tabState.ref.current=app.sessionsRef.current.map(s=>newTab(s.id));
 app.reconnect(old);assert.equal(app.state.prompt,true);await app.submit('password');assert.equal(calls,1);assert.equal(app.sessionsRef.current.length,16);assert.equal(app.tabState.ref.current.length,16);
});
test('100 disconnect/reconnect cycles retain one target pane and the existing bastion',async()=>{
 const app=harness(async()=>{});
 const parent={id:'existing',kind:'ssh',host:gateway,status:'connected',closed:false};
 const first={id:'target',kind:'ssh',host:target,status:'closed',closed:false,bastionSessionId:parent.id};
 app.sessionsRef.current=[parent,first];app.tabState.ref.current=[newTab(parent.id),newTab(first.id)];
 for(let i=0;i<100;i++){
  const old=app.sessionsRef.current.find(s=>s.host.id===target.id);old.status='closed';app.reconnect(old);await app.submit('synthetic-only');
  assert.equal(app.sessionsRef.current.length,2);assert.equal(app.tabState.ref.current.length,2);assert.equal(app.routeRun.current,null);assert.equal(app.sessionsRef.current[0],parent);assert.equal(new Set(app.tabState.ref.current.flatMap(t=>paneIds(t.tree))).size,2);
 }
});
test('recovery uses the transport flag, not translated message text; closing cancels the timer',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let channel;let recovered=0;
 const app=harness(async args=>{channel=args.output});app.recoverLatest.current=()=>recovered++;
 app.openHost(gateway);await app.submit('synthetic');
 channel.onmessage({type:'closed',message:'네트워크 연결이 끊어졌습니다.',retryable:false});t.mock.timers.tick(3000);assert.equal(recovered,0);
 channel.onmessage({type:'closed',message:'transport unavailable',retryable:true});assert.equal(app.recoveryTimers.current.size,1);t.mock.timers.tick(2000);assert.equal(recovered,1);
 channel.onmessage({type:'closed',message:'transport unavailable',retryable:true});app.close(app.sessionsRef.current[0]);t.mock.timers.tick(3000);assert.equal(recovered,1);
});

test('saved hop credentials connect automatically and failed credentials allow replacement',async()=>{
 const calls=[];let fail=true;
 const app=harness(async a=>{calls.push(a);if(a.request.host===target.host&&fail)throw {kind:'authentication'};});
 app.dataRef.current=storeCredential(storeCredential(app.dataRef.current,gateway,true,'saved-gateway'),target,true,'outdated-target');
 app.openHost(target);await tick();await tick();
 assert.equal(calls.length,2);assert.equal(calls[0].request.password,'saved-gateway');assert.equal(calls[1].request.password,'outdated-target');
 assert.equal(app.state.prompt,true);assert.equal(app.state.selected.id,target.id);assert.equal(app.state.password,'');
 fail=false;await app.submit('new-target');
 assert.equal(savedSecret(app.dataRef.current,target),'new-target');assert.equal(app.routeRun.current,null);
 assert.equal(app.sessionsRef.current.some(s=>'secret' in s.host),false);
});
test('unchecked credentials remain one-time, checked credentials persist after success',async()=>{
 const app=harness(async()=>{});app.openHost(gateway);await app.submit('one-time');
 assert.equal(savedSecret(app.dataRef.current,gateway),undefined);
 app.close(app.sessionsRef.current[0]);app.openHost(gateway);app.setRememberSecret(true);await app.submit('remembered');
 assert.equal(savedSecret(app.dataRef.current,gateway),'remembered');
});
