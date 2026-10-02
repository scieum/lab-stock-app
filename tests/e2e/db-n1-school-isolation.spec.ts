// [N1-db] 학교 간 데이터 격리 — 실제 RLS (anon 키 + 각 계정 로그인). service role 미사용.
// 기준: harness/d7-data.md §2, design/rules.json never.N1
import { test, expect } from "@playwright/test";
import {
  ROLE_LABEL,
  SCHOOL_A_ROLES,
  SCHOOL_TABLES,
  anonClient,
  ensureUsageLog,
  harmlessPatch,
  ownIds,
  ownReagents,
  pickReagent,
  REAGENT_SLOT,
  signIn,
  uniqueTag,
  type Role,
  type Session,
  type SchoolTable,
} from "./db-helpers";

test.describe.configure({ mode: "default" });

test.beforeAll(async ({}, info) => {
  // 양쪽 학교 모두 usage_logs 가 ≥1행 있어야 교차 조회 0행이 의미 있다
  await ensureUsageLog(await signIn("teacher"), info);
  await ensureUsageLog(await signIn("schoolB"), info);
});

/** 자기 학교 계정이 각 테이블에서 ≥1행을 본다 (양성 대조군) */
async function victimRows(owner: Session, table: SchoolTable): Promise<Record<string, unknown>[]> {
  const { data, error } = await owner.client.from(table).select("*").order("id");
  expect(error, `${ROLE_LABEL[owner.role]} 자기 학교 ${table} 조회`).toBeNull();
  expect((data ?? []).length, `${ROLE_LABEL[owner.role]} 자기 학교 ${table} 양성 대조군 ≥1행`).toBeGreaterThan(0);
  return data as Record<string, unknown>[];
}

/** update 대상: 다른 테스트가 만들고 지우는 임시 행이 아닌, 가장 오래된 행 */
async function victimTarget(owner: Session, table: SchoolTable): Promise<Record<string, unknown>> {
  if (table === "cabinet_slots") {
    const cab = await owner.client.from("cabinets").select("id").order("created_at").order("id").limit(1).single();
    expect(cab.error).toBeNull();
    const slot = await owner.client.from("cabinet_slots").select("*").eq("cabinet_id", cab.data!.id).order("id").limit(1).single();
    expect(slot.error).toBeNull();
    return slot.data as Record<string, unknown>;
  }
  const timeCol = table === "usage_logs" ? "used_at" : "created_at";
  const row = await owner.client.from(table).select("*").order(timeCol).order("id").limit(1).single();
  expect(row.error, `${ROLE_LABEL[owner.role]} 자기 학교 ${table} 양성 대조군`).toBeNull();
  return row.data as Record<string, unknown>;
}

/** stock 은 재고 테스트가 바꿀 수 있으므로 비교에서 뺀다 (patch 는 stock 을 건드리지 않음) */
function stable(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const { stock: _stock, ...rest } = row;
  void _stock;
  return rest;
}

const PAIRS: { attacker: Role; owner: Role }[] = [
  ...SCHOOL_A_ROLES.map((r) => ({ attacker: r, owner: "schoolB" as Role })),
  { attacker: "schoolB", owner: "teacher" },
];

