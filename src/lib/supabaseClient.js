"use client";
/* ============================================================
   브라우저 Supabase 클라이언트 (단일 인스턴스).
   로그인 없이 anon 키로 직접 접근한다. POS 테이블은 permissive RLS.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  _client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// 메뉴 사진 공개 URL (pos-menu 공개 버킷)
export function menuImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path; // 이미 전체 URL이면 그대로
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return `${base}/storage/v1/object/public/pos-menu/${path}`;
}
