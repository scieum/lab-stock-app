import type { Metadata } from "next";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { BadgeOverlay } from "@/components/badge-overlay";
import { Toast } from "@/components/ex-toast";
import { ManualUpload } from "@/components/manual-upload";
import { MANUAL_FILE_ERRORS } from "@/lib/manual-rules";
import styles from "../gallery.module.css";
import { ManualFlowDemo, ManualResultExample } from "./demo";
import local from "./manual.module.css";
import {
  SAMPLE_GROUPS,
  demoExtracted,
  sampleImage,
  samplePdf,
  sampleReagents,
  sampleReagentsWithBasis,
  sampleRows,
  sampleRowsAllUnlinked,
  sampleRowsFrame,
  sampleRowsMerged,
  sampleRowsMismatch,
  sampleRowsUnlinked,
} from "./sample";

export const metadata: Metadata = { title: "실험 매뉴얼 컴포넌트 · Lab_Stock" };

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
 * 화면 5(실험 매뉴얼) 상태 갤러리: 업로드 영역 5종 · 추출 결과 표 7종 · 저장 직후 토스트 · 동작 데모.
 * 시안 5 는 업로드 미리보기 + 처리 중 + 추출 결과가 함께 그려진 합성 상태라 여기서는 상태별로 나눠 그린다.
 */
export default function GalleryManualPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>실험 매뉴얼 (화면 5)</h1>
      <p className={styles.lead}>
        manual-upload(업로드 영역) · badge-overlay · text-input(조 수 · 사용량) · extraction-table · ex-data-table-cell ·
        button-outline · button-primary · ex-toast
      </p>

      <div className={local.grid}>
        <Item id="empty" name="manual-upload — 파일 선택 전">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={null} />
          </div>
        </Item>

        <Item id="selected-pdf" name="manual-upload — 파일 선택 후 (PDF: 문서 자리 표시 + badge-overlay 파일 이름, 시안 5)">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={samplePdf} />
          </div>
        </Item>

        <Item id="selected-image" name="manual-upload — 파일 선택 후 (이미지: 썸네일 + 긴 파일 이름 말줄임)">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={sampleImage} />
          </div>
        </Item>

        <Item id="file-error" name="manual-upload — 파일 오류 (형식)">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={null} error={MANUAL_FILE_ERRORS.type} />
          </div>
        </Item>

        <Item id="file-error-size" name="manual-upload — 파일 오류 (4MB 초과)">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={null} error={MANUAL_FILE_ERRORS.size} />
          </div>
        </Item>

        <Item id="processing" name="manual-upload — 처리 중 (진행 막대 + 사용량을 찾고 있어요, 시안 5)">
          <div className={local.narrow}>
            <ManualUpload variant="upload" file={samplePdf} processing />
          </div>
        </Item>

        <Item id="badge" name="badge-overlay — 짧은 이름 · 긴 이름 말줄임">
          <div className={local.overlayStage}>
            <BadgeOverlay>{samplePdf.name}</BadgeOverlay>
          </div>
          <div className={local.overlayStage}>
            <BadgeOverlay>{sampleImage.name}</BadgeOverlay>
          </div>
        </Item>

        <Item id="result" name="extraction-table — 추출 결과 4행 + 하단 버튼 (시안 5: 염산 사용량을 고친 칸 = 연하늘)">
          <ManualResultExample rows={sampleRowsFrame} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="edited" name="extraction-table — 추출 직후 (고친 칸 없음). 사용량을 고치면 그 칸이 연하늘">
          <ManualResultExample rows={sampleRows} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="unlinked" name="extraction-table — 미연결 행 (등록되지 않은 시약: 저장에서 빠짐)">
          <ManualResultExample rows={sampleRowsUnlinked} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="all-unlinked" name="extraction-table — 전부 미연결 (저장할 시약 0: 확인 후 저장 비활성 + 이유)">
          <ManualResultExample rows={sampleRowsAllUnlinked} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="mismatch" name="extraction-table — 단위 불일치 · 사용량 없음 · 단위 미확정 (확인 후 저장 비활성 + 이유)">
          <ManualResultExample rows={sampleRowsMismatch} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="basis" name="extraction-table — 기존 기준 표시 (더 큰 값 유지: 염산은 바뀜, 에탄올은 그대로)">
          <ManualResultExample rows={sampleRows} groups={SAMPLE_GROUPS} reagents={sampleReagentsWithBasis} />
        </Item>

        <Item id="merged" name="extraction-table — 같은 시약에 두 행 (합쳐서 저장)">
          <ManualResultExample rows={sampleRowsMerged} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="zero" name="extraction-table — 0행 (시약을 찾지 못함)">
          <ManualResultExample rows={[]} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
        </Item>

        <Item id="toast" name="ex-toast — 저장 직후">
          <div className={local.toastRow}>
            <Toast>재주문 기준을 저장했어요</Toast>
          </div>
        </Item>

        <Item id="demo" name="동작 데모 — 파일 + 조 수 → AI 추출(가짜 결과) → 처리 중 → 추출 결과 확인 → 확인 후 저장">
          <ManualFlowDemo reagents={sampleReagents} extracted={demoExtracted} />
        </Item>

        <Item id="account-menu" name="nav-account-menu — 학교명 옆 ▾ (로그인 후 셸 공통, 디자인 1.15)">
          <NavAccountMenu schoolName="샘플고등학교" />
        </Item>
      </div>
    </main>
  );
}
