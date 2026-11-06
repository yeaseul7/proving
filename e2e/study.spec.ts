import { readFile } from 'node:fs/promises';
import type { Notebook } from '../lib/notebooks';
import type { StudyNote } from '../lib/study';
import { test, expect, type Page } from '@playwright/test';

const account = 'e2e-user';
const answer = 'LEFT JOIN은 왼쪽 테이블의 모든 행을 유지합니다.';
const summary = '## 핵심 개념\n\nLEFT JOIN으로 일치하지 않는 행도 조회합니다.';
const question = (page: Page) => page.getByRole('textbox', { name: '공부 질문', exact: true });
const send = (page: Page) => page.getByRole('button', { name: '질문 보내기', exact: true });

// 테스트마다 별도의 브라우저 컨텍스트를 사용한다. 실제 계정과 AI를 호출하지 않는다.
test.beforeEach(async ({ page }) => {
  const notebooks = new Map<string, Notebook>();
  const records = new Map<string, StudyNote>();
  const closedIds = new Set<string>();
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') {
      return route.fulfill({ json: { account, name: '테스트 사용자', canChat: true } });
    }
    if (path === '/api/models') {
      return route.fulfill({ json: { models: [{ id: 'test-model', name: 'Test Model' }] } });
    }
    if (path === '/api/study-sync') {
      if (route.request().method() === 'GET') {
        return route.fulfill({json:{account, notebooks:[...notebooks.values()], records:[...records.values()], closedIds:[...closedIds]}});
      }
      const {action, notebook, id} = route.request().postDataJSON();
      if (action === 'save') notebooks.set(notebook.id, notebook);
      if (action === 'record') {
        const record = {
          id:notebook.id, title:notebook.title, subject:'GPT 공부', date:notebook.date,
          updatedAt:new Date().toISOString(), content:notebook.summary, messages:notebook.messages, cloud:true as const,
        };
        records.set(record.id,record);
        notebooks.delete(record.id);
        closedIds.add(record.id);
        return route.fulfill({json:{record}});
      }
      if (action === 'discard') { notebooks.delete(id); closedIds.add(id); }
      if (action === 'delete-original') {
        const record = records.get(id);
        if (record) records.set(id,{...record,messages:[]});
      }
      return route.fulfill({json:{}});
    }
    if (path === '/api/chat') {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { account, text: body.summarize ? summary : answer, title: 'JOIN 공부' } });
    }
    // 모킹하지 않은 API가 실제 서버로 전달되는 것을 방지한다.
    return route.abort();
  });
});

async function startGpt(page: Page) {
  await page.getByRole('button', { name: /GPT로 시작하기/ }).click();
}

async function ask(page: Page) {
  await startGpt(page);
  await question(page).fill('LEFT JOIN이 뭐야?');
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
}

test('비로그인 상태에서는 질문 전송을 제한한다', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: { account: null } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue with ChatGPT' }).first()).toBeVisible();
  await expect(question(page)).toBeDisabled();
  await expect(send(page)).toBeDisabled();
});

test('질문과 답변을 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/');
  await ask(page);
  await page.reload();
  await expect(page.locator('.chat-message.user')).toHaveText('LEFT JOIN이 뭐야?');
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
  await expect(page.getByRole('textbox', { name: '대화 제목', exact: true })).toHaveValue('JOIN 공부');
});

test('노트 전환과 새로고침 후 초안을 유지하고 노트를 3개로 제한한다', async ({ page }) => {
  await page.goto('/');
  await startGpt(page);
  const title = page.getByRole('textbox', { name: '대화 제목', exact: true });
  await expect(title).toBeEnabled();
  await title.fill('첫 번째 노트');
  await question(page).fill('아직 보내지 않은 질문');
  const add = page.getByRole('button', { name: '＋ 노트 추가', exact: true });
  await add.click();
  await expect(question(page)).toHaveValue('');
  await page.getByRole('button', { name: '첫 번째 노트', exact: true }).click();
  await expect(question(page)).toHaveValue('아직 보내지 않은 질문');
  await page.reload();
  await expect(question(page)).toHaveValue('아직 보내지 않은 질문');
  await add.click();
  await expect(add).toBeDisabled();
});

test('AI 오류 후 질문을 중복 추가하지 않고 재시도한다', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/chat', route => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 429, json: { error: '테스트 사용 한도 오류' } })
      : route.fulfill({ json: { account, text: answer } });
  });
  await page.goto('/');
  await startGpt(page);
  await question(page).fill('LEFT JOIN이 뭐야?');
  await expect(send(page)).toBeEnabled();
  await send(page).click();
  const chat = page.getByRole('region', { name: 'GPT 공부 채팅', exact: true });
  await expect(chat.getByRole('alert')).toHaveText('테스트 사용 한도 오류');
  await page.getByRole('button', { name: '사용량 확인 후 다시 시도', exact: true }).click();
  await page.getByRole('button', { name: /답변 다시 받기/ }).click();
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
  await expect(page.locator('.chat-message.user')).toHaveCount(1);
});

