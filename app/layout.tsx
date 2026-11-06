import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'katex/dist/katex.min.css';
import './globals.css';
import { LanguageProvider } from '@/components/language-provider';
import { siteUrl } from '@/lib/site';

const handwriting = localFont({
  src: './fonts/nanum-barun-hippie.woff2',
  variable: '--font-handwriting',
  display: 'swap',
  // Nanum Barun Hippie draws small; nudge it so text width matches the layout it was tuned for.
  declarations: [{ prop: 'size-adjust', value: '105%' }],
});
const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
  preload: false,
  // Pretendard glyphs run large at the same px; scale them so readable and handwriting modes read at a similar size.
  declarations: [{ prop: 'size-adjust', value: '80%' }],
});
export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: 'proving — 증명하며 성장하다', template: '%s — proving' },
  description: '공부의 과정을 기록하고 배움을 증명하며 성장하는 공간, proving.',
};
// Applies the saved theme (or system setting) and font mode before first paint so neither flashes.
const themeScript = `try{var t=localStorage.getItem('proving-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;var f=localStorage.getItem('proving-font-mode');if(!f){try{f=JSON.parse(localStorage.getItem('proving-font-modes')||'{}').connect}catch(e){}}document.documentElement.dataset.fontMode=f==='readable'?'readable':'handwriting'}catch(e){}`;
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ko" className={`${handwriting.variable} ${pretendard.variable}`} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
