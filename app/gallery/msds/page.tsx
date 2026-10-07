import type { Metadata } from "next";
import { MsdsBulkBanner } from "@/components/msds-bulk-banner";
import { MsdsCandidates } from "@/components/msds-candidates";
import { MsdsEntry } from "@/components/msds-entry";
import { MsdsSearch } from "@/components/msds-search";
import { MSDS_TEXT } from "@/lib/msds-rules";
import styles from "../gallery.module.css";
import { MsdsBulkDemo, MsdsCandidatesBulkStatic, MsdsFindDemo, MsdsRegisterDemo } from "./demo";
import { sampleMsdsCandidates, sampleMsdsCandidates7 } from "./sample";

export const metadata: Metadata = { title: "MSDS 찾기 컴포넌트 · Lab_Stock" };

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
 * 디자인 1.17 MSDS 찾기 컴포넌트 갤러리 (d7 §20): msds-search · msds-candidates · msds-bulk-banner.
 * 시안 3-msds · 7-msds · 2-msds-bulk 상태와 0개 · 불러오는 중 · 오류 · 직접 입력. 네트워크·저장·DB 없음.
 */
export default function GalleryMsdsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>MSDS 찾기 (화면 2 · 3 · 7)</h1>
      <p className={styles.lead}>msds-search · msds-candidates · msds-bulk-banner</p>

      <div className={styles.grid}>
        <Item id="entry" name="msds-entry + msds-search — 시안 3-msds (교사·admin: 캡션 + MSDS 찾기 / 학생: 캡션만)">
          <MsdsEntry variant="button" notice={MSDS_TEXT.missing} missingAction={<MsdsSearch />} />
          <MsdsEntry variant="button" notice={MSDS_TEXT.missing} missingAction={null} />
        </Item>

        <Item id="search" name="msds-search — 15/600 (화면 3) · 13/600 (화면 7) · 비활성 (시약명 없음)">
          <div className={styles.row}>
            <MsdsSearch />
            <MsdsSearch size="sm" />
            <MsdsSearch size="sm" disabled />
          </div>
        </Item>

        <Item id="cand-3" name="msds-candidates — 시안 3-msds (질산은, 첫 행 선택)">
          <MsdsCandidates sheet={false} caption="질산은" query="질산은" status="ready" candidates={sampleMsdsCandidates} />
        </Item>

        <Item id="cand-7" name="msds-candidates — 시안 7-msds (질산칼륨)">
          <MsdsCandidates sheet={false} caption="질산칼륨" query="질산칼륨" status="ready" candidates={sampleMsdsCandidates7} />
        </Item>

        <Item id="cand-bulk" name="msds-candidates — 시안 2-msds-bulk (질산은 · 1 / 4, 건너뛰기 · 이 MSDS로)">
          <MsdsCandidatesBulkStatic />
        </Item>

        <Item id="cand-empty" name="msds-candidates — 0개 (찾지 못했어요 — 직접 입력)">
          <MsdsCandidates sheet={false} caption="모르는 시약" query="모르는 시약" status="ready" candidates={[]} />
        </Item>

        <Item id="cand-loading" name="msds-candidates — 불러오는 중">
          <MsdsCandidates sheet={false} caption="질산은" query="질산은" status="loading" />
        </Item>

        <Item id="cand-error" name="msds-candidates — 오류 (외부 실패)">
          <MsdsCandidates sheet={false} caption="질산은" query="질산은" status="error" message={MSDS_TEXT.upstream} />
        </Item>

        <Item id="cand-direct" name="msds-candidates — 직접 입력 (화면 3 · 2: 시트 안 주소 입력)">
          <MsdsCandidates sheet={false} caption="질산은" status="ready" candidates={[]} initialDirect />
        </Item>

        <Item id="banner" name="msds-bulk-banner — 시안 2-msds-bulk (MSDS 없는 시약 4종 · 한 번에 찾기)">
          <MsdsBulkBanner count={4} bleed={false} />
        </Item>

        <Item id="demo-3" name="동작 — 화면 3: MSDS 찾기 → 고르기 → 이 MSDS로 → 토스트">
          <MsdsFindDemo />
        </Item>

        <Item id="demo-7" name="동작 — 화면 7: 시약명이 비면 비활성, 고르면 MSDS 칸에 주소">
          <MsdsRegisterDemo />
        </Item>

        <Item id="demo-2" name="동작 — 화면 2: 한 번에 찾기 → 시약마다 고르기/건너뛰기 → N종에 MSDS를 넣었어요">
          <MsdsBulkDemo />
        </Item>
      </div>
    </main>
  );
}
