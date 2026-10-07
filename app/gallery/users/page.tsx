import type { Metadata } from "next";
import { Toast } from "@/components/ex-toast";
import { DeleteConfirm, InviteSheet, RoleChangeSheet, UserManage } from "@/components/user-manage";
import styles from "../gallery.module.css";
import { sampleInvites, sampleMemberCounts, sampleMembers } from "./sample";

export const metadata: Metadata = { title: "사용자 관리 컴포넌트 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";

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

/** 화면 8(사용자 관리) 상태 갤러리: 본문 + ex-modal-card 3종(제자리, sheet=false) + 빈 상태 + 토스트 */
export default function GalleryUsersPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>사용자 관리 (화면 8)</h1>
      <p className={styles.lead}>user-manage · ex-modal-card ① 초대 ② 역할 변경 ③ 삭제 확인 · 빈 상태 · 토스트</p>

      <div className={styles.grid}>
        <Item id="list" name="user-manage + ③ 삭제 확인 (시안 1.17 8: 박OO 삭제 확인 시트가 열린 상태)">
          <UserManage schoolName={SAMPLE_SCHOOL} members={sampleMembers} invites={sampleInvites} counts={sampleMemberCounts} />
          <DeleteConfirm sheet={false} closeIcon name="박OO" />
        </Item>

        <Item id="role" name="ex-modal-card ② 역할 변경 시트">
          <RoleChangeSheet sheet={false} name="박OO" currentRole="student" />
        </Item>

        <Item id="role-last-admin" name="ex-modal-card ② 역할 변경 시트 — 본인 · 마지막 admin">
          <RoleChangeSheet sheet={false} name="김OO" currentRole="admin" isSelf isLastAdmin />
        </Item>

        <Item id="invite" name="ex-modal-card ① 초대 시트">
          <InviteSheet sheet={false} />
        </Item>

        <Item id="invite-filled" name="ex-modal-card ① 초대 시트 — 2명 입력">
          <InviteSheet sheet={false} defaultEmails={["lee.teacher@example.com", "kim.student@example.com"]} defaultRole="teacher" />
        </Item>

        <Item id="delete" name="ex-modal-card ③ 삭제 확인">
          <DeleteConfirm sheet={false} />
        </Item>

        <Item id="delete-named" name='ex-modal-card ③ 삭제 확인 — 시안 1.17 8: × 닫기 · "{이름} · 사용·입고 기록은 남아요" · "{이름} 삭제"'>
          <DeleteConfirm sheet={false} closeIcon name="박OO" />
        </Item>

        <Item id="search-empty" name="user-manage — 검색 0건">
          <UserManage
            schoolName={SAMPLE_SCHOOL}
            members={sampleMembers}
            invites={sampleInvites}
            counts={sampleMemberCounts}
            defaultQuery="홍길동"
          />
        </Item>

        <Item id="alone" name="user-manage — 다른 사용자 0명">
          <UserManage schoolName={SAMPLE_SCHOOL} members={sampleMembers.slice(0, 1)} />
        </Item>

        <Item id="toast" name="ex-toast">
          <Toast>2명을 초대했어요</Toast>
          <Toast>역할을 바꿨어요</Toast>
          <Toast>사용자를 삭제했어요</Toast>
        </Item>
      </div>
    </main>
  );
}
