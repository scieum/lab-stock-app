import { ReagentBrowser, type ReagentFilter } from "@/app/(app)/(member)/reagents/(list)/reagent-browser";
import styles from "@/app/(app)/(member)/reagents/(list)/reagents.module.css";
import { getDemoReagentList } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ filter?: string | string[]; q?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 화면 2g 둘러보기 시약 목록 — 경로 `/demo/reagents` (데모 학교 reagents, anon). ?filter·?q 는 화면 2와 같다 */
export default async function DemoReagentsPage({ searchParams }: Props) {
  const [items, params] = await Promise.all([getDemoReagentList(), searchParams]);
  const filter: ReagentFilter = first(params.filter) === "low-stock" ? "low-stock" : "all";

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>시약 목록</h1>
      <ReagentBrowser
        items={items}
        initialFilter={filter}
        initialQuery={first(params.q) ?? ""}
        detailBase="/demo/reagents"
      />
    </div>
  );
}
