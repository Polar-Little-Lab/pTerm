import {leaf,paneIds,removePane,type PaneNode,type PaneEdge} from './pane-layout.ts';
export type TerminalTab={id:string;tree:PaneNode;focused:string};
export function newTab(session:string,occupied:ReadonlySet<string>=new Set()):TerminalTab{
 let id=session,index=1;while(occupied.has(id))id=session+':tab:'+index++;
 return {id,tree:leaf(session),focused:session};
}
export function removeSession(tabs:TerminalTab[],id:string):TerminalTab[]{
 return tabs.flatMap(tab=>{const tree=removePane(tab.tree,id);return tree?[{...tab,tree,focused:tab.focused===id?paneIds(tree)[0]:tab.focused}]:[];});
}
export function setTabTree(tabs:TerminalTab[],owner:string,next:PaneNode|null):TerminalTab[]{
 const target=tabs.find(t=>t.id===owner);if(!target)return tabs;
 const incoming=paneIds(next),outgoing=paneIds(target.tree).filter(id=>!incoming.includes(id));
 const rest=tabs.flatMap(tab=>{
  if(tab===target)return next?[{...tab,tree:next,focused:incoming.includes(tab.focused)?tab.focused:incoming[0]}]:[];
  let tree:PaneNode|null=tab.tree;for(const id of incoming)tree=removePane(tree,id);
  return tree?[{...tab,tree,focused:paneIds(tree).includes(tab.focused)?tab.focused:paneIds(tree)[0]}]:[];
 });
 const occupied=new Set(rest.map(t=>t.id));
 const detached=outgoing.map(id=>{const tab=newTab(id,occupied);occupied.add(tab.id);return tab;});
 return [...rest,...detached];
}
export function dockBranch(tree:PaneNode,branch:PaneNode,target:string,edge:PaneEdge,scope:'pane'|'workspace'):PaneNode{
 let base:PaneNode|null=tree;
 for(const id of paneIds(branch))base=removePane(base,id);
 if(!base)return tree;
 const before=edge==='left'||edge==='top';
 const wrap=(node:PaneNode):PaneNode=>({kind:'split',axis:edge==='left'||edge==='right'?'x':'y',first:before?branch:node,second:before?node:branch});
 if(scope==='workspace')return wrap(base);
 if(!paneIds(base).includes(target))return tree;
 const visit=(node:PaneNode):PaneNode=>node.kind==='leaf'?(node.id===target?wrap(node):node):({...node,first:visit(node.first),second:visit(node.second)});
 return visit(base);
}
export function reorderTabs(tabs:TerminalTab[],source:string,target:string,after:boolean):TerminalTab[]{
 const moving=tabs.find(t=>paneIds(t.tree).includes(source)),anchor=tabs.find(t=>paneIds(t.tree).includes(target));
 if(!moving||!anchor||moving===anchor)return tabs;
 const rest=tabs.filter(t=>t!==moving),index=rest.indexOf(anchor);
 return [...rest.slice(0,index+(after?1:0)),moving,...rest.slice(index+(after?1:0))];
}
// When lifting the selected tab, expose a neighboring tab as its docking surface.
export function dragDestination(tabs:TerminalTab[],source:string,active:string|null):string|null{
 const index=tabs.findIndex(t=>paneIds(t.tree).includes(source));
 if(index<0||!active||!paneIds(tabs[index].tree).includes(active))return null;
 return (tabs[index-1]||tabs[index+1])?.focused||null;
}

export function dropOnTabStrip(tabs:TerminalTab[],source:string,kind:'tab'|'pane'|undefined,slot:{id:string;after:boolean}):TerminalTab[]{
 const anchor=tabs.find(t=>paneIds(t.tree).includes(slot.id));
 const owner=tabs.find(t=>paneIds(t.tree).includes(source));
 if(!anchor||!owner)return tabs;
 let next=tabs;
 if(kind==='pane'&&paneIds(owner.tree).length>1)next=setTabTree(tabs,owner.id,removePane(owner.tree,source));
 // The anchor can be the pane being detached: retain the original tab as anchor.
 const target=next.find(t=>t.id===anchor.id);
 return target?reorderTabs(next,source,target.focused,slot.after):next;
}
