import {AlertCircle,CheckCircle2,X} from 'lucide-react';
export function ToastStack({error,notice,onDismissError,onDismissNotice}:{error:string;notice:string;onDismissError:()=>void;onDismissNotice:()=>void}){
 return <div className="app-toasts" aria-label="알림">
  {error&&<div key={'error:'+error} className="app-toast toast-error" role="alert" aria-atomic="true"><AlertCircle size={19}/><span>{error}</span><button aria-label="오류 닫기" onClick={onDismissError}><X size={16}/></button></div>}
  {notice&&<div key={'notice:'+notice} className="app-toast toast-notice" role="status" aria-atomic="true"><CheckCircle2 size={19}/><span>{notice}</span><button aria-label="알림 닫기" onClick={onDismissNotice}><X size={16}/></button></div>}
 </div>;
}
