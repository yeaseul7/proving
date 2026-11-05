'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import type { Device } from '@/lib/devices';

// 배포 사이트의 "연결된 기기". 내 PC의 proving을 연결할 1회용 코드를 만들고, 연결을 끊는다.
export function DeviceLinks() {
  const { language } = useLanguage();
  const en = language === 'en';
  const [visible, setVisible] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function request(method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
    const response = await fetch('/api/devices', { method, cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await (await fetch('/api/session', { cache: 'no-store' })).json();
        if (session.provider !== 'google' || !session.account) return;
        const data = await request('GET');
        if (active) { setDevices(data.devices); setVisible(true); }
      } catch {}
    })();
    return () => { active = false; };
  }, []);

  async function createCode() {
    setBusy(true); setMessage('');
    try { setCode(await request('POST')); }
    catch (error) { setMessage((error as Error).message || (en ? 'Could not create a code.' : '연결 코드를 만들지 못했어요.')); }
    finally { setBusy(false); }
  }

  async function revoke(device: Device) {
    if (!confirm(en ? `Disconnect "${device.name}"?` : `"${device.name}" 연결을 끊을까요?`)) return;
    setBusy(true); setMessage('');
    try { const data = await request('DELETE', { id: device.id }); if (data.devices) setDevices(data.devices); else setDevices(devices.filter(d => d.id !== device.id)); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  if (!visible) return null;
  const date = (value: string) => new Date(value).toLocaleString(en ? 'en-US' : 'ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
  return <section className="profile-card device-links" aria-label={en ? 'Connected devices' : '연결된 기기'}>
    <div className="section-title"><h2>{en ? 'Connected devices' : '연결된 기기'}</h2>
      <button className="text-button" disabled={busy} onClick={createCode}>{en ? 'Connect a computer' : '내 PC 연결하기'}</button>
    </div>
    <p className="muted">{en
      ? 'Study with your ChatGPT plan in proving on your computer, and your notes sync here.'
      : '내 PC의 proving에서 ChatGPT 플랜으로 공부하면 기록이 이곳에 동기화됩니다.'}</p>
    {code && <div className="device-code" role="status">
      <code>{code.code}</code>
      <p className="muted">{en ? 'In proving on your computer, run:' : '내 PC의 proving 폴더에서 실행하세요:'} <code>npm run link -- {code.code}</code> · {en ? 'expires' : '만료'} {date(code.expiresAt)}</p>
    </div>}
    {devices.length ? <ul className="device-list">{devices.map(device => <li key={device.id}>
      <span><strong>{device.name}</strong> <small className="muted">{en ? 'last sync' : '마지막 동기화'} {device.lastUsedAt ? date(device.lastUsedAt) : '—'}</small></span>
      <button className="text-button" disabled={busy} onClick={() => revoke(device)}>{en ? 'Disconnect' : '연결 끊기'}</button>
    </li>)}</ul> : <p className="muted">{en ? 'No computers connected yet.' : '아직 연결된 PC가 없어요.'}</p>}
    {message && <p className="profile-message" role="status">{message}</p>}
  </section>;
}
