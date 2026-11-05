import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'katex/dist/katex.min.css';
import './globals.css';
import { LanguageProvider } from '@/components/language-provider';

const haewon = localFont({
  src: './fonts/ongeulip-haewon.ttf',
  variable: '--font-ongeulip-haewon',
  display: 'swap',
});
const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  variable: '--font-pretendard',
  display: 'swap',
  weight: '45 920',
  preload: false,
});
export const metadata: Metadata = { title: 'proving — 증명하며 성장하다', description: '공부의 과정을 기록하고 배움을 증명하며 성장하는 공간, proving.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ko" className={`${haewon.variable} ${pretendard.variable}`}><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
