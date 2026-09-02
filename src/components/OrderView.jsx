"use client";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabaseClient";
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

  function goMenu() {
    if (!canProceed) return;
    // 인원을 정하면 메뉴 수량을 인원 수(최소 인원 보장)로 자동 세팅 →
    // 담기 과정 없이 바로 − 수량 + 스텝퍼가 보인다.
    const init = {};
    menu.forEach((m) => {
      init[m.id] = Math.max(m.min_people, people || m.min_people);
    });
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
      if (next < item.min_people) return q;
      return { ...q, [item.id]: next };
    });
  }

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

      const rows = selected.map((m) => ({
        order_id: order.id,
        menu_id: m.id,
        name: m.name,
        people: qty[m.id],
        amount: m.price * qty[m.id],
        dispatched: false,
        taken: false,
      }));
      const { error: iErr } = await sb.from("pos_order_items").insert(rows);
      if (iErr) throw iErr;

      setLastItems(rows);
      setQty({});
      setStep("confirm");
    } catch (e) {
      setErr("주문 전송에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
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
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 8px", marginBottom: 26 }}>
            <img src="/image.png" alt="미스터시래기" style={{ height: 42, width: "auto" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: ORDER.red }}>
              {tableNo}번 테이블
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => setTablePicker((v) => !v)} style={pill}>
              테이블 바꾸기 ▾
            </button>
            <button onClick={() => setTableNo(1)} style={pill}>
              ← 전체
            </button>
          </div>

          {tablePicker && (
            <div style={{ ...cardBox, padding: 12, marginBottom: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {TABLES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTableNo(t);
                      setTablePicker(false);
                    }}
                    style={{
                      padding: "12px 0",
                      borderRadius: 12,
                      fontWeight: 700,
                      background: t === tableNo ? ORDER.ink : "#FFF",
                      color: t === tableNo ? "#FFF" : ORDER.ink,
                      border: `1px solid ${ORDER.line}`,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 24, marginBottom: 4 }}>
            몇 분이 오셨나요?
          </div>
          <div style={{ color: ORDER.muted, fontSize: 13.5, marginBottom: 12 }}>
            한상 메뉴는 2인 이상 주문됩니다
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {PARTY_OPTIONS.map((p) => {
              const on = people === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setPeople(p.value)}
                  style={{
                    padding: "22px 0",
                    borderRadius: 16,
                    fontFamily: serif,
                    fontWeight: 700,
                    fontSize: 20,
                    background: on ? ORDER.ink : "#FFF",
                    color: on ? "#FFF" : ORDER.ink,
                    border: `1px solid ${on ? ORDER.ink : ORDER.line}`,
                    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
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
            <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 20 }}>한상 메뉴</div>
            <div style={{ color: ORDER.muted, fontSize: 13 }}>2인분부터</div>
          </div>

          {loading && <div style={{ color: ORDER.muted }}>메뉴 불러오는 중…</div>}
          {err && <div style={{ color: ORDER.red }}>{err}</div>}
          {!loading && menu.length === 0 && (
            <div style={{ color: ORDER.muted }}>등록된 메뉴가 없습니다.</div>
          )}

          {menu.map((m) => {
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
                {/* 사진 자리 (실제 파일 없음 → 브랜드 톤 플레이스홀더) */}
                <div style={photoPlaceholder}>
                  {added && <div style={addedBadge}>{cnt}인 담김</div>}
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 22, color: "#FFF9EC" }}>
                    {m.name}
                  </div>
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 21, marginBottom: 6 }}>
                    {m.name}
                  </div>
                  {m.description && (
                    <div style={{ color: ORDER.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
                      {m.description}
                    </div>
                  )}
                  <div style={{ fontSize: 14, marginBottom: 14 }}>
                    <span style={{ color: ORDER.muted }}>1인 </span>
                    <b>{wonLabel(m.price)}</b>
                    <span style={{ color: ORDER.muted }}> / {cnt}인 </span>
                    <b style={{ color: ORDER.red }}>{wonLabel(m.price * cnt)}</b>
                  </div>

                  {!added ? (
                    <button onClick={() => addItem(m)} style={{ ...primaryBtn, padding: "13px 0" }}>
                      담기
                    </button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button
                        onClick={() => stepQty(m, -1)}
                        disabled={cnt <= m.min_people}
                        style={{ ...stepBtn, background: "#F1EEE4", color: ORDER.ink, opacity: cnt <= m.min_people ? 0.4 : 1 }}
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>{totalCount}개 메뉴 · {totalPeople}인</div>
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
            <button onClick={() => setStep("history")} style={{ ...primaryBtn }}>
              주문 내역 보기
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

  // ========== STEP: 주문 내역 (방금 전송한 내역) ==========
  return (
    <div style={wrap}>
      <div style={topRow}>
        <button onClick={() => setStep("confirm")} style={{ ...pill, fontWeight: 700 }}>
          ← 뒤로
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ color: ORDER.red, fontWeight: 700 }}>{tableNo}번 테이블</div>
      </div>
      <div className="app-scroll" style={{ flex: 1, overflowY: "auto", padding: "8px 18px 20px" }}>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 20, margin: "6px 0 14px" }}>
          주문 내역
        </div>
        {lastItems.map((it, i) => (
          <div key={i} style={{ ...cardBox, padding: 14, marginBottom: 10, display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{it.name}</div>
              <div style={{ color: ORDER.muted, fontSize: 13 }}>{it.people}인</div>
            </div>
            <div style={{ fontWeight: 700, color: ORDER.red }}>{wonLabel(it.amount)}</div>
          </div>
        ))}
        <div style={{ ...cardBox, padding: 14, marginTop: 6, display: "flex", alignItems: "center", background: "#FBF8F1" }}>
          <div style={{ flex: 1, fontWeight: 700 }}>합계</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: ORDER.red }}>
            {wonLabel(lastItems.reduce((s, i) => s + i.amount, 0))}
          </div>
        </div>
      </div>
      <BottomBar>
        <button onClick={() => setStep("menu")} style={{ ...primaryBtn }}>
          추가 주문하기
        </button>
      </BottomBar>
    </div>
  );
}

/* ---------- 재사용 스타일 ---------- */
const pill = {
  padding: "8px 12px",
  borderRadius: 999,
  background: "#FFF",
  border: `1px solid ${ORDER.line}`,
  color: ORDER.ink,
  fontSize: 13,
  fontWeight: 500,
};
const cardBox = {
  background: ORDER.card,
  borderRadius: 16,
  border: `1px solid ${ORDER.line}`,
};
const primaryBtn = {
  width: "100%",
  padding: "16px 0",
  borderRadius: 14,
  background: ORDER.red,
  color: "#FFF",
  fontWeight: 700,
  fontSize: 16,
  minHeight: 52,
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
const topRow = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 18px 6px",
};
const photoPlaceholder = {
  position: "relative",
  height: 130,
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
