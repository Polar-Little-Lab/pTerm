import test from 'node:test';
import assert from 'node:assert/strict';
import {validBastion} from '../../app/src/bastion-route.ts';
const host=(id,bastionHostId)=>({id,name:id,host:id,username:'test',port:22,bastionHostId});
test('saved offline bastion and valid multi-hop routes are selectable',()=>{
 const gateway=host('gateway'),middle=host('middle','gateway');
 assert.equal(validBastion(gateway,'target',[gateway,middle]),true);
 assert.equal(validBastion(middle,'target',[gateway,middle]),true);
});
test('self, dependent and pre-existing cyclic routes are excluded',()=>{
 const target=host('target'),child=host('child','target'),a=host('a','b'),b=host('b','a');
 const hosts=[target,child,a,b];
 assert.equal(validBastion(target,'target',hosts),false);
 assert.equal(validBastion(child,'target',hosts),false);
 assert.equal(validBastion(a,'target',hosts),false);
});
