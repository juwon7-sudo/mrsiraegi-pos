"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import { DARK, font, serif, TABLES } from "@/lib/constants";
import { wonLabel, elapsedLabel, isSeoulToday } from "@/lib/format";
import { useConfirm } from "@/components/confirm";

const PAY_METHODS = [
  { k: "card", label: "카드" },
  { k: "cash", label: "현금" },
  { k: "voucher", label: "상품권" },
];
const payLabel = (k) => PAY_METHODS.find((p) => p.k === k)?.label || "미지정";

const SERVE_BLUE = "#6FA8DC"; // 서빙대기(주방 출고 완료, 홀 전달 전) 강조색

/* 카운터 화면 — 테이블 현황 / 매출 집계. 4초 폴링. */
export default function CounterView() {
  const [seg, setSeg] = useState("tables"); // tables | sales
  const [active, setActive] = useState([]); // status != done + items
  const [doneToday, setDoneToday] = useState([]); // 오늘 완료 주문(무효 제외)
  const [voidedToday, setVoidedToday] = useState([]); // 오늘 취소(무효) 내역
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [sheetTable, setSheetTable] = useState(null); // 결제/정리 대상 order
  const [, forceTick] = useState(0);
  const [confirm, confirmModal] = useConfirm();
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
      const doneT = (d.data || []).filter((o) => isSeoulToday(o.created_at));
      setDoneToday(doneT.filter((o) => !o.voided));
      setVoidedToday(doneT.filter((o) => o.voided));
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

  async function settle(tableNo, method) {
    try {
      const sb = getSupabase();
      const os = active.filter((o) => o.table_no === tableNo);
      const items = os.flatMap((o) => o.pos_order_items || []);
      // 안전장치: 모든 음식을 가져감(제공완료)한 뒤에만 결제
      if (items.length === 0 || !items.every((it) => it.taken)) {
        setErr("아직 제공 전입니다. 모든 음식을 '가져감' 처리한 뒤 결제할 수 있습니다.");
        return;
      }
      const ids = os.map((o) => o.id);
      const { error } = await sb
        .from("pos_orders")
        .update({ status: "done", pay_method: method })
        .in("id", ids);
      if (error) throw error;
      setSheetTable(null);
      await load();
    } catch (e) {
      setErr("정리에 실패했습니다.");
    }
  }

  // 매출 취소: 무효(감사) 처리. 테이블로 복원하지 않고 매출에서만 제외, 취소 내역에 보존.
  async function cancelSale(order) {
    if (!(await confirm(`${order.table_no}번 · ${wonLabel(order.total)} 매출을 취소할까요?\n테이블로 복원되지 않으며, 취소 내역에만 남습니다.`))) return;
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from("pos_orders")
        .update({ voided: true, voided_at: new Date().toISOString() })
        .eq("id", order.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("매출 취소에 실패했습니다.");
    }
  }

  // 테이블 번호 → 활성 주문 배열 (한 테이블에 추가 주문이 여러 개일 수 있음)
  const byTable = {};
  active.forEach((o) => {
    (byTable[o.table_no] || (byTable[o.table_no] = [])).push(o);
  });

  const salesTotal = doneToday.reduce((s, o) => s + (o.total || 0), 0);
  const salesByMethod = doneToday.reduce((m, o) => {
    const k = o.pay_method || "none";
    m[k] = (m[k] || 0) + (o.total || 0);
    return m;
  }, {});
  const countByMethod = doneToday.reduce((m, o) => {
    const k = o.pay_method || "none";
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

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
                const os = byTable[t];
                if (!os || os.length === 0) {
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
                // 이 테이블의 모든 활성 주문 항목을 합쳐서 판정
                const items = os.flatMap((o) => o.pos_order_items || []);
                // 상태 흐름: 조리중 → (주방 출고) 서빙대기 → (홀 가져감) 제공완료
                const allTaken = items.length > 0 && items.every((it) => it.taken);
                const allDispatched = items.length > 0 && items.every((it) => it.dispatched);
                const state = allTaken ? "done" : allDispatched ? "serving" : "cooking";
                const badgeLabel = state === "done" ? "제공완료" : state === "serving" ? "서빙대기" : "조리중";
                const accent = state === "done" ? DARK.green : state === "serving" ? SERVE_BLUE : DARK.gold;
                const badgeBg =
                  state === "done"
                    ? "rgba(95,190,119,.18)"
                    : state === "serving"
                    ? "rgba(111,168,220,.20)"
                    : "rgba(227,178,62,.18)";
                const rep = items[0]?.name || "주문";
                const total = os.reduce((s, o) => s + (o.total || 0), 0);
                const people = Math.max(...os.map((o) => o.people || 0));
                const created = os[0]?.created_at; // 활성은 오래된 순 → 첫 주문 기준 경과
                return (
                  <button
                    key={t}
                    onClick={() => setSheetTable(t)}
                    style={{
                      textAlign: "left",
                      background: "#0F0F10",
                      border: `1px solid ${accent}`,
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
                          background: badgeBg,
                          color: accent,
                        }}
                      >
                        {badgeLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: DARK.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rep} {people}인{os.length > 1 ? ` · 주문 ${os.length}건` : ""}
                    </div>
                    <div style={{ fontSize: 13, marginTop: "auto" }}>
                      <b>{wonLabel(total)}</b>{" "}
                      <span style={{ color: DARK.muted }}>{elapsedLabel(created)}</span>
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
            {doneToday.length > 0 && (
              <div style={{ background: DARK.card, borderRadius: 16, padding: "6px 16px", marginTop: 12, border: `1px solid ${DARK.line}` }}>
                <div style={{ color: DARK.muted, fontSize: 12, padding: "10px 0 4px" }}>결제수단별</div>
                {[...PAY_METHODS, ...((countByMethod.none || 0) > 0 ? [{ k: "none", label: "미지정" }] : [])].map((p, i, arr) => (
                  <div key={p.k} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderTop: i === 0 ? `1px solid ${DARK.line}` : "none", borderBottom: i < arr.length - 1 ? `1px solid ${DARK.line}` : "none" }}>
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: p.k === "none" ? DARK.muted : DARK.ink }}>{p.label}</div>
                    <div style={{ color: DARK.muted, fontSize: 13, marginRight: 12 }}>{countByMethod[p.k] || 0}건</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: p.k === "none" ? DARK.muted : DARK.ink }}>{wonLabel(salesByMethod[p.k] || 0)}</div>
                  </div>
                ))}
              </div>
            )}
            {doneToday.length > 0 && (
              <div style={{ background: DARK.card, borderRadius: 16, padding: "6px 16px 10px", marginTop: 12, border: `1px solid ${DARK.line}` }}>
                <div style={{ color: DARK.muted, fontSize: 12, padding: "10px 0 4px" }}>완료 주문 · 매출취소</div>
                {doneToday.map((o, i) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i === 0 ? "none" : `1px solid ${DARK.line}` }}>
                    <div style={{ color: DARK.gold, fontWeight: 700, width: 38, fontSize: 14 }}>{o.table_no}번</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{wonLabel(o.total)}</div>
                      <div style={{ color: DARK.muted, fontSize: 12 }}>{payLabel(o.pay_method)}</div>
                    </div>
                    <button
                      onClick={() => cancelSale(o)}
                      style={{ background: "transparent", color: "#E88", fontWeight: 700, fontSize: 13, padding: "8px 12px", borderRadius: 10, border: `1px solid ${DARK.line}`, minHeight: 38 }}
                    >
                      매출취소
                    </button>
                  </div>
                ))}
              </div>
            )}
            {loaded && doneToday.length === 0 && (
              <div style={{ color: DARK.muted, textAlign: "center", marginTop: 20, fontSize: 13 }}>
                오늘 완료된 주문이 아직 없습니다
              </div>
            )}

            {/* 오늘 취소(무효) 내역 — 매출 제외, 기록만 보관 */}
            {voidedToday.length > 0 && (
              <div style={{ background: DARK.card, borderRadius: 16, padding: "6px 16px 10px", marginTop: 12, border: `1px solid #5a3a3a` }}>
                <div style={{ color: "#E88", fontSize: 12, fontWeight: 700, padding: "10px 0 4px" }}>
                  오늘 취소 내역 {voidedToday.length}건 · {wonLabel(voidedToday.reduce((s, o) => s + (o.total || 0), 0))} (매출 제외)
                </div>
                {voidedToday.map((o, i) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${DARK.line}` }}>
                    <div style={{ color: DARK.gold, fontWeight: 700, width: 38, fontSize: 13 }}>{o.table_no}번</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ textDecoration: "line-through", color: DARK.muted }}>{wonLabel(o.total)}</span>
                        <span style={{ color: DARK.muted }}> · {payLabel(o.pay_method)}</span>
                      </div>
                    </div>
                    <div style={{ color: DARK.muted, fontSize: 12 }}>취소됨</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 결제/정리 시트 — 활성 데이터에서 실시간으로 다시 계산 */}
      {sheetTable != null &&
        (() => {
          const os = byTable[sheetTable] || [];
          const items = os.flatMap((o) => o.pos_order_items || []);
          const total = os.reduce((s, o) => s + (o.total || 0), 0);
          const canPay = items.length > 0 && items.every((it) => it.taken);
          return (
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
                    {sheetTable}번 테이블
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{wonLabel(total)}</div>
                </div>

                {items.length === 0 && (
                  <div style={{ color: DARK.muted, fontSize: 14, padding: "10px 0" }}>주문이 없습니다.</div>
                )}
                {items.map((it) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${DARK.line}`, fontSize: 14 }}>
                    <div style={{ flex: 1 }}>
                      {it.name} <span style={{ color: DARK.muted }}>{it.people}인</span>
                      <span style={{ color: DARK.muted }}> · {wonLabel(it.amount)}</span>
                    </div>
                    {it.taken ? (
                      <div style={{ color: DARK.green, fontWeight: 700, fontSize: 13 }}>제공완료</div>
                    ) : (
                      <button
                        onClick={() => takeItem(it)}
                        style={{ background: DARK.green, color: "#0E2A16", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 10, minHeight: 38 }}
                      >
                        가져감
                      </button>
                    )}
                  </div>
                ))}

                {canPay ? (
                  <>
                    <div style={{ color: DARK.muted, fontSize: 13, margin: "16px 0 8px" }}>결제 수단을 누르면 정리됩니다</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {PAY_METHODS.map((p) => (
                        <button
                          key={p.k}
                          onClick={() => settle(sheetTable, p.k)}
                          style={{ flex: 1, padding: "16px 0", borderRadius: 14, background: DARK.green, color: "#0E2A16", fontWeight: 700, fontSize: 16, minHeight: 56 }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      margin: "16px 0 4px",
                      padding: "14px 12px",
                      borderRadius: 12,
                      background: "rgba(111,168,220,.14)",
                      border: `1px solid ${SERVE_BLUE}`,
                      color: SERVE_BLUE,
                      fontSize: 13.5,
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  >
                    아직 제공 전입니다 · 모든 음식을 <span style={{ textDecoration: "underline" }}>가져감</span> 처리한 뒤 결제할 수 있습니다
                  </div>
                )}

                <button
                  onClick={() => setSheetTable(null)}
                  style={{ width: "100%", marginTop: 8, padding: "13px 0", borderRadius: 14, background: "transparent", color: DARK.muted, fontWeight: 700 }}
                >
                  닫기
                </button>
              </div>
            </div>
          );
        })()}
      {confirmModal}
    </div>
  );
}
