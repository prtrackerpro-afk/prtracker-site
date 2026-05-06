# PR Tracker — Vision Doc

**A grande aposta**: PR Tracker é o primeiro app fitness brasileiro onde o digital VIRA físico. Liftoff/Hevy/Strong não conseguem porque vendem dígitos. Nós vendemos troféus. **Toda interação digital tem um ponto de fuga pro produto físico.**

> "Seu PR merece mais do que uma foto."

---

## A diferenciação contra Liftoff (~$300k MRR, USD), Hevy (~$2M MRR), Strong

| Eles | Nós |
|------|-----|
| Tracker digital + ranks | Tracker digital + ranks **+ troféu físico unique-to-you** |
| Inglês, global | PT-BR, foco BR (CrossFit + Powerlifting + Halterofilismo) |
| Gym aesthetic | **Premium trophy aesthetic** |
| Receita: subscription | Receita: **D2C físico + sub + B2B box + sponsorships** |

A moat não é tracking — é o **virtual-physical loop**. Cada troféu virtual tem um "comprar o real" embutido no fluxo emocional do PR.

---

## 12 tentpoles do produto

| # | Feature | Stage | Quem |
|---|---------|:-----:|:----:|
| 1 | **Strength Score + Tier** (Iniciante → Elite, percentil) | ✅ V1 (em build) | Eng |
| 2 | **Virtual Gym 2D → 3D + Avatar** com troféus físicos montados | 🟡 V1 lite (Trophy Wall 2D) → V2 (Three.js) | Eng + Designer 3D |
| 3 | **1-tap Story (IG + TikTok)** Web Share + deep links | 🟡 V1 (Web Share) → V1.5 (deep link) | Eng |
| 4 | **Auto-Reel 15s** (Lottie + FFmpeg server-side) | ⏳ Q4 26 | Eng |
| 5 | **Box Owner Dashboard** + claim + QR onboard + leaderboard + comissão | ⏳ Q4 26 | Eng + PM |
| 6 | **Friend feed + reações + comentários** | ⏳ Q4 26 | Eng |
| 7 | **Quests + Achievements + Streaks** | ⏳ Q1 27 | PM design |
| 8 | **Ads + Sponsorships** (B2B marketplace, brand integrations, premium R$9,90/mo) | ⏳ Q4 26 | CMO + Eng |
| 9 | **Coach Verification** (PRs verificados pelo box) | ⏳ Q1 27 | PM + Eng |
| 10 | **Capacitor → App Store + Play Store** | ⏳ Q1 27 | Eng |
| 11 | **Apple Watch + Live Activities + Lock Screen Widget** | ⏳ Q2 27 | Native eng |
| 12 | **Drops/limited editions** (campeonatos, edição assinada) | ⏳ Q2 27 | Brand |

---

## Slots de monetização (sem ferir marca premium)

| Slot | Modelo | Ticket | Quando |
|------|--------|--------|--------|
| Trophy direct (atual) | D2C | R$120-300 | Hoje |
| **Premium Tier** (sem ads + avatar/gym custom + Reel HD + analytics) | Sub R$9,90-19,90/mo | Recorrência | Q4 26 |
| **Box Partnerships** | B2B SaaS R$200/mo + comissão venda | Recorrência | Q4 26 |
| **Brand Sponsorship Marketplace** (Growth, Centauro, Vitafor pagam pra estar na home + box leaderboards) | CPM/CPA | Maior LTV | Q1 27 |
| **Reel Pre-Roll** (5s, skip 2s) | CPM | Volume | Q1 27 |
| **Athlete sponsorships** (atleta posta, marca paga, comissão site) | Affiliate | High-intent | Q1 27 |

---

## Math grosso ano 1 (10k MAU, conservador)

- Trophy: 5% × R$170 = **R$85k**
- Premium: 8% × R$9,90 × 12 = **R$95k**
- Boxes: 50 × R$200 × 12 = **R$120k**
- Sponsorships: 5 × R$5k × 12 = **R$300k**
- **Total Y1: ~R$600k**, 50% vindo de sponsorships B2B

LTV pra premium subscriber: ~R$120/ano. CAC alvo: <R$30 via Reels orgânico.

