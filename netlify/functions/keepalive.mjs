/* ============================================================
   Supabase 무료 프로젝트 자동정지 방지 (keep-alive)
   - 넷리파이 예약 함수: 하루 1회 자동 실행.
   - pos_menu_items를 1건만 가볍게 조회해 DB 활동을 남긴다.
     (7일간 무접속 시 자동 일시정지되는 것을 막는다)
   - 환경변수는 앱에서 쓰는 것과 동일(NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).
   ============================================================ */

export const config = { schedule: "@daily" };

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("keepalive: 환경변수(NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)가 없습니다.");
    return new Response("missing supabase env", { status: 500 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/pos_menu_items?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const ok = res.ok;
    console.log(`keepalive: Supabase 응답 ${res.status} (${ok ? "정상" : "실패"})`);
    return new Response(`keepalive ${ok ? "ok" : "fail"}: ${res.status}`, {
      status: ok ? 200 : 502,
    });
  } catch (e) {
    console.error("keepalive: 요청 실패", e);
    return new Response(`keepalive error: ${e?.message || e}`, { status: 500 });
  }
};
