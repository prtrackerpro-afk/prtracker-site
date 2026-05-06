-- PR Tracker — social graph: friendships + reactions on PR records.
-- Generated 2026-05-06.
--
-- V1 keeps it simple: directional follow (no mutual handshake), reactions
-- are emoji-only. Friend feed = PRs from anyone you follow ordered by
-- performed_at desc. Each PR can collect reactions from any signed-in
-- athlete who can read it (via RLS on pr_records — i.e. the owner; for
-- V1 we open up cross-athlete reads to followers via a SECURITY DEFINER
-- function).

-- =============================================================================
-- Follows (directional)
-- =============================================================================

create table if not exists public.pr_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_pr_follows_followee on public.pr_follows (followee_id);

alter table public.pr_follows enable row level security;

-- Each athlete sees their own outbound follows (who they follow) and
-- inbound follows (who follows them). They can write only their own
-- outbound rows.
create policy "follow read own" on public.pr_follows
  for select using (follower_id = auth.uid() or followee_id = auth.uid());
create policy "follow write outbound" on public.pr_follows
  for insert with check (follower_id = auth.uid());
create policy "follow delete outbound" on public.pr_follows
  for delete using (follower_id = auth.uid());

-- =============================================================================
-- Reactions on PR records
-- =============================================================================

create table if not exists public.pr_reactions (
  record_id uuid not null references public.pr_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('🔥','💪','🇧🇷','👏','🤘','⭐')),
  created_at timestamptz default now(),
  primary key (record_id, user_id, emoji)
);
create index if not exists idx_pr_reactions_record on public.pr_reactions (record_id);
create index if not exists idx_pr_reactions_user on public.pr_reactions (user_id);

alter table public.pr_reactions enable row level security;

-- Reactions are visible to anyone who can read the parent record (V1: just
-- the owner via pr_records RLS). For the feed, we surface counts via the
-- pr_friend_feed function (SECURITY DEFINER) which bypasses RLS safely.
create policy "reactions read own" on public.pr_reactions
  for select using (user_id = auth.uid());
create policy "reactions write own" on public.pr_reactions
  for insert with check (user_id = auth.uid());
create policy "reactions delete own" on public.pr_reactions
  for delete using (user_id = auth.uid());

-- =============================================================================
-- Friend feed function (SECURITY DEFINER, bypasses RLS for cross-athlete reads)
-- =============================================================================
-- Returns recent PR records from athletes the caller follows + their own
-- — limited to PR-true records (is_personal_record) so the feed isn't
-- spammed with non-PR working sets. Joins athlete profile + reaction
-- counts so the page can render in one round-trip.

create or replace function public.pr_friend_feed(
  p_limit int default 50,
  p_before_iso timestamptz default null
) returns table (
  record_id uuid,
  user_id uuid,
  display_name text,
  instagram_handle text,
  exercise text,
  weight_kg numeric,
  performed_at date,
  created_at timestamptz,
  reactions jsonb
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  ),
  followed as (
    select followee_id as id from public.pr_follows where follower_id = (select id from viewer)
    union
    select id from viewer  -- always include self
  ),
  recs as (
    select r.id, r.user_id, r.exercise, r.weight_kg, r.performed_at, r.created_at
    from public.pr_records r
    where r.user_id in (select id from followed)
      and r.is_personal_record = true
      and (p_before_iso is null or r.created_at < p_before_iso)
    order by r.created_at desc
    limit p_limit
  ),
  rxn as (
    select rec.id as record_id,
           coalesce(jsonb_object_agg(emoji, cnt) filter (where emoji is not null), '{}'::jsonb) as reactions
    from recs rec
    left join lateral (
      select emoji, count(*) as cnt
      from public.pr_reactions
      where record_id = rec.id
      group by emoji
    ) g on true
    group by rec.id
  )
  select rec.id, rec.user_id, a.display_name, a.instagram_handle,
         rec.exercise, rec.weight_kg, rec.performed_at, rec.created_at,
         coalesce(rxn.reactions, '{}'::jsonb)
  from recs rec
  left join public.pr_athletes a on a.user_id = rec.user_id
  left join rxn on rxn.record_id = rec.id
  order by rec.created_at desc;
$$;

grant execute on function public.pr_friend_feed(int, timestamptz) to authenticated;

-- =============================================================================
-- Athlete search (by display_name or instagram_handle, case-insensitive)
-- =============================================================================
-- For the "find friends" UI. Public-readable as long as the athlete has a
-- display_name set (no anonymous results).

create or replace function public.pr_search_athletes(
  p_query text,
  p_limit int default 20
) returns table (
  user_id uuid,
  display_name text,
  instagram_handle text
)
language sql
security definer
set search_path = public
as $$
  select user_id, display_name, instagram_handle
  from public.pr_athletes
  where display_name is not null
    and (
      display_name ilike '%' || p_query || '%'
      or instagram_handle ilike '%' || p_query || '%'
    )
  order by display_name
  limit p_limit;
$$;

grant execute on function public.pr_search_athletes(text, int) to authenticated;
