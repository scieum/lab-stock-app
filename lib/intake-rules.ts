// 화면 7 입고·시약 등록 입력 규칙 (harness/d7-data.md §6).
// DB 함수 record_intake·register_reagent 가 같은 검사를 다시 한다 — 여기는 사용자에게 보일 안내를 만드는 용도.

/** 종류 = 보관 분류 8종 (design/rules.json cabinet.storage_classes) */
export const STORAGE_CLASSES = ["유기", "산", "염기", "산화제", "인화성", "무기염", "독성", "기타"] as const;
export type StorageClass = (typeof STORAGE_CLASSES)[number];

/** 단위 (d7 §6) */
export const INTAKE_UNITS = ["병", "mL", "g"] as const;
export type IntakeUnit = (typeof INTAKE_UNITS)[number];

export const REAGENT_NAME_MAX = 80;
export const INTAKE_AMOUNT_MIN = 1;
export const INTAKE_AMOUNT_MAX = 1_000_000;
export const MSDS_URL_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type RecordIntakeInput = {
  reagentId: string;
  amount: number;
  /** YYYY-MM-DD */
  intakeDate: string;
};

export type RegisterReagentInput = {
  name: string;
  storageClass: string;
  stock: number;
  unit: string;
  /** YYYY-MM-DD */
  intakeDate: string;
  /** 비우면 null */
  msdsUrl?: string | null;
};

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** 실제로 있는 날짜인 YYYY-MM-DD 인지 (2026-02-30 같은 값은 거부) */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 수량: 소수 허용, 1 이상 (record_usage 와 같이 numeric) */
function amountError(n: unknown, label: string): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return `${label}은 숫자로 입력해 주세요`;
  if (n < INTAKE_AMOUNT_MIN) return `${label}은 ${INTAKE_AMOUNT_MIN} 이상 입력해 주세요`;
  if (n > INTAKE_AMOUNT_MAX) return `${label}이 너무 커요`;
  return null;
}

export function checkRecordIntake(input: RecordIntakeInput): Checked<RecordIntakeInput> {
  if (typeof input.reagentId !== "string" || !UUID_RE.test(input.reagentId)) {
    return { ok: false, error: "시약을 찾을 수 없어요" };
  }
  const amount = amountError(input.amount, "입고 수량");
  if (amount) return { ok: false, error: amount };
  if (!isIsoDate(input.intakeDate)) return { ok: false, error: "입고일을 확인해 주세요" };
  return { ok: true, value: { reagentId: input.reagentId, amount: input.amount, intakeDate: input.intakeDate } };
}

export function checkRegisterReagent(
  input: RegisterReagentInput,
): Checked<Required<RegisterReagentInput>> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name === "") return { ok: false, error: "시약명을 입력해 주세요" };
  if (name.length > REAGENT_NAME_MAX) return { ok: false, error: `시약명은 ${REAGENT_NAME_MAX}자까지 쓸 수 있어요` };
  if (!(STORAGE_CLASSES as readonly string[]).includes(input.storageClass)) {
    return { ok: false, error: "종류를 선택해 주세요" };
  }
  const stock = amountError(input.stock, "재고량");
  if (stock) return { ok: false, error: stock };
  if (!(INTAKE_UNITS as readonly string[]).includes(input.unit)) {
    return { ok: false, error: "단위를 선택해 주세요" };
  }
  if (!isIsoDate(input.intakeDate)) return { ok: false, error: "입고일을 확인해 주세요" };
  const url = typeof input.msdsUrl === "string" ? input.msdsUrl.trim() : "";
  if (url !== "" && (!/^https?:\/\/\S+$/i.test(url) || url.length > MSDS_URL_MAX)) {
    return { ok: false, error: "MSDS 주소는 http:// 또는 https:// 로 시작해야 해요" };
  }
  return {
    ok: true,
    value: {
      name,
      storageClass: input.storageClass,
      stock: input.stock,
      unit: input.unit,
      intakeDate: input.intakeDate,
      msdsUrl: url === "" ? null : url,
    },
  };
}
