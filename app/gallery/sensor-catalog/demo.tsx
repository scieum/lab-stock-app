"use client";

import { useState } from "react";
import { CatalogFillNote } from "@/components/catalog-fill-note";
import { NewSensorFields } from "@/components/new-sensor-fields";
import { SensorLink } from "@/components/sensor-link";
import { SensorModelSuggest } from "@/components/sensor-model-suggest";
import { SensorTypeGroup } from "@/components/sensor-type-group";
import { SensorTypeSelect } from "@/components/sensor-type-select";
import { TextInput } from "@/components/text-input";
import { catalogFill, type PascoModel } from "@/lib/pasco-catalog";
import type { NewSensorDraft, SchoolSensor, SensorDocLink } from "@/lib/sensor-doc-rules";
import { SENSOR_TYPE_GROUPS, initialOpenTypeGroups, typeGroupSelectedCount, type SensorType } from "@/lib/sensor-rules";
import styles from "../gallery.module.css";

/** 고르기 칸 → 시트 (떠 있는 자리) */
export function TypeSelectDemo() {
  const [value, setValue] = useState<SensorType | "">("편광");
  return <SensorTypeSelect variant="box" value={value} onChange={setValue} />;
}

/** 필터 시트의 종류 묶음 (시안 17-filter: 화학 · 2개 펼침, 여러 개 고르기, 검색 없음) */
export function TypeFilterDemo() {
  const [selected, setSelected] = useState<SensorType[]>(["분광", "편광"]);
  const [open, setOpen] = useState<string[]>(() => initialOpenTypeGroups(["분광", "편광"]));
  return (
    <div>
      {SENSOR_TYPE_GROUPS.map((g, i) => {
        const n = typeGroupSelectedCount(g, selected);
        return (
          <SensorTypeGroup
            key={g.title}
            title={g.title}
            types={g.types}
            count={n > 0 ? `· ${n}개` : ""}
            open={open.includes(g.title)}
            onToggle={() => setOpen((o) => (o.includes(g.title) ? o.filter((t) => t !== g.title) : [...o, g.title]))}
            selected={selected}
            onPick={(t) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}
            first={i === 0}
          />
        );
      })}
    </div>
  );
}

/** 회사 = 파스코 모델명 칸 + 후보 + 채움 안내 (시안 17-model) */
export function ModelSuggestDemo() {
  const [model, setModel] = useState("PS-321");
  const [name, setName] = useState("");
  const [type, setType] = useState<SensorType | "">("");
  const [filled, setFilled] = useState<("type" | "name")[]>([]);
  const [listOpen, setListOpen] = useState(true);
  const pick = (m: PascoModel) => {
    const f = catalogFill(m, { name });
    setModel(f.model);
    setName(f.name);
    setType(f.type);
    setFilled(f.filled);
    setListOpen(false);
  };
  return (
    <div className={styles.stage}>
      <TextInput label="이름" value={name} onChange={(e) => setName(e.target.value)} edited={filled.includes("name")} />
      <SensorTypeSelect variant="box" value={type} onChange={setType} filled={filled.includes("type")} />
      <div>
        <TextInput
          label="모델명"
          value={model}
          autoComplete="off"
          onChange={(e) => {
            setModel(e.target.value);
            setFilled([]);
            setListOpen(true);
          }}
        />
        {listOpen && model.trim() ? (
          <SensorModelSuggest query={model} selectedModel={model} floating={false} onPick={pick} onRaw={() => setListOpen(false)} />
        ) : null}
      </div>
      {filled.length > 0 ? <CatalogFillNote filled={filled} /> : null}
    </div>
  );
}

const SCHOOL_SENSORS: SchoolSensor[] = [
  { id: "s-1", name: "무선 온도 센서", maker: "파스코", model: "PS-3201", quantity: 3 },
  { id: "s-2", name: "무선 편광계", maker: "파스코", model: "PS-3237", quantity: 1 },
];

/** 확인 표 행 아래 연결 줄 + 새 센서 칸 (시안 17-doc-review) */
export function SensorLinkDemo() {
  const [a, setA] = useState<SensorDocLink>({ kind: "sensor", sensorId: "s-1" });
  const [b, setB] = useState<SensorDocLink>({ kind: "new" });
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState<NewSensorDraft>({
    name: "무선 CO₂ 센서",
    type: "CO₂",
    maker: "이지메이커",
    model: "",
    quantity: "2",
    locationMode: "text",
    locationText: "과학실 뒤 선반",
    slotId: null,
    status: "ok",
  });
  return (
    <div className={styles.stage}>
      <SensorLink itemName="무선 온도 센서" quantity={2} link={a} sensors={SCHOOL_SENSORS} onChange={setA} />
      <SensorLink
        itemName="무선 CO₂ 센서"
        quantity={2}
        link={b}
        sensors={SCHOOL_SENSORS}
        expanded={expanded}
        onChange={setB}
        onToggleExpand={() => setExpanded((e) => !e)}
      />
      {b.kind === "new" && expanded ? (
        <NewSensorFields itemName="무선 CO₂ 센서" value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
      ) : null}
    </div>
  );
}
