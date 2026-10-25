import test from 'node:test';import assert from 'node:assert/strict';
import {parseAppearance,resolveAppearance,paletteFor,presets} from '../../app/src/theme.ts';
const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('explicit themes override OS appearance; missing or invalid preferences follow the system',()=>{
 assert.equal(parseAppearance(null),'system');assert.equal(parseAppearance('broken'),'system');
 assert.equal(resolveAppearance(parseAppearance('light'),true),'light');assert.equal(resolveAppearance(parseAppearance('dark'),false),'dark');
 assert.equal(resolveAppearance('system',true),'dark');assert.equal(resolveAppearance('system',false),'light');
});
test('terminal text, cursor and ANSI colors remain readable on each background',()=>{
 for(const {id:mode} of presets){const p=paletteFor(mode);assert.ok(contrast(p.foreground,p.background)>=7);assert.ok(contrast(p.cursor,p.cursorAccent)>=7);for(const key of ['red','green','yellow','blue','magenta','cyan','brightBlack','brightWhite'])assert.ok(contrast(p[key],p.background)>=4.5,`${mode} ${key}`);}
});

test('all presets persist independently of OS mode and have distinct backgrounds',()=>{
 assert.equal(new Set(presets.map(p=>p.background)).size,9);
 for(const p of presets){assert.equal(parseAppearance(p.id),p.id);assert.equal(resolveAppearance(p.id,true),p.id);assert.equal(resolveAppearance(p.id,false),p.id);}
});
