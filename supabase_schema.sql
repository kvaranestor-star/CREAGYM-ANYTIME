-- ============================================================
--  tempo — схема БД (Supabase / Postgres)
--  Вставити цілком у Supabase → SQL Editor → Run.
-- ============================================================

-- КЛІЄНТИ -----------------------------------------------------
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  phone         text unique not null,        -- ідентифікатор + канал SMS
  name          text not null,
  password_hash text,                         -- scrypt salt:hash (вхід за паролем)
  card_token    text,                        -- токен картки Monobank (НЕ номер!)
  card_last4    text,                          -- '4421' лише для показу
  created_at    timestamptz default now()
);
-- якщо таблиця вже існувала — додати нову колонку:
alter table clients add column if not exists password_hash text;

-- СЕСІЇ (тренування) -----------------------------------------
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,                 -- null = триває просто зараз
  tariff      text,                         -- 'prime' | 'day' | 'night'
  rate        int,                          -- ₴/год на момент старту
  amount      int,                          -- підсумок ₴ після capture
  end_reason  text,                         -- 'manual' | 'idle' | 'cap'
  hold_id     text                          -- id преавторизації Monobank
);
create index if not exists sessions_client_idx on sessions(client_id, started_at desc);
-- швидко знаходити відкриту сесію (зал зайнятий?)
create unique index if not exists sessions_one_open_idx
  on sessions(id) where ended_at is null;

-- КОДИ ПІДТВЕРДЖЕННЯ (OTP) -----------------------------------
create table if not exists otp_codes (
  id          bigint generated always as identity primary key,
  phone       text not null,
  code_hash   text not null,                -- sha256(phone:code), не сам код
  purpose     text default 'register',       -- 'register' | 'reset'
  payload     text,                          -- JSON: {name, password_hash} для реєстрації
  name        text,
  expires_at  timestamptz not null,
  attempts    int default 0,
  used        boolean default false,
  created_at  timestamptz default now()
);
create index if not exists otp_phone_idx on otp_codes(phone, created_at desc);
-- якщо таблиця вже існувала:
alter table otp_codes add column if not exists purpose text default 'register';
alter table otp_codes add column if not exists payload text;

-- СЕСІЇ ЗАСТОСУНКУ (opaque-токени входу клієнта) -------------
create table if not exists app_sessions (
  token       text primary key,             -- випадковий токен у браузері клієнта
  client_id   uuid references clients(id) on delete cascade,
  created_at  timestamptz default now(),
  expires_at  timestamptz not null
);
create index if not exists app_sessions_client_idx on app_sessions(client_id);

-- НАЛАШТУВАННЯ / ІНТЕГРАЦІЇ (key-value) ----------------------
-- Тут лежать токени TurboSMS / Monobank / URL ESP32.
-- Доступ лише через серверні функції (RLS закриває все).
create table if not exists settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz default now()
);

-- СЕСІЇ ВЛАСНИКА (вхід у панель) -----------------------------
create table if not exists admin_sessions (
  token       text primary key,
  created_at  timestamptz default now(),
  expires_at  timestamptz not null
);

-- ============================================================
--  RLS: заборонити прямий доступ із браузера.
--  Усе ходить через серверні функції з service_role (він обходить RLS).
--  Політик НЕ створюємо → anon/authenticated не бачать жодного рядка.
-- ============================================================
alter table clients      enable row level security;
alter table sessions     enable row level security;
alter table otp_codes    enable row level security;
alter table app_sessions enable row level security;
alter table settings      enable row level security;
alter table admin_sessions enable row level security;

-- ЛОКАЦІЇ (зали) ---------------------------------------------
create table if not exists locations (
  id          uuid primary key default gen_random_uuid(),
  number      int unique not null,         -- порядковий номер, який вводить клієнт
  name        text not null,
  address     text,
  esp32_url   text,                          -- свій контролер на кожну локацію
  active      boolean default true,
  created_at  timestamptz default now()
);
alter table locations enable row level security;

-- прив'язка сесії до локації
alter table sessions add column if not exists location_id uuid references locations(id);

-- засів локацій CREAGYM (зміни під себе)
insert into locations (number, name, address) values
  (1, 'CREAGYM Бандери',      'вул. Бандери 3'),
  (2, 'CREAGYM Клосовського',  'вул. Клосовського 10'),
  (3, 'CREAGYM Новосінна',     'вул. Новосінна 34')
on conflict (number) do nothing;
