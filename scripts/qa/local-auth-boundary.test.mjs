import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from '../../app/node_modules/typescript/lib/typescript.js';
const source=ts.createSourceFile('main.tsx',readFileSync(new URL('../../app/src/main.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function walk(node,visit){visit(node);ts.forEachChild(node,child=>walk(child,visit));}
function calls(node){const result=[];walk(node,n=>{if(ts.isCallExpression(n))result.push(n);});return result;}
test('React effects never initiate Vault unlock',()=>{
 const effects=calls(source).filter(n=>n.expression.getText(source)==='useEffect');assert.ok(effects.length>0);
 for(const effect of effects)for(const call of calls(effect)){
  assert.notEqual(call.expression.getText(source),'unlock');
  if(call.expression.getText(source)==='invoke')assert.notEqual(call.arguments[0]?.text,'unlock_vault');
 }
});
test('local terminal creation has no Vault authentication dependency',()=>{
 let local;walk(source,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='openLocal')local=n.initializer;});assert.ok(local);
 const invoked=calls(local).filter(n=>n.expression.getText(source)==='invoke').map(n=>n.arguments[0]?.text);
 assert.ok(invoked.includes('start_local'));
 for(const command of invoked)assert.ok(['start_local','ack_output','disconnect_ssh'].includes(command),command);
 assert.ok(!calls(local).some(n=>n.expression.getText(source)==='unlock'));
});
