import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/app/(app)/app-shell";
import { msdsBackHref, msdsTitle, readMsdsFrom } from "@/lib/msds-summary";
import { getMsdsReagent } from "@/lib/supabase/msds-reagent";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { MsdsDesk } from "./msds-desk";
import { MsdsView } from "./msds-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string | string[] }> };

/**
 * 화면 16 MSDS 요약 — `/msds/[reagent id]` (로그인, 모든 역할, 자기 학교 시약만 — d7 §22, dev-rules route_auth 16).
 * 다른 학교·없는 id 는 404. MSDS 가 없는 시약은 화면 3 으로 (그곳의 "MSDS가 아직 없어요").
 * ?from=usage = 화면 10 기록 상세에서 들어옴 → 뒤로 = /usage. 그 밖은 화면 3.
 * 모바일 = 전용 화면, 데스크톱 = 시약 목록(레이아웃) 옆 오른쪽 detail-drawer 안 msds-summary (d7 §23 run b).
 */
export default async function MsdsPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const result = await getMsdsReagent(id);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();
  const { reagent, me } = result;
  if (!reagent.msdsUrl) redirect(`/reagents/${reagent.id}`);

  const from = readMsdsFrom(sp.from);
  const backHref = msdsBackHref(reagent.id, { from });
  return (
    <>
      <MobileOnly>
        <MsdsView
          nav={
            <AppNav
              schoolName={me.schoolName}
              staff={me.role !== "student"}
              admin={me.role === "admin"}
              page={{ title: msdsTitle(reagent.name), backHref, activeHref: "/reagents" }}
            />
          }
          name={reagent.name}
          msdsUrl={reagent.msdsUrl}
          backHref={backHref}
        />
      </MobileOnly>
      {/* 데스크톱: (desk) 레이아웃의 시약 목록 옆 오른쪽 드로어 (d7 §23 run b) */}
      <DesktopOnly>
        <MsdsDesk reagentId={reagent.id} name={reagent.name} msdsUrl={reagent.msdsUrl} from={from} />
      </DesktopOnly>
    </>
  );
}
