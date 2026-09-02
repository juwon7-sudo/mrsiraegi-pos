-- ============================================================
-- 미스터시래기 POS — 스키마
-- 매장의 기존 Supabase 프로젝트 SQL Editor 에서 이 파일을 실행하세요.
-- 이 앱은 로그인이 없는 매장 내부 POS 이므로, 아래 3개 테이블에 한해
-- anon/authenticated 의 읽기·쓰기를 허용하는 permissive RLS 를 둡니다.
-- (다른 테이블은 절대 건드리지 않습니다. 아래 3개 POS 테이블만 생성/수정.)
-- ============================================================

-- ---------- 메뉴 ----------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       int  not null default 0,   -- 원, 1인 기준
  min_people  int  not null default 1,
  image_path  text,
  sort        int  not null default 0,
  active      bool not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- 주문 ----------
create table if not exists public.orders (
  id         uuid primary key default gen_random_uuid(),
  table_no   int  not null,
  people     int  not null,
  status     text not null default 'cooking' check (status in ('cooking','ready','done')),
  total      int  not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 주문 항목 ----------
create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  menu_id    uuid references public.menu_items(id),
  name       text,
  people     int  not null,
  amount     int  not null,              -- 원, price * people
  dispatched bool not null default false, -- 주방 출고완료
  taken      bool not null default false, -- 카운터에서 손님이 가져감
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_status     on public.orders (status);
create index if not exists idx_orders_created     on public.orders (created_at);
create index if not exists idx_order_items_order  on public.order_items (order_id);

-- ---------- RLS ----------
alter table public.menu_items  enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- menu_items: 모두 조회 가능, 수정 허용(정렬/활성 토글 등)
drop policy if exists pos_menu_select on public.menu_items;
create policy pos_menu_select on public.menu_items
  for select to anon, authenticated using (true);
drop policy if exists pos_menu_update on public.menu_items;
create policy pos_menu_update on public.menu_items
  for update to anon, authenticated using (true) with check (true);

-- orders: 조회 / 등록 / 수정
drop policy if exists pos_orders_select on public.orders;
create policy pos_orders_select on public.orders
  for select to anon, authenticated using (true);
drop policy if exists pos_orders_insert on public.orders;
create policy pos_orders_insert on public.orders
  for insert to anon, authenticated with check (true);
drop policy if exists pos_orders_update on public.orders;
create policy pos_orders_update on public.orders
  for update to anon, authenticated using (true) with check (true);

-- order_items: 조회 / 등록 / 수정
drop policy if exists pos_items_select on public.order_items;
create policy pos_items_select on public.order_items
  for select to anon, authenticated using (true);
drop policy if exists pos_items_insert on public.order_items;
create policy pos_items_insert on public.order_items
  for insert to anon, authenticated with check (true);
drop policy if exists pos_items_update on public.order_items;
create policy pos_items_update on public.order_items
  for update to anon, authenticated using (true) with check (true);

-- ---------- 권한 부여 ----------
grant select, update            on public.menu_items  to anon, authenticated;
grant select, insert, update    on public.orders      to anon, authenticated;
grant select, insert, update    on public.order_items to anon, authenticated;

-- ============================================================
-- 시드: 참고 화면에 보이는 한상 메뉴 1개.
-- (메뉴는 매장이 아래와 같은 방식으로 계속 추가하면 됩니다.)
--   insert into public.menu_items (name, description, price, min_people, sort)
--   values ('메뉴명', '설명', 12000, 1, 2);
-- ============================================================
insert into public.menu_items (name, description, price, min_people, sort, active)
select
  '불맛한상',
  '직화 낙지볶음 · 직화 제육볶음 · 시래기밥 · 계절쌈과 우렁 강된장 · 시래기 된장지짐이 · 함흥 물냉면',
  18900, 2, 1, true
where not exists (select 1 from public.menu_items where name = '불맛한상');
