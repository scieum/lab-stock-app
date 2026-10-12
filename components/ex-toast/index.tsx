import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  floating?: boolean;
  /**
   * done(기본) = 저장 완료 (진회색 바탕 + 흰 글자, 하늘색 체크 아이콘).
   * info = 안내 (시안 13-no-access ex-toast: 흰 pill + border-strong 테두리, 회색 info 아이콘 · 13 ink 글자 · 오른쪽 닫기 ×, 무채색)
   */
  tone?: "done" | "info";
  /** info: 오른쪽 닫기 × (44) */
  onClose?: () => void;
};

/** 토스트 (ex-toast) */
export function Toast({ children, floating, tone = "done", onClose }: Props) {
  const info = tone === "info";
  return (
    <div
      data-component="ex-toast"
      role="status"
      aria-live="polite"
      className={[styles.toast, info ? styles.info : "", floating ? styles.floating : ""].filter(Boolean).join(" ")}
    >
      <Icon name={info ? "info" : "check"} className={info ? styles.infoIcon : styles.icon} />
      <span className={info ? styles.label : undefined}>{children}</span>
      {info && onClose ? (
        <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
          <Icon name="close" className={styles.closeIcon} />
        </button>
      ) : null}
    </div>
  );
}
