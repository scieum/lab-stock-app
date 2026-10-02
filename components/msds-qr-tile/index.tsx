import styles from "./styles.module.css";

/**
 * MSDS QR 타일. children = QR 이미지(SVG·img). 없으면 자리 표시 패턴.
 */
export function MsdsQrTile({
  children,
  caption = "QR로 MSDS 열기",
}: {
  children?: React.ReactNode;
  caption?: string;
}) {
  return (
    <figure data-component="msds-qr-tile" className={styles.tile}>
      <div className={styles.image}>{children ?? <QrPlaceholder />}</div>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

/**
 * 실제 QR (lib/qr.ts qrPath 결과). 색은 CSS 토큰(.qr fill = --color-text, 바탕 = 타일 --color-surface).
 */
export function QrCodeSvg({ size, d, label }: { size: number; d: string; label: string }) {
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={styles.qr} role="img" aria-label={label}>
      <path d={d} />
    </svg>
  );
}

// 21x21 모듈 자리 표시 (파인더 패턴 3개)
function QrPlaceholder() {
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} />
      <rect x={x + 1} y={y + 1} width={5} height={5} className={styles.qrGap} />
      <rect x={x + 2} y={y + 2} width={3} height={3} />
    </g>
  );
  const dots: [number, number][] = [
    [9, 1], [11, 2], [9, 4], [12, 5], [10, 7], [8, 9], [13, 9], [2, 9], [5, 10], [16, 9],
    [18, 10], [9, 11], [11, 12], [14, 12], [17, 13], [9, 14], [12, 15], [15, 15], [19, 16],
    [10, 17], [13, 18], [16, 18], [9, 19], [18, 19], [11, 20], [14, 20],
  ];
  return (
    <svg viewBox="0 0 21 21" className={styles.qr} role="img" aria-label="MSDS QR 코드">
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
      {dots.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  );
}
