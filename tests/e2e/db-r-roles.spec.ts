// [R-db] 역할별 DB 권한 — 실제 RLS (anon 키 + 각 계정 로그인). service role 미사용.
// 기준: harness/d7-data.md §2 (reagents insert·stock 증가 / cabinets·cabinet_slots 변경 = teacher·admin,
//       usage_logs insert = 자기 user_id, 재고 차감 = record_usage 하나), design/rules.json roles.
// 바꾼 데이터는 전부 원상복구한다 (임시 행 삭제, stock 절대값 복원). record_usage 성공 로그 1행은 남는다.
import { test, expect } from "@playwright/test";
import {
  REAGENT_SLOT,
  ROLE_LABEL,
  ownReagents,
  pickReagent,
  readStock,
  restoreStock,
  signIn,
  uniqueTag,
  type Role,
  type Session,
} from "./db-helpers";

test.describe.configure({ mode: "default" });

async function oldestCabinet(s: Session): Promise<Record<string, unknown>> {
  const r = await s.client.from("cabinets").select("*").order("created_at").order("id").limit(1).single();
  expect(r.error, "자기 학교 시약장 ≥1개 (seed)").toBeNull();
  return r.data as Record<string, unknown>;
}

async function oldestSlot(s: Session): Promise<Record<string, unknown>> {
  const cab = await oldestCabinet(s);
  const r = await s.client.from("cabinet_slots").select("*").eq("cabinet_id", cab.id as string).order("id").limit(1).single();
  expect(r.error, "자기 학교 시약장 칸 ≥1개 (seed)").toBeNull();
  return r.data as Record<string, unknown>;
}

/** 교사 계정으로 임시 시약장 생성 (칸 insert 시험용 — unique 충돌이 아닌 RLS 로만 거부되게 빈 시약장) */
async function tempCabinet(staff: Session, tag: string): Promise<string> {
  const r = await staff.client
    .from("cabinets")
    .insert({ school_id: staff.schoolId, label: `R-db-${tag}`, door_type: "양문형", shelves: 3 })
    .select("id")
    .single();
  expect(r.error, "교사 임시 시약장 생성").toBeNull();
  return r.data!.id as string;
}

async function dropCabinet(staff: Session, id: string): Promise<void> {
  const r = await staff.client.from("cabinets").delete().eq("id", id).select("id");
  expect(r.error).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
}

async function tempReagent(staff: Session, tag: string): Promise<string> {
  const r = await staff.client
    .from("reagents")
    .insert({ school_id: staff.schoolId, name: `R-db-${tag}`, unit: "g", stock: 10, min_stock: 0 })
    .select("id")
    .single();
  expect(r.error, "교사 임시 시약 생성").toBeNull();
  return r.data!.id as string;
}

async function dropReagent(staff: Session, id: string): Promise<void> {
  const r = await staff.client.from("reagents").delete().eq("id", id).select("id");
  expect(r.error).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
}

// ---------- 학생: 거부 ----------

test(`[R-db][S*] 학생 reagents insert 거부`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  expect(st.profileRole).toBe("student");
  const name = `R-db-${uniqueTag(info)}`;
  const res = await st.client.from("reagents").insert({ school_id: st.schoolId, name, unit: "g", stock: 5 }).select("id");
  const leaked = await t.client.from("reagents").select("id").eq("name", name);
  for (const row of leaked.data ?? []) await dropReagent(t, row.id as string);
  expect(res.error, "학생 reagents insert 는 오류여야 함").not.toBeNull();
  expect(leaked.data ?? []).toHaveLength(0);
});

test(`[R-db][S*] 학생 reagents stock 증가 update 0행`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const r = pickReagent(await ownReagents(t), REAGENT_SLOT.studentStockAttempt, info);
  const before = await readStock(t, r.id);
  const res = await st.client.from("reagents").update({ stock: before + 1000 }).eq("id", r.id).select("id");
  const after = await readStock(t, r.id);
  if (after !== before) await restoreStock(t, r.id, before);
  expect(res.error ? [] : res.data ?? [], "학생 stock update 로 바뀐 행").toHaveLength(0);
  expect(after).toBe(before);
});

