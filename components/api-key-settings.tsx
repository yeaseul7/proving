'use client';
import { useState, type FormEvent } from 'react';
import { BROWSER_PROVIDERS, isValidKey, saveKeys, type BrowserKeys, type BrowserProvider } from '@/lib/browser-ai';
import styles from './api-key-settings.module.css';

// OpenAI·Claude·Gemini API 키 입력. 키는 이 브라우저에만 저장하고 서버로 보내지 않는다.
export function ApiKeySettings({ keys, remember, language, onChange, onClose }: { keys: BrowserKeys; remember: boolean; language: 'ko' | 'en'; onChange: (keys: BrowserKeys, remember: boolean) => void; onClose: () => void }) {
  const en = language === 'en';
  const [draft, setDraft] = useState<BrowserKeys>(keys);
  const [keep, setKeep] = useState(remember);
  const [error, setError] = useState('');
  const providers = Object.keys(BROWSER_PROVIDERS) as BrowserProvider[];

  function submit(event: FormEvent) {
    event.preventDefault();
    const entered = Object.fromEntries(providers.map(p => [p, draft[p]?.trim() ?? '']).filter(([, value]) => value));
    const invalid = providers.find(p => entered[p] && !isValidKey(entered[p]));
    if (invalid) { setError(en ? `Check the ${BROWSER_PROVIDERS[invalid].label} key format.` : `${BROWSER_PROVIDERS[invalid].label} 키 형식을 확인해주세요.`); return; }
    try { onChange(saveKeys(entered, keep), keep); onClose(); }
    catch { setError(en ? 'Could not save to browser storage.' : '브라우저 저장소에 저장하지 못했습니다.'); }
  }

  return <form className={styles.panel} onSubmit={submit} aria-label={en ? 'API keys' : 'API 키 설정'}>
    <div className={styles.header}>
      <strong>{en ? 'AI API keys' : 'AI API 키'}</strong>
      <button type="button" className={styles.close} aria-label={en ? 'Close' : '닫기'} onClick={onClose}>×</button>
    </div>
    <p className={styles.note}>{en
      ? 'Your browser calls each provider directly with your key, and usage is billed to your account. Keys stay in this browser and are never sent to proving.'
      : '이 브라우저가 입력한 키로 각 공급자를 직접 호출하고, 요금은 키 계정에 청구됩니다. 키는 이 브라우저에만 저장되며 proving 서버로 보내지 않습니다.'}</p>
    {providers.map(p => <label key={p} className={styles.field}>
      <span>{BROWSER_PROVIDERS[p].label} <a href={BROWSER_PROVIDERS[p].consoleUrl} target="_blank" rel="noreferrer">{en ? 'Get a key' : '키 발급'}</a></span>
      <input type="password" autoComplete="off" spellCheck={false} value={draft[p] ?? ''} placeholder={en ? 'Not set' : '등록 안 됨'} onChange={e => { setDraft({ ...draft, [p]: e.target.value }); setError(''); }} />
    </label>)}
    <label className={styles.remember}><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />{en ? 'Remember on this device (otherwise cleared when the tab closes)' : '이 기기에서 기억하기 (끄면 탭을 닫을 때 삭제)'}</label>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" className="text-button" onClick={() => setDraft({})}>{en ? 'Clear all' : '모두 지우기'}</button>
      <button type="submit" className="button primary">{en ? 'Save' : '저장'}</button>
    </div>
  </form>;
}
