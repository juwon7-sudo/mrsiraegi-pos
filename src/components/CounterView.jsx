"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import { DARK, font, serif, TABLES } from "@/lib/constants";
import { wonLabel, elapsedLabel, isSeoulToday } from "@/lib/format";

/* 카운터 화면 — 테이블 현황 / 매출 집계. 4초 폴링. */
export default function CounterView() {
  const [seg, setSeg] = useState("tables"); // tables | sales
  const [active, setActive] = useState([]); // status != done + items
  const [doneToday, setDoneToday] = useState([]); // 오늘 완료 주문
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sheetTable, setSheetTable] = useState(null); // 결제/정리 대상 order
  const [, forceTick] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const sb = getSupabase();
      const [a, d] = await Promise.all([
        sb.from("pos_orders").select("*, pos_order_items(*)").neq("status", "done").order("created_at", { ascending: true }),
        sb.from("pos_orders").select("*").eq("status", "done").order("created_at", { ascending: false }).limit(500),
      ]);
      if (a.error) throw a.error;
      if (d.error) throw d.error;
      setActive(a.data || []);
      setDoneToday((d.data || []).filter((o) => isSeoulToday(o.created_at)));
      setErr("");
    } catch (e) {
      setErr("카운터 정보를 불러오지 못했습니다.");
    } finally {
      busy.current = false;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 4000);
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // 나갈 음식: 출고됐지만 아직 안 가져간 항목
  const readyItems = [];
  active.forEach((o) => {
    (o.pos_order_items || []).forEach((it) => {
      if (it.dispatched && !it.taken) readyItems.push({ ...it, table_no: o.table_no });
    });
  });

  async function takeItem(item) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_order_items").update({ taken: true }).eq("id", item.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("처리에 실패했습니다.");
    }
  }

  async function clearTable(order) {
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_orders").update({ status: "done" }).eq("id", order.id);
      if (error) throw error;
      setSheetTable(null);
      await load();
    } catch (e) {
      setErr("정리에 실패했습니다.");
    }
  }

  // 테이블 번호 → 활성 주문 매핑 (한 테이블에 여러 주문이면 가장 최근)
  const byTable = {};
  active.forEach((o) => {
    if (!byTable[o.table_no]) byTable[o.table_no] = o;
  });

  const salesTotal = doneToday.reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div style={{ flex: 1, background: DARK.bg, color: DARK.ink, fontFamily: font, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "14px 18px 4px" }}>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24 }}>카운터</div>
        <div style={{ color: DARK.muted, fontSize: 13, marginTop: 2 }}>후불 · 결제는 롯데 디포스에서</div>
      </div>

      {/* 세그먼트 */}
      <div style={{ padding: "10px 18px 6px", display: "flex", gap: 6 }}>
        {[
          { k: "tables", label: "테이블 현황" },
          { k: "sales", label: "매출 집계" },
        ].map((s) => {
          const on = seg === s.k;
          return (
            <button
              key={s.k}
              onClick={() => setSeg(s.k)}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 14,
                background: on ? DARK.elevated : "transparent",
                color: on ? DARK.ink : DARK.muted,
                border: `1px solid ${on ? DARK.line : "transparent"}`,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 16px 24px" }}>
        {err && <div style={{ color: "#E88", marginBottom: 10, fontSize: 13 }}>{err}</div>}

        {seg === "tables" && (
          <>
            {/* 나갈 음식 */}
            <div style={{ background: DARK.card, borderRadius: 16, padding: 14, marginBottom: 16, border: `1px solid ${DARK.line}` }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: readyItems.length ? 10 : 0 }}>
                <span style={{ color: DARK.green }}>●</span> 나갈 음식 {readyItems.length}건 대기
              </div>
              {readyItems.map((it, i) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${DARK.line}`,
                  }}
                >
                  <div style={{ color: DARK.gold, fontWeight: 700, width: 34 }}>{it.table_no}번</div>
                  <div style={{ flex: 1, fontSize: 15 }}>
                    {it.name} <span style={{ color: DARK.muted }}>{it.people}인</span>
                  </div>
                  <button
                    onClick={() => takeItem(it)}
                    style={{ background: DARK.green, color: "#0E2A16", fontWeight: 700, fontSize: 13, padding: "9px 14px", borderRadius: 10, minHeight: 40 }}
                  >
                    가져감
                  </button>
                </div>
              ))}
            </div>

            {/* 테이블 그리드 — 화면 폭에 맞춰 여러 열 (가로 태블릿 대응) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
              {TABLES.map((t) => {
                const o = byTable[t];
                if (!o) {
                  return (
                    <div
                      key={t}
                      style={{
                        background: "#232325",
                        border: `1px dashed ${DARK.line}`,
                        borderRadius: 14,
                        padding: 14,
                        minHeight: 92,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        opacity: 0.6,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: DARK.muted }}>{t}번</div>
                      <div style={{ color: DARK.muted, fontSize: 13 }}>빈자리</div>
                    </div>
                  );
                }
                const ready = o.status === "ready";
                const rep = (o.pos_order_items || [])[0]?.name || "주문";
                return (
                  <button
                    key={t}
                    onClick={() => setSheetTable(o)}
                    style={{
                      textAlign: "left",
                      background: "#0F0F10",
                      border: `1px solid ${ready ? DARK.green : DARK.gold}`,
                      borderRadius: 14,
                      padding: 14,
                      minHeight: 92,
                      color: DARK.ink,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 20, color: DARK.gold }}>{t}번</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: ready ? "rgba(95,190,119,.18)" : "rgba(227,178,62,.18)",
                          color: ready ? DARK.green : DARK.gold,
                        }}
                      >
                        {ready ? "제공완료" : "조리중"}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: DARK.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rep} {o.people}인
                    </div>
                    <div style={{ fontSize: 13, marginTop: "auto" }}>
                      <b>{wonLabel(o.total)}</b>{" "}
                      <span style={{ color: DARK.muted }}>{elapsedLabel(o.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {seg === "sales" && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: DARK.card, borderRadius: 18, padding: 24, border: `1px solid ${DARK.line}`, textAlign: "center" }}>
              <div style={{ color: DARK.muted, fontSize: 14, marginBottom: 12 }}>오늘 매출 (결제 완료)</div>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 44, color: DARK.gold, lineHeight: 1.1 }}>
                {wonLabel(salesTotal)}
              </div>
              <div style={{ color: DARK.muted, fontSize: 14, marginTop: 14 }}>
                완료 주문 {doneToday.length}건
              </div>
            </div>
            {loaded && doneToday.length === 0 && (
              <div style={{ color: DARK.muted, textAlign: "center", marginTop: 20, fontSize: 13 }}>
                오늘 완료된 주문이 아직 없습니다
              </div>
            )}
          </div>
        )}
      </div>

      {/* 결제/정리 시트 */}
      {sheetTable && (
        <div
          onClick={() => setSheetTable(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 40 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, background: DARK.card, borderRadius: "20px 20px 0 0", padding: 20, borderTop: `1px solid ${DARK.line}` }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: DARK.gold }}>
                {sheetTable.table_no}번 테이블
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ fontWeight: 700, fontSize: 18 }}>{wonLabel(sheetTable.total)}</div>
            </div>
            {(sheetTable.pos_order_items || []).map((it) => (
              <div key={it.id} style={{ display: "flex", padding: "8px 0", borderTop: `1px solid ${DARK.line}`, fontSize: 14 }}>
                <div style={{ flex: 1 }}>
                  {it.name} <span style={{ color: DARK.muted }}>{it.people}인</span>
                </div>
                <div style={{ color: DARK.muted }}>{wonLabel(it.amount)}</div>
              </div>
            ))}
            <button
              onClick={() => clearTable(sheetTable)}
              style={{ width: "100%", marginTop: 16, padding: "16px 0", borderRadius: 14, background: DARK.green, color: "#0E2A16", fontWeight: 700, fontSize: 16, minHeight: 52 }}
            >
              결제 완료 (정리)
            </button>
            <button
              onClick={() => setSheetTable(null)}
              style={{ width: "100%", marginTop: 8, padding: "13px 0", borderRadius: 14, background: "transparent", color: DARK.muted, fontWeight: 700 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
