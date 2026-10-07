import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev 가 저장소의 CLAUDE.md 에 안내 블록을 덧붙이지 않게 한다 (CLAUDE.md 는 하네스 문서 — 앱이 고치지 않는다)
  agentRules: false,
};

export default nextConfig;
