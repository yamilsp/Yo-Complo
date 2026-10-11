-- Yo Complo: esquema de sincronización.
-- Pegar completo en Supabase > SQL Editor > New query > Run. Se puede ejecutar más de una vez.

create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  id         text    not null,
  kind       text    not null,
  data       jsonb   not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- Gana la última escritura: si llega una versión más vieja, se ignora.
create or replace function public.records_lww() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_lww on public.records;
create trigger records_lww before insert or update on public.records
for each row execute function public.records_lww();

-- Cada usuario solo ve y modifica sus propios datos.
alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
