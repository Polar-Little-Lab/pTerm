import test from 'node:test';
import assert from 'node:assert/strict';
import {leaf,paneIds,paneRects,presetLayout,dockPane,removePane,replacePane,nearestEdge} from '../../app/src/pane-layout.ts';
function valid(tree,count){
 const ids=paneIds(tree),rects=paneRects(tree);assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);
 assert.equal(rects.reduce((n,r)=>n+r.width*r.height,0),1);
 for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=1&&r.y+r.height<=1);for(const s of rects)if(r!==s)assert.ok(r.x+r.width<=s.x||s.x+s.width<=r.x||r.y+r.height<=s.y||s.y+s.height<=r.y);}
}
test('all presets cover the viewport without overlap',()=>{
 for(const [preset,count] of [['single',1],['columns',2],['rows',2],['main-left',3],['main-top',3],['grid',4]])valid(presetLayout(preset,['a','b','c','d','e']),count);
});
test('edge docking grows one pane into four, retaining existing IDs',()=>{
 let tree=leaf('a');tree=dockPane(tree,'b','a','right');tree=dockPane(tree,'c','b','bottom');tree=dockPane(tree,'d','a','top');valid(tree,4);assert.deepEqual(new Set(paneIds(tree)),new Set(['a','b','c','d']));
 valid(dockPane(tree,'e','a','left'),5);
});
test('moving existing panes collapses the previous slot without duplicating',()=>{
 for(const edge of ['left','right','top','bottom']){const tree=dockPane(presetLayout('grid',['a','b','c','d']),'a','d',edge);valid(tree,4);assert.equal(paneIds(tree).filter(x=>x==='a').length,1);}
});
test('removal collapses empty splits; last removal is null',()=>{
 let tree=presetLayout('grid',['a','b','c','d']);for(const [id,count] of [['a',3],['c',2],['b',1]]){tree=removePane(tree,id);valid(tree,count);}assert.deepEqual(tree,leaf('d'));assert.equal(removePane(tree,'d'),null);
});
test('replacing focused pane preserves siblings and geometry',()=>{
 const tree=presetLayout('main-left',['a','b','c']);const next=replacePane(tree,'b','d');valid(next,3);assert.deepEqual(paneIds(next),['a','d','c']);assert.deepEqual(paneRects(tree).map(({id,...r})=>r),paneRects(next).map(({id,...r})=>r));
});
test('invalid and self drops leave layout unchanged',()=>{const tree=leaf('a');assert.equal(dockPane(tree,'a','a','left'),tree);assert.equal(dockPane(tree,'b','missing','top'),tree);});
test('edge hit testing resolves all four edges',()=>{assert.equal(nearestEdge(.01,.5),'left');assert.equal(nearestEdge(.99,.5),'right');assert.equal(nearestEdge(.5,.01),'top');assert.equal(nearestEdge(.5,.99),'bottom');});

test('active tab can split away from another open background tab',async()=>{
 const {planDock}=await import('../../app/src/pane-layout.ts');
 const tree=leaf('a'),next=planDock(tree,'a','a','right',['a','b']);
 assert.deepEqual(paneIds(next),['b','a']);valid(next,2);
 assert.equal(planDock(tree,'a','a','right',['a']),tree);
});
test('center does not split while all four edges do',async()=>{
 const {dockingEdge}=await import('../../app/src/pane-layout.ts');
 assert.equal(dockingEdge(.5,.5),null);assert.equal(dockingEdge(.3,.6),null);
 for(const [x,y,edge] of [[.1,.5,'left'],[.9,.5,'right'],[.5,.1,'top'],[.5,.9,'bottom']])assert.equal(dockingEdge(x,y),edge);
});
test('self docking cannot create a fifth pane or duplicate visible siblings',async()=>{
 const {planDock}=await import('../../app/src/pane-layout.ts');
 const tree=presetLayout('grid',['a','b','c','d']);assert.equal(planDock(tree,'a','a','left',['a','b','c','d','e']),tree);
 const two=presetLayout('columns',['a','b']);assert.equal(planDock(two,'a','a','left',['a','b']),two);
});

