export type PaneEdge='left'|'right'|'top'|'bottom';
export type PaneNode={kind:'leaf';id:string}|{kind:'split';axis:'x'|'y';ratio?:number;first:PaneNode;second:PaneNode};
export type PanePreset='single'|'columns'|'rows'|'main-left'|'main-top'|'grid';
export type PaneRect={id:string;x:number;y:number;width:number;height:number};
export const leaf=(id:string):PaneNode=>({kind:'leaf',id});
export function paneIds(tree:PaneNode|null):string[]{return !tree?[]:tree.kind==='leaf'?[tree.id]:[...paneIds(tree.first),...paneIds(tree.second)];}
export function removePane(tree:PaneNode|null,id:string):PaneNode|null{
 if(!tree)return null;if(tree.kind==='leaf')return tree.id===id?null:tree;
 const first=removePane(tree.first,id),second=removePane(tree.second,id);
 return first&&second?{...tree,first,second}:first||second;
}
export function replacePane(tree:PaneNode,id:string,next:string):PaneNode{
 if(tree.kind==='leaf')return tree.id===id?leaf(next):tree;
 return {...tree,first:replacePane(tree.first,id,next),second:replacePane(tree.second,id,next)};
}
export function dockPane(tree:PaneNode,source:string,target:string,edge:PaneEdge):PaneNode{
 if(source===target||!paneIds(tree).includes(target))return tree;

 const base=removePane(tree,source)!;
 const replace=(node:PaneNode):PaneNode=>{
  if(node.kind==='split')return {...node,first:replace(node.first),second:replace(node.second)};
  if(node.id!==target)return node;
  const incoming=leaf(source),before=edge==='left'||edge==='top';
  return {kind:'split',axis:edge==='left'||edge==='right'?'x':'y',first:before?incoming:node,second:before?node:incoming};
 };return replace(base);
}
export function presetLayout(preset:PanePreset,ids:string[]):PaneNode|null{
 const unique=[...new Set(ids)];const [a,b,c,d]=unique.map(leaf);
 if(!a)return null;
 const split=(axis:'x'|'y',first:PaneNode,second:PaneNode):PaneNode=>({kind:'split',axis,first,second});
 if(preset==='single'||!b)return a;
 if(preset==='columns')return split('x',a,b);
 if(preset==='rows')return split('y',a,b);
 if(preset==='main-left'&&c)return split('x',a,split('y',b,c));
 if(preset==='main-top'&&c)return split('y',a,split('x',b,c));
 if(preset==='grid'&&c&&d)return split('y',split('x',a,b),split('x',c,d));
 return split('x',a,b);
}
export function paneRects(tree:PaneNode,rect={x:0,y:0,width:1,height:1}):PaneRect[]{
 if(tree.kind==='leaf')return [{id:tree.id,...rect}];
 const first={...rect},second={...rect};
 const ratio=tree.ratio??.5;
 if(tree.axis==='x'){first.width*=ratio;second.width*=1-ratio;second.x+=first.width;}
 else{first.height*=ratio;second.height*=1-ratio;second.y+=first.height;}
 return [...paneRects(tree.first,first),...paneRects(tree.second,second)];
}
export function nearestEdge(x:number,y:number):PaneEdge{
 const distances:[PaneEdge,number][]=[['left',x],['right',1-x],['top',y],['bottom',1-y]];
 return distances.sort((a,b)=>a[1]-b[1])[0][0];
}
// The center is a neutral area, so moving across a pane does not imply a split.
export function dockingEdge(x:number,y:number):PaneEdge|null{
 if(x>.28&&x<.72&&y>.28&&y<.72)return null;
 return nearestEdge(x,y);
}
export function planDock(tree:PaneNode,source:string,target:string,edge:PaneEdge,available:string[],scope:'pane'|'workspace'='pane'):PaneNode{
 if(scope==='workspace'){
  const visible=paneIds(tree);

  const base=removePane(tree,source)||(()=>{const other=available.find(id=>id!==source);return other?leaf(other):null;})();
  if(!base)return tree;
  const before=edge==='left'||edge==='top';
  return {kind:'split',axis:edge==='left'||edge==='right'?'x':'y',first:before?leaf(source):base,second:before?base:leaf(source)};
 }
 if(source!==target)return dockPane(tree,source,target,edge);
 const visible=paneIds(tree);
 const replacement=available.find(id=>id!==source&&!visible.includes(id));
 if(!replacement||visible.length>=4)return tree;
 return dockPane(replacePane(tree,source,replacement),source,replacement,edge);
}
// New tabs replace only the focused slot; explicit split keeps that slot too.
export function placeSession(tree:PaneNode|null,active:string|null,incoming:string,edge?:PaneEdge):PaneNode{
 const base=tree||(active?leaf(active):null);
 if(!base)return leaf(incoming);
 const target=active&&paneIds(base).includes(active)?active:paneIds(base)[0];
 if(edge)return dockPane(base,incoming,target,edge);
 return replacePane(base,target,incoming);
}

// Paths identify split nodes, leaving leaf/session identities stable during resize.
export type SplitHandle={path:string;axis:'x'|'y';ratio:number;x:number;y:number;width:number;height:number;first:PaneNode;second:PaneNode};
export function splitHandles(tree:PaneNode,rect={x:0,y:0,width:1,height:1},path=''):SplitHandle[]{
 if(tree.kind==='leaf')return [];
 const ratio=tree.ratio??.5,first={...rect},second={...rect};
 if(tree.axis==='x'){first.width*=ratio;second.width*=1-ratio;second.x+=first.width;}
 else{first.height*=ratio;second.height*=1-ratio;second.y+=first.height;}
 return [{path,axis:tree.axis,ratio,...rect,first:tree.first,second:tree.second},...splitHandles(tree.first,first,path+'0'),...splitHandles(tree.second,second,path+'1')];
}
export function resizeSplit(tree:PaneNode,path:string,ratio:number):PaneNode{
 if(tree.kind==='leaf'||!Number.isFinite(ratio))return tree;
 if(!path)return {...tree,ratio:Math.max(.05,Math.min(.95,ratio))};
 return path[0]==='0'?{...tree,first:resizeSplit(tree.first,path.slice(1),ratio)}:{...tree,second:resizeSplit(tree.second,path.slice(1),ratio)};
}
export function minimumSpan(tree:PaneNode,axis:'x'|'y'):number{
 if(tree.kind==='leaf')return axis==='x'?180:110;
 const a=minimumSpan(tree.first,axis),b=minimumSpan(tree.second,axis);
 return tree.axis===axis?a+b:Math.max(a,b);
}
export function constrainedRatio(handle:SplitHandle,ratio:number,pixels:number):number{
 const a=minimumSpan(handle.first,handle.axis),b=minimumSpan(handle.second,handle.axis);
 if(pixels<a+b)return a/(a+b);
 return Math.max(a/pixels,Math.min(1-b/pixels,ratio));
}

// The outer 24px is reserved for splitting the entire workspace.
export function workspaceEdge(x:number,y:number,width:number,height:number):PaneEdge|null{
 if(width<=0||height<=0||x<0||y<0||x>width||y>height)return null;
 const distances:[PaneEdge,number][]=[['top',y],['bottom',height-y],['left',x],['right',width-x]];
 const [edge,distance]=distances.sort((a,b)=>a[1]-b[1])[0];
 return distance<=Math.min(24,width*.08,height*.08)?edge:null;
}
