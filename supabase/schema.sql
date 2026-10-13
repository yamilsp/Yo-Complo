-- Yo Cumplo: esquema de sincronización.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.

create table if not exists public.yc_records (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  id         text    not null,
  kind       text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists yc_records_user_server_ts on public.yc_records (user_id, server_ts);

-- Gana la última escritura: si llega una versión más vieja, se ignora.
create or replace function public.yc_records_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists yc_records_lww on public.yc_records;
create trigger yc_records_lww before insert or update on public.yc_records
for each row execute function public.yc_records_lww();

-- Cada usuario solo ve y modifica sus propios datos.
alter table public.yc_records enable row level security;

drop policy if exists "yc own records" on public.yc_records;
create policy "yc own records" on public.yc_records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
