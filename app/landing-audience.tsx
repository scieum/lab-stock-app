"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Shot, ShotHome } from "@/components/product-shot";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import styles from "./landing-desktop.module.css";

type Audience = "teacher" | "student" | "admin";

const OPTIONS: SegmentOption[] = [
  { value: "teacher", label: "교사" },
  { value: "student", label: "학생" },
  { value: "admin", label: "관리자" },
];

/**
 * 역할별 카드 두 장. 교사는 시안 15-desktop audience-card 문구 그대로,
 * 학생·관리자는 시안에 그려지지 않은 탭이라 같은 모양으로 그 역할이 쓰는 기능(d7 역할 규칙)을 적었다.
 */
const CARDS: Record<Audience, { icon: IconName; title: string; desc: string }[]> = {
  teacher: [
    { icon: "file", title: "입고 · 실험 매뉴얼", desc: "서류를 올리면 AI가 품목을 읽고, 확인한 뒤 저장해요" },
    { icon: "bell", title: "재주문 알림 · 판매처", desc: "부족한 시약을 알림에서 바로 주문처로 이어요" },
  ],
  student: [
    { icon: "pen", title: "사용 기록", desc: "쓴 양과 사용일을 남기면 재고가 바로 줄어요" },
    { icon: "flask", title: "시약 찾기 · MSDS", desc: "보관 위치와 MSDS 요약을 목록에서 바로 봐요" },
  ],
  admin: [
    { icon: "users", title: "사용자 관리", desc: "우리 학교 선생님과 학생의 역할을 정해요" },
    { icon: "store", title: "판매처 · 시약장 설정", desc: "자주 쓰는 판매처와 시약장 칸을 학교에 맞게 정해요" },
  ],
};

const SHOT_LABEL: Record<Audience, string> = {
  teacher: "교사 화면 예시 — 관리 메뉴가 있는 데스크톱 홈",
  student: "학생 화면 예시 — 기본 메뉴만 있는 데스크톱 홈",
  admin: "관리자 화면 예시 — 학교 설정 메뉴가 있는 데스크톱 홈",
};

/**
 * 대상 탭 (시안 15-desktop section-band-7 audience-section, 흰 띠): 제목 32/700 → segmented-control 교사·학생·관리자(368) →
 * audience-body = 왼쪽 카드 2장(360, 사이 24) + 오른쪽 데스크톱 홈 조각(792 × 360, 역할마다 사이드바 메뉴가 다르다).
 */
export function LandingAudience() {
  const [who, setWho] = useState<Audience>("teacher");
  return (
    <section className={styles.bandWhite} aria-labelledby="landing-audience-title">
      <div className={styles.section}>
        <h2 id="landing-audience-title" className={styles.sectionTitle} data-reveal="">
          역할마다 필요한 만큼 보여요
        </h2>
        <div className={styles.audienceTabs} data-reveal="">
          <SegmentedControl
            options={OPTIONS}
            value={who}
            onChange={(v) => setWho(v === "student" || v === "admin" ? v : "teacher")}
            label="역할"
          />
        </div>
        <div className={styles.audienceBody} role="tabpanel" aria-label={OPTIONS.find((o) => o.value === who)?.label}>
          {/* 탭을 바꾸면 카드가 새로 그려지므로 떠오름 표시는 바뀌지 않는 묶음에 둔다 */}
          <div className={styles.audienceCards} data-reveal="">
            {CARDS[who].map((c) => (
              <article key={c.title} className={styles.audienceCard}>
                <Icon name={c.icon} className={styles.cardIcon} />
                <h3 className={styles.cardTitle}>{c.title}</h3>
                <p className={styles.cardDesc}>{c.desc}</p>
              </article>
            ))}
          </div>
          <div className={styles.audienceShot} data-reveal="">
            <Shot label={SHOT_LABEL[who]}>
              <ShotHome role={who} />
            </Shot>
          </div>
        </div>
      </div>
    </section>
  );
}
