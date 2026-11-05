import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { EggGarden } from '@/components/egg-garden';
import { StudyMarkdown } from '@/components/study-markdown';
import { introDescription } from '@/lib/profile';
import { getPublicProfile, seoulToday } from '@/lib/public-profile';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

type Props = { params: Promise<{ handle: string }> };
const shareImage = { url: '/proving-logo.png', width: 1306, height: 428, alt: 'proving' };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const profile = await getPublicProfile((await params).handle);
  if (!profile) return { title: '프로필을 찾을 수 없어요', robots: { index: false, follow: false } };
  const title = `${profile.displayName} (@${profile.handle})`;
  const description = introDescription(profile.intro) || `${profile.displayName}님의 proving 공부 기록`;
  const path = `/u/${profile.handle}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'profile', url: path, siteName: 'proving', locale: 'ko_KR', title, description, username: profile.handle, images: [shareImage] },
    twitter: { card: 'summary', title, description, images: [shareImage.url] },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  await connection();
  const profile = await getPublicProfile((await params).handle);
  if (!profile) notFound();
  const total = Object.values(profile.counts).reduce((sum, count) => sum + count, 0);
  const url = new URL(`/u/${profile.handle}`, siteUrl).href;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url,
    dateModified: profile.updatedAt,
    mainEntity: {
      '@type': 'Person',
      name: profile.displayName,
      alternateName: `@${profile.handle}`,
      description: introDescription(profile.intro, 300) || undefined,
      url,
    },
  };
  return <main className="public-profile">
    {/* JSON.stringify만으로는 </script>를 막지 못해 <를 이스케이프한다. */}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    <header className="public-profile-header">
      <a href="/" className="public-profile-brand" aria-label="proving 홈">
        <Image src="/proving-logo.png" alt="Proving" width={1306} height={428} sizes="120px" className="brand-logo brand-logo-light" />
        <Image src="/proving-logo-dark.png" alt="" width={1306} height={428} sizes="120px" className="brand-logo brand-logo-dark" />
      </a>
      <h1>{profile.displayName}</h1>
      <p className="public-profile-handle">@{profile.handle} · 최근 1년 기록 {total}개</p>
    </header>
    {profile.intro.trim()
      ? <section className="public-profile-intro" aria-label="소개"><StudyMarkdown>{profile.intro}</StudyMarkdown></section>
      : <p className="public-profile-empty">아직 소개글이 없어요.</p>}
    <EggGarden counts={profile.counts} today={seoulToday()} />
  </main>;
}
