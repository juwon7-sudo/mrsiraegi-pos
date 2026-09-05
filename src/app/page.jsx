"use client";
import { useState } from "react";
import TopTabs from "@/components/TopTabs";
import OrderView from "@/components/OrderView";
import KitchenView from "@/components/KitchenView";
import CounterView from "@/components/CounterView";
import ManageView from "@/components/ManageView";
import { TABBAR_BG } from "@/lib/constants";

export default function Home() {
  const [tab, setTab] = useState("order");
  // 카운터·관리는 가로(와이드), 주방은 세로 태블릿 꽉 채우기(단일 세로 열), 나머지는 모바일 폭
  const maxW = tab === "counter" || tab === "manage" ? 1280 : tab === "kitchen" ? 900 : 460;

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
        <TopTabs active={tab} onChange={setTab} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {tab === "order" && <OrderView />}
          {tab === "kitchen" && <KitchenView />}
          {tab === "counter" && <CounterView />}
          {tab === "manage" && <ManageView />}
        </div>
      </div>
    </div>
  );
}
