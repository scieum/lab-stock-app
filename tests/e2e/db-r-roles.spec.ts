// [R-db] 역할별 DB 권한 — 실제 RLS (anon 키 + 각 계정 로그인). service role 미사용.
// 기준: harness/d7-data.md §2 (reagents insert·stock 증가 / cabinets·cabinet_slots 변경 = teacher·admin,
//       usage_logs insert = 자기 user_id, 재고 차감 = record_usage 하나), design/rules.json roles.
// 바꾼 데이터는 전부 원상복구한다 (임시 행 삭제, stock 절대값 복원). record_usage 성공 로그 1행은 남는다.
// 시약장(cabinets·cabinet_slots): d7 §9 (화면 11) 부터 직접 insert·update·delete 는 교사·admin 도 거부되고 DB 함수로만 바꾼다.
// 공용 학교 A 에는 임시 시약장을 만들지 않는다 (학교 A 시약장·칸 구성을 그대로 비교하는 스펙·화면 11 e2e 와 병렬 실행에서 경합) —
// 여기서는 "거부되어야 하는 직접 쓰기"만 하고, 함수로 추가·저장·삭제가 되는지는 db-s11-cabinets.spec.ts 가 일회용 학교에서 본다.
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

/** 자기 학교 시약장·칸 전체 (id 순) — 거부 호출 앞뒤로 그대로인지 비교한다 */
async function cabinetState(s: Session): Promise<{ cabinets: unknown[]; slots: unknown[] }> {
  const cabinets = await s.client.from("cabinets").select("*").order("id");
  const slots = await s.client.from("cabinet_slots").select("*").order("id");
  expect(cabinets.error, "자기 학교 cabinets 조회").toBeNull();
  expect(slots.error, "자기 학교 cabinet_slots 조회").toBeNull();
  return { cabinets: cabinets.data ?? [], slots: slots.data ?? [] };
}

/** 가장 오래된 시약장에서 아직 칸 행이 없는 자리 (없으면 L1 — 어느 쪽이든 권한 오류 42501 이 먼저여야 한다) */
async function freeCell(s: Session, cab: Record<string, unknown>): Promise<{ side: string; shelf: number }> {
  const r = await s.client.from("cabinet_slots").select("side, shelf").eq("cabinet_id", cab.id as string);
  expect(r.error).toBeNull();
  const taken = new Set((r.data ?? []).map((x) => `${x.side}${x.shelf}`));
  const sides = cab.door_type === "단문형" ? ["L"] : ["L", "R"];
  for (const side of sides) {
    for (let shelf = 1; shelf <= Number(cab.shelves); shelf++) {
      if (!taken.has(`${side}${shelf}`)) return { side, shelf };
    }
  }
  return { side: "L", shelf: 1 };
}

/**
 * 비상 정리: 거부되어야 할 직접 insert 가 구현 결함으로 성공했을 때만 그 시약장을 delete_cabinet 으로 지운다.
 * 정상이라면 대상이 0개라 아무 호출도 하지 않는다.
 */
async function dropLeakedCabinets(staff: Session, label: string): Promise<number> {
  const leaked = await staff.client.from("cabinets").select("id").eq("label", label);
  for (const row of leaked.data ?? []) await staff.client.rpc("delete_cabinet", { p_cabinet_id: row.id as string });
  return (leaked.data ?? []).length;
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
  const leaked = await dropLeakedCabinets(t, label);
  expect(res.error, "학생 cabinets insert 는 오류여야 함").not.toBeNull();
  expect(leaked).toBe(0);
});

test(`[R-db][S*] 학생 cabinets update 0행`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const cab = await oldestCabinet(t);
  const res = await st.client.from("cabinets").update({ label: "R-db-침범" }).eq("id", cab.id as string).select("id");
  const after = await t.client.from("cabinets").select("*").eq("id", cab.id as string).single();
  if (after.data && after.data.label !== cab.label) {
    // 비상 복구 (구현 결함으로 바뀐 경우만): 직접 update 는 막혀 있으므로 rename_cabinet 으로 되돌린다
    await t.client.rpc("rename_cabinet", { p_cabinet_id: cab.id as string, p_label: cab.label as string });
  }
  expect(res.error ? [] : res.data ?? []).toHaveLength(0);
  expect(after.data).toEqual(cab);
});

