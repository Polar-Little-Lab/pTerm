import test from 'node:test';
import assert from 'node:assert/strict';
import {newTab,setTabTree,removeSession,dockBranch,reorderTabs} from '../../app/src/terminal-tabs.ts';
import {leaf,paneIds,paneRects,presetLayout,resizeSplit,placeSession} from '../../app/src/pane-layout.ts';
function unique(tabs,expected){assert.equal(new Set(tabs.map(t=>t.id)).size,tabs.length,'tab identities must be unique');const ids=tabs.flatMap(t=>paneIds(t.tree));assert.deepEqual([...ids].sort(),[...expected].sort());assert.equal(new Set(ids).size,ids.length);for(const t of tabs)assert.ok(paneIds(t.tree).includes(t.focused));}
test('new tab leaves existing split geometry and ratios intact',()=>{
 const split=resizeSplit(presetLayout('columns',['a','b']),'',.7);
 const original={id:'a',tree:split,focused:'b'},tabs=[original,newTab('c')];
 assert.equal(tabs[0],original);assert.equal(tabs[1].tree.id,'c');
 unique(tabs,['a','b','c']);
});
test('splitting adds a session inside one tab; other tabs stay unchanged',()=>{
 const tabs=[newTab('a'),newTab('other')];
 const next=setTabTree(tabs,'a',placeSession(tabs[0].tree,'a','b','right'));
 assert.equal(next.length,2);assert.deepEqual(paneIds(next[0].tree),['a','b']);assert.deepEqual(next[1],tabs[1]);unique(next,['a','b','other']);
});
test('moving a pane between tabs neither closes nor duplicates it',()=>{
 const tabs=[{id:'a',tree:presetLayout('columns',['a','b']),focused:'b'},newTab('c')];
 const tree=dockBranch(tabs[1].tree,leaf('b'),'c','bottom','pane');
 const next=setTabTree(tabs,'c',tree);
 assert.deepEqual(paneIds(next[0].tree),['a']);assert.deepEqual(paneIds(next[1].tree),['c','b']);unique(next,['a','b','c']);
});
test('dropping an entire split tab preserves its subtree and removes its old tab',()=>{
 const source=resizeSplit(presetLayout('columns',['a','b']),'',.65);
 const tabs=[{id:'a',tree:source,focused:'b'},newTab('c')];
 const next=setTabTree(tabs,'c',dockBranch(leaf('c'),source,'c','top','workspace'));
 assert.equal(next.length,1);assert.deepEqual(next[0].tree.first,source);unique(next,['a','b','c']);
});
test('detaching a pane creates a new tab and closing a pane preserves siblings',()=>{
 const tabs=[{id:'a',tree:presetLayout('columns',['a','b']),focused:'b'}];
 const detached=setTabTree(tabs,'a',leaf('a'));assert.equal(detached.length,2);unique(detached,['a','b']);
 const closed=removeSession(tabs,'b');assert.equal(closed.length,1);assert.equal(closed[0].focused,'a');
 assert.deepEqual(removeSession(closed,'a'),[]);
});
test('tab reorder moves an entire group without changing geometry',()=>{
 const tabs=[newTab('a'),{id:'b',tree:presetLayout('rows',['b','c']),focused:'c'},newTab('d')];
 const next=reorderTabs(tabs,'c','a',false);assert.deepEqual(next.map(t=>t.id),['b','a','d']);assert.equal(next[0].tree,tabs[1].tree);
 unique(next,['a','b','c','d']);
});
test('workspace top split retains the two columns below it',()=>{
 const tree=dockBranch(presetLayout('columns',['1','2']),leaf('3'),'1','top','workspace');
 assert.deepEqual(paneRects(tree).map(r=>[r.id,r.x,r.y,r.width,r.height]),[['3',0,0,1,.5],['1',0,.5,.5,.5],['2',.5,.5,.5,.5]]);
});

test('lifting the selected tab exposes a neighbor; other tabs keep their destination',async()=>{
 const {dragDestination}=await import('../../app/src/terminal-tabs.ts');
 const tabs=[newTab('a'),{id:'b',tree:presetLayout('columns',['b','c']),focused:'c'},newTab('d')];
 assert.equal(dragDestination(tabs,'a','a'),'c');
 assert.equal(dragDestination(tabs,'c','b'),'a');
 assert.equal(dragDestination(tabs,'d','d'),'c');
 assert.equal(dragDestination(tabs,'a','d'),null);
 assert.equal(dragDestination([newTab('a')],'a','a'),null);
 assert.equal(dragDestination(tabs,'missing','a'),null);
});

test('detaching the original pane gives it a different tab identity',()=>{
 const tabs=[{id:'a',tree:presetLayout('columns',['a','b']),focused:'a'}];
 const next=setTabTree(tabs,'a',leaf('b'));
 unique(next,['a','b']);assert.equal(next.length,2);
 assert.equal(next[0].id,'a');assert.notEqual(next[1].id,'a');
 const changed=setTabTree(next,next[1].id,leaf('a'));
 unique(changed,['a','b']);assert.equal(changed.length,2);
 assert.deepEqual(changed[0].tree,leaf('b'));
});
test('repeated detach, resize, reorder and merge never multiply tabs or sessions',()=>{
 let tabs=[{id:'a',tree:presetLayout('columns',['a','b']),focused:'a'},newTab('c')];
 for(let i=0;i<100;i++){
  const owner=tabs.find(t=>paneIds(t.tree).includes('a'));
  tabs=setTabTree(tabs,owner.id,leaf('b'));
  unique(tabs,['a','b','c']);assert.equal(tabs.length,3);
  const detached=tabs.find(t=>paneIds(t.tree).includes('a'));
  tabs=setTabTree(tabs,detached.id,leaf('a'));
  tabs=reorderTabs(tabs,'a','c',true);
  const destination=tabs.find(t=>paneIds(t.tree).includes('b'));
  const merged=dockBranch(destination.tree,leaf('a'),'b','right','pane');
  tabs=setTabTree(tabs,destination.id,resizeSplit(merged,'',.65));
  unique(tabs,['a','b','c']);assert.equal(tabs.length,2);
 }
});
test('new tab allocation also avoids reused session ids held by surviving tabs',()=>{
 const tab=newTab('a',new Set(['a','a:tab:1']));
 assert.equal(tab.id,'a:tab:2');assert.equal(tab.tree.id,'a');
});

test('detaching onto the original tab inserts beside the survivor, not at the end',async()=>{
 const {dropOnTabStrip}=await import('../../app/src/terminal-tabs.ts');
 const tabs=[{id:'a',tree:presetLayout('columns',['a','b']),focused:'a'},newTab('c')];
 for(const after of [false,true]){
  const next=dropOnTabStrip(tabs,'a','pane',{id:'a',after});
  unique(next,['a','b','c']);
  assert.deepEqual(next.map(t=>paneIds(t.tree)),after?[['b'],['a'],['c']]:[['a'],['b'],['c']]);
 }
});
test('detaching collapses the vacated area without altering other tabs',async()=>{
 const {dropOnTabStrip}=await import('../../app/src/terminal-tabs.ts');
 const tabs=[{id:'a',tree:presetLayout('main-left',['a','b','c']),focused:'b'},newTab('d')];
 const next=dropOnTabStrip(tabs,'b','pane',{id:'d',after:true});
 unique(next,['a','b','c','d']);assert.deepEqual(next.map(t=>paneIds(t.tree)),[['a','c'],['d'],['b']]);
 assert.equal(paneRects(next[0].tree).find(r=>r.id==='c').height,1);
});
