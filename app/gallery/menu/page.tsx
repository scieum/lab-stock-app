import type { Metadata } from "next";
import Link from "next/link";
import { InviteCancel, InviteCancelConfirm } from "@/components/invite-cancel";
import { InviteMoreMenu } from "@/components/invite-more-menu";
import styles from "../gallery.module.css";
import { InviteCancelDemo } from "./demo";

export const metadata: Metadata = { title: "초대 취소 갤러리 · Lab_Stock" };

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 디자인 1.28 (d7 §28) 초대 취소(invite_cancel) 컴포넌트 예시 (시안 8-invite-cancel).
 * 모바일 전체 메뉴(☰)는 디자인 1.29 mobile_menu.removed 로 없앴다 (d7 §29) — 대신 관리 탭 (/gallery/manage).
 */
export default function MenuGalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>초대 취소</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <div className={styles.grid}>
        <Item id="invite-menu" name="invite-more-menu · invite-cancel (시안 8-invite-cancel: ⋯ 열림)">
          <div className={styles.row}>
            <InviteMoreMenu email="han@example.com" defaultOpen>
              <InviteCancel />
            </InviteMoreMenu>
          </div>
        </Item>
        <Item id="invite-confirm" name="ex-modal-card — 초대 취소 확인 (닫기 · 초대 취소)">
          <InviteCancelConfirm email="han@example.com" sheet={false} modal={false} />
        </Item>
        <Item id="invite-demo" name="invite-more-menu → invite-cancel → 확인 → 행 빠짐">
          <InviteCancelDemo />
        </Item>
      </div>
    </main>
  );
}
