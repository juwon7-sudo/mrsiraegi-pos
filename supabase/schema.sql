-- ============================================================
-- 미스터시래기 POS — 스키마 (테이블 이름에 pos_ 접두사)
-- 같은 Supabase 를 여러 앱이 공유하므로, 이름 충돌을 피하려고
-- POS 전용 테이블 3개는 pos_ 접두사를 씁니다.
-- (다른 테이블은 절대 건드리지 않습니다.)
-- ============================================================

create table if not exists public.pos_menu_items (
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

create table if not exists public.pos_orders (
  id         uuid primary key default gen_random_uuid(),
  table_no   int  not null,
  people     int  not null,
  status     text not null default 'cooking' check (status in ('cooking','ready','done')),
  total      int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.pos_orders(id) on delete cascade,
  menu_id    uuid references public.pos_menu_items(id),
  name       text,
  people     int  not null,
  amount     int  not null,              -- 원, price * people
  dispatched bool not null default false, -- 주방 출고완료
  taken      bool not null default false, -- 카운터에서 손님이 가져감
  created_at timestamptz not null default now()
);

create index if not exists idx_pos_orders_status    on public.pos_orders (status);
create index if not exists idx_pos_orders_created    on public.pos_orders (created_at);
create index if not exists idx_pos_order_items_order on public.pos_order_items (order_id);

-- ---------- RLS (로그인 없는 매장 내부 POS) ----------
alter table public.pos_menu_items  enable row level security;
alter table public.pos_orders      enable row level security;
alter table public.pos_order_items enable row level security;

drop policy if exists pos_menu_select on public.pos_menu_items;
create policy pos_menu_select on public.pos_menu_items for select to anon, authenticated using (true);
drop policy if exists pos_menu_update on public.pos_menu_items;
create policy pos_menu_update on public.pos_menu_items for update to anon, authenticated using (true) with check (true);

drop policy if exists pos_orders_select on public.pos_orders;
create policy pos_orders_select on public.pos_orders for select to anon, authenticated using (true);
drop policy if exists pos_orders_insert on public.pos_orders;
create policy pos_orders_insert on public.pos_orders for insert to anon, authenticated with check (true);
drop policy if exists pos_orders_update on public.pos_orders;
create policy pos_orders_update on public.pos_orders for update to anon, authenticated using (true) with check (true);

drop policy if exists pos_items_select on public.pos_order_items;
create policy pos_items_select on public.pos_order_items for select to anon, authenticated using (true);
drop policy if exists pos_items_insert on public.pos_order_items;
create policy pos_items_insert on public.pos_order_items for insert to anon, authenticated with check (true);
drop policy if exists pos_items_update on public.pos_order_items;
create policy pos_items_update on public.pos_order_items for update to anon, authenticated using (true) with check (true);

grant select, update         on public.pos_menu_items  to anon, authenticated;
grant select, insert, update on public.pos_orders      to anon, authenticated;
grant select, insert, update on public.pos_order_items to anon, authenticated;

-- ---------- 시드: 한상 메뉴 1개 ----------
insert into public.pos_menu_items (name, description, price, min_people, sort, active)
select '불맛한상',
  '직화 낙지볶음 · 직화 제육볶음 · 시래기밥 · 계절쌈과 우렁 강된장 · 시래기 된장지짐이 · 함흥 물냉면',
  18900, 2, 1, true
where not exists (select 1 from public.pos_menu_items where name = '불맛한상');
