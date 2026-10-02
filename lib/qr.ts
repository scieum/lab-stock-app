import QRCode from "qrcode";

/** 조용한 영역(quiet zone) 모듈 수 — 타일 흰 바탕 위에서도 스캐너가 경계를 잡도록 */
const QUIET_ZONE = 2;

export type QrMatrixPath = {
  /** viewBox 한 변 (모듈 단위, 조용한 영역 포함) */
  size: number;
  /** 어두운 모듈을 이은 SVG path d — 색은 CSS(토큰)로 칠한다 */
  d: string;
};

/**
 * 문자열을 QR 행렬로 만들어 SVG path 로 돌려준다.
 * 라이브러리의 색 옵션(hex)을 쓰지 않고 모양만 만든다 — 색은 msds-qr-tile CSS 의 토큰.
 */
export function qrPath(text: string): QrMatrixPath {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const parts: string[] = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!qr.modules.get(y, x)) {
        x++;
        continue;
      }
      // 같은 줄에서 이어지는 어두운 모듈은 한 사각형으로
      let run = 1;
      while (x + run < n && qr.modules.get(y, x + run)) run++;
      parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return { size: n + QUIET_ZONE * 2, d: parts.join("") };
}