---

## Roadmap por trimestre

### Q3 26 (em curso) — Foundation
- ✅ Score, tier, body data, profile, dashboard chart, share PNG
- ✅ Onboarding flow polished
- ✅ PWA installable (athlete-facing /pr/manifest.webmanifest)

### Q4 26 — Engagement
- Trophy Wall 2D (SVG isométrico)
- Box owner dashboard + QR onboarding
- Friend system MVP
- Streaks + basic quests
- 1-tap share to Story (PNG, captioned)
- **Premium tier launch** (R$9,90/mo, 3 perks)

### Q1 27 — App Store + Networking
- Three.js gym 3D + avatar (Ready Player Me)
- Reel auto-generation (15s MP4 server-side)
- Achievements system
- Coach verification beta com 3 boxes parceiros
- Capacitor wrap → App Store + Play Store

### Q2 27 — Native + Multiplayer
- Multiplayer gym visits (Supabase Realtime)
- Brand sponsorship marketplace
- Live Activities + Lock Screen widgets (Swift native)
- Apple Watch app

---

## Tentpole #2 detalhado — Virtual Gym 3D (V1 → V4)

A peça mais ambiciosa. Mistura Liftoff (números) + GymRats (social) + Sims/Animal Crossing (mundo). Decisão de stack: **Three.js cru** (sem R3F/Drei/Rapier) — bundle isolado em `/pr/gym`, mantido até Capacitor V4. Skill `pr-tracker-3d-gym` em `.claude/skills/` documenta convenções.

### V1 — Static room (entregar até 2026-05-13)

Estado atual: scaffold em `src/components/pr/VirtualGym.tsx` mas canvas renderiza vazio em prod (bug `aspect-ratio` + `h-full`).

- [ ] **Fix empty-canvas** — substituir `w-full h-full` por `position: absolute; inset: 0` no mount; medir via `getBoundingClientRect` no `useEffect`.
- [ ] **Validate em mobile real** (360×640) — screenshot anexado ao PR.
- [x] Sala: 3 paredes + chão + grid + plaque do atleta
- [x] 3 prateleiras com até 12 troféus
- [x] TV na parede direita com loop "PR REELS — EM BREVE"
- [x] Avatar low-poly idle bob
- [x] OrbitControls com damping
- [ ] **HUD overlay polish** — tier color para o nome, contador de troféus em Archivo Black

### V2 — Walking avatar + interactive trophies (até 2026-06-15)

- [ ] Refator pra `src/lib/pr/gym/` com mini-ECS em TS puro (~200 LOC, zero dep)
- [ ] **InputSystem**: WASD desktop + virtual joystick mobile (bottom-left)
- [ ] **MovementSystem**: avatar anda a ~2.5 u/s com colisão AABB nas paredes e pedestais
- [ ] **CameraSystem**: third-person follow padrão + toggle pra free orbit
- [ ] **InteractionSystem**: raycast no clique/tap → emit `TrophyClicked`
- [ ] **TrophyDetailModal** (HTML overlay, não 3D): peso, exercício, data, "Ver PR" + "Comprar troféu real" → deep-link ao BarbellConfigurator
- [ ] **Performance budget**: 30 FPS em Android mid-range, pixel ratio cap 1.5 mobile, desabilitar shadows se FPS<25

### V2.5 — Real avatar (até 2026-07-15)

- [ ] **GLTFLoader** com Ready Player Me (free CDN, GLB ~2MB)
- [ ] **AnimationMixer** com blend tree idle ↔ walk (Mixamo FBX retargetado)
- [ ] **Avatar customization page** (Premium tier perk): cor de pele, regata lime/branca/preta
- [ ] **Wave animation** ao chegar perto de troféu novo (PR daquela semana)

### V3 — TV plays Reels + multiplayer visits (até 2026-09-30)

