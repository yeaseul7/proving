import assert from 'node:assert/strict';
import { test } from 'node:test';
import { introDescription, parseProfileInput } from '../lib/profile.ts';

test('프로필 입력은 아이디를 소문자로 정리하고 공개 조건과 길이를 검사한다', () => {
  assert.deepEqual(parseProfileInput({ handle: ' Yea_Seul7 ', displayName: ' 예슬 ', intro: '## 안녕', isPublic: true }),
    { handle: 'yea_seul7', displayName: '예슬', intro: '## 안녕', isPublic: true });
  assert.deepEqual(parseProfileInput({ handle: '', displayName: '', intro: '', isPublic: false }),
    { handle: null, displayName: null, intro: '', isPublic: false });
  assert.equal(typeof parseProfileInput({ handle: 'ab', displayName: null, intro: '', isPublic: false }), 'string');
  assert.equal(typeof parseProfileInput({ handle: 'has-dash', displayName: null, intro: '', isPublic: false }), 'string');
  assert.equal(typeof parseProfileInput({ handle: null, displayName: null, intro: '', isPublic: true }), 'string');
  assert.equal(typeof parseProfileInput({ handle: 'okay', displayName: null, intro: 'x'.repeat(5001), isPublic: false }), 'string');
  assert.equal(typeof parseProfileInput({ handle: 'okay', displayName: '가'.repeat(41), intro: '', isPublic: false }), 'string');
  assert.equal(typeof parseProfileInput({ handle: 'okay', intro: '', isPublic: 'yes' }), 'string');
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
