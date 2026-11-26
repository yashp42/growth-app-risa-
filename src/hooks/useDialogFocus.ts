import { useEffect,useRef,type RefObject } from 'react';
/** Modal focus/scroll management shared by existing drawers. No business state. */
export function useDialogFocus(open:boolean,onClose:()=>void,ref:RefObject<HTMLElement|null>){
 const closeRef=useRef(onClose);closeRef.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const root=ref.current;if(!root)return;
  const previous=document.activeElement as HTMLElement|null;
  const candidates=()=>Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
  const first=candidates()[0];(first??root).focus();
  const key=(e:KeyboardEvent)=>{
   const modals=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"],dialog[open]'));
   if(modals.at(-1)!==root)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();}
   if(e.key==='Tab'){const items=candidates(),start=items[0],end=items.at(-1);if(!start){e.preventDefault();root.focus();}else if(e.shiftKey&&document.activeElement===start){e.preventDefault();end?.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();start.focus();}}
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);if(root.contains(document.activeElement)||document.activeElement===document.body)previous?.focus();};
 },[open,ref]);
}
