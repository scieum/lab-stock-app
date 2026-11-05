// 화면 19 개인정보 처리방침 `/privacy` (공개·정적) — C1 · C2 · C3 · R-ui · N1-ui · V1
// 기대값: design/rules.json privacy_page · privacy_consent.copy · footer · screens_required · desktop_shell.pre_login · tab_bar · roles
//         · harness/d7-data.md §30 (시행일 · 보호책임자 · 국외 이전 항목 — 시안 자리표시보다 d7 가 정답)
//         · harness/dev-rules.json routes · route_auth · design/frames/19-{mobile|desktop}.json (여백·폭·목차 단)
// 구현 파일(lib/privacy.ts 등)에서 기대값을 읽지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { expectPreLoginShell, frameOf, hexToRgb } from "./pre-login-helpers";
import { PROFILE_ROLE, countComponent, devRules, roleChecks, routeOf, rules, seedRows, sel, useProjectViewport, type ViewportName } from "./screen-helpers";
import { anonContext } from "./shell-helpers";

type PrivacyPage = { screen: number; path: string; shell: string; doc: string; table: string };
const PP = (rules as unknown as { privacy_page: PrivacyPage }).privacy_page;
const COPY = (rules as unknown as { privacy_consent: { copy: { processors: string } } }).privacy_consent.copy;
const FOOTER = (rules as unknown as { footer: { links: string[]; component: string } }).footer;
const SCREEN = PP.screen;
const N1 = rules.never.N1;

/** rules privacy_page.doc 절 목록 ("1 수집 목적" …, 괄호 설명 뺌) */
const SECTIONS: string[] = PP.doc
  .split("번호 절")[1]
  .split("):")[1]
  .split(" · ")
  .map((s) => s.replace(/\(.*\)$/, "").trim());
/** rules privacy_page.shell "가운데 읽기 단(최대 720)" */
const READING_MAX = Number(PP.shell.match(/최대 (\d+)/)![1]);
/** rules privacy_page.table "열 업체 · 하는 일 · 위치" */
const TABLE_COLS = PP.table.match(/열 (.+?), mobile/)![1].split(" · ");
/** rules privacy_consent.copy.processors "Supabase(DB·로그인, 서울) · …" → 업체 · 하는 일 · 위치 */
const PROCESSORS = COPY.processors.split(" · ").map((p) => {
  const m = p.match(/^(.+?)\(([^,]+), ([^ ,—)]+)/)!;
  return { name: m[1].trim(), role: m[2].trim(), location: m[3].trim() };
});

/** d7 §30 "화면 19 처리방침" 행 — 시행일 · 보호책임자 · 국외 이전 항목 */
const D7_ROW = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8")
  .split("\n")
  .find((l) => l.startsWith("| 화면 19 처리방침 |"))!;
const D7_DATE = D7_ROW.match(/시행일 (\d{4}-\d{2}-\d{2})/)![1];
const D7_OFFICER = D7_ROW.match(/보호책임자 = '([^']+)'/)![1];
const D7_ABROAD_ITEMS = D7_ROW.match(/국외 이전 항목\(([^)]+)\)/)![1].split("·");
const D7_ABROAD_COUNTRY = D7_ROW.match(/국외 — ([^,]+),/)![1].trim();

// ---------- 프레임 ----------
type N = { name: string; path: string[]; width: number; height: number; padding?: number[] | null; gap?: number | null; fills?: string[]; cornerRadius?: number | null; text?: { characters: string; fontSize?: number; fontWeight?: number } | null };
const frame = (vp: ViewportName) => frameOf(`${SCREEN}-${vp}`) as unknown as { width: number; nodes: N[] };
const fnode = (vp: ViewportName, path: string): N => {
  const n = frame(vp).nodes.find((x) => x.path.slice(1).join("/") === path);
  if (!n) throw new Error(`프레임 ${SCREEN}-${vp} 에 ${path} 없음`);
  return n;
};
/** 프레임 toc-col 마다 toc-link 수 (문서 순서) */
const tocCols = (vp: ViewportName): number[] => {
  const out: number[] = [];
  for (const n of frame(vp).nodes) {
    if (n.name === "toc-col") out.push(0);
    else if (n.name === "toc-link") out[out.length - 1] += 1;
  }
  return out;
};

