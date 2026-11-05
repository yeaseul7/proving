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

async function ask(page: Page) {
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

test('화면별 글꼴 모드를 기억하고 모바일에서도 언어 선택을 가운데 정렬한다', async ({ page }) => {
  await page.goto('/');
  const readable = page.getByRole('radio', { name: '가독성 모드' });
  const handwriting = page.getByRole('radio', { name: '필기 모드' });
  await expect(handwriting).toBeChecked();
  await page.getByText('가독성 모드', { exact: true }).click();
  const shell = page.locator('.app-shell');
  await expect(shell).toHaveAttribute('data-font-mode', 'readable');
  await expect.poll(() => shell.evaluate(element => getComputedStyle(element).fontFamily)).toMatch(/pretendard/i);
  const nav = page.getByRole('navigation', { name: '메인 메뉴' });
  await nav.getByRole('button', { name: '개요', exact: true }).click();
  await expect(handwriting).toBeChecked();
  await nav.getByRole('button', { name: '배우는 중', exact: true }).click();
  await expect(readable).toBeChecked();
  await page.reload();
  await expect(readable).toBeChecked();

  await page.setViewportSize({ width: 390, height: 844 });
  const language = page.getByRole('group', { name: '언어 선택' });
  await expect(language).toBeVisible();
  const bounds = await language.boundingBox();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 195)).toBeLessThan(2);
});