test('요약 기록과 원본을 저장하고 TXT 다운로드 후 원본만 삭제한다', async ({ page }) => {
  await page.goto('/');
  await ask(page);
  await page.getByRole('button', { name: '기록하기', exact: true }).click();
  await expect(page.locator('.chat-message.user')).toHaveCount(0);
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: /기록/ }).click();
  await page.getByRole('button', { name: /JOIN 공부/ }).click();
  const dialog = page.locator('.detail-dialog');
  await expect(dialog.getByRole('heading', { name: '핵심 개념' })).toBeVisible();
  await dialog.getByRole('tab', { name: '원본 대화', exact: true }).click();
  await expect(dialog.getByLabel('원본 대화 텍스트')).toContainText(answer);
  await dialog.locator('summary').click();
  const txt = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /원본 대화.*\.txt/ }).click();
  const download = await txt;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  expect(await readFile((await download.path())!, 'utf8')).toContain(answer);
  await dialog.locator('summary').click();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Markdown/ }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/JOIN 공부\.md$/);
  page.once('dialog', prompt => prompt.accept());
  await dialog.getByRole('button', { name: '원본 대화 삭제', exact: true }).click();
  await expect(dialog.getByLabel('원본 대화 텍스트')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: /기록/ }).click();
  await page.getByRole('button', { name: /JOIN 공부/ }).click();
  await expect(dialog.getByRole('heading', { name: '핵심 개념' })).toBeVisible();
  await dialog.getByRole('tab', { name: '원본 대화', exact: true }).click();
  await expect(dialog.getByLabel('원본 대화 텍스트')).toHaveCount(0);
});

test('플랜 안내 확인 후 재방문에는 안내를 반복하지 않는다', async ({ page }) => {
  await page.goto('/');
  const notice=page.getByRole('dialog',{name:'ChatGPT 플랜 사용 안내'});
  await expect(notice).toBeVisible();
  await notice.getByRole('button',{name:'확인',exact:true}).click();
  await startGpt(page);
  await page.reload();
  await expect(page.getByRole('textbox',{name:'대화 제목',exact:true})).toBeEnabled();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText('연결한 ChatGPT 플랜 사용 중',{exact:true})).toHaveCount(0);
});

test('요약 사용량 제한에도 대화와 작성 중 초안을 보존한다',async({page})=>{
  await page.goto('/');
  await ask(page);
  await question(page).fill('작성 중 초안');
  await page.route('**/api/chat',route=>route.fulfill({status:429,json:{error:'사용량 제한',code:'subscription_sharing_usage_limit_exceeded',recovery:'usage'}}));
  await page.getByRole('button',{name:'기록하기',exact:true}).click();
  await expect(page.getByRole('button',{name:'사용량 확인 후 다시 시도',exact:true})).toBeVisible();
  await expect(question(page)).toHaveValue('작성 중 초안');
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
  await page.reload();
  await expect(question(page)).toHaveValue('작성 중 초안');
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
});

test('권한 철회 시 대화를 유지하고 명시적으로 재인증한다',async({page})=>{
  await page.goto('/');
  await ask(page);
  await page.route('**/api/chat',route=>route.fulfill({status:401,json:{error:'인증 만료',recovery:'reauth'}}));
  await question(page).fill('후속 질문');
  await send(page).click();
  await expect(page.getByRole('button',{name:'ChatGPT 다시 인증하기'})).toBeVisible();
  // 오류는 복구 안내 상자 안에 한 번만 보이고, 대화가 유지된다는 안내를 함께 보여준다.
  const recovery=page.locator('.chat-recovery');
  await expect(recovery.getByRole('alert')).toHaveText('인증 만료');
  await expect(recovery.getByText('공부 대화와 초안은 유지됩니다.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'GPT 공부 채팅',exact:true}).getByRole('alert')).toHaveCount(1);
  await expect(page.locator('.chat-message.user')).toHaveCount(2);
  await page.route('**/auth/login?reauthorize=1',route=>route.fulfill({contentType:'text/html',body:'재인증 테스트'}));
  await page.getByRole('button',{name:'ChatGPT 다시 인증하기'}).click();
  await expect(page).toHaveURL(/reauthorize=1/);
});

test('원격 폐기 미확인 시 로그아웃 후 안내하고 저장 대화는 삭제하지 않는다',async({page})=>{
  await page.goto('/');
  await ask(page);
  await page.route('**/api/logout',route=>route.fulfill({json:{signedOut:true,revocationConfirmed:false}}));
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await expect(page.getByText(/원격 토큰 폐기는 확인되지 않았습니다/)).toBeVisible();
  const saved=await page.evaluate(()=>localStorage.getItem('study-notebooks-e2e-user'));
  expect(saved).toContain(answer);
});


test('보관함 저장 실패 후 대화를 유지하고 요약을 재사용해 다시 저장한다', async ({ page }) => {
  let failed = false;
  await page.route('**/api/study-sync', route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'record' && !failed) {
      failed = true;
      return route.fulfill({status:503,json:{error:'테스트 저장 실패'}});
    }
    return route.fallback();
  });
  await page.goto('/');
  await ask(page);
  await page.getByRole('button',{name:'기록하기',exact:true}).click();
  await expect(page.getByText('테스트 저장 실패',{exact:true})).toBeVisible();
  await expect(page.locator('.chat-message.assistant')).toHaveText(answer);
  await page.getByRole('button',{name:'기록 저장 재시도',exact:true}).click();
  await expect(page.locator('.chat-message.assistant')).toHaveCount(0);
});

