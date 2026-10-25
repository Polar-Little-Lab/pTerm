import {useEffect,useState} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow,type Theme} from '@tauri-apps/api/window';
import {appearanceKey,parseAppearance,resolveAppearance,paletteFor,presetFor,type Appearance} from './theme';
let appliedWindowTheme:Theme|null|undefined;
let appliedWindowColor:string|undefined;
let windowThemeQueue=Promise.resolve();
function syncWindowTheme(preference:Appearance,mode:Theme,color:string){
 if(!isTauri())return;
 // Reset the native override for system mode: forcing the resolved color would
 // also override macOS WebView's prefers-color-scheme and stop OS tracking.
 const theme=preference==='system'?null:mode;
 windowThemeQueue=windowThemeQueue.then(async()=>{
  const window=getCurrentWindow();
  if(appliedWindowTheme!==theme){
   await window.setTheme(theme);
   appliedWindowTheme=theme;
  }
  if(appliedWindowColor!==color){
   await window.setBackgroundColor(color);
   appliedWindowColor=color;
  }
 }).catch(error=>console.warn('Unable to update native window appearance',error));
}
function read(){try{return parseAppearance(localStorage.getItem(appearanceKey));}catch{return 'system' as const;}}
function apply(preference:Appearance){
 const resolved=resolveAppearance(preference,matchMedia('(prefers-color-scheme: dark)').matches),preset=presetFor(resolved),root=document.documentElement;
 root.dataset.theme=preset.mode;root.dataset.preset=resolved;root.style.colorScheme=preset.mode;
 const tokens={canvas:preset.background,surface:preset.surface,'surface-soft':preset.soft,'surface-hover':`color-mix(in srgb, ${preset.soft}, ${preset.foreground} 8%)`,text:preset.foreground,accent:preset.accent,'accent-soft':`color-mix(in srgb, ${preset.background}, ${preset.accent} 16%)`,terminal:preset.background,focus:preset.accent};
 for(const [key,value] of Object.entries(tokens))root.style.setProperty('--'+key,value);
 syncWindowTheme(preference,preset.mode,preset.soft);
 return resolved;
}
apply(read());
export function terminalTheme(){return paletteFor(resolveAppearance(parseAppearance(document.documentElement.dataset.preset),false));}
export function useAppearance(){
 const [preference,setPreference]=useState<Appearance>(read);
 const [resolved,setResolved]=useState(()=>apply(preference));
 useEffect(()=>{setResolved(apply(preference));const media=matchMedia('(prefers-color-scheme: dark)');const update=()=>setResolved(apply(preference));media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[preference]);
 const choose=(next:Appearance)=>{setPreference(next);setResolved(apply(next));try{localStorage.setItem(appearanceKey,next);}catch{}};
 return {preference,resolved,choose};
}
