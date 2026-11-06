import assert from 'node:assert/strict';
import { test } from 'node:test';
import { introDescription, parseProfileInput } from '../lib/profile.ts';

test('프로필 입력은 이름·사진·설명만 받고 길이와 이미지 형식을 검사한다', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(parseProfileInput({ displayName: ' 예슬 ', avatar: png, intro: '안녕', handle: 'ignored', isPublic: true }),
    { displayName: '예슬', avatar: png, intro: '안녕' });
  assert.deepEqual(parseProfileInput({ displayName: '', avatar: '', intro: '' }), { displayName: null, avatar: null, intro: '' });
  assert.deepEqual(parseProfileInput({ displayName: null, avatar: null, intro: '가'.repeat(500) }), { displayName: null, avatar: null, intro: '가'.repeat(500) });
  assert.equal(typeof parseProfileInput({ displayName: null, avatar: null, intro: '가'.repeat(501) }), 'string');
  assert.equal(typeof parseProfileInput({ displayName: '가'.repeat(41), avatar: null, intro: '' }), 'string');
  assert.equal(typeof parseProfileInput({ displayName: null, avatar: 'data:image/svg+xml;base64,PHN2Zz4=', intro: '' }), 'string');
  assert.equal(typeof parseProfileInput({ displayName: null, avatar: 'https://example.com/a.png', intro: '' }), 'string');
  assert.equal(typeof parseProfileInput({ displayName: null, avatar: `data:image/png;base64,${'A'.repeat(200_001)}`, intro: '' }), 'string');
  assert.equal(typeof parseProfileInput({ displayName: null, intro: 1 }), 'string');
  assert.equal(typeof parseProfileInput(null), 'string');
});

test('소개글 설명은 Markdown 기호·코드·수식을 걷어내고 길이를 제한한다', () => {
  const markdown = '## 안녕하세요\n\n**SQL**과 [수학](https://example.com)을 공부해요.\n\n```js\nconsole.log(1)\n```\n\n$$x^2$$\n- 목표: `JOIN`';
  assert.equal(introDescription(markdown), '안녕하세요 SQL과 수학을 공부해요. 목표: JOIN');
  const long = introDescription('가'.repeat(200));
  assert.equal(Array.from(long).length, 160);
  assert.ok(long.endsWith('…'));
  assert.equal(introDescription('   '), '');
});
