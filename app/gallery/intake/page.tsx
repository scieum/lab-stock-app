import type { Metadata } from "next";
import { ButtonOutline } from "@/components/button-outline";
import { DocIntakeTable } from "@/components/doc-intake-table";
import { DocUpload } from "@/components/doc-upload";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { IntakeMode } from "@/components/intake-mode";
import { NewReagentFields } from "@/components/new-reagent-fields";
import { ReagentLink } from "@/components/reagent-link";
import { DOC_TEXT } from "@/lib/doc-intake-rules";
import styles from "../gallery.module.css";
import { DocIntakeFlowDemo, IntakeModeDemo, NewReagentFieldsDemo, ReagentLinkDemo } from "./demo";
import { SAMPLE_TODAY, sampleDocReagents, sampleDocRows, sampleManualRows } from "./sample";

export const metadata: Metadata = { title: "서류로 입고 컴포넌트 · Lab_Stock" };

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

const sampleFile = { name: "거래명세서_1007.jpg", kind: "image" as const, previewUrl: null };

/**
 * 디자인 1.17 서류로 입고 컴포넌트 갤러리 (d7 §21): intake-mode · doc-upload · doc-intake-table · reagent-link · new-reagent-fields.
 * 시안 7 · 7-doc-upload · 7-doc-fail · 7-doc-review 상태와 동작 예시. 네트워크·저장·DB 없음.
 */
export default function GalleryIntakePage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>서류로 입고 (화면 7)</h1>
      <p className={styles.lead}>intake-mode · doc-upload · doc-intake-table · reagent-link · new-reagent-fields</p>

      <div className={styles.grid}>
        <Item id="mode" name="intake-mode — 시안 7 (직접 입력 / 서류로 입고, 기본 = 서류로 입고)">
          <IntakeMode value="doc" />
          <IntakeMode value="direct" />
        </Item>

        <Item id="upload" name="doc-upload — 시안 7 (처음: 촬영하기 · 파일 선택 · AI로 읽기 비활성)">
          <DocUpload file={null} />
        </Item>

        <Item id="upload-selected" name="doc-upload — 파일 고름 (미리보기 + 파일 이름, AI로 읽기 활성)">
          <DocUpload file={sampleFile} />
        </Item>

        <Item id="upload-processing" name="doc-upload — 시안 7-doc-upload (읽는 중)">
          <DocUpload file={sampleFile} processing />
        </Item>

        <Item id="upload-error" name="doc-upload — 오류 (형식 · 크기 · 추출 실패 문구)">
          <DocUpload file={null} error="PDF, JPG, PNG 파일만 올릴 수 있어요" />
          <DocUpload file={sampleFile} error={DOC_TEXT.failed} />
        </Item>

        <Item id="fail" name="doc-fail — 시안 7-doc-fail (품목 0개: ex-empty-state-card + 직접 입력, 다른 파일 올리기)">
          <EmptyStateCard variant="outlined" icon="upload" title={DOC_TEXT.emptyTitle} description={DOC_TEXT.emptyBody}>
            <ButtonOutline>{DOC_TEXT.modeDirect}</ButtonOutline>
          </EmptyStateCard>
          <DocUpload file={null} heading={DOC_TEXT.uploadAgainHeading} />
        </Item>

        <Item id="review" name="doc-intake-table — 시안 7-doc-review (염산 연결 · 질산칼륨 새 시약 펼침 · 아세트산 새 시약 접힘 · 시약 아님 2개)">
          <DocIntakeTable rows={sampleDocRows()} reagents={sampleDocReagents} intakeDate="2026-10-07" today={SAMPLE_TODAY} findMsds={false} />
        </Item>

        <Item id="review-manual" name="doc-intake-table — 계산할 수 없는 입고량(L ↔ g) · 병 단위 · 시약 아님 펼침 없음">
          <DocIntakeTable rows={sampleManualRows()} reagents={sampleDocReagents} intakeDate={SAMPLE_TODAY} today={SAMPLE_TODAY} findMsds={false} />
        </Item>

        <Item id="review-future" name="doc-intake-table — 입고일이 오늘 이후 (오류)">
          <DocIntakeTable rows={sampleDocRows()} reagents={sampleDocReagents} intakeDate="2026-10-09" today={SAMPLE_TODAY} findMsds={false} defaultNotReagentOpen />
        </Item>

        <Item id="link" name="reagent-link — 연결 · 새 시약(접힘 요약) · 뺌">
          <ReagentLink itemName="염산 35% 500mL" link={{ kind: "reagent", reagentId: "r-hcl" }} reagents={sampleDocReagents} />
          <ReagentLink itemName="아세트산(빙초산) 500mL" link={{ kind: "new" }} reagents={sampleDocReagents} summary="새 시약 · 산 · 1,000 mL" />
          <ReagentLink itemName="질산칼륨 500g" link={{ kind: "none" }} reagents={sampleDocReagents} />
        </Item>

        <Item id="fields" name="new-reagent-fields — 시안 7-doc-review (산화제 추천 + suggest-badge, MSDS 아직 없어요 · MSDS 찾기)">
          <NewReagentFields
            itemName="질산칼륨 500g"
            value={{ name: "질산칼륨", storageClass: "산화제", suggestedClass: "산화제", unit: "g", stock: "500", stockEdited: false, msdsUrl: "" }}
          />
        </Item>

        <Item id="fields-error" name="new-reagent-fields — 분류 미선택 · 오류 문구">
          <NewReagentFields
            itemName="미지 시약"
            value={{ name: "미지 시약", storageClass: "", suggestedClass: null, unit: "병", stock: "", stockEdited: false, msdsUrl: "" }}
            error="보관 분류를 골라 주세요"
            findMsds={false}
          />
        </Item>

        <Item id="demo-mode" name="동작 — intake-mode 바꾸기">
          <IntakeModeDemo />
        </Item>

        <Item id="demo-flow" name="동작 — 파일 고르기 → AI로 읽기(가짜) → 확인 표 → 확인 후 입고">
          <DocIntakeFlowDemo />
        </Item>

        <Item id="demo-link" name="동작 — reagent-link 바꾸기 · 빼기 · 다시 넣기">
          <ReagentLinkDemo />
        </Item>

        <Item id="demo-fields" name="동작 — new-reagent-fields 고치기 (MSDS 직접 입력)">
          <NewReagentFieldsDemo />
        </Item>
      </div>
    </main>
  );
}
