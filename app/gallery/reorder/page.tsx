import type { Metadata } from "next";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { ReorderAlertItemCard } from "@/components/reorder-alert-card";
import { VendorLink, VendorLinkModal, VendorNewWindowNote } from "@/components/vendor-link";
import styles from "../gallery.module.css";
import { ReorderDemo } from "./demo";
import {
  sampleAlertAuto,
  sampleAlertAutoIntake,
  sampleAlertPlain,
  sampleAlerts,
  sampleAlertsSorted,
  sampleLinkVendors,
  sampleLinkVendorsMixed,
} from "./sample";

export const metadata: Metadata = { title: "재주문 알림 컴포넌트 · Lab_Stock" };

const REAGENT = "염산";

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 화면 6(재주문 알림) 상태 갤러리: admin(시안 1.17 6 — 알림 3건 + 염산 카드 새 창 안내) · 모달 열림 · 교사 · 0건 · 모달 상태 4종 · 기준 문구.
 * 모달은 제자리(sheet=false)로 그린다.
 */
export default function GalleryReorderPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>재주문 알림 (화면 6)</h1>
      <p className={styles.lead}>
        manual-upload · reorder-alert-card · badge-low-stock · vendor-link · ex-modal-card(판매처 연결) · vendor-register(진입 버튼) ·
        ex-empty-state-card
      </p>

      <div className={styles.grid}>
        <Item id="default" name="admin — 알림 3건(에탄올 자동 기준) + 염산 카드 새 창 안내 (시안 1.17 6)">
          <ReorderDemo
            role="admin"
            alerts={sampleAlerts}
            vendors={sampleLinkVendors}
            defaultOpened={{ alertId: "r-1", name: "한빛과학교재", url: "https://example.com/hanbit" }}
          />
        </Item>

        <Item id="open-modal" name="admin — 판매처 연결 모달 열림">
          <ReorderDemo role="admin" alerts={sampleAlerts} vendors={sampleLinkVendors} defaultOpenId="r-1" />
        </Item>

        <Item id="teacher" name="교사 — 알림 3건, 부족한 정도가 큰 순 (판매처 등록 없음)">
          <ReorderDemo role="teacher" alerts={sampleAlertsSorted} vendors={sampleLinkVendorsMixed} />
        </Item>

        <Item id="empty" name="알림 0건 — admin">
          <ReorderDemo role="admin" alerts={[]} vendors={sampleLinkVendors} />
        </Item>

        <Item id="empty-teacher" name="알림 0건 — 교사">
          <ReorderDemo role="teacher" alerts={[]} vendors={sampleLinkVendors} />
        </Item>

        <Item id="modal" name="ex-modal-card 판매처 연결 — 웹사이트가 있는 판매처 선택 (시안 6)">
          <VendorLinkModal sheet={false} reagentName={REAGENT} vendors={sampleLinkVendors} />
        </Item>

        <Item id="modal-no-website" name="ex-modal-card 판매처 연결 — 웹사이트가 없는 판매처 선택 (확인 비활성 + 연락처 안내)">
          <VendorLinkModal sheet={false} reagentName={REAGENT} vendors={sampleLinkVendorsMixed} defaultSelectedId="v-3" />
        </Item>

        <Item id="modal-none" name="ex-modal-card 판매처 연결 — 판매처 0개 (교사)">
          <VendorLinkModal sheet={false} reagentName={REAGENT} vendors={[]} />
        </Item>

        <Item id="modal-none-admin" name="ex-modal-card 판매처 연결 — 판매처 0개 (admin: 판매처 설정으로)">
          <VendorLinkModal sheet={false} reagentName={REAGENT} vendors={[]} registerHref="/vendors" />
        </Item>

        <Item id="basis" name="reorder-alert-card — 실험 매뉴얼 값·알림 날짜가 없는 시약 (기준 문구 두 번째 형태)">
          <ReorderAlertItemCard
            name={sampleAlertPlain.name}
            amount={sampleAlertPlain.amount}
            basis={sampleAlertPlain.basis}
            date={sampleAlertPlain.date}
          >
            <VendorLink />
          </ReorderAlertItemCard>
        </Item>

        <Item id="auto" name="reorder-alert-card — 자동 기준: 수량 줄 가운데 auto-threshold-badge + 캡션 (d7 §18, 시안 1.17 6 에탄올)">
          <ReorderAlertItemCard
            name={sampleAlertAuto.name}
            amount={sampleAlertAuto.amount}
            auto={sampleAlertAuto.auto}
            date={sampleAlertAuto.date}
          >
            <VendorLink />
          </ReorderAlertItemCard>
          <ReorderAlertItemCard
            name={sampleAlertAutoIntake.name}
            amount={sampleAlertAutoIntake.amount}
            auto={sampleAlertAutoIntake.auto}
            date={sampleAlertAutoIntake.date}
          >
            <VendorLink />
          </ReorderAlertItemCard>
        </Item>

        <Item id="new-window" name="reorder-alert-card — 판매처 확인 뒤 새 창 안내 줄 (vendor-new-window: 아이콘 + 안내 + 흰 테두리 pill 직접 열기, d7 §18)">
          <ReorderAlertItemCard
            name={sampleAlertPlain.name}
            amount={sampleAlertPlain.amount}
            basis={sampleAlertPlain.basis}
            date={sampleAlertPlain.date}
          >
            <VendorLink />
            <VendorNewWindowNote vendorName="한빛과학교재" url="https://example.com/hanbit" />
          </ReorderAlertItemCard>
        </Item>

        <Item id="account-menu" name="nav-account-menu — 학교명 옆 ▾ (로그인 후 셸 공통, 디자인 1.15)">
          <NavAccountMenu schoolName="샘플고등학교" />
        </Item>
      </div>
    </main>
  );
}
