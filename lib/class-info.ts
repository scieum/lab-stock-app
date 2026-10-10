// 수업 기록 규칙 (d7 §24, design/rules.json 1.25 class_info). 순수 함수 — 서버·클라이언트 공용.
// DB(record_usage_batch · usage_logs 검사)가 같은 검사를 다시 한다 — 여기는 입력 정리와 화면 안내용.

/** 반 범위 (rules class_info.classes) */
export const CLASS_NO_MIN = 1;
export const CLASS_NO_MAX = 20;
/** 수업명 최대 글자 수 (rules class_info.subject_max) */
export const CLASS_SUBJECT_MAX = 20;
/** 최근 조합 칩 최대 개수 (rules class_info.recent) */
export const RECENT_CLASS_MAX = 3;

/**
 * 학교급별 최고 학년 (rules class_info.grades: 초 1~6, 중·고 1~3). schools 에 학교급 열이 없어 NEIS 공식 학교명으로 판단한다
 * — DB private.school_max_grade 와 같은 규칙: 이름에 "초등학교" → 6, "중학교"·"고등학교" → 3, 모르면 6.
 */
export function maxGradeForSchool(schoolName: string | null | undefined): number {
  const name = schoolName ?? "";
  if (name.includes("초등학교")) return 6;
  if (name.includes("중학교") || name.includes("고등학교")) return 3;
  return 6;
}

export type ClassInfo = {
  grade: number | null;
  classNo: number | null;
  subject: string | null;
};

export const EMPTY_CLASS: ClassInfo = { grade: null, classNo: null, subject: null };

/** 수업명 정리: 공백 여러 개 → 하나, 앞뒤 공백 제거, 비면 null (DB 와 같은 정리) */
export function normalizeClassSubject(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** "1학년 2반 · 통합과학" — 있는 것만 ("1학년", "통합과학", "2반"). 하나도 없으면 "" */
export function classLabelText(c: Partial<ClassInfo> | null | undefined): string {
  if (!c) return "";
  const head = [c.grade ? `${c.grade}학년` : "", c.classNo ? `${c.classNo}반` : ""].filter(Boolean).join(" ");
  return [head, c.subject ?? ""].filter(Boolean).join(" · ");
}

export function hasClassInfo(c: Partial<ClassInfo> | null | undefined): boolean {
  return Boolean(c && (c.grade || c.classNo || c.subject));
}

export function sameClass(a: ClassInfo, b: ClassInfo): boolean {
  return a.grade === b.grade && a.classNo === b.classNo && (a.subject ?? null) === (b.subject ?? null);
}

/** 최근 기록(최신순)에서 서로 다른 조합 최대 3개 (빈 조합은 뺀다) */
export function recentClassCombos(rows: readonly Partial<ClassInfo>[], max = RECENT_CLASS_MAX): ClassInfo[] {
  const out: ClassInfo[] = [];
  for (const r of rows) {
    const c: ClassInfo = { grade: r.grade ?? null, classNo: r.classNo ?? null, subject: normalizeClassSubject(r.subject) };
    if (!hasClassInfo(c)) continue;
    if (out.some((o) => sameClass(o, c))) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

export type CheckedClass = { ok: true; value: ClassInfo } | { ok: false; error: string; field: "grade" | "classNo" | "subject" };

function toInt(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,2}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) ? n : undefined;
}

/** 학년(1~maxGrade) · 반(1~20) · 수업명(1~20자, 공백 정리) — 셋 다 선택 */
export function checkClassInfo(input: { grade?: unknown; classNo?: unknown; subject?: unknown }, maxGrade: number): CheckedClass {
  const grade = toInt(input.grade);
  if (grade === undefined || (grade !== null && (grade < 1 || grade > maxGrade))) {
    return { ok: false, error: `학년은 1~${maxGrade}학년 중에서 골라 주세요`, field: "grade" };
  }
  const classNo = toInt(input.classNo);
  if (classNo === undefined || (classNo !== null && (classNo < CLASS_NO_MIN || classNo > CLASS_NO_MAX))) {
    return { ok: false, error: `반은 ${CLASS_NO_MIN}~${CLASS_NO_MAX}반 중에서 골라 주세요`, field: "classNo" };
  }
  if (input.subject !== undefined && input.subject !== null && typeof input.subject !== "string") {
    return { ok: false, error: "수업명을 확인해 주세요", field: "subject" };
  }
  const subject = normalizeClassSubject(input.subject);
  if (subject !== null && Array.from(subject).length > CLASS_SUBJECT_MAX) {
    return { ok: false, error: `수업명은 ${CLASS_SUBJECT_MAX}자까지 쓸 수 있어요`, field: "subject" };
  }
  return { ok: true, value: { grade, classNo, subject } };
}

/* ───────── 화면 10 class-filter ───────── */

export type ClassFilter = { grade: number | null; classNo: number | null };
export const EMPTY_CLASS_FILTER: ClassFilter = { grade: null, classNo: null };

/** 주소창 ?grade · ?cls → 필터 (잘못된 값은 무시). 반은 학년이 있을 때만 */
export function parseClassFilter(grade: unknown, cls: unknown, maxGrade = 6): ClassFilter {
  const g = toInt(grade);
  const c = toInt(cls);
  const okGrade = typeof g === "number" && g >= 1 && g <= maxGrade ? g : null;
  const okClass = okGrade !== null && typeof c === "number" && c >= CLASS_NO_MIN && c <= CLASS_NO_MAX ? c : null;
  return { grade: okGrade, classNo: okClass };
}

/** class-filter 버튼 글자: "반: 전체" · "반: 1학년" · "반: 1학년 2반" */
export function classFilterLabel(f: ClassFilter): string {
  if (f.grade === null) return "반: 전체";
  return f.classNo === null ? `반: ${f.grade}학년` : `반: ${f.grade}학년 ${f.classNo}반`;
}