for (const { attacker, owner } of PAIRS) {
  const ownerSchool = owner === "schoolB" ? "학교 B" : "학교 A";
  for (const table of SCHOOL_TABLES) {
    test(`[N1-db][S*] ${ROLE_LABEL[attacker]}로 ${ownerSchool} ${table} 조회 0행`, async () => {
      const a = await signIn(attacker);
      const o = await signIn(owner);
      expect(a.schoolId).not.toBe(o.schoolId);
      const victim = await victimRows(o, table);
      const victimIds = victim.map((r) => r.id as string);

      const bySchool = await a.client.from(table).select("id").eq("school_id", o.schoolId);
      expect(bySchool.error).toBeNull();
      expect(bySchool.data ?? []).toHaveLength(0);

      const byId = await a.client.from(table).select("id").in("id", victimIds);
      expect(byId.error).toBeNull();
      expect(byId.data ?? []).toHaveLength(0);

      // 전체 조회에도 상대 학교 행이 섞이지 않는다 (자기 학교 행만)
      const all = await a.client.from(table).select("id, school_id");
      expect(all.error).toBeNull();
      const foreign = (all.data ?? []).filter((r) => r.school_id !== a.schoolId);
      expect(foreign).toHaveLength(0);
    });

    test(`[N1-db][S*] ${ROLE_LABEL[attacker]}로 ${ownerSchool} ${table} update 0행`, async () => {
      const a = await signIn(attacker);
      const o = await signIn(owner);
      const target = await victimTarget(o, table);

      const res = await a.client.from(table).update(harmlessPatch(table)).eq("id", target.id as string).select("id");
      // RLS로 대상이 안 보이면 error 없이 0행, 또는 권한 오류 — 어느 쪽이든 바뀐 행은 0
      expect(res.error ? [] : res.data ?? []).toHaveLength(0);

      const bySchool = await a.client
        .from(table)
        .update(harmlessPatch(table))
        .eq("school_id", o.schoolId)
        .select("id");
      expect(bySchool.error ? [] : bySchool.data ?? []).toHaveLength(0);

      // 소유 학교 계정으로 다시 읽어 실제로 바뀌지 않았는지 확인
      const after = await o.client.from(table).select("*").eq("id", target.id as string).single();
      expect(after.error).toBeNull();
      expect(stable(after.data)).toEqual(stable(target));
    });
  }

  test(`[N1-db][S*] ${ROLE_LABEL[attacker]}로 ${ownerSchool} school_id 로 reagents insert 거부`, async ({}, info) => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    const name = `N1-${uniqueTag(info)}`;
    const res = await a.client.from("reagents").insert({ school_id: o.schoolId, name, unit: "g", stock: 1 }).select("id");
    expect(res.error, "다른 학교 school_id insert 는 오류여야 함").not.toBeNull();
    const leaked = await o.client.from("reagents").select("id").eq("name", name);
    expect(leaked.data ?? []).toHaveLength(0);
  });

  test(`[N1-db][S*] ${ROLE_LABEL[attacker]}로 ${ownerSchool} school_id 로 usage_logs insert 거부`, async () => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    const reagent = (await ownReagents(o))[0];
    const res = await a.client
      .from("usage_logs")
      .insert({ school_id: o.schoolId, reagent_id: reagent.id, user_id: a.userId, amount: 1 })
      .select("id");
    expect(res.error, "다른 학교 usage_logs insert 는 오류여야 함").not.toBeNull();
  });

  test(`[N1-db][S*] ${ROLE_LABEL[attacker]}로 ${ownerSchool} 시약 record_usage 거부`, async ({}, info) => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    const reagent = pickReagent(await ownReagents(o), REAGENT_SLOT.ensureLog, info);
    const logsBefore = await o.client.from("usage_logs").select("id").eq("reagent_id", reagent.id);
    const res = await a.client.rpc("record_usage", { reagent_id: reagent.id, amount: 1 });
    expect(res.error, "다른 학교 시약 record_usage 는 오류여야 함").not.toBeNull();
    const stockAfter = (await ownReagents(o)).find((r) => r.id === reagent.id)?.stock;
    expect(stockAfter).toBe(reagent.stock);
    const logsAfter = await o.client.from("usage_logs").select("id").eq("reagent_id", reagent.id);
    expect((logsAfter.data ?? []).length).toBe((logsBefore.data ?? []).length);
  });
}

test(`[N1-db][S*] 학교A admin으로 학교 B profiles 조회·update 0행`, async () => {
  const admin = await signIn("admin");
  const b = await signIn("schoolB");
  const sel = await admin.client.from("profiles").select("user_id").eq("school_id", b.schoolId);
  expect(sel.error).toBeNull();
  expect(sel.data ?? []).toHaveLength(0);
  const upd = await admin.client
    .from("profiles")
    .update({ display_name: "N1-db-침범" })
    .eq("user_id", b.userId)
    .select("user_id");
  expect(upd.error ? [] : upd.data ?? []).toHaveLength(0);
  // 대조군: admin은 자기 학교 profiles 를 본다
  expect((await ownIds(admin, "profiles")).length).toBeGreaterThan(1);
});

test(`[N1-db][S*] 로그인 안 한 anon은 업무 테이블 0행`, async () => {
  const anon = anonClient();
  for (const table of [...SCHOOL_TABLES, "schools", "profiles"]) {
    const res = await anon.from(table).select("*").limit(5);
    expect(res.error ? [] : res.data ?? [], `anon ${table}`).toHaveLength(0);
  }
});