// ---------- 페이지 ----------
async function openPrivacy(page: Page, info: TestInfo): Promise<ViewportName> {
  // useProjectViewport 와 같음 (훅 이름 규칙 때문에 직접)
  const vp = info.project.name as ViewportName;
  const [w, h] = devRules.viewports[vp];
  await page.setViewportSize({ width: w, height: h });
  expect(routeOf(SCREEN), `dev-rules routes["${SCREEN}"] = rules privacy_page.path`).toBe(PP.path);
  const res = await page.goto(PP.path);
  expect(res?.status(), `${PP.path} 응답`).toBe(200);
  await page.waitForLoadState("load");
  await expect(page.locator(sel("privacy-doc")), "privacy-doc 1").toHaveCount(1, { timeout: 30_000 });
  await expectPreLoginShell(page, SCREEN, vp, `화면 ${SCREEN} ${vp}`);
  return vp;
}

async function box(l: Locator, what: string) {
  await expect(l, what).toBeVisible();
  const b = await l.boundingBox();
  expect(b, `${what} 위치`).not.toBeNull();
  return b!;
}

const near = (actual: number, expected: number, what: string, tol = 1) =>
  expect(Math.abs(actual - expected), `${what}: ${actual.toFixed(1)} ≈ ${expected} (±${tol})`).toBeLessThanOrEqual(tol);

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** 목차 링크들 (privacy-toc 안 a[href^="#"]) */
const tocLinks = (page: Page) => page.locator(sel("privacy-toc")).locator('a[href^="#"]');

/** 목차 i번째 링크가 가리키는 절 */
async function sectionOf(page: Page, i: number): Promise<Locator> {
  const href = await tocLinks(page).nth(i).getAttribute("href");
  expect(href, `목차 ${i + 1} href`).toMatch(/^#.+/);
  return page.locator(sel("privacy-doc")).locator(`[id="${href!.slice(1)}"]`);
}

// =====================================================================
// C1 — 구성 · 순서 · 문구
// =====================================================================

test(`[C1][S${SCREEN}] screens_required[${SCREEN}] 모두 보임 · 모바일 top-bar(nav-pill) → privacy-doc → web-footer / 데스크톱 web-header → privacy-doc → web-footer 순서`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const required = rules.screens_required[String(SCREEN)] as string[];
  expect(Array.isArray(required) && required.length > 0, `screens_required["${SCREEN}"]`).toBe(true);
  for (const c of required) await expect(page.locator(sel(c)).filter({ visible: true }), `${c} 보임 1`).toHaveCount(1);
  const head = vp === "desktop" ? "web-header" : "nav-pill";
  const order = [head, "privacy-doc", "web-footer"];
  let prev = -Infinity;
  for (const c of order) {
    const b = await box(page.locator(sel(c)), c);
    expect(b.y, `${order.join(" → ")}: ${c} 위치`).toBeGreaterThan(prev);
    prev = b.y + b.height - 1;
  }
  // 데스크톱 web-header 버튼 = 시안 19-desktop header-actions (로그인 button-outline · 회원가입 button-primary)
  if (vp === "desktop") {
    const header = page.locator(sel("web-header"));
    for (const name of ["button-outline", "button-primary"]) {
      const label = frame(vp).nodes.find((n) => n.path.includes(name) && n.name === "label")!.text!.characters;
      await expect(header.locator(sel(name)), `web-header ${name} '${label}'`).toHaveText(label);
    }
  }
});

