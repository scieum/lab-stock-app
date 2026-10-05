// 시안 아이콘 (선 아이콘, 색은 currentColor — 부모에서 토큰 색으로 지정)
import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "flask"
  | "qr"
  | "record"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "back"
  | "search"
  | "pen"
  | "intake"
  | "check"
  | "external"
  | "calendar"
  | "cabinet"
  | "users"
  | "eye"
  | "eye-off"
  | "building"
  | "map-pin"
  | "bell"
  | "close"
  | "info"
  | "plus"
  | "warning"
  | "more";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v11h13V9" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6.2L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3" />
      <path d="M7.5 14h9" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h2" />
    </>
  ),
  record: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  "chevron-right": <path d="m9.5 6 6 6-6 6" />,
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  "chevron-up": <path d="m6 14.5 6-6 6 6" />,
  back: (
    <>
      <path d="M20 12H4.5" />
      <path d="m10.5 6-6 6 6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  pen: (
    <>
      <path d="M12 20h8.5" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  intake: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  cabinet: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M12 3v18M4 12h16M10 7.5v1M14 7.5v1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // 시안 15 feature-card icon-building (학교별 분리)
  building: (
    <>
      <path d="M6 21V3h8v18" />
      <path d="M14 8h4v13" />
      <path d="M4 21h16" />
      <path d="M9 7h2M9 11h2M9 15h2M16 12h.01M16 16h.01" />
    </>
  ),
  // 시안 15 feature-card icon-map-pin (NEIS 학교 선택)
  "map-pin": (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  // 시안 15 feature-card icon-bell (재고 부족 알림)
  // 시안 7 selected-reagent icon-close
  close: <path d="m6 6 12 12M18 6 6 18" />,
  // 시안 7 intake-preview icon-info
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5h.01" />
    </>
  ),
  // 시안 11 cabinet-add icon-plus
  plus: <path d="M12 5v14M5 12h14" />,
  // 시안 11 cabinet-slot · mix-warning icon-warning (세모 + 느낌표)
  warning: (
    <>
      <path d="M12 4 2.8 19.5h18.4Z" />
      <path d="M12 10v4.5M12 17.2h.01" />
    </>
  ),
  // 시안 9 vendor-row icon-more (가로 점 3개)
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={3} />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
};

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
