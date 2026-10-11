// 화면 9 (판매처 설정) — 저장·삭제 뒤 목록 반영이 서버 새 목록(RSC 다시 받기)을 기다리지 않는다 (harness/d7-data.md §26 "판매처 수정 버그 (화면 9)" 행).
//   §26: 저장 응답의 행을 목록 로컬 덮어쓰기에 바로 합친다(등록·수정) · 삭제는 바로 뺀다 · router.refresh.
//   이 스펙은 서버 재검증 응답(RSC 요청 — 헤더 `RSC: 1` 또는 `_rsc` 쿼리, 서버 액션 POST 는 제외)을 일부러 늦춘 상태에서
//   토스트가 보이는 순간 · 그 직후 · 늦춘 응답이 도착하기 전까지 목록을 **한 번씩 바로 읽어** 이미 새 값인지 본다 (재시도 없음 — 이번 고침의 효과).
//   늦춘 응답이 도착한 뒤의 최종 상태는 expect.poll 로 다시 읽는다 (§26 "저장 토스트 직후 한 번 읽기 금지" 는 최종 상태 판정에 적용).
//   390 = 하단 시트 폼(모바일 전용 폼 경로) / 1440 = 오른쪽 드로어 폼 (프로젝트 mobile·desktop).
// 쓰기는 일회용 학교의 일회용 admin 세션으로만. service role 은 준비·정리·대조 조회에만 쓴다.
import { test, expect, type Page, type Request } from "@playwright/test";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import {
  DELETE_ITEM,
  EDIT_ITEM,
  FIELD_CONTACT,
  FIELD_NAME,
  FIELD_WEBSITE,
  NO_RESIDUE_69,
  TOAST,
  TOAST_DELETED,
  TOAST_SAVED,
  VENDORS,
  VENDORS_HREF,
  chooseRowMenu,
  cleanup,
  deleteDialog,
  exact,
  fieldInput,
  hex,
  listScope,
  makeSchool,
  openCreateForm,
  prepVendor,
  primaryIn,
  purge,
  readVendorRows,
  saveButton,
  sharedSnapshot,
  toast,
  vendorRow,
  vendorsBySchool,
  waitVendors,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const SCREEN = VENDORS;
const GROUP = "s9rsc";
const TIMEOUT = 300_000;
/** RSC 다시 받기 응답을 늦추는 시간 (요청: 2~3초) */
const DELAY_MS = 2_500;
/** 늦춘 응답이 오기 전까지 목록을 다시 바로 읽는 간격 */
const SAMPLE_MS = 200;

let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;

function fixture(info: import("@playwright/test").TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

async function fresh(info: import("@playwright/test").TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

/** Next 의 RSC 요청(서버 새 목록 다시 받기·revalidate) — 서버 액션 POST(next-action)는 아니다 */
function isRsc(req: Request): boolean {
  const h = req.headers();
  if (h["next-action"]) return false;
  return h["rsc"] === "1" || new URL(req.url()).searchParams.has("_rsc");
}

type Delay = {
  /** 지금까지 늦추기 시작한 RSC 요청 번호 (mark 로 쓴다) */
  mark: () => number;
  /** mark 뒤에 시작해 늦춘 RSC 요청 수 (미리 받기 prefetch 제외) */
  heldAfter: (mark: number) => number;
  /** mark 뒤에 시작해 늦춘 뒤 응답이 브라우저에 도착한 RSC 요청 수 (미리 받기 제외) */
  landedAfter: (mark: number) => number;
};

/** 미리 받기(prefetch)는 저장·삭제 뒤 다시 받기가 아니다 — 늦추기는 하되 세지 않는다 */
const isPrefetch = (req: Request) => Boolean(req.headers()["next-router-prefetch"]);

/** 이 페이지의 RSC 요청을 DELAY_MS 늦춘다 (본문 그대로 통과) */
async function delayRsc(page: Page): Promise<Delay> {
  let seq = 0;
  const started = new Map<Request, number>();
  const finished = new Set<Request>();
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (!isRsc(req)) return route.fallback();
    started.set(req, ++seq);
    await new Promise((r) => setTimeout(r, DELAY_MS));
    await route.continue().catch(() => {});
  });
  const done = (req: Request) => {
    if (started.has(req)) finished.add(req);
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  const count = (mark: number, only?: Set<Request>) =>
    [...started].filter(([req, n]) => n > mark && !isPrefetch(req) && (!only || only.has(req))).length;
  return { mark: () => seq, heldAfter: (m) => count(m), landedAfter: (m) => count(m, finished) };
}

/** 지금 목록에서 판매처명 → 행 글자 줄 (바로 한 번 읽기) */
async function rowsNow(page: Page): Promise<string[][]> {
  return readVendorRows(page);
}

/**
 * 토스트가 보이는 순간부터 늦춘 응답이 도착하기 전까지 SAMPLE_MS 마다 목록을 바로 읽어 check 로 본다 (재시도 없음).
 * 첫 읽기 때 늦춘 응답이 아직 도착하지 않았어야 지연 조건이 걸린 것이다. 돌려주는 값 = 읽은 횟수.
 */
async function checkWhileDelayed(page: Page, delay: Delay, mark: number, toastText: string, check: (rows: string[][], when: string) => void): Promise<number> {
  await expect(toast(page).filter({ hasText: exact(toastText) }), `${TOAST} "${toastText}"`).toBeVisible({ timeout: 20_000 });
  // 토스트가 보이는 순간
  const first = await rowsNow(page);
  expect(delay.landedAfter(mark), `지연 조건: 토스트가 보일 때 늦춘 RSC 응답은 아직 도착하지 않았다 (${DELAY_MS}ms 지연)`).toBe(0);
  check(first, "토스트가 보이는 순간");
  let reads = 1;
  // 그 직후 ~ 늦춘 응답 도착 전
  while (delay.landedAfter(mark) === 0 && reads < Math.ceil((DELAY_MS * 2) / SAMPLE_MS)) {
    await page.waitForTimeout(SAMPLE_MS);
    if (delay.landedAfter(mark) > 0) break;
    check(await rowsNow(page), `토스트 뒤 ${reads * SAMPLE_MS}ms (늦춘 응답 도착 전)`);
    reads += 1;
  }
  return reads;
}

/** 저장·삭제 뒤 서버 새 목록 다시 받기(RSC)가 실제로 나갔고, 늦춘 뒤 도착했다 */
async function expectRefreshLanded(delay: Delay, mark: number): Promise<void> {
  await expect.poll(() => delay.heldAfter(mark), { message: "저장·삭제 뒤 서버 새 목록 다시 받기(RSC) 요청이 나갔다 (d7 §26 router.refresh)", timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => delay.landedAfter(mark), { message: "늦춘 RSC 응답이 도착했다", timeout: 20_000 }).toBeGreaterThanOrEqual(1);
}

// =====================================================================
// 수정 — 연락처만
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: RSC 다시 받기를 ${DELAY_MS}ms 늦춘 상태에서 "${EDIT_ITEM}" → 연락처만 바꿔 저장 → ${TOAST} "${TOAST_SAVED}" 가 보이는 순간·그 직후(늦춘 응답 도착 전) 목록 행 연락처 = 새 값 · 옛 연락처 0 (재시도 없는 즉시 읽기, d7 §26) · 도착 뒤에도 새 값 · DB 일치`, async ({ browser }, info) => {
  const f = await fresh(info);
  const OLD = "043-555-0101";
  const NEW = "043-555-0202";
  const target = await prepVendor(f, { name: `수정 지연-${hex()}`, contact: OLD, note: "시약" });
  const other = await prepVendor(f, { name: `다른 판매처-${hex()}`, contact: "043-777-0000" });
  const { context, page } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    expect((await rowsNow(page)).sort(), "처음 행").toEqual([[target.name, OLD], [other.name, other.contact!]].sort());
    const delay = await delayRsc(page);

    await chooseRowMenu(page, target.name, EDIT_ITEM);
    await expect(fieldInput(page, FIELD_CONTACT), "폼: 기존 연락처").toHaveValue(OLD);
    await fieldInput(page, FIELD_CONTACT).fill(NEW);
    const mark = delay.mark();
    await saveButton(page).click();

    const want = [[target.name, NEW], [other.name, other.contact!]].sort();
    const reads = await checkWhileDelayed(page, delay, mark, TOAST_SAVED, (rows, when) => {
      expect(rows.find((r) => r[0] === target.name), `${when}: 행 = 이름 + 새 연락처`).toEqual([target.name, NEW]);
      expect(rows.filter((r) => r.includes(OLD)), `${when}: 옛 연락처 "${OLD}" 0`).toEqual([]);
      expect([...rows].sort(), `${when}: 목록 전체 (다른 행 그대로 · 중복 없음)`).toEqual(want);
    });
    expect(reads, "토스트 직후 늦춘 응답 도착 전에 여러 번 읽었다").toBeGreaterThanOrEqual(2);
    expect(await listScope(page).innerText(), "목록 영역에 옛 연락처 글자 0").not.toContain(OLD);

    // 늦춘 응답이 도착한 뒤 (서버 목록) — 다시 시도하며 읽는다
    await expectRefreshLanded(delay, mark);
    await expect.poll(async () => [...(await rowsNow(page))].sort(), { message: "도착 뒤 목록", timeout: 20_000 }).toEqual(want);
    const db = await vendorsBySchool(f.school.id);
    expect(db.find((v) => v.id === target.id), "DB: 연락처만 바뀜 (note·웹사이트 그대로)").toEqual({ ...target, contact: NEW });
    expect(db.find((v) => v.id === other.id), "DB: 다른 행 불변").toEqual(other);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 등록
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: RSC 다시 받기를 ${DELAY_MS}ms 늦춘 상태에서 "판매처 등록" → 저장 → ${TOAST} "${TOAST_SAVED}" 가 보이는 순간·그 직후(늦춘 응답 도착 전) 새 행이 목록에 바로 1개 (재시도 없는 즉시 읽기, d7 §26) · 도착 뒤에도 1개 · DB 일치`, async ({ browser }, info) => {
  const f = await fresh(info);
  const existing = await prepVendor(f, { name: `기존 판매처-${hex()}`, contact: "043-111-2222" });
  const { context, page } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    expect(await rowsNow(page), "처음 행").toEqual([[existing.name, existing.contact!]]);
    const delay = await delayRsc(page);

    const name = `새 판매처 지연-${hex()}`;
    const contact = "043-333-4444";
    await openCreateForm(page);
    await fieldInput(page, FIELD_NAME).fill(name);
    await fieldInput(page, FIELD_CONTACT).fill(contact);
    await fieldInput(page, FIELD_WEBSITE).fill("");
    const mark = delay.mark();
    await saveButton(page).click();

    const want = [[existing.name, existing.contact!], [name, contact]].sort();
    const reads = await checkWhileDelayed(page, delay, mark, TOAST_SAVED, (rows, when) => {
      expect(rows.filter((r) => r[0] === name), `${when}: 새 행 1개 (이름 + 연락처)`).toEqual([[name, contact]]);
      expect([...rows].sort(), `${when}: 목록 전체 (기존 행 그대로 · 중복 없음)`).toEqual(want);
    });
    expect(reads, "토스트 직후 늦춘 응답 도착 전에 여러 번 읽었다").toBeGreaterThanOrEqual(2);

    await expectRefreshLanded(delay, mark);
    await expect.poll(async () => [...(await rowsNow(page))].sort(), { message: "도착 뒤 목록 (새 행 1개 — 로컬 행과 서버 행이 겹치지 않음)", timeout: 20_000 }).toEqual(want);
    const db = await vendorsBySchool(f.school.id);
    expect(db.map((v) => [v.name, v.contact]).sort(), "DB 행 = 기존 + 새 행").toEqual(want);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 삭제
// =====================================================================

test(`[C1][S${SCREEN}] 일회용 학교 admin: RSC 다시 받기를 ${DELAY_MS}ms 늦춘 상태에서 "${DELETE_ITEM}" → 확인 → ${TOAST} "${TOAST_DELETED}" 가 보이는 순간·그 직후(늦춘 응답 도착 전) 그 행이 목록에서 이미 사라짐 (재시도 없는 즉시 읽기, d7 §26) · 도착 뒤에도 없음 · DB 일치`, async ({ browser }, info) => {
  const f = await fresh(info);
  const target = await prepVendor(f, { name: `지울 지연-${hex()}`, contact: "043-555-9999" });
  const keep = await prepVendor(f, { name: `남길 지연-${hex()}`, contact: "043-555-8888" });
  const { context, page } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    expect((await rowsNow(page)).sort(), "처음 행").toEqual([[target.name, target.contact!], [keep.name, keep.contact!]].sort());
    const delay = await delayRsc(page);

    await chooseRowMenu(page, target.name, DELETE_ITEM);
    const del = primaryIn(deleteDialog(page), DELETE_ITEM);
    await expect(del).toBeEnabled();
    const mark = delay.mark();
    await del.click();

    const want = [[keep.name, keep.contact!]];
    const reads = await checkWhileDelayed(page, delay, mark, TOAST_DELETED, (rows, when) => {
      expect(rows.filter((r) => r[0] === target.name), `${when}: 지운 행 0`).toEqual([]);
      expect(rows, `${when}: 남은 행`).toEqual(want);
    });
    expect(reads, "토스트 직후 늦춘 응답 도착 전에 여러 번 읽었다").toBeGreaterThanOrEqual(2);
    expect(await vendorRow(page, target.name).count(), "늦춘 응답 도착 전: 지운 행 0").toBe(0);

    await expectRefreshLanded(delay, mark);
    await expect.poll(async () => await rowsNow(page), { message: "도착 뒤 목록", timeout: 20_000 }).toEqual(want);
    expect(await vendorsBySchool(f.school.id), "DB: 지운 행 없음 · 남은 행 불변").toEqual([keep]);
  } finally {
    await context.close();
  }
});
