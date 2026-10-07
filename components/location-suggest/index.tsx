import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import { Icon } from "@/components/icons";
import { SuggestBadge } from "@/components/suggest-badge";
import styles from "./styles.module.css";

/** 추천 칸이 없을 때 안내 (design/rules.json suggest.after_register · d7 §17) */
export const NO_SUGGEST_TEXT = "맞는 칸이 없어요 — 시약장 설정에서 칸 분류를 정해 주세요";

export type LocationSuggestItem = {
  id: string;
  name: string;
  /** 시약 보관 분류 (이름 옆 회색 글자) */
  storageClass?: string | null;
  /** 추천 칸 — 없으면 null ("맞는 칸이 없어요") */
  suggestion: {
    /** 시약장 번호 (번호 원) */
    cabinetNumber: number;
    /** "2번 시약장 · 우 2단" (lib/cabinet-rules locationText) */
    text: string;
  } | null;
  /** 이미 추천 칸에 뒀다 */
  placed?: boolean;
};

type Props = {
  items: readonly LocationSuggestItem[];
  /** [여기에 두기] — 추천 칸에 넣는다 (place_reagent) */
  onPlace?: (id: string) => void;
  /** [다른 칸] — 화면 3 위치 피커로 (주소) */
  otherHref?: (id: string) => string;
  /** [다른 칸] — 주소 대신 동작 (갤러리) */
  onOther?: (id: string) => void;
  /** "모두 추천대로" — 아직 두지 않은 추천 칸 시약을 모두 넣는다 (여러 개일 때만 보인다) */
  onPlaceAll?: () => void;
  /** "나중에" — 화면 2 로 */
  onLater?: () => void;
  /** 시약장 설정 (추천 없음 줄의 버튼) */
  cabinetsHref?: string;
  /** 넣는 중인 시약 (그 줄의 버튼 비활성) · 모두 넣는 중 */
  pendingId?: string | null;
  pendingAll?: boolean;
  /** 넣기 실패 안내 (서버 문구) */
  error?: string | null;
  className?: string;
};

/**
 * 새 시약 등록 직후 보관 위치 정하기 (디자인 1.17 location-suggest, d7 §17 — 교사·admin, 화면 7).
 * 제목 "보관 위치 정하기" + caption "새 시약 N개의 칸을 추천했어요" → 시약마다 회색 카드:
 * 이름 · 분류 → "추천 위치:" + 번호 원 + "2번 시약장 · 우 2단" + suggest-badge → [다른 칸](button-outline) [여기에 두기](button-primary).
 * 추천 칸이 없으면 "맞는 칸이 없어요 — …" + 시약장 설정(button-pill-soft). 여러 개면 아래 "모두 추천대로"(button-primary) · "나중에".
 * 번호 원은 화면 3·11 의 cabinet-number 와 같은 모양이지만 화면 7 소속이 아니라 data-component 없이(bare) 그린다.
 */
export function LocationSuggest({
  items,
  onPlace,
  otherHref,
  onOther,
  onPlaceAll,
  onLater,
  cabinetsHref = "/cabinets",
  pendingId = null,
  pendingAll = false,
  error,
  className,
}: Props) {
  const suggested = items.filter((i) => i.suggestion);
  const remaining = suggested.filter((i) => !i.placed);
  const busy = pendingAll || pendingId !== null;
  const caption =
    suggested.length > 0 ? `새 시약 ${items.length}개의 칸을 추천했어요` : `새 시약 ${items.length}개에 맞는 칸이 없어요`;

  return (
    <section data-component="location-suggest" aria-label="보관 위치 정하기" className={[styles.root, className ?? ""].filter(Boolean).join(" ")}>
      <div className={styles.head}>
        <h2 className={styles.heading}>
          보관 위치 정하기
        </h2>
        <p className={styles.caption}>{caption}</p>
      </div>

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={[styles.row, item.suggestion ? styles.rowSuggested : ""].filter(Boolean).join(" ")} data-testid="location-suggest-row">
            <div className={styles.rowText}>
              <p className={styles.rowTitle}>
                <span className={styles.name}>{item.name}</span>
                {item.storageClass ? <span className={styles.cls}>{item.storageClass}</span> : null}
              </p>
              {item.suggestion ? (
                <p className={styles.suggestLine}>
                  <span>{item.placed ? "보관 위치:" : "추천 위치:"}</span>
                  <CabinetNumber number={item.suggestion.cabinetNumber} bare />
                  <span className={styles.value}>{item.suggestion.text}</span>
                  {item.placed ? null : <SuggestBadge />}
                </p>
              ) : (
                <p className={styles.noSlot}>{NO_SUGGEST_TEXT}</p>
              )}
            </div>
            {item.suggestion ? (
              item.placed ? (
                <p className={styles.done} role="status">
                  <Icon name="check" className={styles.doneIcon} />
                  <span>여기에 뒀어요</span>
                </p>
              ) : (
                <div className={styles.actions}>
                  {otherHref ? (
                    <ButtonOutline href={otherHref(item.id)} className={styles.actionButton} aria-label={`${item.name} 다른 칸`}>
                      다른 칸
                    </ButtonOutline>
                  ) : (
                    <ButtonOutline
                      className={styles.actionButton}
                      aria-label={`${item.name} 다른 칸`}
                      disabled={busy}
                      onClick={onOther ? () => onOther(item.id) : undefined}
                    >
                      다른 칸
                    </ButtonOutline>
                  )}
                  <ButtonPrimary
                    className={styles.actionButton}
                    aria-label={`${item.name} 여기에 두기`}
                    disabled={busy}
                    aria-busy={pendingId === item.id || undefined}
                    onClick={onPlace ? () => onPlace(item.id) : undefined}
                  >
                    여기에 두기
                  </ButtonPrimary>
                </div>
              )
            ) : (
              <ButtonPillSoft href={cabinetsHref} tone="white" icon="chevron-right" className={styles.settings}>
                시약장 설정
              </ButtonPillSoft>
            )}
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <div className={styles.footer}>
        {items.length > 1 && remaining.length > 0 ? (
          <ButtonPrimary fullWidth disabled={busy} aria-busy={pendingAll || undefined} onClick={onPlaceAll}>
            모두 추천대로
          </ButtonPrimary>
        ) : null}
        <button type="button" className={styles.later} disabled={pendingAll} onClick={onLater}>
          나중에
        </button>
      </div>
    </section>
  );
}
