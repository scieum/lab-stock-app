"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import { CATALOG_TEXT, catalogKey, catalogMatchRange, pascoCaption, searchPascoCatalog, type PascoModel } from "@/lib/pasco-catalog";
import styles from "./styles.module.css";

type Props = {
  /** 모델명 칸에 적은 글자 (모델번호·한국어 이름으로 검색) */
  query: string;
  /** 지금 모델명 칸 값과 같은 카탈로그 모델 (✓ + highlight-soft) */
  selectedModel?: string | null;
  onPick?: (m: PascoModel) => void;
  /** "목록에 없어요 — 그대로 적기" (목록을 닫고 적은 글자 그대로) */
  onRaw?: () => void;
  /** true(기본) = 모델명 칸 아래로 떠 있는 목록(모바일 입력 아래 · 데스크톱 드롭다운). false = 제자리(갤러리) */
  floating?: boolean;
  /** 모델명 input 의 id (aria-controls 를 거는 쪽이 쓴다) */
  id?: string;
};

/** 모델번호 안 입력과 맞은 글자만 bold (시안 model-number: match 700 + rest 400) */
function ModelNumber({ model, query }: { model: string; query: string }) {
  const r = catalogMatchRange(model, query);
  if (!r) return <span className={styles.rest}>{model}</span>;
  return (
    <>
      {r[0] > 0 ? <span className={styles.rest}>{model.slice(0, r[0])}</span> : null}
      <span className={styles.match} data-name="match">
        {model.slice(r[0], r[1])}
      </span>
      {r[1] < model.length ? <span className={styles.rest}>{model.slice(r[1])}</span> : null}
    </>
  );
}

/**
 * 파스코 모델 후보 (rules 1.28 sensor.catalog.suggest, 시안 17-model sensor-model-suggest):
 * 회사 = 파스코일 때 모델명 text-input 아래 목록 — 흰 바탕 · border-strong 테두리 · radius 16.
 * 행 = 모델번호(17, 맞은 글자 700) + caption "무선 편광계 · 편광"(12 muted), 안쪽 12/16 · 줄 사이 hairline-soft, 최대 6줄.
 * 고른 모델 = highlight-soft + ✓. 맨 끝 조용한 "목록에 없어요 — 그대로 적기"(13 muted). 맞는 모델이 없으면 그 줄만.
 */
export function SensorModelSuggest({ query, selectedModel, onPick, onRaw, floating = true, id }: Props) {
  const autoId = useId();
  const listId = id ?? autoId;
  const items = searchPascoCatalog(query);
  const selectedKey = selectedModel ? catalogKey(selectedModel) : "";
  return (
    <div data-component="sensor-model-suggest" className={[styles.list, floating ? styles.floating : ""].filter(Boolean).join(" ")}>
      <ul id={listId} role="listbox" aria-label="파스코 모델 후보" className={styles.rows}>
        {items.map((m) => {
          const on = selectedKey !== "" && catalogKey(m.model) === selectedKey;
          return (
            <li key={m.model} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={on}
                data-name="suggest-row"
                className={[styles.row, on ? styles.on : ""].filter(Boolean).join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick?.(m)}
              >
                <span className={styles.text} data-name="suggest-text">
                  <span className={styles.model} data-name="model-number">
                    <ModelNumber model={m.model} query={query} />
                  </span>
                  <span className={styles.caption}>{pascoCaption(m)}</span>
                </span>
                {on ? <Icon name="check" className={styles.check} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.raw} data-name="suggest-raw" onMouseDown={(e) => e.preventDefault()} onClick={onRaw}>
        {CATALOG_TEXT.raw}
      </button>
    </div>
  );
}
