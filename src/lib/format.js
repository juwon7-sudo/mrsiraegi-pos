/* ============================================================
   포맷 유틸 — 금액(원)·시간. 시간은 전부 Asia/Seoul 기준.
   ============================================================ */

// 천 단위 구분 금액 (숫자만, 단위 없음)
export function won(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

// "37,800원"
export function wonLabel(n) {
  return `${won(n)}원`;
}

// created_at(ISO) 이후 경과 시간 라벨. 4분 미만이면 mm:ss, 이상이면 "N분".
export function elapsedLabel(iso) {
  if (!iso) return "";
  const start = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const totalSec = Math.floor(diff / 1000);
  const min = Math.floor(totalSec / 60);
  if (min < 1) {
    const s = totalSec % 60;
    return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간 ${m}분`;
}

// Asia/Seoul 기준 오늘 날짜 문자열 "YYYY-MM-DD"
export function seoulToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA => YYYY-MM-DD
}

// 주어진 ISO 시각이 Asia/Seoul 기준 오늘인지
export function isSeoulToday(iso) {
  if (!iso) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)) === seoulToday();
}
