"use client";
import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import { getSupabase, menuImageUrl } from "@/lib/supabaseClient";
import { DARK, font, serif } from "@/lib/constants";
import { wonLabel, won, seoulToday, seoulDate } from "@/lib/format";

const PAY_METHODS = [
  { k: "card", label: "카드" },
  { k: "cash", label: "현금" },
  { k: "voucher", label: "상품권" },
];

/* 입력값을 자체 보관하는 입력 — 부모 리렌더가 입력 중 값을 덮어써서
   모바일 한글(IME) 조합이 끊기는 문제를 막는다. 포커스 중엔 외부 값 무시. */
function LocalText({ value, onChangeText, filter, textarea, ...rest }) {
  const [v, setV] = useState(value ?? "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value ?? "");
  }, [value]);
  const handle = (e) => {
    const next = filter ? filter(e.target.value) : e.target.value;
    setV(next);
    onChangeText(next);
  };
  const props = {
    ...rest,
    value: v,
    onFocus: () => (focused.current = true),
    onBlur: () => (focused.current = false),
    onChange: handle,
  };
  return textarea ? <textarea {...props} /> : <input {...props} />;
}
const digits = (s) => s.replace(/[^0-9]/g, "");

/* 관리 화면 — 메뉴 편집 / 매출 분석 / 일 마감. 다크 테마, 와이드. */
export default function ManageView() {
  const [seg, setSeg] = useState("menu"); // menu | sales | closing

  return (
    <div style={{ flex: 1, background: DARK.bg, color: DARK.ink, fontFamily: font, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "14px 18px 4px" }}>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24 }}>관리</div>
        <div style={{ color: DARK.muted, fontSize: 13, marginTop: 2 }}>메뉴 · 매출 분석 · 일 마감</div>
      </div>

      <div style={{ padding: "10px 18px 6px", display: "flex", gap: 6 }}>
        {[
          { k: "menu", label: "메뉴" },
          { k: "sales", label: "매출 분석" },
          { k: "closing", label: "일 마감" },
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

      <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 16px 28px" }}>
        {seg === "menu" && <MenuManager />}
        {seg === "sales" && <SalesAnalytics />}
        {seg === "closing" && <ClosingPanel />}
      </div>
    </div>
  );
}

/* ================= 공용 스타일 ================= */
const card = { background: DARK.card, borderRadius: 16, border: `1px solid ${DARK.line}`, padding: 16, marginBottom: 14 };
const field = { width: "100%", background: "#1F1F21", border: `1px solid ${DARK.line}`, borderRadius: 10, color: DARK.ink, padding: "10px 12px", fontSize: 14, fontFamily: font };
const label = { color: DARK.muted, fontSize: 12, marginBottom: 4 };
const btnGold = { background: DARK.gold, color: "#241B00", fontWeight: 700, fontSize: 14, padding: "11px 16px", borderRadius: 12, minHeight: 44 };
const btnGhost = { background: "transparent", color: DARK.muted, fontWeight: 700, fontSize: 13, padding: "10px 14px", borderRadius: 12, border: `1px solid ${DARK.line}`, minHeight: 44 };

