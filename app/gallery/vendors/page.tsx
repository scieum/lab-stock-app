import type { Metadata } from "next";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { Toast } from "@/components/ex-toast";
import { VendorDeleteConfirm } from "@/components/vendor-register";
import styles from "../gallery.module.css";
import { VendorsDemo } from "./demo";
import { sampleCommonVendors, sampleVendors } from "./sample";
import local from "./vendors.module.css";

export const metadata: Metadata = { title: "판매처 설정 컴포넌트 · Lab_Stock" };

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
 * 화면 9(판매처 설정) 상태 갤러리: 목록(저장 직후) · 검색 · 더보기 메뉴 · 등록 폼 · 수정 폼 · 삭제 확인 · 0건 · 공통 목록 · 토스트.
 * 고정 줄·시트는 제자리(sticky=false · sheet=false)로 그린다.
 */
export default function GalleryVendorsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>판매처 설정 (화면 9)</h1>
      <p className={styles.lead}>
        segmented-control · text-input · vendor-register(우리 학교 판매처 블록) · ex-data-table-cell(공통 목록) · ex-modal-card(삭제 확인) ·
        ex-empty-state-card · ex-toast
      </p>

      <div className={local.grid}>
        <Item id="default" name="목록 — 저장 직후 (시안 9-mobile: 판매처 4곳, 첫 행 강조, 토스트)">
          <VendorsDemo
            vendors={sampleVendors}
            common={sampleCommonVendors}
            defaultHighlightId="v-1"
            defaultToast="판매처를 저장했어요"
          />
        </Item>

        <Item id="edit" name="수정 폼 (시안 9-desktop: 목록 옆 '판매처 수정')">
          <VendorsDemo
            vendors={sampleVendors}
            common={sampleCommonVendors}
            defaultHighlightId="v-1"
            defaultForm={{ mode: "edit", vendor: sampleVendors[0] }}
          />
        </Item>

        <Item id="create" name="등록 폼 — 판매처명이 비면 '저장' 비활성">
          <VendorsDemo vendors={sampleVendors} common={sampleCommonVendors} defaultForm={{ mode: "create" }} />
        </Item>

        <Item id="search" name="검색 — '과학'">
          <VendorsDemo vendors={sampleVendors} common={sampleCommonVendors} defaultQuery="과학" />
        </Item>

        <Item id="search-empty" name="검색 0건">
          <VendorsDemo vendors={sampleVendors} common={sampleCommonVendors} defaultQuery="없는 판매처" />
        </Item>

        <Item id="menu" name="더보기 메뉴 (수정 · 삭제)">
          <div className={local.menuStage}>
            <VendorsDemo vendors={sampleVendors} common={sampleCommonVendors} defaultMenuOpenId="v-2" />
          </div>
        </Item>

        <Item id="delete" name="ex-modal-card 삭제 확인">
          <VendorDeleteConfirm sheet={false} name="한빛 과학상사" />
        </Item>

        <Item id="empty" name="학교 판매처 0건">
          <VendorsDemo vendors={[]} common={sampleCommonVendors} />
        </Item>

        <Item id="common" name="공통 목록 탭 — 보기 전용 2열">
          <VendorsDemo vendors={sampleVendors} common={sampleCommonVendors} defaultTab="common" />
        </Item>

        <Item id="toast" name="ex-toast">
          <Toast>판매처를 저장했어요</Toast>
          <Toast>판매처를 삭제했어요</Toast>
        </Item>

        <Item id="account-menu" name="nav-account-menu — 학교명 옆 ▾ (로그인 후 셸 공통, 디자인 1.15)">
          <NavAccountMenu schoolName="샘플고등학교" />
        </Item>
      </div>
    </main>
  );
}
