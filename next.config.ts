import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev 가 저장소의 CLAUDE.md 에 안내 블록을 덧붙이지 않게 한다 (CLAUDE.md 는 하네스 문서 — 앱이 고치지 않는다)
  agentRules: false,
  // 사용 가이드는 정적 파일 public/guide/index.html (로그인 없이 열림) — /guide · /guide/ 로도 열리게
  async redirects() {
    return [{ source: "/guide", destination: "/guide/index.html", permanent: false }];
  },
};

export default nextConfig;
