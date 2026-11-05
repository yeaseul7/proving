// 공개 URL의 기준. 배포 시 NEXT_PUBLIC_SITE_URL에 실제 도메인을 넣는다.
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3005');