test('글꼴 모드를 모든 화면에 하나로 기억하고 모바일에서 설정 토글을 한 줄 가운데 정렬한다', async ({ page }) => {
  await page.goto('/');
  const readable = page.getByRole('radio', { name: '가독성 모드' });
  const handwriting = page.getByRole('radio', { name: '필기 모드' });
  await expect(handwriting).toBeChecked();
  await page.getByTitle('가독성 모드', { exact: true }).click();
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-font-mode', 'readable');
  await expect.poll(() => page.locator('.app-shell').evaluate(element => getComputedStyle(element).fontFamily)).toMatch(/pretendard/i);
  const nav = page.getByRole('navigation', { name: '메인 메뉴' });
  await nav.getByRole('button', { name: '개요', exact: true }).click();
  await expect(readable).toBeChecked();
  await nav.getByRole('button', { name: '배우는 중', exact: true }).click();
  await expect(readable).toBeChecked();
  await page.reload();
  await expect(root).toHaveAttribute('data-font-mode', 'readable');
  await expect(readable).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  const language = page.getByRole('group', { name: '언어 선택' });
  await expect(language).toBeVisible();
  const preferences = page.locator('.sidebar-preferences');
  const row = await preferences.evaluate(element => { const items = [...element.children].map(child => child.getBoundingClientRect()); return { left: Math.min(...items.map(r => r.left)), right: Math.max(...items.map(r => r.right)), tops: items.map(r => Math.round(r.top + r.height / 2)) }; });
  expect(Math.abs((row.left + row.right) / 2 - 195)).toBeLessThan(2);
  expect(new Set(row.tops).size).toBe(1);
});

test('다크 모드를 저장해 새로고침 전에 적용하고 저장값이 없으면 시스템 설정을 따른다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const root = page.locator('html');
  const toggle = page.getByTitle('다크 모드', { exact: true });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.brand-logo-dark')).toBeVisible();
  await expect(page.locator('.brand-logo-light')).toBeHidden();

  await toggle.click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.brand-logo-light')).toBeVisible();
  // 시스템이 다크여도 사용자가 고른 라이트 모드를 첫 화면부터 유지한다.
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.emulateMedia({ colorScheme: 'light' });
  await toggle.click();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('하루 기록 개수에 따라 달걀 단계를 범례와 같게 표시한다', async ({ page }) => {
  const seoulDate = (daysAgo: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(Date.now() - daysAgo * 86_400_000);
  const days = [seoulDate(1), seoulDate(2), seoulDate(3)];
  const records = days.flatMap((date, index) => Array.from({ length: index + 1 }, (_, n) => ({
    id: crypto.randomUUID(), title: `기록 ${index + 1}-${n + 1}`, subject: 'GPT 공부', date,
    updatedAt: new Date().toISOString(), content: summary, messages: [], cloud: true as const,
  })));
  await page.route('**/api/study-sync', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { account, notebooks: [], records, closedIds: [] } })
    : route.fallback());
  await page.goto('/');
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: '개요', exact: true }).click();
  const garden = page.getByRole('region', { name: '최근 1년 공부 기록' });
  const legend = garden.locator('.legend-item');
  await expect(legend).toHaveText(['적게', '보통', '많이']);
  await expect(legend.nth(2)).toHaveAttribute('title', '하루 3개 이상');
  for (const [index, date] of days.entries()) {
    const count = index + 1;
    const cell = garden.getByRole('button', { name: `${date} · 공부 기록 ${count}개`, exact: true });
    await expect(cell).toHaveClass(/cooked/);
    // 같은 개수의 범례 그림과 달력 칸의 그림이 일치해야 한다.
    const legendEgg = await legend.nth(count - 1).locator('svg').evaluate(svg => svg.innerHTML);
    expect(await cell.locator('svg').evaluate(svg => svg.innerHTML)).toBe(legendEgg);
  }
  const eggs = await legend.locator('svg').evaluateAll(list => list.map(svg => svg.innerHTML));
  expect(new Set(eggs).size).toBe(3);
});