- [ ] **VideoTexture na TV**: cycla os últimos 5 Reels do atleta (depende de tentpole #4)
- [ ] **Visit a friend's gym**: `/pr/gym/[handle]` carrega gym do amigo, atleta vê troféus do outro
- [ ] **Realtime presence**: Supabase Realtime channel `pr-gym-{handle}`, position broadcast a 10Hz, ghost avatars dos visitantes
- [ ] **Quest overlay no HUD**: missão ativa visível enquanto no gym
- [ ] **Spatial audio** (opcional): sons de ambiente + feedback de unlock quando bate PR novo

### V4 — Native + monetização (até 2026-12-31)

- [ ] **Capacitor wrap** — gym roda inalterado dentro do WebView nativo
- [ ] **In-gym ad slot**: billboard na parede esquerda, texture do CDN. Premium tier oculta.
- [ ] **Sponsor "patrocínio do box"**: gym do atleta de box partnership exibe logo do box discreto na TV durante intermissions
- [ ] **Drops/limited editions**: troféus de eventos especiais (Crossfit Open, Brasileiro de LPO) com material/glow exclusivo no gym

### Critério "Wow" para shipear V2

O atleta abre `/pr/gym` no celular, vê o avatar dele, anda com o joystick, clica num troféu e vê o PR. Sem framerate drop. Sem precisar de tutorial. Esse é o ponto onde o app vira **viral** — porque ninguém no Brasil tem isso e o screenshot/video do gym vira gancho orgânico de aquisição.

---

## Riscos (CMO honesto na sala)

1. **Janela de ~18 meses** antes de Liftoff/Hevy lançarem PT-BR. Velocidade matters.
2. **Brand vs gamification** — não pode virar gacha/loot box infantil. Premium ≠ Pokémon.
3. **Capital**: 3D + native = ~R$1-2M. Provável seed Q1 27 (estimativa).
4. **Aquisição**: Liftoff cresceu via TikTok orgânico. Replicar com CrossFit BR creators.
5. **LGPD**: peso corporal/sexo/idade são dados sensíveis. Coleta opcional + termo de consentimento.

---

## Decisões registradas (Brand Bible)

- **Magic link auth** (sem senha) — qualquer email vira atleta. Diferente de admin (ADMIN_EMAILS allowlist).
- **Body data opcional** — sem ela o tier não é mostrado, mas o PR ainda é registrado.
- **Strength Score V1 = ratio kg/peso corporal** com thresholds calibrados para distribuir ~30/30/20/15/5% nos 5 tiers.
- **Tier por movimento + composto** — usuário vê tier per-lift (nuance) + tier overall (identidade single-number).
- **Card SVG > PNG por enquanto** — PNG real só quando virar prioridade real (custo de Satori/Resvg dep).
- **Web Share API > native deep link** — Web Share funciona bem hoje em iOS 16.4+ e Android. Deep links nativos só quando entrar no Capacitor.

---

## Stack técnico atual

| Camada | Tech | Por quê |
|--------|------|---------|
| Frontend | Astro 5 (SSR) + React islands | Performance default + flexibilidade pra ilhas interativas |
| Backend | Vercel Serverless (Astro adapter) + Supabase | Zero ops + Postgres + Auth + RLS + Realtime ready |
| 3D futuro | Three.js | WebGL universal, Capacitor compatible |
| Avatares futuro | Ready Player Me | Free API, customização rica |
| Mobile futuro | Capacitor | Reusa codebase, App Store + Play Store |
| Pagamentos | Mercado Pago + Pix | BR-native, integrado com Bling ERP |
| ERP | Bling | NF-e + estoque + multi-canal já em prod |
| Catálogo cross-channel | Bling + Meta Catalog + Google Merchant | Single source of truth |
| Analytics | Admin dashboard custom (Meta Ads + GA4 + MP) | Já em prod |

---

## Métricas de sucesso (V1)

- ≥30% dos atletas que logam o 1º PR voltam pra logar um 2º em 30 dias
- ≥10% dos PRs registrados (`is_personal_record=true`) clicam **Transforme em troféu**
- ≥3% conversão clique→checkout (vs ~1-2% ads frio)
- **Net New Strength Tier upgrades** por semana (engagement leading indicator)
- **Median time-to-first-PR** após signup (onboarding quality)
- **Streak de meses ativos** distribution (D7/D30 retention proxy)

---

*Última atualização: 2026-05-06. Mantido por Felipe + Claude. Editar em PR review com chamada de boardroom.*
