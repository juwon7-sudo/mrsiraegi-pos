"use client";
import { TABBAR_BG, TAB_INACTIVE, font } from "@/lib/constants";

const TABS = [
  { key: "order", label: "주문" },
  { key: "kitchen", label: "주방" },
  { key: "counter", label: "카운터" },
];

export default function TopTabs({ active, onChange }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        background: TABBAR_BG,
        padding: "8px 10px",
        display: "flex",
        gap: 6,
        justifyContent: "center",
      }}
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              maxWidth: 150,
              padding: "11px 0",
              borderRadius: 999,
              background: on ? "#FFFFFF" : "transparent",
              color: on ? "#1A1A1A" : TAB_INACTIVE,
              fontFamily: font,
              fontWeight: 700,
              fontSize: 15,
              transition: "background .15s",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