test(`[R-db][S*] 학생 cabinet_slots insert 거부`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  // 학교 A 의 기존 시약장을 겨눈다 (임시 시약장을 만들지 않는다). 빈 자리를 골라 unique 충돌이 아닌 권한으로 거부되는지 본다.
  const cab = await oldestCabinet(t);
  const cell = await freeCell(t, cab);
  const before = await cabinetState(t);
  for (const patch of [{ storage_class: "산" }, { storage_classes: ["산"] }, {}]) {
    const res = await st.client
      .from("cabinet_slots")
      .insert({ school_id: st.schoolId, cabinet_id: cab.id as string, ...cell, ...patch })
      .select("id");
    expect(res.error, "학생 cabinet_slots insert 는 오류여야 함").not.toBeNull();
    expect(res.error?.code, `권한 오류여야 함 (${res.error?.message})`).toBe("42501");
  }
  expect(await cabinetState(t), "학교 A 시약장·칸 그대로").toEqual(before);
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
  // 직접 update 는 교사도 막혀 있어(d7 §9) 여기서 되돌릴 수 없다 — 값이 바뀌었다면 아래 단언이 실패로 알린다.
  expect(res.error ? [] : res.data ?? []).toHaveLength(0);
  expect(after.data, "칸 값 그대로 (바뀌었다면 seed 복구 필요)").toEqual(slot);
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

  test(`[R-db][S*] ${ROLE_LABEL[role]} cabinets·cabinet_slots 직접 insert·update·delete 거부 (d7 §9: 함수로만, 값 그대로)`, async ({}, info) => {
    const s = await signIn(role);
    expect(["teacher", "admin"]).toContain(s.profileRole);
    const before = await cabinetState(s);
    const cab = await oldestCabinet(s);
    const slot = await oldestSlot(s);
    const cell = await freeCell(s, cab);
    const label = `R-db-${uniqueTag(info)}`;

    const ci = await s.client
      .from("cabinets")
      .insert({ school_id: s.schoolId, label, door_type: "양문형", shelves: 3 })
      .select("id");
    const leaked = await dropLeakedCabinets(s, label);
    expect(ci.error, "cabinets 직접 insert 는 오류여야 함").not.toBeNull();
    expect(leaked, "직접 insert 로 생긴 시약장").toBe(0);

    const cu = await s.client.from("cabinets").update({ label }).eq("id", cab.id as string).select("id");
    if (!cu.error && (cu.data ?? []).length) {
      await s.client.rpc("rename_cabinet", { p_cabinet_id: cab.id as string, p_label: cab.label as string }); // 비상 복구
    }
    expect(cu.error ? [] : cu.data ?? [], "cabinets 직접 update 로 바뀐 행").toHaveLength(0);
    const cs = await s.client
      .from("cabinets")
      .update({ shelves: cab.shelves === 4 ? 3 : 4 })
      .eq("id", cab.id as string)
      .select("id");
    expect(cs.error ? [] : cs.data ?? [], "cabinets 직접 update(shelves) 로 바뀐 행").toHaveLength(0);

    const si = await s.client
      .from("cabinet_slots")
      .insert({ school_id: s.schoolId, cabinet_id: cab.id as string, ...cell, storage_class: "산" })
      .select("id");
    expect(si.error, "cabinet_slots 직접 insert 는 오류여야 함").not.toBeNull();
    expect(si.error?.code, `권한 오류여야 함 (${si.error?.message})`).toBe("42501");

    const other = slot.storage_class === "기타" ? "독성" : "기타";
    for (const patch of [{ storage_class: other }, { storage_classes: [other] }]) {
      const su = await s.client.from("cabinet_slots").update(patch).eq("id", slot.id as string).select("id");
      expect(su.error ? [] : su.data ?? [], "cabinet_slots 직접 update 로 바뀐 행").toHaveLength(0);
    }

    // delete 는 없는 id 로 먼저 (막혀 있는지 확인), 그 다음 실제 행 — 칸 먼저, 시약장은 마지막
    for (const table of ["cabinet_slots", "cabinets"] as const) {
      const ghost = await s.client.from(table).delete().eq("id", "00000000-0000-4000-8000-000000000000").select("id");
      expect(ghost.error, `${table} 직접 delete 는 오류여야 함 (delete 권한 없음)`).not.toBeNull();
    }
    const sd = await s.client.from("cabinet_slots").delete().eq("id", slot.id as string).select("id");
    expect(sd.error ? [] : sd.data ?? [], "cabinet_slots 직접 delete 로 지워진 행").toHaveLength(0);
    const cd = await s.client.from("cabinets").delete().eq("id", cab.id as string).select("id");
    expect(cd.error ? [] : cd.data ?? [], "cabinets 직접 delete 로 지워진 행").toHaveLength(0);

    expect(await cabinetState(s), "학교 A 시약장·칸 그대로").toEqual(before);
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
