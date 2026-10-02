import { redirect } from "next/navigation";
import { getReagentList } from "@/lib/supabase/reagents-data";
import { ReagentBrowser, type ReagentFilter } from "./reagent-browser";
import styles from "./reagents.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ filter?: string | string[]; q?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 화면 2 시약 목록 (자기 학교 reagents, RLS) — 홈의 재주문 알림은 ?filter=low-stock 으로 들어온다 */
export default async function ReagentsPage({ searchParams }: Props) {
  const [data, params] = await Promise.all([getReagentList(), searchParams]);
  if (!data) redirect("/login");
  const filter: ReagentFilter = first(params.filter) === "low-stock" ? "low-stock" : "all";

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>시약 목록</h1>
      <ReagentBrowser items={data.items} initialFilter={filter} initialQuery={first(params.q) ?? ""} />
    </div>
  );
}
