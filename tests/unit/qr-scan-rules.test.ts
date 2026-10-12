// 화면 12 (QR 찾기) 순수 규칙 — lib/qr-decode(같은 코드 거르기 · 글자 정리 · jsqr 대체 경로) · lib/cabinet-rules parseCabinetQr(§26 QR 해석).
// 기대값: harness/d7-data.md §26 "카메라"(BarcodeDetector 없으면 jsqr, 서버로 영상을 보내지 않음) · "QR 해석"(같은 origin · /scan?cabinet={uuid},
//         같은 코드를 연달아 읽어도 토스트·시트는 한 번) · §14(QR 내용 `{origin}/scan?cabinet={cabinet id}`), harness/dev-rules.json routes 12.
//         구현 상수는 기대값으로 쓰지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { cabinetQrUrl, parseCabinetQr } from "../../lib/cabinet-rules";
import { cleanQrText, createRepeatFilter } from "../../lib/qr-decode";
import { ROOT, dev } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const D7_26 = D7.slice(D7.indexOf("## 26."), D7.indexOf("\n## ", D7.indexOf("## 26.") + 1));
const row = (head: string) => D7_26.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";
const SCAN = dev.routes["12"] as string;
const ORIGIN = "https://lab-stock.example.app";
const ID = "3f2b8c1e-9a4d-4e6f-b7a1-0c5d2e8f9a10";
const ID2 = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/** QR 그림(검정 모듈 = 0, 흰 = 255 RGBA, 여백 4 · 모듈 4px) — 카메라 한 프레임 대신 */
function qrImage(text: string): { data: Uint8ClampedArray; width: number; height: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const scale = 4;
  const quiet = 4;
  const size = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: size, height: size };
}

describe("[K1][S12] 기대값 원본 (d7 §26 · dev-rules routes)", () => {
  it("[K1][S12] d7 §26 QR 해석 = parseCabinetQr · 같은 origin · /scan?cabinet={uuid} · 연달아 읽어도 한 번 / 카메라 = BarcodeDetector 없으면 jsqr / routes 12 = /scan", () => {
    const qr = row("QR 해석");
    expect(qr).toContain("parseCabinetQr");
    expect(qr).toContain("`/scan?cabinet={uuid}`");
    expect(qr).toContain("같은 코드를 연달아 읽어도 토스트·시트는 한 번");
    expect(row("카메라")).toContain("`jsqr`");
    expect(row("카메라")).toContain("서버로 영상·사진을 보내지 않는다");
    expect(SCAN).toBe("/scan");
  });
});

describe("[K1][S12] createRepeatFilter — 같은 코드를 연달아 읽어도 한 번 (d7 §26)", () => {
  it("[K1][S12] 처음 코드는 통과, 같은 코드를 연달아 여러 번 읽으면 두 번째부터 거른다", () => {
    const f = createRepeatFilter();
    const a = cabinetQrUrl(ORIGIN, ID);
    expect(f.push(a), "처음").toBe(true);
    for (let i = 0; i < 20; i++) expect(f.push(a), `연달아 ${i + 2}번째`).toBe(false);
  });

  it("[K1][S12] 다른 코드로 바뀌면 통과 — 그 뒤 처음 코드로 돌아와도 직전과 다르면 다시 통과", () => {
    const f = createRepeatFilter();
    const a = cabinetQrUrl(ORIGIN, ID);
    const b = cabinetQrUrl(ORIGIN, ID2);
    expect([a, a, b, b, b, a, a, "hello", "hello", a].map((c) => f.push(c))).toEqual([true, false, true, false, false, true, false, true, false, true]);
  });

  it("[K1][S12] reset() 뒤(결과를 닫고 스캔으로 돌아옴)에는 같은 코드도 다시 한 번 통과", () => {
    const f = createRepeatFilter();
    const a = cabinetQrUrl(ORIGIN, ID);
    expect(f.push(a)).toBe(true);
    expect(f.push(a)).toBe(false);
    f.reset();
    expect(f.push(a), "reset 뒤 처음").toBe(true);
    expect(f.push(a), "reset 뒤 연달아").toBe(false);
  });

  it("[K1][S12] 거르개마다 따로 기억한다 (두 거르개가 서로 섞이지 않음)", () => {
    const f1 = createRepeatFilter();
    const f2 = createRepeatFilter();
    expect(f1.push("x")).toBe(true);
    expect(f2.push("x"), "다른 거르개는 처음").toBe(true);
    expect(f1.push("x")).toBe(false);
  });
});

