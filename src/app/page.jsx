"use client";
import { useState } from "react";
import TopTabs from "@/components/TopTabs";
import OrderView from "@/components/OrderView";
import KitchenView from "@/components/KitchenView";
import CounterView from "@/components/CounterView";
import { TABBAR_BG } from "@/lib/constants";

export default function Home() {
  const [tab, setTab] = useState("order");
  const wide = tab === "counter"; // 카운터는 가로(와이드) 레이아웃

  return (
    <div
      className="app-outer"
      style={{ background: TABBAR_BG, display: "flex", justifyContent: "center" }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: wide ? 1280 : 460,
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
        </div>
      </div>
    </div>
  );
}
