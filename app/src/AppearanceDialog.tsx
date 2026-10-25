import {Check,Monitor,Moon,Sun} from 'lucide-react';
import {Modal} from './components';
import {presets,paletteFor,type Appearance} from './theme';
export function AppearanceDialog({value,onChange,onClose}:{value:Appearance;onChange:(value:Appearance)=>void;onClose:()=>void}){
 return <Modal title="테마" eyebrow="APPEARANCE" onClose={onClose}>
  <p className="appearance-description">화이트부터 딥 블랙까지, 나에게 맞는 작업 공간.</p>
  <label className="appearance-system"><Monitor size={17}/><span><strong>Mac 설정 따라가기</strong><small>라이트는 Snow, 다크는 Obsidian</small></span><input type="radio" name="appearance" checked={value==='system'} onChange={()=>onChange('system')}/></label>
  <div className="appearance-catalog">{(['light','dark'] as const).map(mode=><fieldset className="appearance-options" key={mode}><legend>{mode==='light'?'LIGHT · 밝은 테마':'DARK · 어두운 테마'}</legend>{presets.filter(p=>p.mode===mode).map(p=>{const palette=paletteFor(p.id),Icon=mode==='light'?Sun:Moon;return <label key={p.id} className={`appearance-choice ${value===p.id?'chosen':''}`}>
   <input type="radio" name="appearance" value={p.id} checked={value===p.id} onChange={()=>onChange(p.id)}/>
   <span className="appearance-preview" style={{background:p.background,borderColor:p.soft}} aria-hidden="true"><span className="preview-rail" style={{background:p.soft,borderColor:p.soft}}/><span className="preview-screen" style={{color:p.foreground}}><b style={{color:p.accent}}>❯ ssh server</b><i style={{background:p.foreground}}/><span className="preview-palette">{['red','green','yellow','blue','magenta','cyan'].map(k=><em key={k} style={{background:palette[k as keyof typeof palette] as string}}/>)}</span></span></span>
   <span className="appearance-name"><Icon size={14}/><strong>{p.name}</strong><span className="appearance-check">{value===p.id&&<Check size={12}/>}</span></span><small>{p.hint}</small>
  </label>;})}</fieldset>)}</div>
  <p className="appearance-note">앱과 열린 터미널에 바로 적용되며, 다음 실행에도 유지됩니다.</p><div className="modal-actions"><button className="primary" onClick={onClose}>완료</button></div>
 </Modal>;
}