test(`[C1][S${SCREEN}] privacy-doc = 제목 '개인정보 처리방침' → '시행일 ${D7_DATE}'(d7 §30) → privacy-toc → 절, 목차·절 = rules privacy_page.doc 순서 (${SECTIONS.join(" · ")})`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const doc = page.locator(sel("privacy-doc"));
  const title = PP.doc.match(/제목 '([^']+)'/)![1];
  const h1 = doc.getByRole("heading", { level: 1 });
  await expect(h1, "제목").toHaveText(title);
  const date = doc.getByText(`시행일 ${D7_DATE}`, { exact: true });
  await expect(date, `시행일 = d7 §30 ${D7_DATE} (시안 자리표시 날짜 아님)`).toBeVisible();
  const toc = doc.locator(sel("privacy-toc"));
  const tb = await box(h1, "제목");
  const db = await box(date, "시행일");
  const cb = await box(toc, "privacy-toc");
  expect(db.y, "제목 → 시행일").toBeGreaterThan(tb.y);
  expect(cb.y, "시행일 → privacy-toc").toBeGreaterThan(db.y);
  // 시안 글자 크기: doc-title · doc-date
  const ft = fnode(vp, "page-body/privacy-doc/doc-head/doc-title").text!;
  const fd = fnode(vp, "page-body/privacy-doc/doc-head/doc-date");
  expect(await css(h1, "font-size"), "제목 글자 크기 = 시안").toBe(`${ft.fontSize}px`);
  expect(await css(h1, "font-weight"), "제목 굵기 = 시안").toBe(String(ft.fontWeight));
  expect(await css(date, "font-size"), "시행일 글자 크기 = 시안").toBe(`${fd.text!.fontSize}px`);
  expect(await css(date, "color"), "시행일 색 = 시안 muted").toBe(hexToRgb(fd.fills![0]));

  // 목차
  const toctitle = fnode(vp, "page-body/privacy-doc/privacy-toc/toc-title").text!.characters;
  await expect(toc.getByText(toctitle, { exact: true }), `목차 머리 '${toctitle}'`).toBeVisible();
  await expect(tocLinks(page), "목차 링크 수 = 절 수").toHaveCount(SECTIONS.length);
  expect((await tocLinks(page).allInnerTexts()).map((t) => t.trim()), "목차 문구·순서").toEqual(SECTIONS);
  // 절: 목차 링크가 가리키는 곳 = 같은 제목, 위에서 아래 순서, 모두 목차 아래
  let prev = cb.y + cb.height;
  for (let i = 0; i < SECTIONS.length; i++) {
    const sec = await sectionOf(page, i);
    await expect(sec, `절 ${SECTIONS[i]}`).toHaveCount(1);
    await expect(sec.getByRole("heading").first(), `절 ${i + 1} 제목`).toHaveText(SECTIONS[i]);
    const b = await box(sec, `절 ${SECTIONS[i]}`);
    expect(b.y, `절 ${SECTIONS[i]} 은 앞 것 아래`).toBeGreaterThanOrEqual(prev - 1);
    prev = b.y + b.height;
  }
});

test(`[C1][S${SCREEN}] 6절 보호책임자 = d7 §30 '${D7_OFFICER}' · 7절 시행일 = ${D7_DATE} · 4절 국외 이전 고지 = d7 항목(${D7_ABROAD_ITEMS.join("·")}) + 이전 국가 '${D7_ABROAD_COUNTRY}'`, async ({ page }, info) => {
  await openPrivacy(page, info);
  const officer = SECTIONS.findIndex((s) => s.includes("보호책임자"));
  const effective = SECTIONS.findIndex((s) => s.includes("시행일"));
  const abroad = SECTIONS.findIndex((s) => s.includes("국외 이전"));
  expect([officer, effective, abroad].every((i) => i >= 0), "rules 절에 보호책임자·시행일·국외 이전").toBe(true);
  await expect(await sectionOf(page, officer), "보호책임자 절").toContainText(D7_OFFICER);
  await expect(await sectionOf(page, effective), "시행일 절").toContainText(D7_DATE);
  const text = await (await sectionOf(page, abroad)).innerText();
  expect(text, `국외 이전 국가 ${D7_ABROAD_COUNTRY}`).toContain(D7_ABROAD_COUNTRY);
  // 항목마다 낱말이 모두 문장에 있어야 한다 (예: '보유 기간' → 보유 · 기간)
  for (const item of D7_ABROAD_ITEMS) for (const w of item.split(" ")) expect(text, `국외 이전 고지 항목 '${item}' (${w})`).toContain(w);
  // 보호책임자 이메일 = 5절(이용자 권리)이 안내하는 요청 창구 — 문서 안에 1곳 이상
  await expect(page.locator(sel("privacy-doc")), "문서에 보호책임자 값").toContainText(D7_OFFICER);
});

