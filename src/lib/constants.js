/* ============================================================
   공용 토큰 — 색·글꼴·매장 상수.
   ============================================================ */

// 주문 화면 (라이트, 크림)
export const ORDER = {
  bg: "#F4F1EA",
  card: "#FFFFFF",
  ink: "#1F1F1F",
  red: "#D6473C",
  muted: "#8B8B85",
  line: "#E7E3D8",
};

// 주방·카운터 (다크)
export const DARK = {
  bg: "#1B1B1D",
  card: "#29292B",
  elevated: "#333336",
  gold: "#E3B23E",
  green: "#5FBE77",
  muted: "#9A9A9A",
  ink: "#F4F1EA",
  line: "#3A3A3D",
};

// 상단 탭바
export const TABBAR_BG = "#1A1A1A";
export const TAB_INACTIVE = "#9A9A9A";

// 글꼴 토큰
export const font = "'Noto Sans KR', sans-serif";
export const serif = "'Gowun Batang', serif";

// 매장 테이블 수
export const TABLE_COUNT = 12;
export const TABLES = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);

// 인원 선택 옵션 (표시 라벨과 값)
export const PARTY_OPTIONS = [
  { label: "1명", value: 1 },
  { label: "2명", value: 2 },
  { label: "3명", value: 3 },
  { label: "4명", value: 4 },
  { label: "5명", value: 5 },
  { label: "6명+", value: 6 },
];
