import type { Metadata } from "next";
import Link from "next/link";
import { BulkDeleteConfirm } from "@/components/bulk-action-bar/confirm";
import { SensorDeleteConfirm } from "@/components/sensor-delete";
import styles from "../gallery.module.css";

export const metadata: Metadata = { title: "삭제 확인 카드 갤러리 · Lab_Stock" };

/** 디자인 1.26 bulk_delete.confirm (2-bulk-delete) · sensor.delete — 확인 카드 예시 (본 갤러리의 ex-modal-card 개수와 섞이지 않게 따로) */
export default function SensorGalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>삭제 확인 카드</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <div className={styles.grid}>
        <section className={styles.item} aria-labelledby="g-bulk-reagent">
          <h2 id="g-bulk-reagent" className={styles.itemName}>
            ex-modal-card — 시약 여러 개 삭제 (시안 2-bulk-delete)
          </h2>
          <div className={styles.stage}>
            <BulkDeleteConfirm kind="reagent" names={["과산화수소", "구리 가루", "글리세린", "나프탈렌", "녹말 가루"]} sheet={false} />
          </div>
        </section>
        <section className={styles.item} aria-labelledby="g-bulk-sensor">
          <h2 id="g-bulk-sensor" className={styles.itemName}>
            ex-modal-card — 센서 여러 개 삭제
          </h2>
          <div className={styles.stage}>
            <BulkDeleteConfirm kind="sensor" names={["무선 pH 센서", "운동 센서"]} sheet={false} />
          </div>
        </section>
        <section className={styles.item} aria-labelledby="g-sensor-delete">
          <h2 id="g-sensor-delete" className={styles.itemName}>
            ex-modal-card — 센서 하나 삭제 (sensor-delete)
          </h2>
          <div className={styles.stage}>
            <SensorDeleteConfirm name="무선 pH 센서" sheet={false} />
          </div>
        </section>
      </div>
    </main>
  );
}
