import { ButtonOutline } from "@/components/button-outline";
import styles from "./styles.module.css";

/**
 * 센서 수정 진입 (디자인 1.26 sensor.detail, sensor-edit): 상세 아래 button-outline "수정" 전폭. 교사·admin 만 (R5).
 * 모바일 = 화면 아래 edit-bar, 데스크톱 = 드로어 아래 drawer-foot.
 */
export function SensorEdit({ href, className }: { href: string; className?: string }) {
  return (
    <div data-component="sensor-edit" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <ButtonOutline href={href} className={styles.button}>
        수정
      </ButtonOutline>
    </div>
  );
}
