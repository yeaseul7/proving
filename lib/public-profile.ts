import 'server-only';
import { cache } from 'react';
import { transaction } from './notebook-server.ts';
import { readPublicProfile } from './profile-db.ts';

export const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

// generateMetadata, 페이지, OG 이미지가 같은 요청에서 DB를 한 번만 조회하도록 묶는다.
export const getPublicProfile = cache((handle: string) =>
  transaction(db => readPublicProfile(db, decodeURIComponent(handle), seoulToday())));