test(`[R-db][S*] 학생 reagents delete 0행`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const id = await tempReagent(t, uniqueTag(info));
  const res = await st.client.from("reagents").delete().eq("id", id).select("id");
  const still = await t.client.from("reagents").select("id").eq("id", id);
  if ((still.data ?? []).length) await dropReagent(t, id);
  expect(res.error ? [] : res.data ?? []).toHaveLength(0);
  expect(still.data ?? []).toHaveLength(1);
});

test(`[R-db][S*] 학생 cabinets insert 거부`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const label = `R-db-${uniqueTag(info)}`;
  const res = await st.client
    .from("cabinets")
    .insert({ school_id: st.schoolId, label, door_type: "단문형", shelves: 3 })
    .select("id");
  const leaked = await t.client.from("cabinets").select("id").eq("label", label);
  for (const row of leaked.data ?? []) await dropCabinet(t, row.id as string);
  expect(res.error, "학생 cabinets insert 는 오류여야 함").not.toBeNull();
  expect(leaked.data ?? []).toHaveLength(0);
});

test(`[R-db][S*] 학생 cabinets update 0행`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const cab = await oldestCabinet(t);
  const res = await st.client.from("cabinets").update({ label: "R-db-침범" }).eq("id", cab.id as string).select("id");
  const after = await t.client.from("cabinets").select("*").eq("id", cab.id as string).single();
  if (after.data && after.data.label !== cab.label) {
    await t.client.from("cabinets").update({ label: cab.label }).eq("id", cab.id as string);
  }
  expect(res.error ? [] : res.data ?? []).toHaveLength(0);
  expect(after.data).toEqual(cab);
});

test(`[R-db][S*] 학생 cabinet_slots insert 거부`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const cabId = await tempCabinet(t, uniqueTag(info));
  try {
    const res = await st.client
      .from("cabinet_slots")
      .insert({ school_id: st.schoolId, cabinet_id: cabId, side: "L", shelf: 1, storage_class: "산" })
      .select("id");
    const leaked = await t.client.from("cabinet_slots").select("id").eq("cabinet_id", cabId);
    expect(res.error, "학생 cabinet_slots insert 는 오류여야 함").not.toBeNull();
    expect(leaked.data ?? []).toHaveLength(0);
  } finally {
    await dropCabinet(t, cabId);
  }
});

test(`[R-db][S*] 학생 cabinet_slots update 0행`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const slot = await oldestSlot(t);
  const other = slot.storage_class === "기타" ? "독성" : "기타";
  const res = await st.client
    .from("cabinet_slots")
    .update({ storage_class: other })
    .eq("id", slot.id as string)
    .select("id");
  const after = await t.client.from("cabinet_slots").select("*").eq("id", slot.id as string).single();
  if (after.data && after.data.storage_class !== slot.storage_class) {
    await t.client.from("cabinet_slots").update({ storage_class: slot.storage_class }).eq("id", slot.id as string);
  }
  expect(res.error ? [] : res.data ?? []).toHaveLength(0);
  expect(after.data).toEqual(slot);
});

test(`[R-db][S*] 학생이 다른 user_id 로 usage_logs insert 거부`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const r = (await ownReagents(st))[0];
  const before = await t.client.from("usage_logs").select("id").eq("reagent_id", r.id).eq("user_id", t.userId);
  const res = await st.client
    .from("usage_logs")
    .insert({ school_id: st.schoolId, reagent_id: r.id, user_id: t.userId, amount: 1 })
    .select("id");
  const after = await t.client.from("usage_logs").select("id").eq("reagent_id", r.id).eq("user_id", t.userId);
  expect(res.error, "다른 user_id 로 usage_logs insert 는 오류여야 함").not.toBeNull();
  expect((after.data ?? []).length).toBe((before.data ?? []).length);
});

