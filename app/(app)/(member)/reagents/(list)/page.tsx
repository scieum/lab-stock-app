import { redirect } from "next/navigation";
import { parseListFilter } from "@/lib/reagent-list-filter";
import { getReagentList } from "@/lib/supabase/reagents-data";
import { ReagentBrowser, type ReagentFilter } from "./reagent-browser";
import styles from "./reagents.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 2 시약 목록 (자기 학교 reagents, RLS) — 홈의 재주문 알림은 ?filter=low-stock 으로 들어온다.
 * 필터·정렬(d7 §16)도 주소창에 둔다: ?sort · ?class · ?cab · ?slot · ?noslot · ?nomsds (잘못된 값은 무시).
 */
export default async function ReagentsPage({ searchParams }: Props) {
  const [data, params] = await Promise.all([getReagentList(), searchParams]);
  if (!data) redirect("/login");
  const filter: ReagentFilter = first(params.filter) === "low-stock" ? "low-stock" : "all";

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>시약 목록</h1>
      <ReagentBrowser
        items={data.items}
        cabinets={data.cabinets}
        initialFilter={filter}
        initialQuery={first(params.q) ?? ""}
        initialListFilter={parseListFilter(params, data.cabinets)}
        canFindMsds={data.role === "teacher" || data.role === "admin"}
      />
    </div>
  );
}
