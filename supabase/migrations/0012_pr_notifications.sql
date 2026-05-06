-- PR Tracker — in-app notifications inbox.
-- Generated 2026-05-06.
--
-- Notifications are written by the API (via service-role on relevant
-- triggers — reactions, follows, level-ups) and read by the recipient
-- via RLS. No realtime subscription here yet; dashboard polls or shows
-- count on each load.

create table if not exists public.pr_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Who/what triggered the notification (informational only).
  actor_user_id uuid references auth.users(id) on delete set null,
  -- Type drives the rendering on the inbox page.
  type text not null check (type in (
    'reaction',          -- someone reacted to your PR
    'follow',            -- someone started following you
    'level_up',          -- you unlocked a higher tier
    'box_join',          -- someone joined a box you own
    'achievement'        -- you unlocked an achievement
  )),
  -- Payload depends on type:
  --   reaction:    { record_id, emoji, exercise, weight_kg }
  --   follow:      {}
  --   level_up:    { tier, exercise, weight_kg }
  --   box_join:    { box_id, slug }
  --   achievement: { achievement_id }
  payload jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_pr_notifications_user_unread
  on public.pr_notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_pr_notifications_user_all
  on public.pr_notifications (user_id, created_at desc);

alter table public.pr_notifications enable row level security;

-- Recipient can read + mark read. Inserts always go via service-role
-- from server-side hooks (no client-direct insert allowed).
create policy "notifications read own" on public.pr_notifications
  for select using (user_id = auth.uid());
create policy "notifications update own" on public.pr_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trigger: when someone reacts to a PR, notify the record owner.
-- Skips self-reactions.
create or replace function public.pr_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_owner uuid;
  rec_exercise text;
  rec_weight numeric;
begin
  select user_id, exercise, weight_kg into rec_owner, rec_exercise, rec_weight
  from public.pr_records where id = NEW.record_id;

  if rec_owner is null or rec_owner = NEW.user_id then
    return NEW;
  end if;

  insert into public.pr_notifications (user_id, actor_user_id, type, payload)
  values (
    rec_owner,
    NEW.user_id,
    'reaction',
    jsonb_build_object(
      'record_id', NEW.record_id,
      'emoji', NEW.emoji,
      'exercise', rec_exercise,
      'weight_kg', rec_weight
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_pr_notify_reaction on public.pr_reactions;
create trigger trg_pr_notify_reaction
  after insert on public.pr_reactions
  for each row execute function public.pr_notify_reaction();

-- Trigger: when someone follows you, notify.
create or replace function public.pr_notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pr_notifications (user_id, actor_user_id, type, payload)
  values (NEW.followee_id, NEW.follower_id, 'follow', '{}'::jsonb);
  return NEW;
end;
$$;

drop trigger if exists trg_pr_notify_follow on public.pr_follows;
create trigger trg_pr_notify_follow
  after insert on public.pr_follows
  for each row execute function public.pr_notify_follow();

-- Trigger: when someone joins a box you own, notify the owner.
create or replace function public.pr_notify_box_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  box_owner uuid;
  box_slug text;
begin
  select owner_user_id, slug into box_owner, box_slug
  from public.pr_boxes where id = NEW.box_id;

  if box_owner is null or box_owner = NEW.user_id then
    return NEW;
  end if;

  insert into public.pr_notifications (user_id, actor_user_id, type, payload)
  values (
    box_owner,
    NEW.user_id,
    'box_join',
    jsonb_build_object('box_id', NEW.box_id, 'slug', box_slug)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_pr_notify_box_join on public.pr_box_members;
create trigger trg_pr_notify_box_join
  after insert on public.pr_box_members
  for each row execute function public.pr_notify_box_join();