test('개요는 최근·선택한 날짜의 노트를 3개까지만 보여주고 나머지는 기록에서 본다', async ({ page }) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const records = Array.from({ length: 6 }, (_, i) => ({
    id: crypto.randomUUID(), title: `노트 ${i + 1}`, subject: 'GPT 공부', date: i < 5 ? today : '2026-01-05',
    updatedAt: new Date(Date.now() - i * 60_000).toISOString(), content: '요약', messages: [], cloud: true as const,
  }));
  await page.route('**/api/study-sync', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { account, notebooks: [], records, closedIds: [] } })
    : route.fallback());
  await page.goto('/');
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: '개요', exact: true }).click();
  const rows = page.locator('.notes-ledger tbody tr');
  const more = page.getByRole('button', { name: '기록에서 더보기' });
  await expect(rows).toHaveCount(3);
  await expect(more).toBeVisible();

  await page.getByRole('button', { name: `${today} · 공부 기록 5개` }).click();
  await expect(rows).toHaveCount(3);
  await more.click();
  await expect(page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: /^기록/ })).toHaveClass(/active/);
  await expect(rows).toHaveCount(5);
});

test('개요에서 이름·프로필 사진·500자 설명만 편집하고 기존 공개 링크는 유지한다', async ({ page }) => {
  let profile: Record<string, unknown> = { handle: 'yeaseul', displayName: null, avatar: null, intro: '', isPublic: true };
  let sent: Record<string, unknown> = {};
  await page.route('**/api/profile', async route => {
    if (route.request().method() === 'PUT') { sent = route.request().postDataJSON(); profile = { ...profile, ...sent }; }
    return route.fulfill({ json: { profile } });
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: '메인 메뉴' }).getByRole('button', { name: '개요', exact: true }).click();
  const card = page.getByRole('region', { name: '내 프로필' });
  await card.getByRole('button', { name: '편집' }).click();
  await expect(card.getByLabel('아이디')).toHaveCount(0);
  await expect(card.getByLabel(/공개하기/)).toHaveCount(0);
  await card.getByLabel('이름').fill('예슬');
  const description = card.getByRole('textbox', { name: '설명' });
  await description.fill('가'.repeat(600));
  await expect(description).toHaveValue('가'.repeat(500));
  await expect(card.getByText('500/500')).toBeVisible();
  await description.fill('SQL을 공부해요.');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await card.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(card.locator('img.profile-avatar-large')).toBeVisible();
  await card.getByRole('button', { name: '저장' }).click();
  expect(Object.keys(sent).sort()).toEqual(['avatar', 'displayName', 'intro']);
  expect(sent).toMatchObject({ displayName: '예슬', intro: 'SQL을 공부해요.' });
  expect(String(sent.avatar)).toMatch(/^data:image\/(webp|jpeg);base64,/);
  await expect(card.getByRole('heading', { name: '예슬' })).toBeVisible();
  await expect(card.getByText('SQL을 공부해요.')).toBeVisible();
  await expect(card.getByRole('link', { name: '/u/yeaseul' })).toBeVisible();
});

test('사용자 Cloud 프로젝트를 OAuth로 연결해 Gemini에 질문한다', async ({ page }) => {
  let connected = false;
  await page.route('**/auth/google-cloud?*', route => {
    expect(new URL(route.request().url()).searchParams.get('project')).toBe('my-study-project');
    connected = true;
    return route.fulfill({ status: 302, headers: { location: '/' } });
  });
  await page.route('**/api/session', route => route.fulfill({ json: {
    account, name: '테스트 사용자', canChat: false, provider: 'google',
    cloudAi: { enabled: true, models: connected ? [
      { id: 'cloud:gemini', name: 'Gemini (Google Cloud)', provider: 'gemini' },
    ] : [] },
  } }));
  const called: string[] = [];
  await page.route('**/api/chat', route => {
    const { model } = route.request().postDataJSON();
    called.push(model);
    return route.fulfill({ json: { text: model, account } });
  });
  await page.goto('/');
  const picker = page.getByRole('group', { name: 'AI 선택' });
  await picker.getByRole('button', { name: /Gemini로 시작하기/ }).click();
  await expect(picker.getByRole('button', { name: /Claude|GPT/ })).toHaveCount(0);
  await page.getByLabel('본인 Google Cloud 프로젝트 ID').fill('my-study-project');
  await page.getByRole('button', { name: 'Google로 연결' }).click();
  await question(page).fill('첫 질문');
  await send(page).click();
  await expect(page.locator('.chat-message.assistant')).toHaveText('cloud:gemini');
  expect(called).toEqual(['cloud:gemini']);
});
