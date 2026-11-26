import { X } from 'lucide-react';
import { useId,useRef,type ReactNode } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
interface SlideOverDrawerProps {open:boolean;onClose:()=>void;title:string;subtitle?:string;meta?:string;children:ReactNode;}
export function SlideOverDrawer({open,onClose,title,subtitle,meta,children}:SlideOverDrawerProps){
 const ref=useRef<HTMLDivElement>(null);const titleId=useId();useDialogFocus(open,onClose,ref);
 if(!open)return null;
 return <div ref={ref} tabIndex={-1} className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
  <div className="absolute inset-0 bg-[#142D24]/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true"/>
  <aside className="relative flex h-[100dvh] w-full max-w-xl flex-col border-l border-[var(--color-border)] bg-white shadow-2xl sm:my-3 sm:mr-3 sm:h-[calc(100dvh-24px)] sm:rounded-2xl sm:border">
   <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-6 py-5">
    <div className="min-w-0"><h2 id={titleId} className="text-xl font-semibold tracking-tight">{title}</h2>{subtitle?<p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">{subtitle}</p>:null}{meta?<details className="mt-2 text-xs text-[var(--color-ink-subtle)]"><summary>Record details</summary><p className="mt-2 break-words">{meta}</p></details>:null}</div>
    <button type="button" onClick={onClose} aria-label="Close panel" className="icon-button"><X size={18}/></button>
   </header>
   <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
  </aside>
 </div>;
}