test(`[C1][S${SCREEN}] privacy-table = 4절에만 1개 · 업체 ${PROCESSORS.map((p) => p.name).join(" · ")} — 데스크톱 data-table 열 ${TABLE_COLS.join(" · ")} / 모바일 업체마다 canvas-soft 카드`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const abroad = SECTIONS.findIndex((s) => s.includes("국외 이전"));
  await expect(page.locator(sel("privacy-table")), "privacy-table 1").toHaveCount(1);
  await expect((await sectionOf(page, abroad)).locator(sel("privacy-table")), "privacy-table 은 4절 안").toHaveCount(1);
  const tbl = page.locator(sel("privacy-table"));
  const dt = tbl.locator(sel("data-table"));
  if (vp === "desktop") {
    await expect(dt, "데스크톱 data-table 보임").toBeVisible();
    expect((await dt.locator("thead th").allInnerTexts()).map((t) => t.trim()), "열 = rules privacy_page.table").toEqual(TABLE_COLS);
    const rows = dt.locator("tbody tr");
    await expect(rows, "행 = 업체 수").toHaveCount(PROCESSORS.length);
    for (let i = 0; i < PROCESSORS.length; i++) {
      const cells = rows.nth(i).locator("td");
      await expect(cells, `행 ${i + 1} 칸 수`).toHaveCount(TABLE_COLS.length);
      await expect(cells.nth(0), "업체").toHaveText(PROCESSORS[i].name);
      await expect(cells.nth(1), `${PROCESSORS[i].name} 하는 일`).toContainText(PROCESSORS[i].role);
      await expect(cells.nth(2), `${PROCESSORS[i].name} 위치`).toContainText(PROCESSORS[i].location);
    }
    const docW = (await box(page.locator(sel("privacy-doc")), "privacy-doc")).width;
    near((await box(dt, "data-table")).width, docW, "data-table 폭 = 읽기 단 폭 (시안 data-table 720)");
  } else {
    await expect(dt, "모바일 data-table 숨김").toBeHidden();
    const soft = hexToRgb(fnode(vp, "page-body/privacy-doc/doc-sections/doc-section/section-content/privacy-table/vendor-card").fills![0]);
    const cards = await tbl.evaluate((root, bg) => {
      return [...root.querySelectorAll<HTMLElement>("*")]
        .filter((el) => el.offsetParent !== null && getComputedStyle(el).backgroundColor === bg)
        .map((el) => {
          const s = getComputedStyle(el);
          return { text: el.innerText, radius: s.borderTopLeftRadius, pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft] };
        });
    }, soft);
    expect(cards.length, "canvas-soft 카드 = 업체 수").toBe(PROCESSORS.length);
    const fc = fnode(vp, "page-body/privacy-doc/doc-sections/doc-section/section-content/privacy-table/vendor-card");
    for (let i = 0; i < PROCESSORS.length; i++) {
      const p = PROCESSORS[i];
      for (const v of [p.name, p.role, p.location]) expect(cards[i].text, `카드 ${i + 1} ${v}`).toContain(v);
      expect(cards[i].radius, "카드 radius = 시안").toBe(`${fc.cornerRadius}px`);
      expect(cards[i].pad, "카드 안쪽 = 시안").toEqual(fc.padding!.map((x) => `${x}px`));
    }
  }
});

test(`[C1][S${SCREEN}] web-footer footer-links = rules footer.links (${FOOTER.links.join(" · ")}) · '${FOOTER.links[0]}' → ${PP.path}`, async ({ page }, info) => {
  await openPrivacy(page, info);
  const links = page.locator(sel("web-footer")).locator(sel(FOOTER.component)).locator("a");
  expect((await links.allInnerTexts()).map((t) => t.replace("↗", "").trim()), "footer-links").toEqual(FOOTER.links);
  expect(new URL((await links.first().getAttribute("href"))!, "http://x").pathname, "처리방침 링크").toBe(PP.path);
});

