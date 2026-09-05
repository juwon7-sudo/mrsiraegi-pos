"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
import { DARK, font, serif, tableLabel } from "@/lib/constants";
import { elapsedLabel } from "@/lib/format";

/* 주방 화면 — 다크. 4초마다 폴링. status != done 이고 미출고 항목이 남은 주문만. */
export default function KitchenView() {
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [, forceTick] = useState(0); // 경과 시간 갱신용
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("pos_orders")
        .select("*, pos_order_items(*)")
        .neq("status", "done")
        .order("created_at", { ascending: true });
      if (error) throw error;
      // 주방 출고(station=kitchen) 항목 중 미출고가 남은 주문만 (홀 출고는 주방에 안 뜸)
      const list = (data || []).filter((o) =>
        (o.pos_order_items || []).some((it) => it.station !== "hall" && !it.dispatched)
      );
      setOrders(list);
      setErr("");
    } catch (e) {
      setErr("주방 주문을 불러오지 못했습니다.");
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

  async function dispatchItem(order, item) {
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from("pos_order_items")
        .update({ dispatched: true })
        .eq("id", item.id);
      if (error) throw error;

      // 이 주문의 모든 항목이 출고되면 상태를 ready 로
      const remaining = (order.pos_order_items || []).filter(
        (it) => it.id !== item.id && !it.dispatched
      );
      if (remaining.length === 0) {
        await sb.from("pos_orders").update({ status: "ready" }).eq("id", order.id);
      }
      await load();
    } catch (e) {
      setErr("출고 처리에 실패했습니다.");
    }
  }

  return (
    <div style={{ flex: 1, background: DARK.bg, color: DARK.ink, fontFamily: font, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22 }}>주방</div>
        <div style={{ color: DARK.muted, fontSize: 13 }}>조리 대기 {orders.length}건</div>
      </div>

      <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 16px 24px" }}>
        {err && <div style={{ color: "#E88", marginBottom: 10, fontSize: 13 }}>{err}</div>}
        {loaded && orders.length === 0 && (
          <div style={{ color: DARK.muted, textAlign: "center", marginTop: 60 }}>
            대기 중인 주문이 없습니다
          </div>
        )}

        {orders.map((o) => {
          // 주방 출고 항목만 표시 (홀 출고는 주방에 안 뜸)
          const items = (o.pos_order_items || []).filter((it) => it.station !== "hall");
          const done = items.filter((it) => it.dispatched).length;
          const rep = items[0]?.menu_name || items[0]?.name || "";
          return (
            <div
              key={o.id}
              style={{
                background: DARK.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: 14,
                border: `1px solid ${DARK.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 34, color: DARK.gold, lineHeight: 1 }}>
                    {tableLabel(o.table_no)}
                  </div>
                  {rep && (
                    <div style={{ color: DARK.muted, fontSize: 14, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {rep}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: serif, fontWeight: 700, color: DARK.gold, fontSize: 16 }}>
                  {elapsedLabel(o.created_at)}
                </div>
              </div>

              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderTop: `1px solid ${DARK.line}`,
                    opacity: it.dispatched ? 0.4 : 1,
                  }}
                >
                  <div style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>
                    {it.name} <span style={{ color: DARK.muted }}>{it.people}인</span>
                  </div>
                  {it.dispatched ? (
                    <div style={{ color: DARK.green, fontWeight: 700, fontSize: 14 }}>출고됨</div>
                  ) : (
                    <button
                      onClick={() => dispatchItem(o, it)}
                      style={{
                        background: DARK.green,
                        color: "#0E2A16",
                        fontWeight: 700,
                        fontSize: 14,
                        padding: "11px 16px",
                        borderRadius: 12,
                        minHeight: 44,
                      }}
                    >
                      출고
                    </button>
                  )}
                </div>
              ))}

              <div style={{ color: DARK.muted, fontSize: 13, marginTop: 10, textAlign: "right" }}>
                {done}/{items.length} 출고
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
