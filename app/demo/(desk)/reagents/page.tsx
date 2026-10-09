import { ReagentBrowser, type ReagentFilter } from "@/app/(app)/(member)/(desk)/reagents/(list)/reagent-browser";
import styles from "@/app/(app)/(member)/(desk)/reagents/(list)/reagents.module.css";
import { MobileOnly } from "@/components/viewport-only";
import { parseListFilter } from "@/lib/reagent-list-filter";
import { getDemoReagentList } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 2g 둘러보기 시약 목록 — 경로 `/demo/reagents` (데모 학교 reagents, anon).
 * ?filter·?q·필터 시트 쿼리는 화면 2와 같다 (d7 §16: 모든 역할·둘러보기 같은 동작)
 * 이 페이지는 모바일 목록이다. 데스크톱(≥ 1024)은 (desk) 레이아웃의 data-table 이 같은 주소 쿼리로 목록을 그린다 (d7 §23 run d).
 */
export default async function DemoReagentsPage({ searchParams }: Props) {
  const [{ items, cabinets }, params] = await Promise.all([getDemoReagentList(), searchParams]);
  const filter: ReagentFilter = first(params.filter) === "low-stock" ? "low-stock" : "all";

  return (
    <MobileOnly>
    <div className={styles.page}>
      <h1 className={styles.title}>시약 목록</h1>
      <ReagentBrowser
        items={items}
        cabinets={cabinets}
        initialFilter={filter}
        initialQuery={first(params.q) ?? ""}
        initialListFilter={parseListFilter(params, cabinets)}
        detailBase="/demo/reagents"
      />
    </div>
    </MobileOnly>
  );
}
