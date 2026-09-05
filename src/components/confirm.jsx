"use client";
import { useCallback, useState } from "react";
import { DARK, font } from "@/lib/constants";

/* 앱 자체 확인창 — 브라우저 window.confirm 대신 사용.
   브라우저의 '추가 다이얼로그 생성 방지'에 영향받지 않는다.
   const [confirm, confirmModal] = useConfirm();
   if (!(await confirm("정말?"))) return;  // 그리고 JSX에 {confirmModal} 렌더 */
export function useConfirm() {
  const [state, setState] = useState(null); // { message, resolve }
  const confirm = useCallback(
    (message) => new Promise((resolve) => setState({ message, resolve })),
    []
  );
  const close = (v) => {
    if (state) state.resolve(v);
    setState(null);
  };
  const modal = state ? (
    <div
      onClick={() => close(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, background: DARK.card, borderRadius: 16, border: `1px solid ${DARK.line}`, padding: 20, color: DARK.ink, fontFamily: font }}
      >
        <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 18 }}>{state.message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => close(false)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: "transparent", color: DARK.muted, fontWeight: 700, border: `1px solid ${DARK.line}`, minHeight: 48 }}>
            취소
          </button>
          <button onClick={() => close(true)} style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: DARK.gold, color: "#241B00", fontWeight: 700, minHeight: 48 }}>
            확인
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return [confirm, modal];
}
