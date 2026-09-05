-- ============================================================
-- 미스터시래기 POS — 관리 탭용 추가분
--  1) 메뉴 편집(추가/삭제) 권한
--  2) 메뉴 사진 저장용 Storage 버킷(pos-menu, 공개)
--  3) 일 마감 대조 테이블(pos_closings)
-- Supabase SQL Editor 에서 한 번 실행하세요.
-- ============================================================

-- ---------- 1) 메뉴 추가/삭제 권한 ----------
drop policy if exists pos_menu_insert on public.pos_menu_items;
create policy pos_menu_insert on public.pos_menu_items for insert to anon, authenticated with check (true);
drop policy if exists pos_menu_delete on public.pos_menu_items;
create policy pos_menu_delete on public.pos_menu_items for delete to anon, authenticated using (true);

grant insert, delete on public.pos_menu_items to anon, authenticated;

-- 출고 구분: kitchen(주방에서 조리해 출고) | hall(미리 준비돼 홀에서 바로 출고)
alter table public.pos_menu_items  add column if not exists station text not null default 'kitchen';
alter table public.pos_order_items add column if not exists station text not null default 'kitchen';

-- 매출 무효(취소) 감사 기록: 테이블로 복원하지 않고 매출에서만 제외, 내역은 보존
alter table public.pos_orders add column if not exists voided    boolean not null default false;
alter table public.pos_orders add column if not exists voided_at timestamptz;

-- 세트메뉴 구성품: [{ "name":"낙지", "station":"kitchen", "qty":2 }, ...]
-- 값이 있으면 세트(고정가)로 취급하고, 주문 시 구성품마다 별도 출고 건으로 나뉜다.
alter table public.pos_menu_items add column if not exists components jsonb not null default '[]'::jsonb;

-- 주문 항목에 원래 메뉴 이름 저장(주방/카운터에 기본 메뉴명 표시용)
alter table public.pos_order_items add column if not exists menu_name text;

-- ---------- 2) 메뉴 사진 Storage 버킷 (공개 읽기) ----------
insert into storage.buckets (id, name, public)
values ('pos-menu', 'pos-menu', true)
on conflict (id) do update set public = true;

drop policy if exists pos_menu_obj_read   on storage.objects;
create policy pos_menu_obj_read   on storage.objects for select to anon, authenticated using (bucket_id = 'pos-menu');
drop policy if exists pos_menu_obj_insert on storage.objects;
create policy pos_menu_obj_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'pos-menu');
drop policy if exists pos_menu_obj_update on storage.objects;
create policy pos_menu_obj_update on storage.objects for update to anon, authenticated using (bucket_id = 'pos-menu') with check (bucket_id = 'pos-menu');
drop policy if exists pos_menu_obj_delete on storage.objects;
create policy pos_menu_obj_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'pos-menu');

-- ---------- 3) 일 마감 대조 ----------
create table if not exists public.pos_closings (
  id             uuid primary key default gen_random_uuid(),
  close_date     date not null unique,          -- 마감일 (Asia/Seoul)
  system_card    int  not null default 0,        -- 시스템 집계(결제수단별)
  system_cash    int  not null default 0,
  system_voucher int  not null default 0,
  system_none    int  not null default 0,        -- 미지정
  system_total   int  not null default 0,
  actual_card    int  not null default 0,         -- 롯데포스 실제 금액
  actual_cash    int  not null default 0,
  actual_voucher int  not null default 0,
  memo           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.pos_closings enable row level security;

drop policy if exists pos_closings_select on public.pos_closings;
create policy pos_closings_select on public.pos_closings for select to anon, authenticated using (true);
drop policy if exists pos_closings_insert on public.pos_closings;
create policy pos_closings_insert on public.pos_closings for insert to anon, authenticated with check (true);
drop policy if exists pos_closings_update on public.pos_closings;
create policy pos_closings_update on public.pos_closings for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.pos_closings to anon, authenticated;