test('adding a tab preserves existing layout and keeps other panes',async()=>{
 const {placeSession}=await import('../../app/src/pane-layout.ts');
 const tree=presetLayout('grid',['a','b','c','d']),next=placeSession(tree,'b','new');
 assert.deepEqual(paneIds(next),['a','new','c','d']);valid(next,4);
 assert.deepEqual(paneRects(tree).map(({id,...r})=>r),paneRects(next).map(({id,...r})=>r));
});
test('new split opens beside the active terminal without losing it',async()=>{
 const {placeSession}=await import('../../app/src/pane-layout.ts');
 assert.deepEqual(paneIds(placeSession(null,'a','b','right')),['a','b']);
 const tree=presetLayout('columns',['a','b']);const next=placeSession(tree,'b','c','bottom');valid(next,3);assert.deepEqual(paneIds(next),['a','b','c']);
 assert.deepEqual(placeSession(null,null,'a'),leaf('a'));
});

test('nested resize changes only the chosen boundary and preserves ratios on tab replacement',async()=>{
 const {resizeSplit,splitHandles,placeSession}=await import('../../app/src/pane-layout.ts');
 const base=presetLayout('grid',['a','b','c','d']);
 const resized=resizeSplit(resizeSplit(base,'',.6),'0',.7);
 const rects=paneRects(resized);
 assert.equal(rects[0].width,.7);assert.equal(rects[0].height,.6);
 assert.equal(rects[2].width,.5);assert.equal(rects[2].height,.4);
 assert.equal(splitHandles(resized).length,3);
 assert.deepEqual(paneRects(placeSession(resized,'a','new')).map(({id,...r})=>r),rects.map(({id,...r})=>r));
 assert.deepEqual(paneRects(resizeSplit(resizeSplit(resized,'',.5),'0',.5)),paneRects(base));
 assert.equal(resizeSplit(base,'',NaN),base);
});
test('resize limits account for nested minimum terminal sizes',async()=>{
 const {splitHandles,constrainedRatio}=await import('../../app/src/pane-layout.ts');
 const handle=splitHandles(presetLayout('columns',['a','b']))[0];
 assert.equal(constrainedRatio(handle,-2,1000),.18);
 assert.ok(Math.abs(constrainedRatio(handle,2,1000)-.82)<1e-12);
 assert.equal(constrainedRatio(handle,.1,200),.5);
 const rows=splitHandles(presetLayout('rows',['a','b']))[0];
 assert.equal(constrainedRatio(rows,0,1000),.11);
});

test('workspace top docking places third terminal across existing columns',async()=>{
 const {planDock}=await import('../../app/src/pane-layout.ts');
 const tree=presetLayout('columns',['1','2']);
 const next=planDock(tree,'3','1','top',['1','2','3'],'workspace');
 assert.deepEqual(paneRects(next),[
  {id:'3',x:0,y:0,width:1,height:.5},
  {id:'1',x:0,y:.5,width:.5,height:.5},
  {id:'2',x:.5,y:.5,width:.5,height:.5},
 ]);
 const inside=planDock(tree,'3','1','top',['1','2','3'],'pane');
 assert.equal(paneRects(inside).find(r=>r.id==='2').height,1);
});
test('workspace docking supports every edge, moves visible sessions and preserves nested ratios',async()=>{
 const {planDock,resizeSplit}=await import('../../app/src/pane-layout.ts');
 const tree=resizeSplit(presetLayout('columns',['a','b']),'',.65);
 for(const edge of ['left','right','top','bottom']){
  const next=planDock(tree,'c','a',edge,['a','b','c'],'workspace');
  assert.equal(next.first.kind==='split'?next.first.ratio:next.second.ratio,.65);
  assert.equal(paneIds(next).length,3);
  valid(planDock(presetLayout('grid',['a','b','c','d']),'b','a',edge,['a','b','c','d'],'workspace'),4);
 }
 const full=presetLayout('grid',['a','b','c','d']);
 valid(planDock(full,'e','a','top',['a','b','c','d','e'],'workspace'),5);
 assert.equal(planDock(leaf('a'),'a','a','top',['a'],'workspace').id,'a');
});
test('outer workspace hit area is distinct from individual pane targets',async()=>{
 const {workspaceEdge}=await import('../../app/src/pane-layout.ts');
 assert.equal(workspaceEdge(500,10,1000,800),'top');
 assert.equal(workspaceEdge(500,40,1000,800),null);
 assert.equal(workspaceEdge(990,400,1000,800),'right');
 assert.equal(workspaceEdge(500,790,1000,800),'bottom');
 assert.equal(workspaceEdge(10,400,1000,800),'left');
 assert.equal(workspaceEdge(500,-1,1000,800),null);
});
