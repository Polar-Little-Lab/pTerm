export function prepareSnippet(command:string):{kind:'insert'|'review'|'reject';command:string} {
 const text=command.replace(/[\r\n]+$/,'');
 if(!text.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))return {kind:'reject',command:''};
 return {kind:/[\r\n]/.test(text)?'review':'insert',command:text};
}