describe("[K1][S12] cleanQrText — 읽은 글자 정리", () => {
  it("[K1][S12] 앞뒤 공백·줄바꿈을 지우고, 빈 글자 · 문자열 아님은 null", () => {
    const a = cabinetQrUrl(ORIGIN, ID);
    expect(cleanQrText(`  ${a}\n`)).toBe(a);
    expect(cleanQrText(`\t${a}\r\n`)).toBe(a);
    for (const v of ["", "   ", "\n\t", null, undefined]) expect(cleanQrText(v as string | null | undefined), JSON.stringify(v)).toBeNull();
  });
});

describe("[K1][S12] parseCabinetQr — 화면 12 QR 해석 (d7 §26 · §14)", () => {
  it("[K1][S12] 화면 11 이 인쇄한 QR 내용(cabinetQrUrl)은 같은 origin 에서 시약장 id 로, 경로는 routes 12", () => {
    const text = cabinetQrUrl(ORIGIN, ID);
    expect(new URL(text).pathname, "QR 경로 = routes 12").toBe(SCAN);
    expect(parseCabinetQr(text, ORIGIN)).toBe(ID);
  });

  it("[K1][S12] id 대문자는 소문자로 (DB uuid 와 같게), 앞뒤 공백·줄바꿈은 무시", () => {
    expect(parseCabinetQr(`${ORIGIN}${SCAN}?cabinet=${ID.toUpperCase()}`, ORIGIN)).toBe(ID);
    expect(parseCabinetQr(`  ${cabinetQrUrl(ORIGIN, ID)}\n`, ORIGIN)).toBe(ID);
  });

  it("[K1][S12] 시약장 QR 이 아닌 코드(일반 URL · 글자 · 다른 앱 링크 · 다른 origin)는 null → '시약장 QR이 아니에요'", () => {
    for (const t of [
      "https://example.com",
      "시약장 1번",
      "12345",
      `${ORIGIN}/reagents?cabinet=${ID}`,
      `${ORIGIN}${SCAN}`,
      `${ORIGIN}${SCAN}?cabinet=`,
      `${ORIGIN}${SCAN}?cabinet=1`,
      `https://other.example.app${SCAN}?cabinet=${ID}`,
      `http://lab-stock.example.app${SCAN}?cabinet=${ID}`,
      `${ORIGIN}${SCAN}?cabinet=${ID}&next=/users`,
      `${ORIGIN}${SCAN}?cabinet=${ID}#x`,
    ])
      expect(parseCabinetQr(t, ORIGIN), t).toBeNull();
  });

  it("[K1][S12] 다른 학교 시약장 QR 도 모양은 같은 시약장 QR — 해석은 id 를 돌려주고, 학교 판정은 RLS 조회(0행)가 한다 (d7 §26 화면 12 데이터)", () => {
    // 학교 정보는 QR 내용에 없다 (§14 `{origin}/scan?cabinet={cabinet id}`) → 순수 함수는 학교를 가리지 않는다
    expect(parseCabinetQr(cabinetQrUrl(ORIGIN, ID2), ORIGIN)).toBe(ID2);
    expect(row("화면 12 데이터")).toContain("다른 학교 id 는 0행");
  });
});

describe("[K1][S12] jsqr 대체 경로 — BarcodeDetector 없는 브라우저(iOS Safari 등)에서 프레임을 jsqr 로 읽어 해석", () => {
  it("[K1][S12] 시약장 QR 그림 → jsQR → cleanQrText → parseCabinetQr = 그 시약장 id", () => {
    const text = cabinetQrUrl(ORIGIN, ID);
    const img = qrImage(text);
    const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    expect(hit, "jsqr 가 QR 을 찾음").not.toBeNull();
    expect(parseCabinetQr(cleanQrText(hit!.data), ORIGIN)).toBe(ID);
  });

  it("[K1][S12] 시약장 QR 이 아닌 그림 → 읽혀도 parseCabinetQr null · 빈 그림은 jsqr null", () => {
    const img = qrImage("https://example.com/hello");
    const hit = jsQR(img.data, img.width, img.height);
    expect(hit?.data).toBe("https://example.com/hello");
    expect(parseCabinetQr(cleanQrText(hit!.data), ORIGIN)).toBeNull();
    const blank = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    expect(jsQR(blank, 200, 200)).toBeNull();
  });

  it("[K1][S12] 같은 QR 을 프레임마다 읽어도 거르개를 지나면 한 번", () => {
    const img = qrImage(cabinetQrUrl(ORIGIN, ID));
    const f = createRepeatFilter();
    const passed: string[] = [];
    for (let i = 0; i < 5; i++) {
      const t = cleanQrText(jsQR(img.data, img.width, img.height)?.data);
      if (t && f.push(t)) passed.push(t);
    }
    expect(passed.map((t) => parseCabinetQr(t, ORIGIN))).toEqual([ID]);
  });
});
