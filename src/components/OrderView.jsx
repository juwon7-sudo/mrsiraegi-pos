"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { getSupabase, menuImageUrl } from "@/lib/supabaseClient";
import { useConfirm } from "@/components/confirm";
import { ORDER, font, serif, ALL_TABLES, TABLE_COUNT, tableLabel, PARTY_OPTIONS } from "@/lib/constants";
import { wonLabel } from "@/lib/format";

/* 주문 항목(구성품 행)을 '기본 메뉴명'으로 묶는다.
   주문 내역/내 주문 확인은 메뉴명으로 보여주고, 구성품 상세는 주방·홀 화면에만. */
function groupItems(items) {
  const groups = [];
  const index = new Map();
  for (const it of items || []) {
    const key = it.menu_id ?? `name:${it.menu_name || it.name}`;
    let g = index.get(key);
    if (!g) {
      g = { key, menu_id: it.menu_id, name: it.menu_name || it.name, people: it.people || 0, amount: 0, rows: [] };
      index.set(key, g);
      groups.push(g);
    }
    g.amount += it.amount || 0;
    g.people = Math.max(g.people, it.people || 0);
    g.rows.push(it);
  }
  return groups;
}

/* 주문 화면 — 라이트 크림 테마, 다단계 플로우 (테이블/인원 → 메뉴 → 확인) */
export default function OrderView({ customer = false }) {
  const [step, setStep] = useState("table"); // table | menu | confirm | history
  const [tableNo, setTableNo] = useState(1);
  const [people, setPeople] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tablePicker, setTablePicker] = useState(false);

  // 장바구니(담긴) 수량: { [menuId]: peopleCount }
  const [qty, setQty] = useState({});
  // 담기 눌러 인분 고르는 중(장바구니 담기 전): { [menuId]: peopleCount }
  const [draft, setDraft] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [lastItems, setLastItems] = useState([]);

  // 주문 수정/삭제(관리)
  const [manageOrders, setManageOrders] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageBusyId, setManageBusyId] = useState(null); // 처리 중인 주문 id
  const [confirm, confirmModal] = useConfirm();

  // QR코드 등으로 ?table=N 이 들어오면 해당 테이블로 시작
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const t = parseInt(p.get("table") || p.get("t") || "", 10);
      if (ALL_TABLES.includes(t)) setTableNo(t);
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabase();
        const { data, error } = await sb
          .from("pos_menu_items")
          .select("*")
          .eq("active", true)
          .order("sort", { ascending: true });
        if (error) throw error;
        if (alive) setMenu(data || []);
      } catch (e) {
        if (alive) setErr("메뉴를 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const canProceed = people != null;

  // 세트메뉴(구성품 있음) 여부. 주문 단위는 세트든 단품이든 인원(人)으로 통일.
  const isSet = (m) => Array.isArray(m.components) && m.components.length > 0;
  const unitMin = (m) => m.min_people || 1;

  // 단독 주문 메뉴(이름에 "병행주문 불가" 포함) — 다른 메뉴와 합산 주문 불가
  const isExclusive = (m) => /병행\s*주문\s*불가/.test(m?.name || "");
  // 메뉴명에서 괄호 설명을 분리(화면에서 줄바꿈 처리)
  function splitName(name) {
    const s = (name || "").trim();
    const i = s.indexOf("(");
    if (i > 0) return { main: s.slice(0, i).trim(), note: s.slice(i).trim() };
    return { main: s, note: "" };
  }

  // 메뉴 1건을 인원(units)만큼 담았을 때의 출고 행들(세트=구성품별, 단품=1건).
  // 주문 전송과 수량 재계산에서 공통으로 쓴다. {name, amount, station}
  function menuLineParts(m, units) {
    if (isSet(m)) {
      const comps = m.components || [];
      const lineAmount = m.price * units;
      let allocated = 0;
      return comps.map((c, idx) => {
        const hall = c.station === "hall";
        const per = Number(c.amount) || 0;
        const label = per > 0 ? `${c.name} ${per * units}${c.unit || ""}` : c.name;
        const amt = idx === comps.length - 1 ? lineAmount - allocated : Math.round(lineAmount / comps.length);
        allocated += amt;
        return { name: label, amount: amt, station: hall ? "hall" : "kitchen" };
      });
    }
    const hall = m.station === "hall";
    return [{ name: m.name, amount: m.price * units, station: hall ? "hall" : "kitchen" }];
  }

  function goMenu() {
    if (!canProceed) return;
    // 해당 인원에 맞는 메뉴가 딱 1개면 담기 과정 없이 바로 − 수량 + 스텝퍼 표시.
    // 메뉴가 딱 1개뿐이면 담기 과정 없이 바로 담아둔다.
    const init = {};
    if (menu.length === 1) {
      const m = menu[0];
      init[m.id] = Math.max(m.min_people || 1, people || 1);
    }
    setQty(init);
    setDraft({});
    setStep("menu");
  }

  // 1) '담기' → 인분 고르기 시작(아직 장바구니 아님)
  function startPick(item) {
    setErr("");
    setDraft((d) => ({ ...d, [item.id]: Math.max(item.min_people, people || item.min_people) }));
  }
  // 인분 고르는 중 수량 조절
  function stepDraft(item, delta) {
    setDraft((d) => {
      const cur = d[item.id];
      if (cur == null) return d;
      const next = cur + delta;
      if (next < unitMin(item)) return d;
      return { ...d, [item.id]: next };
    });
  }
  // 인분 고르기 취소
  function cancelPick(item) {
    setDraft((d) => {
      const n = { ...d };
      delete n[item.id];
      return n;
    });
  }
  // 2) '장바구니 담기' → 고른 인분으로 장바구니에 담는다
  async function addToCart(item) {
    const amt = draft[item.id] ?? Math.max(item.min_people, people || item.min_people);

    // 단독 주문 규칙: '가을 평일특선' 등(이름에 "병행주문 불가")은 다른 메뉴와 합산 주문 불가.
    if (isExclusive(item) && selected.length > 0) {
      const ok = await confirm(
        `'${splitName(item.name).main}'은(는) 다른 메뉴와 함께 주문할 수 없어요.\n담은 메뉴를 비우고 이 메뉴만 담을까요?`
      );
      if (!ok) return;
      setErr("");
      setQty({ [item.id]: amt }); // 전부 비우고 단독 메뉴만
      cancelPick(item);
      return;
    }
    if (!isExclusive(item) && selected.some(isExclusive)) {
      const ex = selected.find(isExclusive);
      const ok = await confirm(
        `'${splitName(ex.name).main}'은(는) 단독 주문 메뉴예요.\n그 메뉴를 비우고 '${splitName(item.name).main}'을(를) 담을까요?`
      );
      if (!ok) return;
      setErr("");
      setQty((q) => {
        const n = { ...q };
        selected.filter(isExclusive).forEach((e) => delete n[e.id]); // 단독 메뉴 비우기
        n[item.id] = amt;
        return n;
      });
      cancelPick(item);
      return;
    }

    setErr("");
    setQty((q) => ({ ...q, [item.id]: amt }));
    cancelPick(item);
  }
  // 담은 메뉴를 바로 취소(장바구니에서 제거) → '담기' 상태로 되돌림
  function removeItem(item) {
    setQty((q) => {
      const n = { ...q };
      delete n[item.id];
      return n;
    });
  }
  function stepQty(item, delta) {
    setQty((q) => {
      const cur = q[item.id];
      if (cur == null) return q;
      const next = cur + delta;
      if (next < unitMin(item)) return q;
      return { ...q, [item.id]: next };
    });
  }

  // 담긴 메뉴(한상·단품 통합)
  const selected = useMemo(
    () => menu.filter((m) => qty[m.id] != null),
    [menu, qty]
  );
  const totalCount = selected.length;
  const totalPeople = selected.reduce((s, m) => s + (qty[m.id] || 0), 0);
  const totalAmount = selected.reduce((s, m) => s + m.price * (qty[m.id] || 0), 0);

  async function submitOrder() {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    setErr("");
    try {
      const sb = getSupabase();
      const { data: order, error: oErr } = await sb
        .from("pos_orders")
        .insert({ table_no: tableNo, people, status: "cooking", total: totalAmount })
        .select()
        .single();
      if (oErr) throw oErr;

      const rows = [];
      selected.forEach((m) => {
        const units = qty[m.id]; // 주문 인원
        if (isSet(m)) {
          // 세트 → 구성품마다 별도 출고 건. 1인당 양이 있으면 인원에 맞춰 계산해 이름에 표기.
          // 금액은 구성품 수로 균등 배분(합계=1인가×인원).
          const comps = m.components || [];
          const lineAmount = m.price * units;
          let allocated = 0;
          comps.forEach((c, idx) => {
            const hall = c.station === "hall";
            const per = Number(c.amount) || 0;
            const label = per > 0 ? `${c.name} ${per * units}${c.unit || ""}` : c.name;
            const amt = idx === comps.length - 1
              ? lineAmount - allocated
              : Math.round(lineAmount / comps.length);
            allocated += amt;
            rows.push({
              order_id: order.id,
              menu_id: m.id,
              name: label,
              menu_name: m.name,
              people: units,
              amount: amt,
              station: hall ? "hall" : "kitchen",
              dispatched: hall,
              taken: false,
            });
          });
        } else {
          const hall = m.station === "hall";
          rows.push({
            order_id: order.id,
            menu_id: m.id,
            name: m.name,
            menu_name: m.name,
            people: units,
            amount: m.price * units,
            station: hall ? "hall" : "kitchen",
            dispatched: hall,
            taken: false,
          });
        }
      });
      const { error: iErr } = await sb.from("pos_order_items").insert(rows);
      if (iErr) throw iErr;

      // 모든 항목이 홀 출고면 주방 대기 없이 바로 준비 상태로
      if (rows.every((r) => r.dispatched)) {
        await sb.from("pos_orders").update({ status: "ready" }).eq("id", order.id);
      }

      setLastItems(rows);
      setQty({});
      setDraft({});
      setStep("confirm");
    } catch (e) {
      setErr("주문 전송에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- 주문 수정/삭제 ----------
  const minForItem = (it) =>
    menu.find((m) => m.id === it.menu_id)?.min_people || 1;

  async function openManage() {
    setErr("");
    setManageLoading(true);
    setStep("manage");
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("pos_orders")
        .select("*, pos_order_items(*)")
        .eq("table_no", tableNo)
        .neq("status", "done")
        .order("created_at", { ascending: true });
      if (error) throw error;
      // 단가(_unit)를 기억해 수량 변경 시 금액을 다시 계산
      const norm = (data || []).map((o) => ({
        ...o,
        pos_order_items: (o.pos_order_items || []).map((it) => ({
          ...it,
          _unit: it.people ? Math.round(it.amount / it.people) : it.amount,
        })),
      }));
      setManageOrders(norm);
    } catch (e) {
      setErr("주문을 불러오지 못했습니다.");
      setManageOrders([]);
    } finally {
      setManageLoading(false);
    }
  }

  // 손님용: 내 주문 조회(읽기 전용)
  async function openMyOrders() {
    setErr("");
    setManageLoading(true);
    setStep("myorders");
    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("pos_orders")
        .select("*, pos_order_items(*)")
        .eq("table_no", tableNo)
        .neq("status", "done")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setManageOrders(data || []);
    } catch (e) {
      setErr("주문을 불러오지 못했습니다.");
      setManageOrders([]);
    } finally {
      setManageLoading(false);
    }
  }

  // 메뉴(묶음) 단위 수량 변경(저장 전 미리보기) — 세트는 구성품 양·금액·이름까지 재계산.
  function bumpGroup(orderId, groupKey, delta) {
    setManageOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const grp = groupItems(o.pos_order_items).find((g) => g.key === groupKey);
        if (!grp) return o;
        const m = menu.find((x) => x.id === grp.menu_id);
        const minP = (m && m.min_people) || 1;
        const newP = Math.max(minP, grp.people + delta);
        if (newP === grp.people) return o;
        const parts = m ? menuLineParts(m, newP) : null;
        const useParts = parts && parts.length === grp.rows.length; // 구성품 수 동일할 때만 재구성
        const idSet = new Set(grp.rows.map((r) => r.id));
        let ci = 0;
        const items = o.pos_order_items.map((it) => {
          if (!idSet.has(it.id)) return it;
          const idx = ci++;
          if (useParts) {
            const p = parts[idx];
            return { ...it, people: newP, amount: p.amount, name: p.name, station: p.station };
          }
          // 메뉴 정의를 못 찾으면 비례 계산(이름은 유지)
          return { ...it, people: newP, amount: Math.round((it._unit ?? it.amount) * newP) };
        });
        return { ...o, pos_order_items: items };
      })
    );
  }

  async function saveOrder(order) {
    if (manageBusyId) return;
    setManageBusyId(order.id);
    setErr("");
    try {
      const sb = getSupabase();
      for (const it of order.pos_order_items) {
        const { error } = await sb
          .from("pos_order_items")
          .update({ people: it.people, amount: it.amount, name: it.name, station: it.station })
          .eq("id", it.id);
        if (error) throw error;
      }
      const total = order.pos_order_items.reduce((s, it) => s + it.amount, 0);
      const { error: tErr } = await sb.from("pos_orders").update({ total }).eq("id", order.id);
      if (tErr) throw tErr;
      await openManage();
    } catch (e) {
      setErr("수정 저장에 실패했습니다.");
    } finally {
      setManageBusyId(null);
    }
  }

  // 메뉴(묶음) 전체 삭제 — 그 메뉴의 구성품 행을 모두 제거
  async function deleteGroup(order, group) {
    if (manageBusyId) return;
    if (!(await confirm(`${splitName(group.name).main} 메뉴를 삭제할까요?`))) return;
    setManageBusyId(order.id);
    setErr("");
    try {
      const sb = getSupabase();
      const ids = group.rows.map((r) => r.id);
      const { error } = await sb.from("pos_order_items").delete().in("id", ids);
      if (error) throw error;
      const rest = order.pos_order_items.filter((x) => !ids.includes(x.id));
      if (rest.length === 0) {
        await sb.from("pos_orders").delete().eq("id", order.id);
      } else {
        const total = rest.reduce((s, x) => s + x.amount, 0);
        await sb.from("pos_orders").update({ total }).eq("id", order.id);
      }
      await openManage();
    } catch (e) {
      setErr("삭제에 실패했습니다.");
    } finally {
      setManageBusyId(null);
    }
  }

  async function deleteItem(order, item) {
    if (manageBusyId) return;
    if (!(await confirm(`${item.name} 항목을 삭제할까요?`))) return;
    setManageBusyId(order.id);
    setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_order_items").delete().eq("id", item.id);
      if (error) throw error;
      const rest = order.pos_order_items.filter((x) => x.id !== item.id);
      if (rest.length === 0) {
        await sb.from("pos_orders").delete().eq("id", order.id);
      } else {
        const total = rest.reduce((s, x) => s + x.amount, 0);
        await sb.from("pos_orders").update({ total }).eq("id", order.id);
      }
      await openManage();
    } catch (e) {
      setErr("항목 삭제에 실패했습니다.");
    } finally {
      setManageBusyId(null);
    }
  }

  async function deleteOrder(order) {
    if (manageBusyId) return;
    if (!(await confirm(`${tableLabel(order.table_no)} 주문 전체를 삭제할까요?`))) return;
    setManageBusyId(order.id);
    setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_orders").delete().eq("id", order.id);
      if (error) throw error;
      await openManage();
    } catch (e) {
      setErr("주문 삭제에 실패했습니다.");
    } finally {
      setManageBusyId(null);
    }
  }

  // ---------- 공통 래퍼 ----------
  const wrap = {
    flex: 1,
    background: ORDER.bg,
    color: ORDER.ink,
    fontFamily: font,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  };

  // ========== STEP: 테이블 + 인원 ==========
  if (step === "table") {
    return (
      <div style={wrap}>
        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 18px 24px" }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 4px", marginBottom: 33 }}>
            <img src="/image.png" alt="미스터시래기" style={{ height: 20, width: "auto" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, color: ORDER.red, lineHeight: 1 }}>
                {tableNo > TABLE_COUNT ? `포장${tableNo - TABLE_COUNT}` : tableNo}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: ORDER.ink }}>
                {tableNo > TABLE_COUNT ? "" : "번 테이블"}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            {!customer && (
              <button onClick={() => setTablePicker((v) => !v)} style={{ ...pill, whiteSpace: "nowrap" }}>
                테이블 바꾸기 ▾
              </button>
            )}
          </div>

          {!customer && tablePicker && (
            <div style={{ ...cardBox, padding: 10, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {ALL_TABLES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTableNo(t);
                      setTablePicker(false);
                    }}
                    style={{
                      padding: "13px 0",
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: t > TABLE_COUNT ? 13 : 15,
                      background: t === tableNo ? ORDER.ink : "#FFF",
                      color: t === tableNo ? "#FFF" : ORDER.ink,
                      border: `1px solid ${t === tableNo ? ORDER.ink : ORDER.line}`,
                    }}
                  >
                    {t > TABLE_COUNT ? `포장${t - TABLE_COUNT}` : t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!customer && (
            <button
              onClick={openManage}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 12,
                background: "#FFF",
                border: `1px solid ${ORDER.line}`,
                color: ORDER.ink,
                fontWeight: 600,
                fontSize: 13.5,
                marginBottom: 20,
              }}
            >
              주문 내역 · 수정 →
            </button>
          )}
          {customer && (
            <button
              onClick={openMyOrders}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 12,
                background: "#FFF",
                border: `1px solid ${ORDER.line}`,
                color: ORDER.ink,
                fontWeight: 600,
                fontSize: 13.5,
                marginBottom: 20,
              }}
            >
              내 주문 확인 →
            </button>
          )}

          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 19, marginBottom: 3 }}>
            몇 분이 오셨나요?
          </div>
          <div style={{ color: ORDER.muted, fontSize: 12.5, marginBottom: 14 }}>
            한상 메뉴는 2인 이상 주문됩니다
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
            {PARTY_OPTIONS.map((p) => {
              const on = people === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setPeople(p.value)}
                  style={{
                    padding: "17px 0",
                    borderRadius: 14,
                    fontWeight: 600,
                    fontSize: 16,
                    letterSpacing: "-0.01em",
                    background: on ? ORDER.ink : "#FFF",
                    color: on ? "#FFF" : ORDER.ink,
                    border: `1.5px solid ${on ? ORDER.ink : ORDER.line}`,
                    transition: "background .12s",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <BottomBar>
          <button
            disabled={!canProceed}
            onClick={goMenu}
            style={{
              ...primaryBtn,
              opacity: canProceed ? 1 : 0.45,
            }}
          >
            {people ? `${people}인 · 메뉴 보기` : "인원을 선택하세요"}
          </button>
        </BottomBar>
      </div>
    );
  }

  // ========== STEP: 주문 수정/삭제 (관리) ==========
  if (step === "manage") {
    return (
      <div style={wrap}>
        <div style={topRow}>
          <button onClick={() => setStep("table")} style={{ ...pill, fontWeight: 700 }}>
            ← 뒤로
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ color: ORDER.red, fontWeight: 700 }}>{tableLabel(tableNo)}</div>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 18px 24px" }}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, margin: "6px 0 4px" }}>
            주문 내역
          </div>
          <div style={{ color: ORDER.muted, fontSize: 12.5, marginBottom: 14 }}>
            수량 변경 후 <b>변경 저장</b>, 필요 없으면 <b>삭제</b>
          </div>
          {err && <div style={{ color: ORDER.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          {manageLoading && <div style={{ color: ORDER.muted, fontSize: 13.5 }}>불러오는 중…</div>}
          {!manageLoading && manageOrders.length === 0 && (
            <div style={{ color: ORDER.muted, textAlign: "center", marginTop: 50, fontSize: 13.5 }}>
              이 테이블에 진행 중인 주문이 없습니다
            </div>
          )}

          {manageOrders.map((o, oi) => {
            const oTotal = o.pos_order_items.reduce((s, it) => s + it.amount, 0);
            return (
              <div key={o.id} style={{ ...cardBox, padding: 14, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>주문 {oi + 1}</div>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => deleteOrder(o)}
                    style={{ fontSize: 12.5, fontWeight: 700, color: ORDER.red, background: "transparent", padding: "4px 6px" }}
                  >
                    주문 삭제
                  </button>
                </div>

                {groupItems(o.pos_order_items).map((g) => {
                  const gm = menu.find((x) => x.id === g.menu_id);
                  const minP = (gm && gm.min_people) || 1;
                  return (
                    <div
                      key={g.key}
                      style={{ padding: "10px 0", borderTop: `1px solid ${ORDER.line}`, display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 15.5, wordBreak: "keep-all" }}>
                          {splitName(g.name).main}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 700, color: ORDER.red }}>{wonLabel(g.amount)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => bumpGroup(o.id, g.key, -1)}
                          disabled={g.people <= minP}
                          style={{ ...miniStep, background: "#F1EEE4", color: ORDER.ink, opacity: g.people <= minP ? 0.4 : 1 }}
                        >
                          −
                        </button>
                        <div style={{ width: 38, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{g.people}인</div>
                        <button
                          onClick={() => bumpGroup(o.id, g.key, +1)}
                          style={{ ...miniStep, background: ORDER.ink, color: "#FFF" }}
                        >
                          +
                        </button>
                        <button
                          onClick={() => deleteGroup(o, g)}
                          style={{ marginLeft: 4, fontSize: 12.5, fontWeight: 700, color: ORDER.muted, background: "transparent", padding: "6px 4px" }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                    합계 <span style={{ color: ORDER.red }}>{wonLabel(oTotal)}</span>
                  </div>
                  <button
                    onClick={() => saveOrder(o)}
                    disabled={manageBusyId === o.id}
                    style={{
                      padding: "11px 20px",
                      borderRadius: 12,
                      background: ORDER.ink,
                      color: "#FFF",
                      fontWeight: 700,
                      fontSize: 14,
                      opacity: manageBusyId === o.id ? 0.5 : 1,
                    }}
                  >
                    {manageBusyId === o.id ? "저장 중…" : "변경 저장"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <BottomBar>
          <button onClick={() => setStep("table")} style={{ ...lightBtn, flex: 1 }}>
            인원 선택
          </button>
          <button onClick={() => setStep("menu")} style={{ ...primaryBtn, flex: 1 }}>
            추가 주문
          </button>
        </BottomBar>
        {confirmModal}
      </div>
    );
  }

  // 메뉴 카드 하나 렌더 (세로형 — 큰 사진 위, 이름·설명·수량·버튼 가운데)
  function renderCard(m) {
    const inCart = qty[m.id] != null; // 장바구니에 담김
    const inDraft = !inCart && draft[m.id] != null; // 인분 고르는 중
    const cnt = inCart ? qty[m.id] : draft[m.id] || m.min_people;
    const img = menuImageUrl(m.image_path);
    const { main, note } = splitName(m.name);
    return (
      <div
        key={m.id}
        style={{ ...cardBox, border: `2px solid ${inCart ? ORDER.red : inDraft ? "#C9A24B" : ORDER.line}`, marginBottom: 16, padding: 14 }}
      >
        {/* 큰 사진 (위, 전체폭) */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg,#8A5A3B 0%,#6E4126 60%,#4E2E1A 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {img ? (
            <img src={img} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 18, color: "#FFF9EC", textAlign: "center", padding: 8 }}>{m.name}</span>
          )}
          {inCart && <div style={{ ...addedBadge, top: 10, left: 10, fontSize: 12, padding: "4px 10px" }}>{cnt}인</div>}
        </div>

        {/* 메뉴명 (가운데, 크고 진하게) — 괄호 설명은 줄바꿈 + 작게 */}
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <div style={{ fontFamily: serif, fontWeight: 800, fontSize: 31, lineHeight: 1.3, wordBreak: "keep-all" }}>
            {main}
          </div>
          {note && (
            <div style={{ fontFamily: serif, fontWeight: 400, fontSize: 14, lineHeight: 1.3, color: ORDER.muted, marginTop: 6, whiteSpace: "nowrap" }}>
              {note}
            </div>
          )}
        </div>

        {/* 가격 (가운데) */}
        <div style={{ textAlign: "center", fontFamily: serif, fontSize: 22, fontWeight: 700, marginTop: 6 }}>
          {cnt}인 <span style={{ color: ORDER.red }}>{wonLabel(m.price * cnt)}</span>
        </div>

        {/* 설명 (가운데) */}
        {m.description && (
          <div style={{ textAlign: "center", color: ORDER.muted, fontSize: 13, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-line", wordBreak: "keep-all" }}>
            {m.description.trim()}
          </div>
        )}

        {/* 담기 → 인분 선택 → 장바구니 담기 (주문은 하단 장바구니에서 한 번에) */}
        <div style={{ marginTop: 16 }}>
          {inCart ? (
            /* 담김 상태 + 빼기 */
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <span style={{ color: "#2E8B57", fontWeight: 700, fontSize: 16 }}>✓ 장바구니에 담음 ({cnt}인)</span>
              <button
                onClick={() => removeItem(m)}
                style={{ fontSize: 13.5, fontWeight: 700, color: ORDER.muted, background: "transparent", textDecoration: "underline", padding: "4px 2px" }}
              >
                빼기
              </button>
            </div>
          ) : inDraft ? (
            /* 인분 선택 + 장바구니 담기 */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
                <button
                  onClick={() => stepDraft(m, -1)}
                  disabled={cnt <= unitMin(m)}
                  style={{ ...stepBtn, background: "#F1EEE4", color: ORDER.ink, opacity: cnt <= unitMin(m) ? 0.4 : 1 }}
                >
                  −
                </button>
                <div style={{ minWidth: 56, textAlign: "center", fontWeight: 700, fontSize: 19 }}>{cnt}인</div>
                <button onClick={() => stepDraft(m, +1)} style={{ ...stepBtn, background: ORDER.ink, color: "#FFF" }}>
                  +
                </button>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => addToCart(m)}
                  style={{ flex: 3, padding: "16px 0", borderRadius: 14, background: ORDER.red, color: "#FFF", fontWeight: 700, fontSize: 18, minHeight: 56 }}
                >
                  장바구니 담기
                </button>
                <button
                  onClick={() => cancelPick(m)}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 14, background: "#FFF", color: ORDER.muted, border: `1px solid ${ORDER.line}`, fontWeight: 700, fontSize: 14, minHeight: 56 }}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            /* 담기 */
            <button
              onClick={() => startPick(m)}
              style={{ ...primaryBtn, padding: "15px 0", minHeight: 54, fontSize: 17 }}
            >
              담기
            </button>
          )}
        </div>
      </div>
    );
  }

  // ========== STEP: 메뉴 ==========
  if (step === "menu") {
    // 관리(sort) 순서 그대로. 종류가 바뀌는 지점에만 섹션 제목을 넣는다.
    return (
      <div style={wrap}>
        <div style={topRow}>
          <button onClick={() => setStep("table")} style={{ ...pill, fontWeight: 700 }}>
            ← 메뉴
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setStep("table")} style={pill}>
            {tableLabel(tableNo)} ▾
          </button>
          <div style={{ color: ORDER.red, fontWeight: 700, fontSize: 15 }}>{people}인</div>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 18px 20px" }}>
          {loading && <div style={{ color: ORDER.muted }}>메뉴 불러오는 중…</div>}
          {err && <div style={{ color: ORDER.red }}>{err}</div>}
          {!loading && menu.length === 0 && (
            <div style={{ color: ORDER.muted, textAlign: "center", marginTop: 40, fontSize: 13.5 }}>
              등록된 메뉴가 없습니다.
            </div>
          )}

          {/* 관리 순서(sort) 그대로. 종류(한상/단품)가 바뀌는 지점에만 제목 표시 */}
          {menu.map((m, i) => {
            const isH = (m.min_people || 1) >= 2;
            const prev = menu[i - 1];
            const prevIsH = prev ? (prev.min_people || 1) >= 2 : null;
            const showHeader = prevIsH === null || isH !== prevIsH;
            return (
              <Fragment key={m.id}>
                {showHeader && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: i === 0 ? "6px 0 12px" : "16px 0 12px" }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18 }}>{isH ? "한상 메뉴" : "단품메뉴"}</div>
                    <div style={{ color: ORDER.muted, fontSize: 12.5 }}>{isH ? "2인분부터" : "혼밥추천메뉴"}</div>
                  </div>
                )}
                {renderCard(m)}
              </Fragment>
            );
          })}
        </div>

        <BottomBar>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>장바구니 {totalCount}개</div>
            <div style={{ color: ORDER.muted, fontSize: 13 }}>{wonLabel(totalAmount)}</div>
          </div>
          <button
            disabled={totalCount === 0}
            onClick={() => { setErr(""); setStep("cart"); }}
            style={{ ...primaryBtn, width: "auto", padding: "0 30px", fontSize: 17, opacity: totalCount === 0 ? 0.45 : 1 }}
          >
            주문하기
          </button>
        </BottomBar>
        {err && step === "menu" && (
          <div style={{ padding: "0 18px 10px", color: ORDER.red, fontSize: 13 }}>{err}</div>
        )}
        {confirmModal}
      </div>
    );
  }

  // ========== STEP: 장바구니 (주문 확인) ==========
  if (step === "cart") {
    return (
      <div style={wrap}>
        <div style={topRow}>
          <button onClick={() => setStep("menu")} style={{ ...pill, fontWeight: 700 }}>
            ← 메뉴 더 담기
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ color: ORDER.red, fontWeight: 700 }}>{tableLabel(tableNo)}</div>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 18px 20px" }}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 20, margin: "6px 0 10px" }}>장바구니</div>

          {selected.length === 0 && (
            <div style={{ color: ORDER.muted, textAlign: "center", marginTop: 50, fontSize: 14 }}>
              담은 메뉴가 없습니다. 메뉴에서 담아주세요.
            </div>
          )}

          {selected.map((m) => {
            const cnt = qty[m.id] || m.min_people;
            const { main } = splitName(m.name);
            return (
              <div key={m.id} style={{ ...cardBox, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 17, wordBreak: "keep-all" }}>{main}</div>
                    <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: ORDER.red }}>
                      {wonLabel(m.price * cnt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={() => stepQty(m, -1)}
                      disabled={cnt <= unitMin(m)}
                      style={{ ...miniStep, background: "#F1EEE4", color: ORDER.ink, opacity: cnt <= unitMin(m) ? 0.4 : 1 }}
                    >
                      −
                    </button>
                    <div style={{ width: 42, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{cnt}인</div>
                    <button onClick={() => stepQty(m, +1)} style={{ ...miniStep, background: ORDER.ink, color: "#FFF" }}>
                      +
                    </button>
                    <button
                      onClick={() => removeItem(m)}
                      style={{ marginLeft: 4, fontSize: 12.5, fontWeight: 700, color: ORDER.muted, background: "transparent", padding: "6px 4px" }}
                    >
                      빼기
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {selected.length > 0 && (
            <div style={{ ...cardBox, padding: 14, background: "#FBF8F1", display: "flex", alignItems: "center", marginTop: 4 }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>합계</div>
              <div style={{ fontWeight: 700, fontSize: 19, color: ORDER.red }}>{wonLabel(totalAmount)}</div>
            </div>
          )}
          {err && <div style={{ color: ORDER.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        </div>

        <BottomBar>
          <button onClick={() => setStep("menu")} style={{ ...lightBtn, flex: 1 }}>
            더 담기
          </button>
          <button
            onClick={submitOrder}
            disabled={submitting || selected.length === 0}
            style={{ ...primaryBtn, flex: 2, fontSize: 18, opacity: submitting || selected.length === 0 ? 0.5 : 1 }}
          >
            {submitting ? "전송 중…" : `주문하기 (${totalCount})`}
          </button>
        </BottomBar>
        {confirmModal}
      </div>
    );
  }

  // ========== STEP: 확인 ==========
  if (step === "confirm") {
    return (
      <div style={wrap}>
        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "40px 22px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 999,
              background: ORDER.red,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 23, marginBottom: 8 }}>
            주문이 전송되었습니다
          </div>
          <div style={{ color: ORDER.red, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
            {tableLabel(tableNo)}
          </div>
          <div style={{ color: ORDER.muted, fontSize: 14, marginBottom: 32, textAlign: "center" }}>
            주방에서 순서대로 조리해 내어드립니다
          </div>

          <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}>
            {!customer && (
              <button onClick={openManage} style={{ ...primaryBtn }}>
                주문 내역 · 수정
              </button>
            )}
            <button onClick={() => setStep("menu")} style={customer ? { ...primaryBtn } : lightBtn}>
              추가 주문하기
            </button>
            {customer && (
              <button onClick={openMyOrders} style={lightBtn}>
                내 주문 확인
              </button>
            )}
            {!customer && (
              <button
                onClick={() => {
                  setPeople(null);
                  setStep("table");
                }}
                style={lightBtn}
              >
                다른 테이블 주문
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== STEP: 내 주문 확인 (손님, 조회 전용) ==========
  if (step === "myorders") {
    const grand = manageOrders.reduce(
      (s, o) => s + (o.pos_order_items || []).reduce((a, it) => a + (it.amount || 0), 0),
      0
    );
    return (
      <div style={wrap}>
        <div style={topRow}>
          <button onClick={() => setStep("table")} style={{ ...pill, fontWeight: 700 }}>
            ← 뒤로
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ color: ORDER.red, fontWeight: 700 }}>{tableLabel(tableNo)}</div>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 18px 20px" }}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 20, margin: "6px 0 4px" }}>내 주문 내역</div>
          <div style={{ color: ORDER.muted, fontSize: 12.5, marginBottom: 14 }}>주문하신 내역입니다 (조회 전용)</div>
          {err && <div style={{ color: ORDER.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          {manageLoading && <div style={{ color: ORDER.muted, fontSize: 13.5 }}>불러오는 중…</div>}
          {!manageLoading && manageOrders.length === 0 && (
            <div style={{ color: ORDER.muted, textAlign: "center", marginTop: 50, fontSize: 13.5 }}>
              아직 주문 내역이 없습니다
            </div>
          )}

          {manageOrders.map((o, oi) => (
            <div key={o.id} style={{ ...cardBox, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: ORDER.muted, marginBottom: 6 }}>주문 {oi + 1}</div>
              {groupItems(o.pos_order_items).map((g) => (
                <div key={g.key} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0", borderTop: `1px solid ${ORDER.line}`, fontSize: 14.5 }}>
                  <div style={{ flex: 1, fontWeight: 700, wordBreak: "keep-all" }}>
                    {splitName(g.name).main} <span style={{ color: ORDER.muted, fontWeight: 400 }}>{g.people}인</span>
                  </div>
                  <div style={{ color: ORDER.red, fontWeight: 700 }}>{wonLabel(g.amount)}</div>
                </div>
              ))}
              <div style={{ display: "flex", marginTop: 8, fontWeight: 700, fontSize: 14 }}>
                <div style={{ flex: 1 }}>합계</div>
                <div style={{ color: ORDER.red }}>
                  {wonLabel((o.pos_order_items || []).reduce((a, it) => a + (it.amount || 0), 0))}
                </div>
              </div>
            </div>
          ))}

          {manageOrders.length > 0 && (
            <div style={{ ...cardBox, padding: 14, background: "#FBF8F1", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1, fontWeight: 700 }}>총 합계</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: ORDER.red }}>{wonLabel(grand)}</div>
            </div>
          )}
        </div>

        <BottomBar>
          <button onClick={() => setStep("table")} style={{ ...lightBtn, flex: 1 }}>
            메뉴로
          </button>
          <button onClick={openMyOrders} style={{ ...primaryBtn, flex: 1 }}>
            새로고침
          </button>
        </BottomBar>
      </div>
    );
  }

  return null;
}

/* ---------- 재사용 스타일 ---------- */
const pill = {
  padding: "9px 14px",
  borderRadius: 999,
  background: "#FFF",
  border: `1px solid ${ORDER.line}`,
  color: ORDER.ink,
  fontSize: 12.5,
  fontWeight: 600,
};
const cardBox = {
  background: ORDER.card,
  borderRadius: 16,
  border: `1px solid ${ORDER.line}`,
};
const primaryBtn = {
  width: "100%",
  padding: "15px 0",
  borderRadius: 13,
  background: ORDER.red,
  color: "#FFF",
  fontWeight: 700,
  fontSize: 15,
  minHeight: 50,
};
const lightBtn = {
  width: "100%",
  padding: "15px 0",
  borderRadius: 14,
  background: "#FFF",
  color: ORDER.ink,
  border: `1px solid ${ORDER.line}`,
  fontWeight: 700,
  fontSize: 15,
  minHeight: 52,
};
const stepBtn = {
  width: 52,
  height: 52,
  borderRadius: 12,
  fontSize: 24,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const miniStep = {
  width: 38,
  height: 38,
  borderRadius: 10,
  fontSize: 20,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const topRow = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 18px 6px",
};
const photoPlaceholder = {
  position: "relative",
  height: 230,
  background: "linear-gradient(135deg,#8A5A3B 0%,#6E4126 60%,#4E2E1A 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const addedBadge = {
  position: "absolute",
  top: 10,
  left: 10,
  background: ORDER.red,
  color: "#FFF",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 10px",
  borderRadius: 999,
};

function BottomBar({ children }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px calc(12px + env(safe-area-inset-bottom))",
        background: ORDER.bg,
        borderTop: `1px solid ${ORDER.line}`,
      }}
    >
      {children}
    </div>
  );
}
