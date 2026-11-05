'use client';
import { useRef, useState } from 'react';
import { StudyMarkdown } from './study-markdown';
import type { StudyNote } from '@/lib/study';
export function NoteDownload({note,english,onMarkdown,onOriginal,iconOnly=false}:{iconOnly?:boolean;note:StudyNote;english:boolean;onMarkdown:()=>void;onOriginal?:()=>void}){
  const source=useRef<HTMLDivElement>(null);
  const menu=useRef<HTMLDetailsElement>(null);
  const [error,setError]=useState(false);
  async function pdf(){
    if(menu.current)menu.current.open=false;
    setError(false);
    const frame=document.createElement('iframe');
    frame.title='PDF';frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;';
    document.body.append(frame);
    try{
      const doc=frame.contentDocument;if(!doc||!frame.contentWindow)throw new Error();
      doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');doc.close();
      doc.title=note.title;
      const styles=Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map(node=>node.cloneNode(true));
      styles.forEach(node=>doc.head.append(node));
      const css=doc.createElement('style');css.textContent=`@page{size:A4;margin:18mm}html,body{background:#fff!important;color:#263440;margin:0;padding:0}body{font-family:var(--font-body);font-size:12pt}h1{font-family:inherit;font-size:20pt;line-height:1.5;margin:0 0 18px;overflow-wrap:anywhere}.reading-text{max-width:none;font-size:12pt;line-height:1.85}.reading-text h2,.reading-text h3,.reading-text h4{break-after:avoid}.reading-text pre{white-space:pre-wrap;overflow-wrap:anywhere}.code-toolbar button{display:none}.reading-table{overflow:visible}.katex-display{overflow:visible!important}.reading-text a{color:inherit}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
      doc.head.append(css);doc.documentElement.className=document.documentElement.className;
      const heading=doc.createElement('h1');heading.textContent=note.title;doc.body.append(heading);
      const body=doc.createElement('div');body.innerHTML=source.current?.innerHTML??'';doc.body.append(body);
      await Promise.all(Array.from(doc.querySelectorAll('link')).map(link=>link.sheet?Promise.resolve():new Promise<void>(resolve=>{link.onload=()=>resolve();link.onerror=()=>resolve();setTimeout(resolve,4000);})));await doc.fonts.ready;
      frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});
      frame.contentWindow.focus();frame.contentWindow.print();
      setTimeout(()=>frame.remove(),120000);
    }catch{frame.remove();setError(true);}
  }
  return <div className="note-download"><details ref={menu} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))e.currentTarget.open=false;}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label={english?'Download note':'노트 다운로드'} title={english?'Download':'다운로드'}>{iconOnly?<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>:<>{english?'Download':'다운로드'} ↓</>}</summary><div className="note-download-menu"><button type="button" onClick={pdf}>PDF <small>.pdf</small></button><button type="button" onClick={()=>{if(menu.current)menu.current.open=false;onMarkdown();}}>Markdown <small>.md</small></button>{onOriginal&&<button type="button" onClick={()=>{if(menu.current)menu.current.open=false;onOriginal();}}>{english?'Original conversation':'원본 대화'} <small>.txt</small></button>}</div></details>{error&&<span role="alert">{english?'Could not open PDF.':'PDF 화면을 열지 못했습니다.'}</span>}<div hidden ref={source}><StudyMarkdown>{note.content}</StudyMarkdown></div></div>;
}
