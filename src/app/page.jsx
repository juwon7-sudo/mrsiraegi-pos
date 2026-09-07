"use client";
import { useEffect, useState } from "react";
import TopTabs from "@/components/TopTabs";
import OrderView from "@/components/OrderView";
import KitchenView from "@/components/KitchenView";
import CounterView from "@/components/CounterView";
import ManageView from "@/components/ManageView";
import { TABBAR_BG } from "@/lib/constants";

export default function Home() {
  const [tab, setTab] = useState("order");
  // 손님용 모드: QR(?table=N)로 접속하면 주문만 가능(탭 숨김·테이블 고정)
  const [customer, setCustomer] = useState(false);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("table") || p.get("t")) setCustomer(true);
    } catch {}
  }, []);

  // 카운터·관리는 가로(와이드), 주방은 세로 태블릿 꽉 채우기, 나머지·손님용은 모바일 폭
  const maxW = customer ? 460 : tab === "counter" || tab === "manage" ? 1280 : tab === "kitchen" ? 900 : 460;

  return (
    <div
      className="app-outer"
      style={{ background: TABBAR_BG, display: "flex", justifyContent: "center" }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: maxW,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {customer ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <OrderView customer />
          </div>
        ) : (
          <>
            <TopTabs active={tab} onChange={setTab} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              {tab === "order" && <OrderView />}
              {tab === "kitchen" && <KitchenView />}
              {tab === "counter" && <CounterView />}
              {tab === "manage" && <ManageView />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
