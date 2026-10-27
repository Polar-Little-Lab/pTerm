import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {SessionTabs} from '../src/SessionTabs';
test('tab plus opens connection picker without a duplicate search button',async()=>{
 const dom=new JSDOM('<div id="mount"></div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('mount')!);let opened=0;
 await act(()=>root.render(<SessionTabs sessions={[]} active={null} sidebarOpen={false} onSelect={()=>{}} onClose={()=>{}} onSidebar={()=>{}} onNew={()=>{opened++;}}/>));
 assert.equal(document.querySelector('[aria-label="빠른 전환"]'),null);
 await act(()=>(document.querySelector('[aria-label="새 연결"]') as HTMLButtonElement).click());
 assert.equal(opened,1);
 await act(()=>root.unmount());dom.window.close();
});
