import type {ITheme} from '@xterm/xterm';
export type PresetId='light'|'dark'|'frost'|'paper'|'graphite'|'midnight'|'forest'|'plum'|'arctic';
export type Appearance=PresetId|'system';
export type ResolvedTheme=PresetId;
export const presets: {id:PresetId;name:string;hint:string;mode:'light'|'dark';background:string;surface:string;soft:string;foreground:string;accent:string}[]=[
 {id:'arctic',name:'Arctic',hint:'극야 네이비와 빙하빛 민트',mode:'dark',background:'#0d1b26',surface:'#152735',soft:'#1b3040',foreground:'#e5f1f5',accent:'#9edbd3'},
 {id:'light',name:'Snow',hint:'선명한 화이트',mode:'light',background:'#ffffff',surface:'#ffffff',soft:'#f3f4f5',foreground:'#24272d',accent:'#305fad'},
 {id:'frost',name:'Frost',hint:'차가운 아이스 화이트',mode:'light',background:'#f3f8fc',surface:'#ffffff',soft:'#e7eff6',foreground:'#213347',accent:'#32678c'},
 {id:'paper',name:'Paper',hint:'따뜻한 페이퍼 화이트',mode:'light',background:'#faf6ee',surface:'#fffcf7',soft:'#eee8dd',foreground:'#38332b',accent:'#80613b'},
 {id:'dark',name:'Obsidian',hint:'깊고 차분한 블랙',mode:'dark',background:'#111214',surface:'#1a1c20',soft:'#212328',foreground:'#e5e7eb',accent:'#a8bfe9'},
 {id:'graphite',name:'Graphite',hint:'부드러운 차콜 그레이',mode:'dark',background:'#202124',surface:'#282a2e',soft:'#303237',foreground:'#eeeeef',accent:'#c3c7d0'},
 {id:'midnight',name:'Midnight',hint:'푸른빛의 미드나이트',mode:'dark',background:'#101827',surface:'#192338',soft:'#212e45',foreground:'#e0e9f5',accent:'#91b5f5'},
 {id:'forest',name:'Forest',hint:'은은한 딥 그린',mode:'dark',background:'#111c18',surface:'#1a2922',soft:'#24352d',foreground:'#e1eee6',accent:'#8ac99b'},
 {id:'plum',name:'Plum',hint:'절제된 다크 퍼플',mode:'dark',background:'#1c1622',surface:'#292032',soft:'#352a40',foreground:'#eee5f4',accent:'#c8a0e8'},
];
export function presetFor(id:PresetId){return presets.find(p=>p.id===id)??presets.find(p=>p.id==='light')!;}
export const appearanceKey='polarsh.appearance.v1';
export function parseAppearance(value:unknown):Appearance{return presets.some(p=>p.id===value)?value as PresetId:'system';}
export function resolveAppearance(value:Appearance,dark:boolean):ResolvedTheme{return value==='system'?(dark?'dark':'light'):value;}
export function paletteFor(theme:ResolvedTheme):ITheme{
 const preset=presetFor(theme);
 const palette:ITheme=preset.mode==='dark'?{
  background:'#111214',foreground:'#e5e7eb',cursor:'#f5f5f5',cursorAccent:'#111214',selectionBackground:'#44474f',selectionInactiveBackground:'#303238',
  black:'#33363d',red:'#ef8585',green:'#8ac99b',yellow:'#e6c780',blue:'#91b5f5',magenta:'#c8a0e8',cyan:'#80cbd2',white:'#dedfe3',brightBlack:'#858b96',brightRed:'#ffaaaa',brightGreen:'#b3e5bd',brightYellow:'#f4dea0',brightBlue:'#b8cefa',brightMagenta:'#dec1f2',brightCyan:'#b4e8ec',brightWhite:'#ffffff'
 }:{
  background:'#ffffff',foreground:'#24272d',cursor:'#24272d',cursorAccent:'#ffffff',selectionBackground:'#d4ddef',selectionInactiveBackground:'#e5e7eb',
  black:'#24272d',red:'#ac3232',green:'#27683c',yellow:'#80621c',blue:'#305fad',magenta:'#7b4497',cyan:'#236b75',white:'#6d7480',brightBlack:'#636a75',brightRed:'#b52e39',brightGreen:'#287443',brightYellow:'#816416',brightBlue:'#345fc5',brightMagenta:'#9156ac',brightCyan:'#237681',brightWhite:'#555d69'
 };
 if(theme==='arctic')Object.assign(palette,{selectionBackground:'#355663',selectionInactiveBackground:'#263f50',green:'#a4d7bd',blue:'#9cbee8',cyan:'#9edbd3',magenta:'#c4b4de',yellow:'#e3d2a5',red:'#e6a5a5'});
 return {...palette,background:preset.background,foreground:preset.foreground,cursor:preset.foreground,cursorAccent:preset.background};
}
