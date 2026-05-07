-- PR Tracker — Salas visitáveis (V16)
-- Generated 2026-05-07
--
-- Atletas podem visitar o ginásio virtual de outros atletas. Visita
-- é read-only (vê troféus, layout, skills, runs, mas não edita).
--
-- Privacidade:
--   public  → qualquer atleta logado pode visitar
--   friends → apenas quem é seguido pelo dono pode visitar (relação mútua via pr_follows)
--   private → ninguém pode visitar (nem por link)
--
-- Identificador da URL: instagram_handle (já existe em pr_athletes,
-- garantidamente único pelo onboarding).

alter table public.pr_athletes
  add column if not exists gym_visibility text not null default 'public'
    check (gym_visibility in ('public', 'friends', 'private'));

comment on column public.pr_athletes.gym_visibility is
  'Quem pode visitar o ginásio virtual: public/friends/private. Default public.';

-- Index pra lookup rápido por handle (já é unique, mas reforça o caso comum)
create index if not exists idx_pr_athletes_handle_lower
  on public.pr_athletes (lower(instagram_handle));

-- =============================================================================
-- Função: pr_get_visitable_gym(p_handle)
-- =============================================================================
-- Retorna dados do ginásio do atleta-alvo SE o caller tem permissão.
-- Caso contrário retorna 0 rows (página renderiza "Privado" / "Não encontrado").
--
-- Regras de acesso:
--   1. Atleta-alvo existe
--   2. visibility = 'public' → qualquer caller logado vê
--   3. visibility = 'friends' → caller precisa ser seguido pelo target
--      (target tem follow OUT pra caller)
--   4. visibility = 'private' → só o próprio dono vê
--
-- Retorno inclui: profile + layout + xp + skills + runs (tudo que o
-- VirtualGym precisa pra renderizar a sala visitada).

create or replace function public.pr_get_visitable_gym(
  p_handle text
) returns table (
  user_id uuid,
  display_name text,
  instagram_handle text,
  body_weight_kg numeric,
  sex text,
  gym_layout jsonb,
  gym_visibility text,
  xp_total int,
  best_lifts jsonb,
  skills jsonb,
  runs jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid;
  v_visibility text;
begin
  -- 1) Resolve handle → user_id
  select a.user_id, a.gym_visibility
    into v_target, v_visibility
    from public.pr_athletes a
   where lower(a.instagram_handle) = lower(p_handle)
   limit 1;

  if v_target is null then
    return; -- 0 rows
  end if;

  -- 2) Caller é o próprio dono? Sempre vê (mesmo se private)
  if v_caller = v_target then
    -- pula pra return
    null;
  -- 3) public → vê desde que logado
  elsif v_visibility = 'public' then
    if v_caller is null then
      return;
    end if;
  -- 4) friends → caller precisa ser seguido pelo target
  elsif v_visibility = 'friends' then
    if v_caller is null then
      return;
    end if;
    if not exists (
      select 1 from public.pr_follows f
       where f.follower_id = v_target
         and f.followee_id = v_caller
    ) then
      return;
    end if;
  -- 5) private → só dono (já tratado acima); fora dele = bloqueado
  else
    return;
  end if;

  -- Passou: retorna o gym completo
  return query
  select
    a.user_id,
    a.display_name,
    a.instagram_handle,
    a.body_weight_kg,
    a.sex,
    a.gym_layout,
    a.gym_visibility,
    a.xp_total,
    -- best_lifts agregado em JSON {exercise: weight_kg}
    coalesce(
      (select jsonb_object_agg(b.exercise, b.weight_kg)
         from public.pr_best_lifts b
        where b.user_id = v_target),
      '{}'::jsonb
    ) as best_lifts,
    -- skills agregado em JSON {skill_id: best_reps}
    coalesce(
      (select jsonb_object_agg(s.skill_id, s.best_reps)
         from public.pr_skills s
        where s.user_id = v_target),
      '{}'::jsonb
    ) as skills,
    -- runs agregado em JSON {distance: best_time_sec}
    coalesce(
      (select jsonb_object_agg(r.distance, r.best_time_sec)
         from public.pr_runs r
        where r.user_id = v_target),
      '{}'::jsonb
    ) as runs
  from public.pr_athletes a
  where a.user_id = v_target;
end;
$$;

grant execute on function public.pr_get_visitable_gym(text) to authenticated;

-- =============================================================================
-- Função: pr_friends_workout_frequency(p_days)
-- =============================================================================
-- Pra "Gym Rats" widget — retorna por amigo: dias distintos com PR
-- registrado nos últimos N dias. Caller só vê amigos que segue.
--
-- Útil pra UI tipo:
--   "Camila - 5 dias essa semana 🔥"
--   "Bruno - 2 dias 💪"

create or replace function public.pr_friends_workout_frequency(
  p_days int default 7
) returns table (
  user_id uuid,
  display_name text,
  instagram_handle text,
  workout_days int,
  last_workout_date date
)
language sql
security definer
set search_path = public
as $$
  with caller as (select auth.uid() as id),
  followed as (
    select f.followee_id as id
      from public.pr_follows f
     where f.follower_id = (select id from caller)
  ),
  recs as (
    select r.user_id, r.performed_at
      from public.pr_records r
     where r.user_id in (select id from followed)
       and r.is_personal_record = true
       and r.performed_at >= (current_date - p_days * interval '1 day')
  ),
  agg as (
    select recs.user_id,
           count(distinct recs.performed_at) as workout_days,
           max(recs.performed_at) as last_workout_date
      from recs
     group by recs.user_id
  )
  select agg.user_id,
         a.display_name,
         a.instagram_handle,
         agg.workout_days::int,
         agg.last_workout_date
    from agg
    join public.pr_athletes a on a.user_id = agg.user_id
   order by agg.workout_days desc, agg.last_workout_date desc;
$$;

grant execute on function public.pr_friends_workout_frequency(int) to authenticated;
