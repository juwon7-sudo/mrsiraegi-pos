"use client";
import { useEffect, useMemo, useState } from "react";
import { getSupabase, menuImageUrl } from "@/lib/supabaseClient";
import { ORDER, font, serif, TABLES, PARTY_OPTIONS } from "@/lib/constants";
import { wonLabel } from "@/lib/format";

/* 주문 화면 — 라이트 크림 테마, 다단계 플로우 (테이블/인원 → 메뉴 → 확인) */
export default function OrderView() {
  const [step, setStep] = useState("table"); // table | menu | confirm | history
  const [tableNo, setTableNo] = useState(1);
  const [people, setPeople] = useState(null);
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tablePicker, setTablePicker] = useState(false);

  // 담긴 수량: { [menuId]: peopleCount }
  const [qty, setQty] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [lastItems, setLastItems] = useState([]);

  // 주문 수정/삭제(관리)
  const [manageOrders, setManageOrders] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);

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

  // 1명 → 1인 메뉴(min_people 1)만, 2명+ → 한상(min_people 2 이상)만.
  // 두 그룹을 완전히 분리해 서로의 화면에 섞이지 않게 한다.
  function menuForPeople(n) {
    if ((n || 1) <= 1) return menu.filter((m) => (m.min_people || 1) <= 1);
    return menu.filter((m) => (m.min_people || 1) >= 2);
  }

  // 세트메뉴(구성품 있음) 여부. 주문 단위는 세트든 단품이든 인원(人)으로 통일.
  const isSet = (m) => Array.isArray(m.components) && m.components.length > 0;
  const unitMin = (m) => m.min_people || 1;

  function goMenu() {
    if (!canProceed) return;
    // 해당 인원에 맞는 메뉴가 딱 1개면 담기 과정 없이 바로 − 수량 + 스텝퍼 표시.
    const applicable = menuForPeople(people);
    const init = {};
    if (applicable.length === 1) {
      const m = applicable[0];
      init[m.id] = Math.max(m.min_people || 1, people || 1);
    }
    setQty(init);
    setStep("menu");
  }

  function addItem(item) {
    setQty((q) => ({ ...q, [item.id]: Math.max(item.min_people, people || item.min_people) }));
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

  // 현재 인원 화면에 보이는 메뉴 중 담긴 것만 (다른 인원대의 잔여 선택은 무시)
  const selected = useMemo(
    () => menuForPeople(people).filter((m) => qty[m.id] != null),
    [menu, qty, people]
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

  // 로컬 수량 변경(저장 전 미리보기)
  function bumpItem(orderId, itemId, delta) {
    setManageOrders((prev) =>
      prev.map((o) =>
        o.id !== orderId
          ? o
          : {
              ...o,
              pos_order_items: o.pos_order_items.map((it) => {
                if (it.id !== itemId) return it;
                const next = Math.max(minForItem(it), it.people + delta);
                return { ...it, people: next, amount: it._unit * next };
              }),
            }
      )
    );
  }

  async function saveOrder(order) {
    if (manageBusy) return;
    setManageBusy(true);
    setErr("");
    try {
      const sb = getSupabase();
      for (const it of order.pos_order_items) {
        const { error } = await sb
          .from("pos_order_items")
          .update({ people: it.people, amount: it.amount })
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
      setManageBusy(false);
    }
  }

  async function deleteItem(order, item) {
    if (manageBusy) return;
    if (!window.confirm(`${item.name} 항목을 삭제할까요?`)) return;
    setManageBusy(true);
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
      setManageBusy(false);
    }
  }

  async function deleteOrder(order) {
    if (manageBusy) return;
    if (!window.confirm(`${order.table_no}번 테이블 주문 전체를 삭제할까요?`)) return;
    setManageBusy(true);
    setErr("");
    try {
      const sb = getSupabase();
      const { error } = await sb.from("pos_orders").delete().eq("id", order.id);
      if (error) throw error;
      await openManage();
    } catch (e) {
      setErr("주문 삭제에 실패했습니다.");
    } finally {
      setManageBusy(false);
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
                {tableNo}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: ORDER.ink }}>번 테이블</span>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => setTablePicker((v) => !v)} style={{ ...pill, whiteSpace: "nowrap" }}>
              테이블 바꾸기 ▾
            </button>
          </div>

          {tablePicker && (
            <div style={{ ...cardBox, padding: 10, marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {TABLES.map((t) => (
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
                      fontSize: 15,
                      background: t === tableNo ? ORDER.ink : "#FFF",
                      color: t === tableNo ? "#FFF" : ORDER.ink,
                      border: `1px solid ${t === tableNo ? ORDER.ink : ORDER.line}`,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          <div style={{ color: ORDER.red, fontWeight: 700 }}>{tableNo}번 테이블</div>
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

                {o.pos_order_items.map((it) => (
                  <div
                    key={it.id}
                    style={{ padding: "10px 0", borderTop: `1px solid ${ORDER.line}`, display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.name}
                      </div>
                      <div style={{ color: ORDER.red, fontWeight: 700, fontSize: 13 }}>{wonLabel(it.amount)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => bumpItem(o.id, it.id, -1)}
                        disabled={it.people <= minForItem(it)}
                        style={{ ...miniStep, background: "#F1EEE4", color: ORDER.ink, opacity: it.people <= minForItem(it) ? 0.4 : 1 }}
                      >
                        −
                      </button>
                      <div style={{ width: 38, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{it.people}인</div>
                      <button
                        onClick={() => bumpItem(o.id, it.id, +1)}
                        style={{ ...miniStep, background: ORDER.ink, color: "#FFF" }}
                      >
                        +
                      </button>
                      <button
                        onClick={() => deleteItem(o, it)}
                        style={{ marginLeft: 4, fontSize: 12.5, fontWeight: 700, color: ORDER.muted, background: "transparent", padding: "6px 4px" }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>
                    합계 <span style={{ color: ORDER.red }}>{wonLabel(oTotal)}</span>
                  </div>
                  <button
                    onClick={() => saveOrder(o)}
                    disabled={manageBusy}
                    style={{
                      padding: "11px 20px",
                      borderRadius: 12,
                      background: ORDER.ink,
                      color: "#FFF",
                      fontWeight: 700,
                      fontSize: 14,
                      opacity: manageBusy ? 0.5 : 1,
                    }}
                  >
                    변경 저장
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
      </div>
    );
  }

  // ========== STEP: 메뉴 ==========
  if (step === "menu") {
    return (
      <div style={wrap}>
        <div style={topRow}>
          <button onClick={() => setStep("table")} style={{ ...pill, fontWeight: 700 }}>
            ← 메뉴
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setStep("table")} style={pill}>
            {tableNo}번 ▾
          </button>
          <div style={{ color: ORDER.red, fontWeight: 700, fontSize: 15 }}>{people}인</div>
        </div>

        <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 18px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "8px 0 14px" }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18 }}>
              {people === 1 ? "1인 메뉴" : "한상 메뉴"}
            </div>
            <div style={{ color: ORDER.muted, fontSize: 12.5 }}>
              {people === 1 ? "혼자 드실 수 있는 메뉴" : "2인분부터"}
            </div>
          </div>

          {loading && <div style={{ color: ORDER.muted }}>메뉴 불러오는 중…</div>}
          {err && <div style={{ color: ORDER.red }}>{err}</div>}
          {!loading && menuForPeople(people).length === 0 && (
            <div style={{ color: ORDER.muted, textAlign: "center", marginTop: 40, fontSize: 13.5 }}>
              {people === 1
                ? "등록된 1인 메뉴가 없습니다."
                : "이 인원에 맞는 메뉴가 없습니다."}
            </div>
          )}

          {menuForPeople(people).map((m) => {
            const added = qty[m.id] != null;
            const cnt = qty[m.id] || m.min_people;
            return (
              <div
                key={m.id}
                style={{
                  ...cardBox,
                  border: `2px solid ${added ? ORDER.red : ORDER.line}`,
                  marginBottom: 16,
                  overflow: "hidden",
                }}
              >
                {/* 사진: image_path 있으면 실제 사진, 없으면 브랜드 톤 플레이스홀더 */}
                <div style={photoPlaceholder}>
                  {menuImageUrl(m.image_path) && (
                    <img
                      src={menuImageUrl(m.image_path)}
                      alt={m.name}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  )}
                  {added && <div style={addedBadge}>{cnt}인 담김</div>}
                  {!menuImageUrl(m.image_path) && (
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "#FFF9EC" }}>
                      {m.name}
                    </div>
                  )}
                </div>

                <div style={{ padding: 14 }}>
                  {/* 이름 + 가격 한 줄 */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: m.description ? 6 : 12, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 18 }}>{m.name}</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>
                      <span style={{ color: ORDER.muted }}>1인 </span>
                      <b>{wonLabel(m.price)}</b>
                      {cnt > 1 && (
                        <>
                          <span style={{ color: ORDER.muted }}> / {cnt}인 </span>
                          <b style={{ color: ORDER.red }}>{wonLabel(m.price * cnt)}</b>
                        </>
                      )}
                    </div>
                  </div>
                  {m.description && (
                    <div style={{ color: ORDER.muted, fontSize: 12.5, lineHeight: 1.6, marginBottom: 12 }}>
                      {m.description}
                    </div>
                  )}

                  {!added ? (
                    <button onClick={() => addItem(m)} style={{ ...primaryBtn, padding: "13px 0" }}>
                      담기
                    </button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => stepQty(m, -1)}
                        disabled={cnt <= unitMin(m)}
                        style={{ ...stepBtn, background: "#F1EEE4", color: ORDER.ink, opacity: cnt <= unitMin(m) ? 0.4 : 1 }}
                      >
                        −
                      </button>
                      <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 17 }}>
                        {cnt}인
                      </div>
                      <button
                        onClick={() => stepQty(m, +1)}
                        style={{ ...stepBtn, background: ORDER.ink, color: "#FFF" }}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <BottomBar>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{totalCount}개 메뉴</div>
            <div style={{ color: ORDER.muted, fontSize: 13 }}>{wonLabel(totalAmount)}</div>
          </div>
          <button
            disabled={totalCount === 0 || submitting}
            onClick={submitOrder}
            style={{ ...primaryBtn, width: "auto", padding: "0 28px", opacity: totalCount === 0 || submitting ? 0.45 : 1 }}
          >
            {submitting ? "전송 중…" : "주문하기"}
          </button>
        </BottomBar>
        {err && step === "menu" && (
          <div style={{ padding: "0 18px 10px", color: ORDER.red, fontSize: 13 }}>{err}</div>
        )}
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
            {tableNo}번 테이블
          </div>
          <div style={{ color: ORDER.muted, fontSize: 14, marginBottom: 32, textAlign: "center" }}>
            주방에서 순서대로 조리해 내어드립니다
          </div>

          <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={openManage} style={{ ...primaryBtn }}>
              주문 내역 · 수정
            </button>
            <button onClick={() => setStep("menu")} style={lightBtn}>
              추가 주문하기
            </button>
            <button
              onClick={() => {
                setPeople(null);
                setStep("table");
              }}
              style={lightBtn}
            >
              다른 테이블 주문
            </button>
          </div>
        </div>
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
