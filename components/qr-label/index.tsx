import { CabinetNumber } from "@/components/cabinet-number";
import { QR_LABEL_HELP } from "@/lib/cabinet-rules";
import { qrPath } from "@/lib/qr";
import styles from "./styles.module.css";

type Props = {
  /** 학교명 ("샘플고등학교") */
  schoolName: string;
  /** 시약장 번호 (cabinet-number) */
  number: number;
  /** 시약장 이름 ("1번 시약장") */
  name: string;
  /** QR 내용 — lib/cabinet-rules cabinetQrUrl(origin, id) = "{origin}/scan?cabinet={id}" (d7 §14) */
  content: string;
  /** true = data-component 없이 (인쇄 전용 사본 — 화면에는 보이지 않는다) */
  bare?: boolean;
};

/**
 * QR 라벨 1장 (디자인 1.15 qr-label): 흑백 QR(1:1, 모서리 0) + 학교명 caption + cabinet-number · 시약장 이름(title)
 * + "QR을 찍으면 이 시약장의 시약을 봐요"(caption 회색). 인쇄물이라 흑백만 (핑크·하늘색 없음).
 * QR 은 lib/qr.ts(qrcode 패키지)로 모양만 만든다 — 서버·브라우저 어디서 그려도 같은 결과.
 */
export function QrLabel({ schoolName, number, name, content, bare = false }: Props) {
  const qr = qrPath(content);
  const body = (
    <>
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className={styles.qr} role="img" aria-label={`${name} QR 코드`}>
        <path d={qr.d} />
      </svg>
      <div className={styles.text}>
        <span className={styles.school}>{schoolName}</span>
        <span className={styles.title}>
          <CabinetNumber number={number} bare={bare} />
          <span className={styles.name}>{name}</span>
        </span>
        <span className={styles.help}>{QR_LABEL_HELP}</span>
      </div>
    </>
  );
  if (bare) return <div className={styles.label}>{body}</div>;
  return (
    <div data-component="qr-label" className={styles.label}>
      {body}
    </div>
  );
}
