'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { AVATAR_MAX, AVATAR_SIZE, EMPTY_PROFILE, INTRO_MAX, NAME_MAX, type Profile } from '@/lib/profile';

// 고른 사진을 가운데 기준 정사각형으로 잘라 256px WebP(안 되면 JPEG) data URL로 만든다.
async function resizeAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.5]) {
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= AVATAR_MAX) return url;
  }
  throw new Error('too large');
}

// 개요 화면 맨 위의 내 프로필. 이름·사진·설명(500자)만 편집한다.
export function ProfileEditor({ accountName = '' }: { accountName?: string }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSaved(data.profile); setForm(data.profile);
      })
      .catch(error => { if (!controller.signal.aborted) setMessage(error.message || (en ? 'Could not load your profile.' : '프로필을 불러오지 못했어요.')); });
    return () => controller.abort();
  }, [en]);

  const publicPath = saved?.isPublic && saved.handle ? `/u/${saved.handle}` : '';
  const introLength = Array.from(form.intro).length;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || introLength > INTRO_MAX) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: form.displayName, avatar: form.avatar, intro: form.intro }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSaved(data.profile); setForm(data.profile); setEditing(false);
      setMessage(en ? 'Profile saved.' : '프로필을 저장했어요.');
    } catch (error) {
      setMessage((error as Error).message || (en ? 'Could not save your profile.' : '프로필을 저장하지 못했어요.'));
    } finally { setBusy(false); }
  }

  async function pickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    try { const avatar = await resizeAvatar(file); setForm(current => ({ ...current, avatar })); }
    catch { setMessage(en ? 'Could not use that image. Try a JPG or PNG.' : '이 이미지는 쓸 수 없어요. JPG나 PNG로 다시 올려주세요.'); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(publicPath, location.origin).href); setMessage(en ? 'Link copied.' : '링크를 복사했어요.'); }
    catch { setMessage(en ? 'Select the link to copy it.' : '링크를 선택해 복사해주세요.'); }
  }

  const nameOf = (profile: Profile) => profile.displayName || accountName || (en ? 'My profile' : '내 프로필');
  const avatar = (profile: Profile) => profile.avatar
    // data URL이라 next/image 최적화가 필요 없다.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="profile-avatar-large" src={profile.avatar} alt="" />
    : <span className="profile-avatar-large" aria-hidden="true">{Array.from(nameOf(profile).trim())[0]?.toUpperCase() ?? 'P'}</span>;
  const startEditing = () => { if (saved) { setForm(saved); setEditing(true); setMessage(''); } };

  return <section className="profile-card" aria-label={en ? 'My profile' : '내 프로필'}>
    {!saved ? <p className="muted">{message || (en ? 'Loading profile…' : '프로필을 불러오는 중')}</p> : !editing ? <>
      <header className="profile-header">
        {avatar(saved)}
        <div className="profile-identity">
          <h2>{nameOf(saved)}</h2>
          {publicPath && <div className="profile-share"><span className="profile-badge">{en ? 'Public' : '공개'}</span><a href={publicPath} target="_blank" rel="noopener">{publicPath}</a></div>}
        </div>
        <div className="profile-header-actions">
          {publicPath && <button className="button secondary" onClick={copyLink}>{en ? 'Copy link' : '링크 복사'}</button>}
          <button className="button secondary" onClick={startEditing}>{en ? 'Edit' : '편집'}</button>
        </div>
      </header>
      <div className="profile-intro">{saved.intro.trim()
        ? <p className="profile-intro-text">{saved.intro}</p>
        : <p className="muted">{en ? 'Add a short description about yourself.' : '나를 소개하는 짧은 설명을 적어보세요.'}</p>}</div>
    </> : <form className="profile-form" onSubmit={save}>
      <div className="profile-avatar-field">
        {avatar(form)}
        <div className="profile-avatar-actions">
          <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}>{en ? 'Choose photo' : '사진 선택'}</button>
          {form.avatar && <button type="button" className="text-button" onClick={() => setForm({ ...form, avatar: null })}>{en ? 'Remove' : '사진 삭제'}</button>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickAvatar} />
        </div>
      </div>
      <label>{en ? 'Name' : '이름'}<input value={form.displayName ?? ''} maxLength={NAME_MAX} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder={en ? 'Shown on your profile' : '프로필에 보일 이름'} /></label>
      <label>{en ? 'Description' : '설명'}<textarea value={form.intro} rows={5} maxLength={INTRO_MAX} onChange={e => setForm({ ...form, intro: e.target.value })} placeholder={en ? 'What you study and why…' : '요즘 공부하는 것과 이유를 적어보세요.'} aria-invalid={introLength > INTRO_MAX} /></label>
      <small className={introLength > INTRO_MAX ? 'profile-error' : 'muted'}>{introLength}/{INTRO_MAX}</small>
      <div className="profile-actions">
        <button type="button" className="button secondary" onClick={() => { setForm(saved); setEditing(false); setMessage(''); }}>{en ? 'Cancel' : '취소'}</button>
        <button className="button primary" disabled={busy || introLength > INTRO_MAX}>{busy ? (en ? 'Saving…' : '저장 중') : (en ? 'Save' : '저장')}</button>
      </div>
    </form>}
    {saved && message && <p className="profile-message" role="status">{message}</p>}
  </section>;
}
