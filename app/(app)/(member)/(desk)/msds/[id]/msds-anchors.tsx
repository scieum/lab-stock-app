"use client";

import { useState } from "react";
import { MSDS_SECTION_ANCHORS, MSDS_SECTION_KEYS, msdsSectionId, type MsdsSectionKey } from "@/lib/msds-summary";
import styles from "./msds.module.css";

/**
 * 데스크톱 드로어 항목 바로가기 (시안 16-desktop section-anchors): "2. 유해·위험성 · 4. 응급조치 · 7. 취급·저장 · 8. 보호구"
 * (13/600, 누름 높이 44, 사이 16). 누르면 드로어 안에서 그 항목 카드로 내려가고, 누른 바로가기에 하늘색 밑줄 2.
 * 주소창은 바꾸지 않는다 (드로어 상태 = 경로).
 */
export function MsdsAnchors({ prefix }: { prefix: string }) {
  const [active, setActive] = useState<MsdsSectionKey>(MSDS_SECTION_KEYS[0]);
  return (
    <nav className={styles.anchors} aria-label="MSDS 항목 바로가기" data-name="section-anchors">
      {MSDS_SECTION_KEYS.map((key) => {
        const id = msdsSectionId(prefix, key);
        return (
          <a
            key={key}
            href={`#${id}`}
            className={[styles.anchor, key === active ? styles.anchorActive : ""].filter(Boolean).join(" ")}
            aria-current={key === active ? "true" : undefined}
            data-name="anchor-link"
            onClick={(e) => {
              e.preventDefault();
              setActive(key);
              document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          >
            {MSDS_SECTION_ANCHORS[key]}
          </a>
        );
      })}
    </nav>
  );
}
