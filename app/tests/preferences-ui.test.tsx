import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SessionPreferencesDialog} from '../src/SessionPreferencesDialog';
import {resolvePreferences} from '../src/session-preferences';
import type {Workspace} from '../src/types';
test('settings UI shows inherited values and removing an override persists inheritance',async()=>{
 const dom=new JSDOM('<div id="mount"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('mount')!);
 let w:Workspace={version:1,hosts:[{id:'a',name:'server',host:'test',username:'user',port:22,group:'prod'}],snippets:[],sessionDefaults:{fontSize:14},groupPreferences:{prod:{fontSize:18}}};let saves=0;
 const render=()=>root.render(<SessionPreferencesDialog workspace={w} onClose={()=>{}} onSave={async fn=>{w=fn(w);saves++;render();return true;}}/>);
 await act(async()=>render());const scope=[...document.querySelectorAll('select')][0];await act(()=>{scope.value='group';scope.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 let font=document.querySelector<HTMLInputElement>('input[aria-label="글꼴 크기"]')!;assert.equal(font.value,'18');assert.equal(font.disabled,false);
 const checkbox=font.closest('.preference-row')!.querySelector<HTMLInputElement>('input[type=checkbox]')!;await act(()=>checkbox.click());font=document.querySelector<HTMLInputElement>('input[aria-label="글꼴 크기"]')!;assert.equal(font.value,'14');assert.equal(font.disabled,true);
 const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='설정 저장')!;await act(async()=>save.click());assert.equal(saves,1);assert.equal(w.groupPreferences?.prod.fontSize,undefined);assert.equal(resolvePreferences(w,w.hosts[0]).fontSize,14);
 await act(()=>root.unmount());dom.window.close();
});
