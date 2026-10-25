export type TabSlot={id:string;left:number;right:number};
export function insertionSlot(tabs:TabSlot[],x:number):{id:string;after:boolean;x:number}|null{
 if(!tabs.length)return null;
 const before=tabs.find(t=>x<(t.left+t.right)/2);
 return before?{id:before.id,after:false,x:before.left}:{id:tabs.at(-1)!.id,after:true,x:tabs.at(-1)!.right};
}
export function tabDropTarget(x:number,y:number){
 const list=document.querySelector<HTMLElement>('.terminal-tab-scroll'),add=document.querySelector<HTMLElement>('[data-new-terminal]');
 if(!list||!add)return null;
 const box=list.getBoundingClientRect(),end=add.getBoundingClientRect();
 if(y<box.top||y>box.bottom||x<box.left||x>end.right)return null;
 const tabs=[...list.querySelectorAll<HTMLElement>('[data-tab-session]')].map(e=>{
  const r=e.closest('.terminal-tab')!.getBoundingClientRect();
  return {id:e.dataset.tabSession!,left:r.left,right:r.right};
 });
 const slot=insertionSlot(tabs,x);
 return slot?{...slot,x:Math.max(box.left,Math.min(box.right,slot.x)),top:box.top,height:box.height}:null;
}