// ---------- 교사·admin: 같은 학교에서 허용 (대조군, 원상복구) ----------

for (const role of ["teacher", "admin"] as Role[]) {
  test(`[R-db][S*] ${ROLE_LABEL[role]} reagents insert·stock 증가 update·delete 허용`, async ({}, info) => {
    const s = await signIn(role);
    expect(["teacher", "admin"]).toContain(s.profileRole);
    const id = await tempReagent(s, uniqueTag(info));
    try {
      const up = await s.client.from("reagents").update({ stock: 25 }).eq("id", id).select("stock");
      expect(up.error).toBeNull();
      expect(up.data ?? []).toHaveLength(1);
      expect(Number(up.data![0].stock)).toBe(25);
    } finally {
      await dropReagent(s, id);
    }
  });

  test(`[R-db][S*] ${ROLE_LABEL[role]} cabinets·cabinet_slots insert·update·delete 허용`, async ({}, info) => {
    const s = await signIn(role);
    const cabId = await tempCabinet(s, uniqueTag(info));
    try {
      const cu = await s.client.from("cabinets").update({ shelves: 4 }).eq("id", cabId).select("shelves");
      expect(cu.error).toBeNull();
      expect(cu.data ?? []).toHaveLength(1);

      const si = await s.client
        .from("cabinet_slots")
        .insert({ school_id: s.schoolId, cabinet_id: cabId, side: "L", shelf: 1, storage_class: "산" })
        .select("id")
        .single();
      expect(si.error).toBeNull();

      const su = await s.client
        .from("cabinet_slots")
        .update({ storage_class: "염기" })
        .eq("id", si.data!.id as string)
        .select("storage_class");
      expect(su.error).toBeNull();
      expect(su.data ?? []).toHaveLength(1);
    } finally {
      await dropCabinet(s, cabId);
    }
  });
}

// ---------- record_usage ----------

test(`[R-db][S*] 학생 record_usage 재고 초과 거부 (stock·로그 그대로)`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const r = pickReagent(await ownReagents(t), REAGENT_SLOT.studentStockAttempt, info);
  const before = await readStock(t, r.id);
  const logsBefore = await t.client.from("usage_logs").select("id").eq("reagent_id", r.id);
  const res = await st.client.rpc("record_usage", { reagent_id: r.id, amount: before + 1 });
  const after = await readStock(t, r.id);
  if (after !== before) await restoreStock(t, r.id, before);
  expect(res.error, "재고 초과 record_usage 는 오류여야 함").not.toBeNull();
  expect(after).toBe(before);
  const logsAfter = await t.client.from("usage_logs").select("id").eq("reagent_id", r.id);
  expect((logsAfter.data ?? []).length).toBe((logsBefore.data ?? []).length);
});

test(`[R-db][S*] 학생 record_usage 성공: 자기 user_id 로그 + stock 차감 (교사가 stock 원상복구)`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const r = pickReagent(await ownReagents(t), REAGENT_SLOT.recordUsage, info);
  const before = await readStock(t, r.id);
  expect(before).toBeGreaterThanOrEqual(1);
  try {
    const res = await st.client.rpc("record_usage", { reagent_id: r.id, amount: 1 });
    expect(res.error).toBeNull();
    const log = (Array.isArray(res.data) ? res.data[0] : res.data) as Record<string, unknown>;
    expect(log.user_id).toBe(st.userId);
    expect(log.school_id).toBe(st.schoolId);
    expect(log.reagent_id).toBe(r.id);
    expect(Number(log.amount)).toBe(1);
    expect(await readStock(t, r.id)).toBe(before - 1);
  } finally {
    await restoreStock(t, r.id, before);
  }
  expect(await readStock(t, r.id)).toBe(before);
});
