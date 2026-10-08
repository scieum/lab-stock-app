import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarItem } from "@/components/sidebar-item";
import { sidebarAccountLabel, sidebarMenu } from "@/lib/sidebar-menu";
import styles from "../gallery.module.css";

export const metadata: Metadata = { title: "데스크톱 사이드바 컴포넌트 · Lab_Stock" };

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

/** 데스크톱 셸 갤러리 (rules.json 1.22 desktop_shell, d7 §23): 역할별 app-sidebar 3종 + sidebar-item 상태 */
export default function GallerySidebarPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>데스크톱 사이드바 (로그인 후 셸)</h1>
      <p className={styles.lead}>app-sidebar · sidebar-item — 역할별 메뉴(학생 · 교사 · admin), 현재 화면 활성, 계정 ▾ 로그아웃 메뉴</p>

      <div className={styles.grid}>
        <Item id="teacher" name="app-sidebar — 교사 (시안 2-desktop: 시약 활성, 관리 묶음)">
          <AppSidebar
            schoolName={SAMPLE_SCHOOL}
            groups={sidebarMenu("teacher")}
            active="reagents"
            account={sidebarAccountLabel("김OO", "teacher")}
          />
        </Item>

        <Item id="admin" name="app-sidebar — admin (시안 8-desktop: 사용자 활성, 관리 + 학교 설정 묶음)">
          <AppSidebar
            schoolName={SAMPLE_SCHOOL}
            groups={sidebarMenu("admin")}
            active="users"
            account={sidebarAccountLabel("정OO", "admin")}
          />
        </Item>

        <Item id="student" name="app-sidebar — 학생 (홈 활성, 모두 메뉴 5개만)">
          <AppSidebar
            schoolName={SAMPLE_SCHOOL}
            groups={sidebarMenu("student")}
            active="home"
            account={sidebarAccountLabel("이OO", "student")}
          />
        </Item>

        <Item id="items" name="sidebar-item — 비활성 · 활성 · 준비 중(QR 찾기, 화면 12 전)">
          <SidebarItem label="홈" icon="home" href="/" />
          <SidebarItem label="시약" icon="flask" href="/reagents" active />
          <SidebarItem label="QR 찾기" icon="qr" />
        </Item>
      </div>
    </main>
  );
}