// =====================================================================
// C3 — 여백 · 읽기 단 폭 · 목차 단 (시안 19-mobile · 19-desktop)
// =====================================================================

test(`[C3][S${SCREEN}] 읽기 단: 데스크톱 폭 = rules '최대 ${READING_MAX}' · 가운데 / 모바일 좌우 = 시안 page-body`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const fw = fnode(vp, "page-body/privacy-doc").width;
  const vw = page.viewportSize()!.width;
  const b = await box(page.locator(sel("privacy-doc")), "privacy-doc");
  if (vp === "desktop") {
    expect(fw, `시안 19-desktop privacy-doc 폭 = rules 최대 ${READING_MAX}`).toBe(READING_MAX);
    near(b.width, READING_MAX, "privacy-doc 폭");
    near(b.x, (vw - READING_MAX) / 2, "privacy-doc 가운데");
  } else {
    near(b.width, fw, "privacy-doc 폭 = 시안 19-mobile");
    near(b.x, (frame(vp).width - fw) / 2, "privacy-doc 왼쪽 여백 = 시안");
  }
});

test(`[C3][S${SCREEN}] 세로 여백 = 시안: 머리 → 문서(page-body 위) · 제목·시행일 사이 · 문서 사이 · 목차 → 절 · 절 사이(모바일 24 / 데스크톱 12) · 문서 → web-footer`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const body = fnode(vp, "page-body");
  const docN = fnode(vp, "page-body/privacy-doc");
  const head = fnode(vp, "page-body/privacy-doc/doc-head");
  const secs = fnode(vp, "page-body/privacy-doc/doc-sections");
  const doc = page.locator(sel("privacy-doc"));
  const db = await box(doc, "privacy-doc");

  // 머리 → 문서
  if (vp === "desktop") {
    const hb = await box(page.locator(sel("web-header")), "web-header");
    near(hb.height, fnode(vp, "web-header").height, "web-header 높이 = 시안");
    near(db.y - (hb.y + hb.height), body.padding![0], "web-header → privacy-doc = page-body 위");
  } else {
    const top = fnode(vp, "top-bar");
    const nb = await box(page.locator(sel("nav-pill")), "nav-pill");
    near(nb.y, top.padding![0], "top-bar 위 → nav-pill");
    near(nb.x, top.padding![3], "top-bar 왼쪽 → nav-pill");
    near(nb.width, fnode(vp, "top-bar/nav-pill").width, "nav-pill 폭 = 시안");
    near(db.y - (nb.y + nb.height), top.padding![2] + body.padding![0], "nav-pill → privacy-doc = top-bar 아래 + page-body 위");
  }
  // 제목 → 시행일 (doc-head gap)
  const h1 = await box(doc.getByRole("heading", { level: 1 }), "제목");
  const date = await box(doc.getByText(`시행일 ${D7_DATE}`, { exact: true }), "시행일");
  near(date.y - (h1.y + h1.height), head.gap!, "제목 → 시행일 = doc-head 사이");
  // 시행일 → 목차 (privacy-doc gap)
  const toc = await box(page.locator(sel("privacy-toc")), "privacy-toc");
  near(toc.y - (date.y + date.height), docN.gap!, "doc-head → privacy-toc = privacy-doc 사이");
  // 목차 → 첫 절 (privacy-doc gap + doc-sections 위)
  const first = await box(await sectionOf(page, 0), "절 1");
  near(first.y - (toc.y + toc.height), docN.gap! + secs.padding![0], "privacy-toc → 절 1 = privacy-doc 사이 + doc-sections 위");
  // 절 사이
  for (let i = 1; i < SECTIONS.length; i++) {
    const a = await box(await sectionOf(page, i - 1), `절 ${i}`);
    const b = await box(await sectionOf(page, i), `절 ${i + 1}`);
    near(b.y - (a.y + a.height), secs.gap!, `절 ${i} → ${i + 1} = doc-sections 사이 (${vp})`);
  }
  // 문서 → web-footer (page-body gap)
  const fb = await box(page.locator(sel("web-footer")), "web-footer");
  near(fb.y - (db.y + db.height), body.gap!, "privacy-doc → web-footer = page-body 사이");
  near(fb.width, fnode(vp, "page-body/web-footer").width, "web-footer 폭 = 시안 (전폭)");
});

