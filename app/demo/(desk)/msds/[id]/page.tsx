import { notFound, redirect } from "next/navigation";
import { MsdsDesk } from "@/app/(app)/(member)/(desk)/msds/[id]/msds-desk";
import { MsdsView } from "@/app/(app)/(member)/(desk)/msds/[id]/msds-view";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { DemoNav } from "@/app/demo/demo-shell";
import { msdsBackHref, msdsTitle } from "@/lib/msds-summary";
import { getDemoSchool } from "@/lib/supabase/demo-data";
import { getDemoMsdsReagent } from "@/lib/supabase/msds-reagent";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** design/rules.json guest.school_name */
const DEMO_SCHOOL_NAME = "데모 학교";

/**
 * 화면 16 둘러보기 — `/demo/msds/[reagent id]` (데모 학교 시약만, 쓰기 없음 — d7 §22, dev-rules route_auth 16-guest).
 * 로그인 사용자는 proxy·demo layout 이 / 로 보낸다. 데모 학교가 아닌 id 는 404. MSDS 가 없으면 화면 3g 로.
 * 데모 seed 의 msds_url 이 공단 상세 주소가 아니면 요약 없이 원문 보기만(16-no-summary).
 * 모바일 = 전용 화면, 데스크톱 = 시약 목록(레이아웃) 옆 오른쪽 detail-drawer 안 msds-summary (d7 §23 run d).
 */
export default async function DemoMsdsPage({ params }: Props) {
  const { id } = await params;
  const [reagent, school] = await Promise.all([getDemoMsdsReagent(id), getDemoSchool()]);
  if (!reagent) notFound();
  if (!reagent.msdsUrl) redirect(`/demo/reagents/${reagent.id}`);
  const backHref = msdsBackHref(reagent.id, { demo: true });
  return (
    <>
      <MobileOnly>
        <MsdsView
          nav={
            <DemoNav
              schoolName={school?.name ?? DEMO_SCHOOL_NAME}
              page={{ title: msdsTitle(reagent.name), backHref, activeHref: "/demo/reagents" }}
            />
          }
          name={reagent.name}
          msdsUrl={reagent.msdsUrl}
          backHref={backHref}
        />
      </MobileOnly>
      <DesktopOnly>
        <MsdsDesk reagentId={reagent.id} name={reagent.name} msdsUrl={reagent.msdsUrl} from="reagent" />
      </DesktopOnly>
    </>
  );
}
