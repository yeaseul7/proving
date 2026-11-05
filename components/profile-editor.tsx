'use client';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { StudyMarkdown } from '@/components/study-markdown';
import { EMPTY_PROFILE, HANDLE_PATTERN, INTRO_MAX, NAME_MAX, type Profile } from '@/lib/profile';

// 개요 화면 맨 위의 내 프로필 헤더. 공개로 저장하면 /u/<아이디>에서 소개글과 계란 그래프를 볼 수 있다.
export function ProfileEditor({ accountName = '' }: { accountName?: string }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile>(EMPTY_PROFILE);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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

  const handle = form.handle?.trim().toLowerCase() ?? '';
  const handleError = handle && !HANDLE_PATTERN.test(handle)
    ? (en ? 'Use 3–20 lowercase letters, numbers or _.' : '영문 소문자·숫자·밑줄 3~20자') : '';
  const publicPath = saved?.isPublic && saved.handle ? `/u/${saved.handle}` : '';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || handleError) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, handle: handle || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSaved(data.profile); setForm(data.profile); setEditing(false); setPreview(false);
      setMessage(en ? 'Profile saved.' : '프로필을 저장했어요.');
    } catch (error) {
      setMessage((error as Error).message || (en ? 'Could not save your profile.' : '프로필을 저장하지 못했어요.'));
    } finally { setBusy(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(publicPath, location.origin).href); setMessage(en ? 'Link copied.' : '링크를 복사했어요.'); }
    catch { setMessage(en ? 'Select the link to copy it.' : '링크를 선택해 복사해주세요.'); }
  }

  const name = saved?.displayName || accountName || (en ? 'My profile' : '내 프로필');
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? 'P';
  const startEditing = () => { if (saved) { setForm(saved); setEditing(true); setMessage(''); } };

  return <section className="profile-card" aria-label={en ? 'My profile' : '내 프로필'}>
    {!saved ? <p className="muted">{message || (en ? 'Loading profile…' : '프로필을 불러오는 중')}</p> : !editing ? <>
      <header className="profile-header">
        <span className="profile-avatar-large" aria-hidden="true">{initial}</span>
        <div className="profile-identity">
          <h2>{name}</h2>
          <div className="profile-share">
            {publicPath
              ? <><span className="profile-badge">{en ? 'Public' : '공개'}</span><a href={publicPath} target="_blank" rel="noopener">{publicPath}</a></>
              : saved.isPublic
                ? <span className="profile-badge pending">{en ? 'Set a profile ID to go public' : '아이디를 정하면 공개돼요'}</span>
                : <span className="profile-badge private">{en ? 'Private profile' : '비공개 프로필'}</span>}
          </div>
        </div>
        <div className="profile-header-actions">
          {publicPath && <button className="button secondary" onClick={copyLink}>{en ? 'Copy link' : '링크 복사'}</button>}
          <button className="button secondary" onClick={startEditing}>{en ? 'Edit' : '편집'}</button>
        </div>
      </header>
      <div className="profile-intro">{saved.intro.trim() ? <StudyMarkdown>{saved.intro}</StudyMarkdown> : <p className="muted">{en ? 'Write a short intro in Markdown and share your profile.' : 'Markdown으로 소개글을 쓰고 프로필을 공유해보세요.'}</p>}</div>
    </> : <form className="profile-form" onSubmit={save}>
      <label>{en ? 'Name' : '이름'}<input value={form.displayName ?? ''} maxLength={NAME_MAX} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder={en ? 'Shown on your profile' : '프로필에 보일 이름'} /></label>
      <label>{en ? 'Profile ID' : '아이디'}<span className="profile-handle"><span aria-hidden="true">/u/</span><input value={form.handle ?? ''} maxLength={20} onChange={e => setForm({ ...form, handle: e.target.value })} aria-invalid={Boolean(handleError)} autoCapitalize="none" spellCheck={false} /></span>{handleError ? <small className="profile-error">{handleError}</small> : form.isPublic && !handle && <small className="muted">{en ? 'A public profile needs an ID.' : '공개 프로필에는 아이디가 필요해요.'}</small>}</label>
      <div className="profile-intro-heading"><span>{en ? 'Intro (Markdown)' : '소개글 (Markdown)'}</span><button type="button" className="text-button" onClick={() => setPreview(!preview)}>{preview ? (en ? 'Write' : '작성') : (en ? 'Preview' : '미리보기')}</button></div>
      {preview
        ? <div className="profile-preview">{form.intro.trim() ? <StudyMarkdown>{form.intro}</StudyMarkdown> : <p className="muted">{en ? 'Nothing to preview.' : '미리 볼 내용이 없어요.'}</p>}</div>
        : <textarea aria-label={en ? 'Intro' : '소개글'} value={form.intro} maxLength={INTRO_MAX} rows={8} onChange={e => setForm({ ...form, intro: e.target.value })} placeholder={en ? '## Hi\nWhat I study and why…' : '## 안녕하세요\n요즘 공부하는 것과 이유를 적어보세요.'} />}
      <small className="muted">{form.intro.length}/{INTRO_MAX}</small>
      <label className="profile-public"><input type="checkbox" checked={form.isPublic} onChange={e => setForm({ ...form, isPublic: e.target.checked })} />{en ? 'Make public (intro and study graph only; note titles and contents stay private)' : '공개하기 (소개글과 계란 그래프만 공개, 노트 제목·내용은 비공개)'}</label>
      <div className="profile-actions">
        <button type="button" className="button secondary" onClick={() => { setForm(saved); setEditing(false); setPreview(false); setMessage(''); }}>{en ? 'Cancel' : '취소'}</button>
        <button className="button primary" disabled={busy || Boolean(handleError) || (form.isPublic && !handle)}>{busy ? (en ? 'Saving…' : '저장 중') : (en ? 'Save' : '저장')}</button>
      </div>
    </form>}
    {saved && message && <p className="profile-message" role="status">{message}</p>}
  </section>;
}
