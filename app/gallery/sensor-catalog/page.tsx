import type { Metadata } from "next";
import Link from "next/link";
import { CatalogFillNote } from "@/components/catalog-fill-note";
import { NewSensorFields } from "@/components/new-sensor-fields";
import { SensorAddChoiceSheet, SensorDocAdd } from "@/components/sensor-doc-add";
import { SensorLink } from "@/components/sensor-link";
import { SensorModelSuggest } from "@/components/sensor-model-suggest";
import { SensorTypeGroup } from "@/components/sensor-type-group";
import { SensorTypeSelect } from "@/components/sensor-type-select";
import { SensorTypeSheet } from "@/components/sensor-type-sheet";
import { SENSOR_TYPE_GROUPS } from "@/lib/sensor-rules";
import styles from "../gallery.module.css";
import { ModelSuggestDemo, SensorLinkDemo, TypeFilterDemo, TypeSelectDemo } from "./demo";

export const metadata: Metadata = { title: "센서 종류·카탈로그·서류 등록 갤러리 · Lab_Stock" };

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

const SCHOOL_SENSORS = [
  { id: "s-1", name: "무선 온도 센서", maker: "파스코", model: "PS-3201", quantity: 3 },
  { id: "s-2", name: "무선 편광계", maker: "파스코", model: "PS-3237", quantity: 1 },
];

/**
 * 디자인 1.28 (d7 §28) 센서 종류 27종 묶음 시트 · 파스코 카탈로그 · 센서 서류로 등록 컴포넌트 예시
 * (시안 17-type · 17-filter · 17-model · 17-doc-upload · 17-doc-review). 화면 연결은 D3.
 */
export default function SensorCatalogGalleryPage() {
  const chem = SENSOR_TYPE_GROUPS[1];
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>센서 종류 · 카탈로그 · 서류 등록</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <div className={styles.grid}>
        <Item id="type-sheet-mobile" name="sensor-type-sheet — 모바일 바텀시트 (시안 17-type-mobile: 화학 펼침, 편광 고름)">
          <SensorTypeSheet value="편광" layout="sheet" floating={false} />
        </Item>
        <Item id="type-sheet-desktop" name="sensor-type-sheet — 데스크톱 드롭다운 (시안 17-type-desktop)">
          <SensorTypeSheet value="편광" layout="dropdown" floating={false} />
        </Item>
        <Item id="type-sheet-search" name="sensor-type-sheet — 검색 '산소' (맞는 묶음만 펼침) · 맞는 종류 없음">
          <SensorTypeSheet value="" layout="dropdown" floating={false} defaultQuery="산소" />
          <SensorTypeSheet value="" layout="dropdown" floating={false} defaultQuery="현미경" />
        </Item>
        <Item id="type-group" name="sensor-type-group — 접힘 · 펼침(고른 chip)">
          <SensorTypeGroup title="물리" types={SENSOR_TYPE_GROUPS[0].types} count="12" open={false} selected={[]} first />
          <SensorTypeGroup title={chem.title} types={chem.types} count="9" open selected={["편광"]} />
        </Item>
        <Item id="type-select-box" name="sensor-type-select box — 고르기 칸 '종류 [편광 ▾]' (누르면 시트) · 빈 칸 · 카탈로그 채움">
          <TypeSelectDemo />
          <SensorTypeSelect variant="box" value="" />
          <SensorTypeSelect variant="box" value="색·탁도" filled />
        </Item>
        <Item id="type-filter" name="필터 시트의 종류 묶음 (시안 17-filter: '화학 · 2개', 여러 개 고르기)">
          <TypeFilterDemo />
        </Item>
        <Item id="model-suggest" name="sensor-model-suggest · catalog-fill-note (시안 17-model: 'PS-321' 후보, 고르면 종류·이름 채움)">
          <ModelSuggestDemo />
        </Item>
        <Item id="model-suggest-static" name="sensor-model-suggest — 고른 모델(PS-3215 ✓) · 이름 검색 '편광'">
          <SensorModelSuggest query="PS-321" selectedModel="PS-3215" floating={false} />
          <SensorModelSuggest query="편광" floating={false} />
          <CatalogFillNote filled={["type", "name"]} />
          <CatalogFillNote filled={["type"]} />
        </Item>
        <Item id="doc-add" name="sensor-doc-add — 데스크톱 머리 버튼 · 서류 화면 머리(올리기 전 · 확인)">
          <div className={styles.row}>
            <SensorDocAdd variant="button" />
          </div>
          <SensorDocAdd variant="head" />
          <SensorDocAdd variant="head" fileName="2026 센서 구입 영수증.pdf" />
        </Item>
        <Item id="doc-add-choice" name="sensor-doc-add — 모바일 '등록' 시트 2줄 (서류로 등록 / 직접 입력)">
          <SensorAddChoiceSheet directHref="/sensors/new" floating={false} />
        </Item>
        <Item id="sensor-link" name="sensor-link · new-sensor-fields (시안 17-doc-review — 기존 센서에 더하기 / 새 센서로 등록 펼침)">
          <SensorLinkDemo />
        </Item>
        <Item id="sensor-link-static" name="sensor-link — 뺌 · 바꾸기 목록 열림">
          <SensorLink itemName="실험용 비커" quantity={1} link={{ kind: "none" }} sensors={SCHOOL_SENSORS} />
          <SensorLink itemName="무선 편광계" quantity={1} link={{ kind: "sensor", sensorId: "s-2" }} sensors={SCHOOL_SENSORS} pickerOpen />
        </Item>
        <Item id="new-sensor-fields-static" name="new-sensor-fields — 카탈로그로 채운 값 옆 '카탈로그'">
          <NewSensorFields
            itemName="무선 비색·탁도"
            floating={false}
            value={{
              name: "무선 비색·탁도",
              type: "색·탁도",
              maker: "파스코",
              model: "PS-3215",
              quantity: "1",
              locationMode: "text",
              locationText: "",
              slotId: null,
              status: "ok",
              catalogFilled: ["name", "type"],
            }}
          />
        </Item>
        <Item id="new-sensor-fields-slot" name="new-sensor-fields — 보관 위치 '시약장 칸' 고름 (시약장 없음 → 비활성 상자 + 안내)">
          <NewSensorFields
            itemName="무선 편광계"
            floating={false}
            value={{
              name: "무선 편광계",
              type: "편광",
              maker: "파스코",
              model: "PS-3237",
              quantity: "1",
              locationMode: "slot",
              locationText: "",
              slotId: null,
              status: "ok",
            }}
          />
        </Item>
      </div>
    </main>
  );
}
