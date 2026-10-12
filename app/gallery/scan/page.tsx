import type { Metadata } from "next";
import Link from "next/link";
import { ScanGalleryDemo } from "./demo";
import styles from "../gallery.module.css";

export const metadata: Metadata = { title: "QR 찾기 갤러리 · Lab_Stock" };

/** 디자인 1.26 화면 12 · 12-result — qr-scan · qr-manual-entry · qr-result-sheet 예시 (카메라 없이 모양만) */
export default function ScanGalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>QR 찾기</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <ScanGalleryDemo />
    </main>
  );
}
