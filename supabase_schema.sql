-- ============================================================
--  tempo — схема БД (Supabase / Postgres)
--  Вставити цілком у Supabase → SQL Editor → Run.
-- ============================================================

-- КЛІЄНТИ -----------------------------------------------------
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  phone       text unique not null,        -- ідентифікатор + канал SMS
  name        text not null,
  card_token  text,                        -- токен картки Monobank (НЕ номер!)
  card_last4  text,                         -- '4421' лише для показу
  created_at  timestamptz default now()
);

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
  name        text,                          -- ім'я з кроку реєстрації
  expires_at  timestamptz not null,
  attempts    int default 0,
  used        boolean default false,
  created_at  timestamptz default now()
);
create index if not exists otp_phone_idx on otp_codes(phone, created_at desc);

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