test(`[C3][S${SCREEN}] privacy-toc 상자 = 시안 (canvas-soft · radius · 안쪽 · 링크 높이) · 단 수 = 시안 toc-col (모바일 ${tocCols("mobile").join("+")} / 데스크톱 ${tocCols("desktop").join("+")})`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const tn = fnode(vp, "page-body/privacy-doc/privacy-toc");
  const toc = page.locator(sel("privacy-toc"));
  expect(await css(toc, "background-color"), "목차 바탕 = 시안 canvas-soft").toBe(hexToRgb(tn.fills![0]));
  expect(await css(toc, "border-top-left-radius"), "목차 radius = 시안").toBe(`${tn.cornerRadius}px`);
  const pad = await toc.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
  });
  expect(pad, "목차 안쪽 = 시안").toEqual(tn.padding!.map((x) => `${x}px`));

  const cols = tocCols(vp);
  expect(cols.reduce((a, b) => a + b, 0), "시안 목차 링크 수 = rules 절 수").toBe(SECTIONS.length);
  const linkH = frame(vp).nodes.find((n) => n.name === "toc-link")!.height;
  const colGap = frame(vp).nodes.find((n) => n.name === "toc-col")!.gap ?? 0;
  const boxes = [];
  for (let i = 0; i < SECTIONS.length; i++) boxes.push(await box(tocLinks(page).nth(i), `목차 ${i + 1}`));
  for (const b of boxes) near(b.height, linkH, "목차 링크 높이 = 시안 toc-link");
  // 단 = 왼쪽 위치가 같은 링크 묶음, 위에서 아래로 채운 뒤 다음 단 (시안 toc-col 순서)
  const xs = [...new Set(boxes.map((b) => Math.round(b.x)))].sort((a, b) => a - b);
  expect(xs.length, `목차 단 수 (${vp})`).toBe(cols.length);
  let k = 0;
  for (let c = 0; c < cols.length; c++) {
    for (let j = 0; j < cols[c]; j++, k++) {
      near(boxes[k].x, xs[c], `목차 ${k + 1} 은 ${c + 1}단`);
      if (j > 0) near(boxes[k].y - boxes[k - 1].y, linkH + colGap, `목차 ${k} → ${k + 1} 줄 간격 = 링크 높이 + toc-col 사이`);
    }
  }
  if (cols.length > 1) {
    const gap = fnode(vp, "page-body/privacy-doc/privacy-toc/toc-columns").gap!;
    const firstColRight = boxes[0].x + boxes[0].width;
    near(boxes[cols[0]].x - firstColRight, gap, "단 사이 = 시안 toc-columns");
  }
});

// 시안 19-desktop web-footer 안쪽 위아래 12 (15-desktop 은 24). rules footer.layout 에 여백 값이 없으므로 화면 19 는 19 프레임이 정답.
test(`[C3][S${SCREEN}] web-footer 안쪽 위아래 = 시안 ${SCREEN}-{폭} web-footer (모바일 ${fnode("mobile", "page-body/web-footer").padding![0]} / 데스크톱 ${fnode("desktop", "page-body/web-footer").padding![0]}, 위 hairline 포함)`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const fn = fnode(vp, "page-body/web-footer");
  const f = page.locator(sel("web-footer"));
  const s = await f.evaluate((el) => {
    const c = getComputedStyle(el);
    return { top: parseFloat(c.paddingTop) + parseFloat(c.borderTopWidth), bottom: parseFloat(c.paddingBottom) };
  });
  near(s.top, fn.padding![0], `web-footer 위 안쪽 (${vp})`);
  near(s.bottom, fn.padding![2], `web-footer 아래 안쪽 (${vp})`);
  near((await box(f, "web-footer")).height, fn.height, `web-footer 높이 = 시안 ${SCREEN}-${vp}`, 2);
});

// =====================================================================
// C2 — 탭바
// =====================================================================