/* ================= 1) 메뉴 편집 ================= */
function MenuManager() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const sb = getSupabase();
      const { data, error } = await sb.from("pos_menu_items").select("*").order("sort", { ascending: true });
      if (error) throw error;
      setRows(data || []);
      setErr("");
    } catch (e) {
      setErr("메뉴를 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function edit(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  // 세트 구성품 목록 관리 (구성품마다 품목명 + 인분 + 주방/홀 개별 선택)
  function setComps(id, comps) {
    edit(id, { components: comps });
  }
  function addComp(r) {
    setComps(r.id, [...(r.components || []), { name: "", station: "kitchen", qty: 1 }]);
  }
  function editComp(r, i, patch) {
    setComps(r.id, (r.components || []).map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function removeComp(r, i) {
    setComps(r.id, (r.components || []).filter((_, idx) => idx !== i));
  }
  const hasSet = (r) => (r.components || []).some((c) => (c.name || "").trim());

  async function addMenu() {
    setErr("");
    try {
      const sb = getSupabase();
      const sort = (rows.reduce((m, r) => Math.max(m, r.sort || 0), 0) || 0) + 1;
      const { error } = await sb
        .from("pos_menu_items")
        .insert({ name: "새 메뉴", description: "", price: 0, min_people: 1, sort, active: true, station: "kitchen" });
      if (error) throw error;
      await load(); // 목록 새로고침(여러 개 등록 확실히 반영)
    } catch (e) {
      setErr("메뉴 추가에 실패했습니다.");
    }
  }

  async function save(r) {
    setBusyId(r.id);
    setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from("pos_menu_items")
        .update({
          name: r.name,
          description: r.description,
          price: Number(r.price) || 0,
          min_people: Math.max(1, Number(r.min_people) || 1),
          active: !!r.active,
          station: r.station === "hall" ? "hall" : "kitchen",
          components: (r.components || [])
            .filter((c) => (c.name || "").trim())
            .map((c) => ({ name: c.name.trim(), station: c.station === "hall" ? "hall" : "kitchen", qty: Math.max(1, Number(c.qty) || 1) })),
        })
        .eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("저장에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r) {
    if (!window.confirm(`'${r.name}' 메뉴를 삭제할까요?`)) return;
    setBusyId(r.id);
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_menu_items").delete().eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadPhoto(r, file) {
    if (!file) return;
    setBusyId(r.id);
    setErr("");
    try {
      const sb = getSupabase();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${r.id}-${Date.now()}.${ext}`;
      const up = await sb.storage.from("pos-menu").upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await sb.from("pos_menu_items").update({ image_path: path }).eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("사진 업로드에 실패했습니다. (Storage 설정 SQL을 실행했는지 확인)");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>메뉴 {rows.length}개</div>
        <div style={{ flex: 1 }} />
        <button onClick={addMenu} style={btnGold}>+ 메뉴 추가</button>
      </div>
      {err && <div style={{ color: "#E88", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {loaded && rows.length === 0 && <div style={{ color: DARK.muted, textAlign: "center", marginTop: 40 }}>메뉴가 없습니다. + 메뉴 추가</div>}

      {rows.map((r) => {
        const img = menuImageUrl(r.image_path);
        const busy = busyId === r.id;
        return (
          <div key={r.id} style={card}>
            <div style={{ display: "flex", gap: 14 }}>
              {/* 사진 */}
              <div style={{ width: 96, flexShrink: 0 }}>
                <div style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", background: "linear-gradient(135deg,#8A5A3B,#4E2E1A)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {img ? (
                    <img src={img} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ color: "#FFF9EC", fontSize: 12 }}>사진 없음</span>
                  )}
                </div>
                <label style={{ display: "block", marginTop: 8, textAlign: "center", ...btnGhost, padding: "8px 0", cursor: "pointer", fontSize: 12 }}>
                  사진 변경
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadPhoto(r, e.target.files?.[0])} />
                </label>
              </div>

              {/* 필드 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: 8 }}>
                  <div style={label}>메뉴 이름</div>
                  <LocalText style={field} value={r.name || ""} onChangeText={(t) => edit(r.id, { name: t })} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={label}>설명</div>
                  <LocalText textarea style={{ ...field, minHeight: 56, resize: "vertical" }} value={r.description || ""} onChangeText={(t) => edit(r.id, { description: t })} />
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={label}>{hasSet(r) ? "세트 가격(원)" : "1인 가격(원)"}</div>
                    <LocalText style={field} inputMode="numeric" value={String(r.price ?? 0)} filter={digits} onChangeText={(t) => edit(r.id, { price: t })} />
                  </div>
                  <div style={{ width: 96 }}>
                    <div style={label}>최소 인원</div>
                    <LocalText style={field} inputMode="numeric" value={String(r.min_people ?? 1)} filter={digits} onChangeText={(t) => edit(r.id, { min_people: t })} />
                  </div>
                </div>

                {/* 단품일 때만 단일 출고 구분 (세트는 주방/홀 칸으로 지정) */}
                {!hasSet(r) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={label}>출고 구분</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[
                        { k: "kitchen", label: "주방 출고", desc: "조리 후" },
                        { k: "hall", label: "홀 출고", desc: "바로" },
                      ].map((s) => {
                        const on = (r.station || "kitchen") === s.k;
                        return (
                          <button
                            key={s.k}
                            onClick={() => edit(r.id, { station: s.k })}
                            style={{
                              flex: 1,
                              padding: "10px 0",
                              borderRadius: 10,
                              fontWeight: 700,
                              fontSize: 13,
                              background: on ? DARK.elevated : "transparent",
                              color: on ? DARK.gold : DARK.muted,
                              border: `1px solid ${on ? DARK.gold : DARK.line}`,
                            }}
                          >
                            {s.label} <span style={{ color: DARK.muted, fontWeight: 500 }}>· {s.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 세트 구성 — 구성품마다 주방/홀 개별 선택. 하나라도 있으면 세트메뉴(고정가) */}
                <div style={{ marginBottom: 10, background: "#1F1F21", borderRadius: 10, border: `1px solid ${DARK.line}`, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                      세트 구성{hasSet(r) && <span style={{ color: DARK.gold }}> · 세트</span>}
                    </div>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => addComp(r)} style={{ ...btnGhost, padding: "7px 12px", minHeight: 0, fontSize: 12, whiteSpace: "nowrap" }}>+ 구성품</button>
                  </div>
                  {!hasSet(r) && (r.components || []).length === 0 && (
                    <div style={{ color: DARK.muted, fontSize: 11.5, marginBottom: 4 }}>
                      구성품을 추가하면 세트메뉴가 됩니다(가격은 세트 1개 기준). 구성품마다 주방/홀을 선택하면 주문 시 각각 출고됩니다. 단품이면 비워두세요.
                    </div>
                  )}
                  {(r.components || []).map((c, i) => (
                    <div key={i} style={{ marginTop: 8, background: "#191919", borderRadius: 10, border: `1px solid ${DARK.line}`, padding: 8 }}>
                      {/* 이름: 한 줄 전체 */}
                      <LocalText
                        placeholder={`구성품 ${i + 1} 이름 (예: 낙지)`}
                        value={c.name || ""}
                        onChangeText={(t) => editComp(r, i, { name: t })}
                        style={{ ...field, width: "100%", padding: "10px 12px", fontSize: 14, marginBottom: 8 }}
                      />
                      {/* 인분 · 출고 · 삭제: 아래 줄 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <LocalText
                          inputMode="numeric"
                          value={String(c.qty ?? 1)}
                          filter={digits}
                          onChangeText={(t) => editComp(r, i, { qty: t })}
                          style={{ ...field, width: 56, padding: "9px 6px", fontSize: 14, textAlign: "center" }}
                        />
                        <span style={{ color: DARK.muted, fontSize: 13 }}>인</span>
                        <button
                          onClick={() => editComp(r, i, { station: c.station === "hall" ? "kitchen" : "hall" })}
                          style={{ padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: `1px solid ${c.station === "hall" ? "#6FA8DC" : DARK.gold}`, background: "transparent", color: c.station === "hall" ? "#6FA8DC" : DARK.gold }}
                        >
                          {c.station === "hall" ? "홀 출고" : "주방 출고"}
                        </button>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => removeComp(r, i)} style={{ padding: "9px 10px", background: "transparent", color: "#E88", fontWeight: 700, fontSize: 14 }}>✕ 삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={() => edit(r.id, { active: !r.active })}
                    style={{ ...btnGhost, borderColor: r.active ? DARK.green : DARK.line, color: r.active ? DARK.green : DARK.muted }}
                  >
                    {r.active ? "표시 중" : "숨김"}
                  </button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => remove(r)} disabled={busy} style={{ ...btnGhost, color: "#E88" }}>삭제</button>
                  <button onClick={() => save(r)} disabled={busy} style={{ ...btnGold, opacity: busy ? 0.5 : 1 }}>{busy ? "처리 중…" : "저장"}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ================= 2) 매출 분석 ================= */
function SalesAnalytics() {
  const today = seoulToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [openMethod, setOpenMethod] = useState(null); // 결제수단별 펼침
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("pos_orders")
        .select("*, pos_order_items(*)")
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      setOrders(data || []);
      setErr("");
    } catch (e) {
      setErr("매출 데이터를 불러오지 못했습니다.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 매출 무효 처리(감사): 테이블로 복원하지 않고 매출에서만 제외, 내역은 보존
  async function voidSale(order) {
    if (!window.confirm(`${order.table_no}번 · ${wonLabel(order.total)} 매출을 취소(무효) 처리할까요?\n테이블로 복원되지 않으며, 취소 내역에만 남습니다.`)) return;
    setBusy(true);
    setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_orders").update({ voided: true, voided_at: new Date().toISOString() }).eq("id", order.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr("매출 취소에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 기간 내 전체(무효 포함)와, 매출 집계용(무효 제외), 취소내역(무효만)
  const inRangeAll = useMemo(() => {
    return orders.filter((o) => {
      const d = seoulDate(o.created_at);
      return d >= from && d <= to;
    });
  }, [orders, from, to]);
  const inRange = useMemo(() => inRangeAll.filter((o) => !o.voided), [inRangeAll]);
  const voidedList = useMemo(() => inRangeAll.filter((o) => o.voided), [inRangeAll]);

  const total = inRange.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = inRange.length;
  const peopleCount = inRange.reduce((s, o) => s + (o.people || 0), 0);
  const perOrder = orderCount ? Math.round(total / orderCount) : 0;
  const perPerson = peopleCount ? Math.round(total / peopleCount) : 0;

  const byMethod = PAY_METHODS.map((p) => ({
    ...p,
    amount: inRange.filter((o) => o.pay_method === p.k).reduce((s, o) => s + (o.total || 0), 0),
    count: inRange.filter((o) => o.pay_method === p.k).length,
  }));
  const noneAmount = inRange.filter((o) => !o.pay_method).reduce((s, o) => s + (o.total || 0), 0);

  const byDay = useMemo(() => {
    const m = {};
    inRange.forEach((o) => {
      const d = seoulDate(o.created_at);
      m[d] = (m[d] || 0) + (o.total || 0);
    });
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [inRange]);

  const byItem = useMemo(() => {
    const m = {};
    inRange.forEach((o) => {
      (o.pos_order_items || []).forEach((it) => {
        const k = it.name || "기타";
        if (!m[k]) m[k] = { name: k, qty: 0, amount: 0 };
        m[k].qty += it.people || 0;
        m[k].amount += it.amount || 0;
      });
    });
    return Object.values(m).sort((a, b) => b.amount - a.amount);
  }, [inRange]);

  const preset = (days) => {
    const t = seoulToday();
    const d = new Date(`${t}T00:00:00+09:00`);
    d.setDate(d.getDate() - (days - 1));
    setFrom(seoulDate(d.toISOString()));
    setTo(t);
  };

  return (
    <>
      {/* 기간 */}
      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={label}>시작일</div>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ ...field, width: "auto" }} />
          </div>
          <div>
            <div style={label}>종료일</div>
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={{ ...field, width: "auto" }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => preset(1)} style={btnGhost}>오늘</button>
            <button onClick={() => preset(7)} style={btnGhost}>7일</button>
            <button onClick={() => preset(30)} style={btnGhost}>30일</button>
          </div>
        </div>
      </div>

      {err && <div style={{ color: "#E88", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {!loaded && <div style={{ color: DARK.muted }}>불러오는 중…</div>}

      {/* 요약 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <Stat title="총 매출" value={wonLabel(total)} big />
        <Stat title="주문 수" value={`${won(orderCount)}건`} />
        <Stat title="객단가(주문당)" value={wonLabel(perOrder)} />
        <Stat title="객단가(1인당)" value={wonLabel(perPerson)} sub={`총 ${won(peopleCount)}인`} />
      </div>

      {/* 결제수단별 (누르면 개별 건 펼침 → 매출취소) */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>결제수단별</div>
        <div style={{ color: DARK.muted, fontSize: 12, marginBottom: 4 }}>결제수단을 누르면 개별 건에서 매출취소</div>
        {byMethod.map((p) => {
          const open = openMethod === p.k;
          const list = inRange.filter((o) => o.pay_method === p.k);
          return (
            <div key={p.k} style={{ borderTop: `1px solid ${DARK.line}` }}>
              <button
                onClick={() => setOpenMethod(open ? null : p.k)}
                style={{ width: "100%", display: "flex", alignItems: "center", padding: "12px 0", background: "transparent", color: DARK.ink, textAlign: "left" }}
              >
                <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
                  {open ? "▾ " : "▸ "}{p.label}
                </div>
                <div style={{ color: DARK.muted, fontSize: 13, marginRight: 12 }}>{p.count}건</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{wonLabel(p.amount)}</div>
              </button>
              {open && (
                <div style={{ padding: "0 0 8px" }}>
                  {list.length === 0 && <div style={{ color: DARK.muted, fontSize: 13, padding: "4px 0 10px" }}>해당 건이 없습니다</div>}
                  {list.map((o) => (
                    <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0 9px 12px", borderTop: `1px solid ${DARK.line}` }}>
                      <div style={{ color: DARK.gold, fontWeight: 700, width: 40, fontSize: 13 }}>{o.table_no}번</div>
                      <div style={{ flex: 1, fontSize: 13 }}>
                        {wonLabel(o.total)}
                        <span style={{ color: DARK.muted }}> · {seoulDate(o.created_at)}</span>
                      </div>
                      <button onClick={() => voidSale(o)} disabled={busy} style={{ background: "transparent", color: "#E88", fontWeight: 700, fontSize: 12.5, padding: "7px 12px", borderRadius: 10, border: `1px solid ${DARK.line}`, opacity: busy ? 0.5 : 1 }}>
                        매출취소
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {noneAmount > 0 && <Row left="미지정" mid="" right={wonLabel(noneAmount)} muted />}
      </div>

      {/* 품목별 */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>품목별 판매</div>
        {byItem.length === 0 && <div style={{ color: DARK.muted, fontSize: 13 }}>데이터 없음</div>}
        {byItem.map((it) => (
          <Row key={it.name} left={it.name} mid={`${won(it.qty)}인분`} right={wonLabel(it.amount)} />
        ))}
      </div>

      {/* 일별 */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>일별 매출</div>
        {byDay.length === 0 && <div style={{ color: DARK.muted, fontSize: 13 }}>데이터 없음</div>}
        {byDay.map(([d, amt]) => (
          <Row key={d} left={d} mid="" right={wonLabel(amt)} />
        ))}
      </div>

      {/* 취소(무효) 내역 — 감사용. 매출에서는 제외됨 */}
      <div style={{ ...card, borderColor: "#5a3a3a" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 700, color: "#E88" }}>매출취소 내역</div>
          <div style={{ color: DARK.muted, fontSize: 12 }}>
            {voidedList.length}건 · {wonLabel(voidedList.reduce((s, o) => s + (o.total || 0), 0))} (매출 제외)
          </div>
        </div>
        {voidedList.length === 0 && <div style={{ color: DARK.muted, fontSize: 13 }}>취소된 매출이 없습니다</div>}
        {voidedList.map((o) => (
          <div key={o.id} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${DARK.line}` }}>
            <div style={{ color: DARK.gold, fontWeight: 700, width: 40, fontSize: 13 }}>{o.table_no}번</div>
            <div style={{ flex: 1, fontSize: 13 }}>
              <span style={{ textDecoration: "line-through", color: DARK.muted }}>{wonLabel(o.total)}</span>
              <span style={{ color: DARK.muted }}> · {o.pay_method ? o.pay_method : "미지정"}</span>
            </div>
            <div style={{ color: DARK.muted, fontSize: 12 }}>
              {o.voided_at ? `${seoulDate(o.voided_at)} 취소` : "취소"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Stat({ title, value, sub, big }) {
  return (
    <div style={{ background: DARK.card, border: `1px solid ${DARK.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ color: DARK.muted, fontSize: 12, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: big ? 26 : 20, color: DARK.gold }}>{value}</div>
      {sub && <div style={{ color: DARK.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function Row({ left, mid, right, muted }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${DARK.line}` }}>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: muted ? DARK.muted : DARK.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{left}</div>
      {mid ? <div style={{ color: DARK.muted, fontSize: 13, marginRight: 12 }}>{mid}</div> : null}
      <div style={{ fontWeight: 700, fontSize: 14, color: muted ? DARK.muted : DARK.ink }}>{right}</div>
    </div>
  );
}

/* ================= 3) 일 마감 대조 ================= */
function ClosingPanel() {
  const today = seoulToday();
  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState([]);
  const [past, setPast] = useState([]);
  const [actual, setActual] = useState({ card: 0, cash: 0, voucher: 0 });
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(""); setMsg("");
    try {
      const sb = getSupabase();
      const [o, c] = await Promise.all([
        sb.from("pos_orders").select("*").eq("status", "done").order("created_at", { ascending: false }).limit(5000),
        sb.from("pos_closings").select("*").eq("close_date", date).maybeSingle(),
      ]);
      if (o.error) throw o.error;
      setOrders(o.data || []);
      if (c.data) {
        setActual({ card: c.data.actual_card || 0, cash: c.data.actual_cash || 0, voucher: c.data.actual_voucher || 0 });
        setMemo(c.data.memo || "");
      } else {
        setActual({ card: 0, cash: 0, voucher: 0 });
        setMemo("");
      }
    } catch (e) {
      setErr("마감 데이터를 불러오지 못했습니다.");
    }
  }, [date]);

  const loadPast = useCallback(async () => {
    try {
      const sb = getSupabase();
      const { data } = await sb.from("pos_closings").select("*").order("close_date", { ascending: false }).limit(30);
      setPast(data || []);
    } catch (e) { /* noop */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPast(); }, [loadPast]);

  const dayOrders = orders.filter((o) => seoulDate(o.created_at) === date && !o.voided);
  const sys = {
    card: dayOrders.filter((o) => o.pay_method === "card").reduce((s, o) => s + (o.total || 0), 0),
    cash: dayOrders.filter((o) => o.pay_method === "cash").reduce((s, o) => s + (o.total || 0), 0),
    voucher: dayOrders.filter((o) => o.pay_method === "voucher").reduce((s, o) => s + (o.total || 0), 0),
    none: dayOrders.filter((o) => !o.pay_method).reduce((s, o) => s + (o.total || 0), 0),
  };
  sys.total = sys.card + sys.cash + sys.voucher + sys.none;

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const sb = getSupabase();
      const row = {
        close_date: date,
        system_card: sys.card, system_cash: sys.cash, system_voucher: sys.voucher, system_none: sys.none, system_total: sys.total,
        actual_card: Number(actual.card) || 0, actual_cash: Number(actual.cash) || 0, actual_voucher: Number(actual.voucher) || 0,
        memo, updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("pos_closings").upsert(row, { onConflict: "close_date" });
      if (error) throw error;
      setMsg("마감 저장 완료");
      await loadPast();
    } catch (e) {
      setErr("마감 저장에 실패했습니다. (마감 테이블 SQL을 실행했는지 확인)");
    } finally {
      setBusy(false);
    }
  }

  const diff = (a, s) => (Number(a) || 0) - (s || 0);
  const diffColor = (d) => (d === 0 ? DARK.muted : d > 0 ? DARK.green : "#E88");
  const diffLabel = (d) => (d === 0 ? "일치" : `${d > 0 ? "+" : ""}${won(d)}원`);

  return (
    <>
      <div style={card}>
        <div style={label}>마감 날짜</div>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...field, width: "auto" }} />
      </div>

      {err && <div style={{ color: "#E88", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {msg && <div style={{ color: DARK.green, fontSize: 13, marginBottom: 10 }}>{msg}</div>}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>롯데포스 대조</div>
        <div style={{ display: "flex", color: DARK.muted, fontSize: 12, padding: "0 0 8px" }}>
          <div style={{ width: 70 }}>구분</div>
          <div style={{ flex: 1, textAlign: "right" }}>시스템</div>
          <div style={{ flex: 1, textAlign: "right" }}>롯데포스</div>
          <div style={{ flex: 1, textAlign: "right" }}>차액</div>
        </div>
        {PAY_METHODS.map((p) => {
          const d = diff(actual[p.k], sys[p.k]);
          return (
            <div key={p.k} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${DARK.line}` }}>
              <div style={{ width: 70, fontWeight: 700, fontSize: 14 }}>{p.label}</div>
              <div style={{ flex: 1, textAlign: "right", fontSize: 14 }}>{won(sys[p.k])}</div>
              <div style={{ flex: 1, textAlign: "right" }}>
                <input
                  inputMode="numeric"
                  value={actual[p.k]}
                  onChange={(e) => setActual((a) => ({ ...a, [p.k]: e.target.value.replace(/[^0-9]/g, "") }))}
                  style={{ ...field, width: "100%", textAlign: "right", padding: "8px 10px" }}
                />
              </div>
              <div style={{ flex: 1, textAlign: "right", fontWeight: 700, fontSize: 13, color: diffColor(d) }}>{diffLabel(d)}</div>
            </div>
          );
        })}
        {sys.none > 0 && (
          <div style={{ display: "flex", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${DARK.line}`, color: DARK.muted }}>
            <div style={{ width: 70, fontWeight: 700, fontSize: 14 }}>미지정</div>
            <div style={{ flex: 1, textAlign: "right", fontSize: 14 }}>{won(sys.none)}</div>
            <div style={{ flex: 1, textAlign: "right", fontSize: 12 }}>결제수단 지정 필요</div>
            <div style={{ flex: 1 }} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", padding: "10px 0 0", borderTop: `2px solid ${DARK.line}`, marginTop: 4 }}>
          <div style={{ width: 70, fontWeight: 700 }}>합계</div>
          <div style={{ flex: 1, textAlign: "right", fontWeight: 700, color: DARK.gold }}>{won(sys.total)}</div>
          <div style={{ flex: 1, textAlign: "right", fontWeight: 700 }}>{won((Number(actual.card)||0)+(Number(actual.cash)||0)+(Number(actual.voucher)||0))}</div>
          <div style={{ flex: 1 }} />
        </div>
      </div>

      <div style={card}>
        <div style={label}>메모 (차이 사유 등)</div>
        <LocalText textarea style={{ ...field, minHeight: 60, resize: "vertical" }} value={memo} onChangeText={setMemo} placeholder="예: 현금 5,000원 부족 — 거스름돈 오차" />
        <button onClick={save} disabled={busy} style={{ ...btnGold, width: "100%", marginTop: 12, opacity: busy ? 0.5 : 1 }}>
          {busy ? "저장 중…" : "마감 저장"}
        </button>
      </div>

      {past.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>지난 마감</div>
          {past.map((c) => {
            const actualTotal = (c.actual_card || 0) + (c.actual_cash || 0) + (c.actual_voucher || 0);
            const d = actualTotal - (c.system_total || 0);
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${DARK.line}`, cursor: "pointer" }} onClick={() => setDate(c.close_date)}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{c.close_date}</div>
                <div style={{ color: DARK.muted, fontSize: 13, marginRight: 12 }}>{wonLabel(c.system_total)}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: diffColor(d) }}>{diffLabel(d)}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
