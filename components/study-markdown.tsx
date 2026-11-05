'use client';
import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { normalizeMathMarkdown } from '@/lib/math-markdown';
import { useLanguage } from '@/components/language-provider';

function CodeBlock({children}:{children:ReactNode}){
  const {language}=useLanguage();
  const ref=useRef<HTMLPreElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [status,setStatus]=useState<'idle'|'copied'|'error'>('idle');
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const className=isValidElement<{className?:string}>(children)?children.props.className??'':'';
  const codeLanguage=/language-([\w+-]+)/.exec(className)?.[1]??(language==='en'?'Code':'코드');
  async function copy(){
    try{await navigator.clipboard.writeText(ref.current?.textContent??'');setStatus('copied');}
    catch{setStatus('error');}
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>setStatus('idle'),2500);
  }
  const label=language==='en'?(status==='copied'?'Copied':status==='error'?'Select text to copy':'Copy'):(status==='copied'?'복사 완료':status==='error'?'텍스트를 선택해 복사하세요':'코드 복사');
  return <div className="code-block"><div className="code-toolbar"><span>{codeLanguage}</span><button type="button" onClick={copy} aria-label={label}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg><span role="status">{label}</span></button></div><pre ref={ref}>{children}</pre></div>;
}
export function StudyMarkdown({children}:{children:string}) {
  return <div className="reading-text"><Markdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false,strict:'ignore',throwOnError:false}],[rehypeHighlight,{detect:false,ignoreMissing:true}]]} skipHtml components={{
    img:({alt})=><span className="image-description">{alt||'Image'}</span>,
    table:({children})=><div className="reading-table"><table>{children}</table></div>,
    pre:({children})=><CodeBlock>{children}</CodeBlock>,
  }}>{normalizeMathMarkdown(children)}</Markdown></div>;
}