test(`[C2][S${SCREEN}] ${rules.tab_bar.component}·${rules.tab_bar.item} 0 (화면 ${SCREEN} 은 tab_bar.mobile_screens 밖) · app-sidebar 0`, async ({ page }, info) => {
  const vp = await openPrivacy(page, info);
  const tb = rules.tab_bar;
  const shown = vp === "mobile" && tb.mobile_screens.includes(SCREEN);
  expect(shown, "rules tab_bar.mobile_screens 에 19 없음").toBe(false);
  await expect(page.locator(sel(tb.component)), `${vp} ${tb.component}`).toHaveCount(0);
  await expect(page.locator(sel(tb.item)), `${vp} ${tb.item}`).toHaveCount(0);
  await expect(page.locator(sel("app-sidebar")), `${vp} app-sidebar`).toHaveCount(0);
});

// =====================================================================
// R-ui · N1-ui — 로그인 사용자도 그대로 (dev-rules route_auth["19"] · d7 §30)
// =====================================================================

test(`[R-ui][S${SCREEN}] 로그인 전 화면 ${SCREEN}: roles R1~R7 역할 제한 컴포넌트 상한`, async ({ page }, info) => {
  await openPrivacy(page, info);
  const checks = roleChecks(SCREEN, null);
  expect(checks.length, "rules.json roles 에서 만든 검사").toBeGreaterThan(0);
  for (const c of checks) {
    const n = await countComponent(page, c.component);
    if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
    else expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
  }
});

/** 로그인 전·후 같아야 하는 컴포넌트 (셸 + 문서) */
const SAME = ["web-header", "nav-pill", "privacy-doc", "privacy-toc", "privacy-table", "web-footer", FOOTER.component, "app-sidebar", "tab-bar", "nav-account-menu", "button-outline", "button-primary"];

const ROLES: Role[] = ["student", "teacher", "admin", "schoolB"];
for (const role of ROLES) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} 로그인 상태로 ${PP.path} → 200 · 리다이렉트 없음 · 로그인 전과 같은 문서(${SAME.join("·")} 개수) · 학교명·seed 데이터 미노출`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    expect((devRules as unknown as { route_auth: Record<string, string> }).route_auth[String(SCREEN)], "route_auth 공개").toMatch(/^로그인 전·후 모두/);
    const anon = await anonContext(browser, info);
    const expected: Record<string, number> = {};
    try {
      const p = await anon.newPage();
      await p.goto(PP.path);
      await p.waitForLoadState("load");
      await expect(p.locator(sel("privacy-doc"))).toHaveCount(1, { timeout: 30_000 });
      await expectPreLoginShell(p, SCREEN, info.project.name as ViewportName);
      for (const c of SAME) expected[c] = await countComponent(p, c);
    } finally {
      await anon.close();
    }

    const { context, page, response } = await openAs(browser, info, role, SCREEN);
    try {
      expect(response?.status(), `${PP.path} 응답`).toBe(200);
      expect(response!.request().redirectedFrom(), "리다이렉트 없음").toBeNull();
      expect(new URL(page.url()).pathname, "처리방침에 머무름").toBe(PP.path);
      await expect(page.locator(sel("privacy-doc")), "privacy-doc").toHaveCount(1, { timeout: 30_000 });
      await expectPreLoginShell(page, SCREEN, info.project.name as ViewportName, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      for (const c of SAME) expect(await countComponent(page, c), `${c} = 로그인 전 ${expected[c]}`).toBe(expected[c]);
      for (const c of roleChecks(SCREEN, PROFILE_ROLE[role])) {
        const n = await countComponent(page, c.component);
        if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
      }
      const text = await page.locator("body").innerText();
      expect([...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])], "학교명 없음").toHaveLength(0);
      for (const s of seedRows("schools")) expect(text, `seed 학교명 ${s.name}`).not.toContain(s.name);
      for (const r of seedRows("reagents")) expect(text, `seed 시약명 ${r.name}`).not.toContain(r.name);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// V1 (보고용 스크린샷, 실패 조건 아님)
// =====================================================================

test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(PP.path);
  await page.waitForLoadState("load");
  await page.locator(sel("privacy-doc")).waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${vp}.png`), fullPage: true });
});
