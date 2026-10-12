// QR 읽기 (화면 12, d7 §26 카메라) — 브라우저 BarcodeDetector(qr_code) 가 있으면 그것, 없으면(iOS Safari 등) jsqr 로 프레임 해석.
// 영상·사진은 서버로 보내지 않는다 (모두 브라우저 안에서 읽는다). 클라이언트 전용.
import jsQR from "jsqr";

/** 한 프레임에서 QR 글자 하나를 읽는다 (없으면 null) */
export type QrDecoder = (source: HTMLVideoElement) => Promise<string | null>;

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** jsqr 로 읽을 때 프레임을 줄이는 최대 변 길이 (큰 영상도 빠르게 — 시약장 QR 은 화면 가운데에 크게 잡힌다) */
const JSQR_MAX_SIDE = 640;

/** 읽은 글자 정리 — 앞뒤 공백 제거, 빈 글자는 null */
export function cleanQrText(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t : null;
}

/** 줄인 프레임 크기 (긴 변이 max 이하, 비율 유지, 정수) */
export function scaledSize(width: number, height: number, max = JSQR_MAX_SIDE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * 연달아 같은 코드를 읽어도 한 번만 넘기는 거르개 (d7 §26 "같은 코드를 연달아 읽어도 토스트·시트는 한 번").
 * push(code) = 처음 보는(직전과 다른) 코드면 true. reset() 뒤에는 같은 코드도 다시 true.
 */
export function createRepeatFilter() {
  let last: string | null = null;
  return {
    push(code: string): boolean {
      if (code === last) return false;
      last = code;
      return true;
    },
    reset() {
      last = null;
    },
  };
}

function barcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

async function nativeDecoder(): Promise<QrDecoder | null> {
  const Ctor = barcodeDetectorCtor();
  if (!Ctor) return null;
  try {
    if (Ctor.getSupportedFormats) {
      const formats = await Ctor.getSupportedFormats();
      if (!formats.includes("qr_code")) return null;
    }
    const detector = new Ctor({ formats: ["qr_code"] });
    return async (video) => {
      if (video.readyState < 2) return null;
      const found = await detector.detect(video);
      return cleanQrText(found[0]?.rawValue);
    };
  } catch {
    return null;
  }
}

function jsqrDecoder(): QrDecoder {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return async (video) => {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    const { width, height } = scaledSize(video.videoWidth, video.videoHeight);
    if (!canvas) {
      canvas = document.createElement("canvas");
      ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!ctx) return null;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    const hit = jsQR(img.data, width, height, { inversionAttempts: "dontInvert" });
    return cleanQrText(hit?.data);
  };
}

/** 쓸 수 있는 읽기 도구: BarcodeDetector 우선, 없으면 jsqr */
export async function createQrDecoder(): Promise<{ decode: QrDecoder; engine: "native" | "jsqr" }> {
  const native = await nativeDecoder();
  if (native) return { decode: native, engine: "native" };
  return { decode: jsqrDecoder(), engine: "jsqr" };
}
