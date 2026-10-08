// 화면 폭 기준. design/rules.json frames: mobile 390 · desktop 1440.
// CSS 에서는 @media (min-width: 1024px) 와 같은 값을 쓴다.
export const DESKTOP_MIN_WIDTH = 1024;
export const MOBILE_MEDIA_QUERY = `(max-width: ${DESKTOP_MIN_WIDTH - 1}px)`;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;
