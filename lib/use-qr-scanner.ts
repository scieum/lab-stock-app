"use client";

// 화면 12 카메라 (d7 §26): getUserMedia 후면 카메라 우선 → 프레임마다 QR 읽기(BarcodeDetector 우선, jsqr 대체).
// active=false(화면을 떠남 · "번호로 찾기"로 바꿈 · 결과 시트 열림)이면 카메라를 끈다. 플래시는 트랙 torch 지원 때만.
import { useCallback, useEffect, useRef, useState } from "react";
import { createQrDecoder, createRepeatFilter } from "@/lib/qr-decode";

export type QrScannerStatus = "idle" | "starting" | "scanning" | "unavailable";

type Options = {
  /** true = 카메라 켜고 읽기 */
  active: boolean;
  /** 새 코드를 읽었을 때 (직전과 같은 코드는 다시 부르지 않는다 — resetRepeat 로 풀기) */
  onCode: (text: string) => void;
  /** 읽기 사이 간격(ms) */
  intervalMs?: number;
};

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export function useQrScanner({ active, onCode, intervalMs = 200 }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const repeat = useRef(createRepeatFilter());
  const onCodeRef = useRef(onCode);
  const [status, setStatus] = useState<Exclude<QrScannerStatus, "idle">>("starting");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      trackRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        if (!cancelled) setStatus("unavailable");
        return;
      }
      if (cancelled) {
        stop();
        return;
      }
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
      setTorchSupported(Boolean(caps.torch));
      const video = videoRef.current;
      if (!video) {
        stop();
        setStatus("unavailable");
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      try {
        await video.play();
      } catch {
        // 자동 재생이 막혀도 프레임은 들어온다 — 읽기는 계속 시도
      }
      const { decode } = await createQrDecoder();
      if (cancelled) return;
      setStatus("scanning");
      const tick = async () => {
        if (cancelled) return;
        try {
          const text = await decode(video);
          if (!cancelled && text && repeat.current.push(text)) onCodeRef.current(text);
        } catch {
          // 한 프레임 실패는 넘어간다
        }
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      stop();
      // 다음에 켤 때는 처음부터 (꺼진 동안 바깥에는 "idle")
      setStatus("starting");
      setTorchOn(false);
      setTorchSupported(false);
    };
  }, [active, intervalMs]);

  /** 플래시 켜기/끄기 (지원할 때만) */
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn, torchSupported]);

  /** 같은 코드를 다시 받아들이게 한다 (결과 시트를 닫고 다시 스캔할 때) */
  const resetRepeat = useCallback(() => repeat.current.reset(), []);

  return { videoRef, status: (active ? status : "idle") as QrScannerStatus, torchSupported, torchOn, toggleTorch, resetRepeat };
}
