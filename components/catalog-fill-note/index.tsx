import { Icon } from "@/components/icons";
import { catalogFillNote } from "@/lib/pasco-catalog";
import styles from "./styles.module.css";

type Props = {
  /** 카탈로그로 채운 칸 — 채운 칸만 이름 ("종류·이름" / "종류") */
  filled?: readonly ("type" | "name")[];
  className?: string;
};

/**
 * 카탈로그 채움 안내 (rules 1.28 sensor.catalog.fill, 시안 17-model catalog-fill-note):
 * 모델명 아래 icon-info 16(muted) + caption 12 muted "카탈로그에서 종류·이름을 채웠어요", 사이 4. 핑크 없음.
 */
export function CatalogFillNote({ filled = ["type", "name"], className }: Props) {
  const text = catalogFillNote(filled);
  if (!text) return null;
  return (
    <p data-component="catalog-fill-note" role="status" className={[styles.note, className ?? ""].filter(Boolean).join(" ")}>
      <Icon name="info" className={styles.icon} />
      <span>{text}</span>
    </p>
  );
}
