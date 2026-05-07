# PR Tracker World — Roadmap 500 ciclos

Plano detalhado de 500 ciclos de melhoria contínua do app PR Tracker World.
Cada ciclo é uma melhoria autocontida (commitável + deployável).
Os ciclos são agrupados em **20 fases temáticas** de 25 ciclos cada.

---

## Princípios

1. **Cada ciclo = 1 commit deployável.** Sem refactor sem feature.
2. **Realismo > complexidade.** Detalhe arquitetônico beats novos sistemas.
3. **Funcional > decorativo.** App tem que servir como ferramenta de treino real.
4. **Brand-first.** Tudo passa pelo CLAUDE.md (força, conquista, premium).
5. **Cada feature nova precisa de RLS no Supabase.** Sem buracos de segurança.

---

## FASE 1 (ciclos 102-126) — Customização do Avatar

**Objetivo**: avatar deixa de ser "boneco genérico" e vira identidade visual do atleta.

| Ciclo | Item |
|-------|------|
| 102 | Tabela `pr_avatar_prefs` Supabase com campos: skin, hair, hairStyle, top, shorts, gender, **headwear, eyewear, wristband, gloves, beard, tattoos** |
| 103 | RLS na nova tabela (read/write owner-only + read public) |
| 104 | Endpoint `GET/PUT /api/pr/avatar` |
| 105 | Página `/pr/avatar` redesenhada com novas seções (acessórios) |
| 106 | Builder: **boné** (BackwardsCap, SnapBack, Beanie, BasicCap) |
| 107 | Builder: **óculos** (Aviator, Wayfarer, Lifting Glasses, Sunglasses) |
| 108 | Builder: **wristband** (cinto, munhequeira, sweatbands) |
| 109 | Builder: **luva** (mão fechada estilo strap, luva tactical, luva mitten) |
| 110 | Builder: **barba** (curta, longa, bigode, goatee) |
| 111 | Builder: **tatuagem** (faixa lime no bíceps, full sleeve, peitoral) |
| 112 | Picker UI: live preview rotacionável (canvas miniatura React) |
| 113 | Picker: tabs separadas (Cabeça/Tronco/Pernas/Acessórios) |
| 114 | Sistema de **unlocks**: certos acessórios só liberados por XP/PRs |
| 115 | Item especial: **boné PR Tracker** (lime com logo) — unlock 5 PRs |
| 116 | **Cinto de levantamento**: unlock primeiro PR de Deadlift acima de 1.5×BW |
| 117 | **Wristband Olímpico** (vermelho/azul/amarelo): unlock por tier |
| 118 | **Camiseta personalizada**: estampar exercício favorito do atleta |
| 119 | **Short** com estampa marca |
| 120 | **Tênis** customizável (cor da sola, cor do upper) |
| 121 | Avatar idle anima: respiração (scale do torso 0.99-1.01) |
| 122 | Avatar idle: piscar (face canvas alterna 1× a cada 4-6s) |
| 123 | Avatar idle: leve weight shift (rotation.z root ±0.02) |
| 124 | Render do avatar no perfil `/pr/profile` (preview pequeno) |
| 125 | Render do avatar na NavBar quando logado |
| 126 | Compartilhamento: snapshot do avatar PNG pra story |

---

## FASE 2 (ciclos 127-151) — Planos de Treino com Personal

**Objetivo**: Personal Trainers podem cadastrar atletas, criar planos semanais e receber feedback. Substitui a planilha que muitos PTs usam hoje.

| Ciclo | Item |
|-------|------|
| 127 | Schema Supabase: `pr_coaches` (PT/Nutri profile expandido) |
| 128 | Schema: `pr_coach_athletes` (vínculo coach↔atleta com data_inicio/fim) |
| 129 | Schema: `pr_workout_plans` (header: nome, semana, athlete_id, coach_id) |
| 130 | Schema: `pr_workout_days` (1 row por dia da semana) |
| 131 | Schema: `pr_workout_exercises` (exercicio, séries, reps, RPE, descanso) |
| 132 | RLS: athlete vê próprios planos, coach vê planos dos seus atletas |
| 133 | Página `/pr/coach` — dashboard do PT (lista de atletas) |
| 134 | Página `/pr/coach/athlete/[id]` — perfil do atleta visto pelo PT |
| 135 | Editor de plano `/pr/coach/plan/[id]` — drag-and-drop semanal |
| 136 | Página `/pr/plan` — atleta vê plano da semana atual |
| 137 | Card de exercício do dia (com vídeo embed do Insta/YouTube opcional) |
| 138 | Check-in do treino: atleta marca "feito" + RPE percebido |
| 139 | Histórico do plano: comparar volume/intensidade semana a semana |
| 140 | Notificação push: "Hora do treino" às 17h (web push API) |
| 141 | Comentários: athlete e PT trocam mensagens em cada exercício |
| 142 | Convite: PT envia link de convite (token) → atleta vincula |
| 143 | Onboarding do atleta: anamnese inicial (lesões, objetivo, freq) |
| 144 | Página de descoberta: `/pr/coaches` — buscar PT por região/especialidade |
| 145 | Avaliação física inicial registrada (peso, %BF, medidas) |
| 146 | Gráfico de evolução: peso corporal × semanas |
| 147 | Plano "modelo": PT salva templates pra reusar |
| 148 | Cópia de plano de athlete pra outro (ajuste fino depois) |
| 149 | Limite gratuito: PT free → 3 atletas; pago → ilimitado |
| 150 | Gateway de pagamento (Mercado Pago/Stripe) — assinatura PT R$49/mês |
| 151 | Recibo + invoice automática no e-mail |

---

## FASE 3 (ciclos 152-176) — Planos de Dieta com Nutricionista

**Objetivo**: Nutris cadastram atletas, prescrevem dieta diária, atletas registram refeições.

| Ciclo | Item |
|-------|------|
| 152 | Schema: `pr_meal_plans` (header com macros target) |
| 153 | Schema: `pr_meals` (refeição: horário, label, kcal, macros) |
| 154 | Schema: `pr_meal_items` (alimento, quantidade, marca opcional) |
| 155 | Schema: `pr_food_db` (banco de alimentos com kcal/100g — TBCA + USDA) |
| 156 | Seed do food_db: 500 alimentos brasileiros mais comuns |
| 157 | RLS: athlete vê próprio plano, nutri vê dos seus atletas |
| 158 | Página `/pr/nutri` — dashboard do nutri |
| 159 | Editor `/pr/nutri/plan/[id]` — montar 6 refeições do dia |
| 160 | Calculadora automática: kcal/macros do plano completo |
| 161 | Página `/pr/diet` — atleta vê dieta do dia |
| 162 | Check-off: atleta marca refeição feita + foto opcional |
| 163 | Substituição: lista de "o que pode trocar" pré-cadastrado |
| 164 | Lista de compras: agregada da semana inteira |
| 165 | Anamnese: alergias, intolerâncias, restrições (vegano, low-carb) |
| 166 | Gráfico: aderência diária (% das refeições feitas) |
| 167 | Bioimpedância: log periódico de %BF, massa magra |
| 168 | Hidratação: tracker de copos d'água (meta diária) |
| 169 | Suplemento: cadastro de whey/creatina/multi (horário) |
| 170 | Foto progressiva: athlete envia foto frente/lado/costas semanal |
| 171 | Comparação visual: foto semana 1 vs semana atual |
| 172 | Convite nutri ↔ atleta (token like FASE 2) |
| 173 | Página de descoberta: `/pr/nutricionistas` |
| 174 | Limite gratuito: nutri free → 3 atletas; pago → ilimitado |
| 175 | Assinatura nutri R$49/mês (gateway já integrado FASE 2) |
| 176 | Combo PT+Nutri: athlete paga R$30 pra ambos os profissionais juntos |

---

## FASE 4 (ciclos 177-201) — Comunidade e Social

**Objetivo**: feed virar rede social do treino, sem virar Instagram.

| Ciclo | Item |
|-------|------|
| 177 | Sistema de **followers** (sem reciprocidade obrigatória) |
| 178 | Feed mostra apenas seguidos por padrão |
| 179 | Sugestões de "atletas pra seguir" baseado em box/cidade |
| 180 | Posts curtos: athlete escreve mini-update além do PR automático |
| 181 | Foto/vídeo no PR: upload (storage Supabase) limitado 30s |
| 182 | Reações expandidas: 👏 💪 🔥 💯 🙌 (+ emoji custom dos boxes) |
| 183 | Comentários em PR (limite 200 chars, sem markdown) |
| 184 | Notificações: "X reagiu ao seu PR" (in-app + push) |
| 185 | Mentions: @atleta no comentário linka pro perfil |
| 186 | Hashtags: #deadlift #natural #wodofthe day |
| 187 | Trending: top 10 PRs da semana com mais reações |
| 188 | Box page: `/pr/box/[handle]` — feed da comunidade do box |
| 189 | Vínculo athlete↔box: opt-in via convite do dono do box |
| 190 | Box leaderboard: top 10 dos alunos por exercício |
| 191 | Box challenges: desafio mensal criado pelo coach |
| 192 | Stories: PR vira story de 24h + recap automático "este mês foram 12 PRs" |
| 193 | Direct messages athlete↔athlete (1:1, sem grupos) |
| 194 | Grupos por modalidade: CrossFit, Powerlifting, LPO, Strongman |
| 195 | Eventos: campeonatos amadores cadastráveis com inscrição |
| 196 | Patrocinador do mês: brand sponsor visível no feed (ad respeitoso) |
| 197 | Anti-spam: rate limit 5 posts/hora, 30 reações/min |
| 198 | Block / Mute / Report (moderação básica) |
| 199 | Dashboard mod: prtrackerpro@gmail.com vê reports + ban |
| 200 | LGPD: pedido de exclusão da conta com export prévio dos dados |
| 201 | Termos de uso + política de privacidade revisados |

---

## FASE 5 (ciclos 202-226) — Gamificação e XP avançado

**Objetivo**: aprofundar o XP system pra dar engagement diário sem virar grindfest.

| Ciclo | Item |
|-------|------|
| 202 | Daily login streak (separado do PR streak) |
| 203 | Daily quest: "registre 1 PR hoje" (+50 XP) |
| 204 | Weekly quest: "treine 4 dias" (+200 XP) |
| 205 | Monthly quest: "PR em 3 movimentos diferentes" (+500 XP) |
| 206 | Level system: XP → level (curve), level mostra no nameTag |
| 207 | Title system: "Novato 🌱", "Intermediário 💪", "Avançado 🔥", "Elite 👑" |
| 208 | Badges: 100kg deadlift, 1× BW bench, 2× BW squat, 3× BW deadlift |
| 209 | Badge: "Streak King" 30 dias seguidos |
| 210 | Badge: "Comeback" 90 dias sem PR e voltou |
| 211 | Badge: "Mentor" — vinculou 3 atletas como PT |
| 212 | Achievements page `/pr/achievements` lista tudo |
| 213 | Leaderboard global: top 100 por XP total |
| 214 | Leaderboard: top 100 por categoria (CF/PL/LPO) |
| 215 | Leaderboard regional: top 50 da cidade |
| 216 | Leaderboard semanal: zera toda segunda |
| 217 | Trofeus permanentes: top 3 leaderboard semanal vira badge perma |
| 218 | Bonus XP: PR no aniversário (+100%) |
| 219 | Bonus XP: PR em feriado (+50%) |
| 220 | XP boost: vínculo com PT/nutri ativo (+10% XP em todo PR) |
| 221 | XP boost: completar plano da semana (+200 XP) |
| 222 | Anti-cheat: rate limit no XP (max 1 PR/movimento/24h) |
| 223 | Anti-cheat: peso suspeito (3× BW deadlift) flag pra revisão |
| 224 | Anti-cheat: vídeo opcional pra validar PR > tier "Avançado" |
| 225 | Penalty: PR removido = XP devolvido |
| 226 | Audit log: histórico de mudanças de XP visível pro athlete |

---

## FASE 6 (ciclos 227-251) — Ginásio Virtual: novos equipamentos

**Objetivo**: o gym virtual cresce com a marca. Cada nova linha do produto vira equipamento no gym.

| Ciclo | Item |
|-------|------|
| 227 | Builder: **Glute-Ham Developer** |
| 228 | Builder: **Reverse Hyper** |
| 229 | Builder: **Belt Squat** |
| 230 | Builder: **Sled Push** |
| 231 | Builder: **Yoke / Farmer Walk station** |
| 232 | Builder: **Strongman Atlas Stones** |
| 233 | Builder: **Sandbag Pile** |
| 234 | Builder: **Battle Rope** |
| 235 | Builder: **Climbing Rope** |
| 236 | Builder: **GHR / Nordic** |
| 237 | Builder: **Lying Leg Curl Machine** |
| 238 | Builder: **Hack Squat** |
| 239 | Builder: **Smith Machine** (com travas amarelas) |
| 240 | Builder: **Calf Raise Standing Machine** |
| 241 | Builder: **Trap Bar Hex** |
| 242 | Builder: **Specialty bars** (safety bar, Swiss bar) |
| 243 | Layout edit: drag/drop dos novos equipamentos no `/pr/gym/edit` |
| 244 | Layout: rotação dos equipamentos com Q/E (não só 90°) |
| 245 | Layout: undo/redo (Ctrl+Z) |
| 246 | Layout: snap-to-grid 0.5m |
| 247 | Layout: collision check (não sobrepor equipamentos) |
| 248 | Layout: presets ("Powerlifter", "CrossFitter", "Bodybuilder") |
| 249 | Layout: salvar 3 layouts diferentes e alternar |
| 250 | Layout: limite por XP (mais XP = mais equipamentos no gym) |
| 251 | Compartilhar layout: link público pra outros copiarem |

---

## FASE 7 (ciclos 252-276) — Sons e música

**Objetivo**: som ambiente curado pelo brand. Nada de music ©.

| Ciclo | Item |
|-------|------|
| 252 | Sound effect: barbell drop (sintetizado) |
| 253 | SFX: plate clank ao registrar PR |
| 254 | SFX: door creak ao trocar de sala |
| 255 | SFX: footstep no avatar (variação por superfície) |
| 256 | SFX: NPC laugh quando você passa perto |
| 257 | SFX: crowd cheer ao PR > tier Avançado |
| 258 | Música: 5 tracks lo-fi originais (loops 2min cada) — encomenda freelancer |
| 259 | Música: cross-fade entre tracks |
| 260 | Música: volume slider persistente (localStorage) |
| 261 | Música: mute total no settings |
| 262 | Música: track muda por hora do dia |
| 263 | Música: track especial em dia de PR |
| 264 | TV no gym: vídeo loop dos brand-asset reels |
| 265 | TV: rotação de 5 vídeos curados |
| 266 | TV: volume baixo, não compete com música |
| 267 | TV: clique aproxima câmera + dá close |
| 268 | Audio API: spatial audio (sons mais altos perto) |
| 269 | Audio: NPC fala (TTS sintetizado curto) |
| 270 | Audio: PT NPC dá dica do dia |
| 271 | Audio: nutri NPC dá receita |
| 272 | Audio: idle ambient hum mais rico |
| 273 | Audio: persistir last-volume entre sessões |
| 274 | Audio: pause ao tab inativa |
| 275 | Audio: webaudio analyser → bass thump faz LED stripe pulsar |
| 276 | Audio settings page: equalizer simples (3 bandas) |

---

## FASE 8 (ciclos 277-301) — Performance e Acessibilidade

**Objetivo**: 60fps em mobile mid-range; suporte WCAG AA.

| Ciclo | Item |
|-------|------|
| 277 | Lighthouse audit baseline (publicar score) |
| 278 | LCP optimization: preload do hero image |
| 279 | Three.js: instancing nas plates (reduz draw calls) |
| 280 | Three.js: LOD nos NPCs (high/low quality por distância) |
| 281 | Three.js: frustum culling manual nos itens distantes |
| 282 | Three.js: shadow map size adapta ao device |
| 283 | Three.js: pixelRatio cap em mobile (1.0 vs 1.5) |
| 284 | Three.js: dispose materials/geometries no unmount |
| 285 | React: lazy load do VirtualGym (só hidrata em viewport) |
| 286 | React: memoize trophy lists |
| 287 | React: virtualized lists em feed > 50 items |
| 288 | Astro: prerender páginas estáticas (sobre, contato) |
| 289 | Astro: image optimization plugin |
| 290 | Astro: critical CSS inline |
| 291 | Service worker: cache assets do gym |
| 292 | PWA: install prompt em mobile |
| 293 | PWA: offline fallback (last-cached gym) |
| 294 | A11y: alt em todas imagens |
| 295 | A11y: aria-label em todos botões icon-only |
| 296 | A11y: focus trap em modais |
| 297 | A11y: skip-link no header |
| 298 | A11y: prefers-reduced-motion respeitado |
| 299 | A11y: contraste AA em todos textos |
| 300 | A11y: navegação por teclado completa |
| 301 | i18n: pt-BR primário, EN como toggle (não auto-detect) |

---

## FASE 9 (ciclos 302-326) — E-commerce: rebuild Astro completo

**Objetivo**: substituir o WordPress atual por loja Astro estática + checkout próprio.

| Ciclo | Item |
|-------|------|
| 302 | Página `/produto/my-pr-set` Astro (substitui WP) |
| 303 | Página `/produto/deadlift-set` |
| 304 | Página `/produto/power-rack-set` |
| 305 | Página `/produto/bench-press-set` |
| 306 | Page-level: configurador "Monte sua barra" interativo |
| 307 | Estado do configurador: localStorage (carrinho persiste) |
| 308 | Resumo do pedido: lista de plates + total |
| 309 | Validação: max pares por anilha respeitado |
| 310 | Validação: stock real-time (admin marca falta) |
| 311 | Frete: calculado por CEP (API Correios/Melhor Envio) |
| 312 | Cupom: campo + validação contra `pr_coupons` table |
| 313 | Pix gateway: integrado MP/PagSeguro (5% OFF auto) |
| 314 | Cartão gateway: até 6× sem juros |
| 315 | Confirmação de pedido: e-mail automático Resend |
| 316 | Acompanhamento: página `/pedido/[id]` com status |
| 317 | Admin: dashboard de pedidos (`/admin/orders`) |
| 318 | Admin: marcação manual de "enviado" + tracking code |
| 319 | Notificação athlete: "Seu pedido foi enviado" |
| 320 | Reviews: athlete loga no site → pode review produto comprado |
| 321 | Photo review: upload da foto do troféu na estante real |
| 322 | Reviews em grid no produto |
| 323 | Camiseta: mesmo flow + escolha de tamanho |
| 324 | Anilhas avulsas: página dedicada com matriz de preços |
| 325 | Wishlist: athlete salva produto pra depois |
| 326 | Abandono de carrinho: e-mail 24h depois com cupom |

---

## FASE 10 (ciclos 327-351) — Admin e operação

**Objetivo**: ferramentas pra Felipe operar sozinho sem planilha.

| Ciclo | Item |
|-------|------|
| 327 | `/admin` dashboard geral (atletas ativos, PRs hoje, vendas) |
| 328 | `/admin/atletas` — busca + filtros |
| 329 | `/admin/coaches` — aprovação de novos PT/nutri |
| 330 | `/admin/orders` — kanban (Pago/Produção/Enviado/Entregue) |
| 331 | `/admin/inventory` — stock por SKU |
| 332 | `/admin/coupons` — gerar cupom + validade + max uses |
| 333 | `/admin/influencers` — lista de creators + comissões |
| 334 | `/admin/boxes` — boxes parceiros |
| 335 | Comissão calc: cron mensal calcula tier + valor a pagar |
| 336 | Export CSV das comissões |
| 337 | E-mail mensal automático: "Sua comissão foi de R$X" |
| 338 | `/admin/feed-mod` — moderação de posts/comments |
| 339 | `/admin/reports` — reports recebidos pra revisar |
| 340 | `/admin/audit` — log de ações admin |
| 341 | `/admin/refund` — emitir refund parcial/total |
| 342 | `/admin/comms` — broadcast push pra todos atletas |
| 343 | `/admin/integrations` — status MP/Resend/Bling |
| 344 | Bling sync: produtos + estoque sync diário |
| 345 | Mercado Livre integration polish (PR #45 já mergeada) |
| 346 | Google Merchant feed polish (PR #44 já mergeada) |
| 347 | Followup queue dashboard `/admin/followups` |
| 348 | NPS survey: dispara 30 dias pós-compra |
| 349 | NPS dashboard: gráfico de score |
| 350 | Postmortem: incidentes + RCA template |
| 351 | Dashboard pública (transparência): atletas totais, PRs totais |

---

## FASE 11 (ciclos 352-376) — Mobile-first refinements

**Objetivo**: se 80% do tráfego é mobile, mobile vira o caminho principal.

| Ciclo | Item |
|-------|------|
| 352 | Bottom nav: 4 tabs (Gym/Feed/Plan/Profile) |
| 353 | Bottom nav: badge de notificação |
| 354 | Pull-to-refresh em feed |
| 355 | Swipe entre posts |
| 356 | Gym joystick: bigger tap target |
| 357 | Gym: pinch zoom (mas não pan) |
| 358 | Gym: tap longo no NPC abre menu |
| 359 | Gym: rotate horizontal sugere fullscreen |
| 360 | Forms: input large + autocomplete agressivo |
| 361 | Date pickers nativos (não custom) |
| 362 | Câmera nativa: foto progressiva direto |
| 363 | Geolocalização: sugerir box/PT da cidade |
| 364 | Notificação push iOS/Android |
| 365 | Compartilhar nativo (Web Share API) |
| 366 | Haptics: vibração curta no PR (Vibration API) |
| 367 | Haptics: vibração diferente em PR vs outros |
| 368 | Apple Wallet: pass com cupom (raro mas premium) |
| 369 | Add to Home Screen: melhor manifest icons |
| 370 | Splash screen customizada |
| 371 | Status bar color match |
| 372 | Notch / safe-area inset respeitado |
| 373 | Dark mode permanente (já é dark, mas reforço) |
| 374 | Skeleton loaders em todas páginas async |
| 375 | Optimistic UI em todos forms |
| 376 | Offline indicator banner |

---

## FASE 12 (ciclos 377-401) — Conteúdo e SEO

**Objetivo**: prtracker.com.br ranqueia pra "PR halterofilismo", "miniatura crossfit".

| Ciclo | Item |
|-------|------|
| 377 | Blog `/blog` (Astro content collection) |
| 378 | 5 artigos seed: o que é PR, como bater PR, tabelas Olímpicas |
| 379 | Artigo: "ELO Wilks vs DOTS — qual usar" |
| 380 | Artigo: "Periodização para iniciantes" |
| 381 | Artigo: "Como o box pode ser parceiro" |
| 382 | Sitemap.xml dinâmico |
| 383 | robots.txt curado |
| 384 | OpenGraph image dinâmico (PR card pra cada PR público) |
| 385 | Structured data: Product schema |
| 386 | Structured data: Organization |
| 387 | Structured data: BreadcrumbList |
| 388 | Canonical URLs |
| 389 | hreflang pra futuro pt vs en |
| 390 | Page speed: Lighthouse > 90 em mobile |
| 391 | Hero copy A/B test |
| 392 | Landing dedicada: `/cl-creators` (creators com cupom) |
| 393 | Landing dedicada: `/box-parceiro` (apresentação pro box) |
| 394 | Landing: `/black-friday` (sazonal) |
| 395 | E-mail newsletter capture (Resend audience) |
| 396 | Welcome email sequence (5 emails) |
| 397 | Re-engagement email (atleta inativo 30d) |
| 398 | Birthday email com cupom |
| 399 | UTM tracking persistente (atribuição) |
| 400 | GA4 + Meta Pixel server-side |
| 401 | Conversion API funnel completo |

---

## FASE 13 (ciclos 402-426) — Integrações terceiros

**Objetivo**: athlete não precisa registrar PR 2x — puxa do Strava/Hevy/Strong.

| Ciclo | Item |
|-------|------|
| 402 | Hevy API exploration |
| 403 | Hevy OAuth flow |
| 404 | Hevy: importar PR histórico |
| 405 | Hevy: webhook real-time pra novos PRs |
| 406 | Strong app integration (similar) |
| 407 | Strava: import de runs (mas manter scope só strength) |
| 408 | MyFitnessPal: import refeições pro nutri plan |
| 409 | Apple Health bridge (peso corporal) |
| 410 | Google Fit bridge |
| 411 | Garmin connect (peso BC scale) |
| 412 | Polar Beat (HR durante treino) |
| 413 | Spotify: playlist do treino aparece no profile |
| 414 | YouTube: import de vídeo do PR |
| 415 | Instagram: cross-post automático opt-in |
| 416 | TikTok: cross-post automático opt-in |
| 417 | Discord bot: PR vira mensagem no server do box |
| 418 | Slack bot: feed corporativo pra empresas (b2b) |
| 419 | Bling: sync de produto + estoque (já existe — polish) |
| 420 | Tiny ERP: alternativa ao Bling |
| 421 | Resend: domínio próprio prtracker.com.br |
| 422 | Stripe: alternativa ao MP pra cartão |
| 423 | Pagar.me: 3a opção pagamento |
| 424 | Webhook pra desenvolvedores externos (futuro API) |
| 425 | Zapier: trigger "PR registrado" |
| 426 | Make.com: trigger paralelo |

---

## FASE 14 (ciclos 427-451) — IA e personalização

**Objetivo**: o app deixa de ser ferramenta passiva e vira coach assistente.

| Ciclo | Item |
|-------|------|
| 427 | Detect plateau: 30 dias sem PR num movimento → alerta |
| 428 | Sugestão: "vamos treinar dois acessórios pra destravar" |
| 429 | Análise volume semanal: visualizar progressão |
| 430 | Auto-deload: sugere semana leve a cada 4-6 |
| 431 | RPE prediction: baseado em histórico, prevê 1RM |
| 432 | Wilks/DOTS calculator embed |
| 433 | Sinclair, IPF GL — outras fórmulas |
| 434 | Comparação anônima com peer group (mesmo BW/sex) |
| 435 | Heatmap semanal: dia + horário do PR |
| 436 | Insight: "você bate mais PR aos domingos" |
| 437 | Insight: "depois de 7h de sono você performa melhor" |
| 438 | Imagem AI: mockup de troféu personalizado pré-compra |
| 439 | Coach AI (sandbox): perguntas comuns respondidas |
| 440 | Nutri AI (sandbox): troca de alimento por equivalente |
| 441 | Form analysis: athlete envia vídeo → AI analisa execução (ML model) |
| 442 | Voice journal: athlete fala como foi o treino |
| 443 | Mood tracking: emoji após treino |
| 444 | Sleep log: integra Apple Health + correlação com PR |
| 445 | Stress log + correlação |
| 446 | Periodization AI: monta block 12 semanas autonomamente |
| 447 | Recommendation: "tente este box parceiro perto de você" |
| 448 | Recommendation: athlete-similar baseado em padrões |
| 449 | Spam detection AI no comentário |
| 450 | Toxicity filter |
| 451 | Image safety scan no upload |

---

## FASE 15 (ciclos 452-476) — Eventos e competições

**Objetivo**: PR Tracker hospeda mini-competições — boxes usam pra friendly fights.

| Ciclo | Item |
|-------|------|
| 452 | Schema: `pr_events` (nome, data, modalidade, taxa) |
| 453 | Schema: `pr_event_categories` (open, masters, etc) |
| 454 | Schema: `pr_event_athletes` (inscrição) |
| 455 | Schema: `pr_event_workouts` (provas) |
| 456 | Schema: `pr_event_scores` (resultado por athlete por prova) |
| 457 | Página `/eventos` lista pública |
| 458 | Inscrição com pagamento |
| 459 | Confirmação por e-mail + ticket QR |
| 460 | Live leaderboard durante o evento |
| 461 | Score input pelo juiz/coach |
| 462 | Categorias: M/F × 5 faixas etárias × 3 níveis |
| 463 | Brackets pra 1x1 strongman |
| 464 | Cronômetro embarcado (worker timer) |
| 465 | Stream link Insta/Twitch embed |
| 466 | Foto pós-evento upload em batch |
| 467 | Resultados finais publicados em `/eventos/[id]/resultados` |
| 468 | Certificado PDF download |
| 469 | XP bonus pelos top 3 |
| 470 | Badge de evento permanente |
| 471 | Próximos eventos do mesmo box destacados |
| 472 | Histórico do athlete em eventos |
| 473 | Box organizador: dashboard de inscritos + recibo |
| 474 | Refund automático se evento cancelado |
| 475 | LGPD: foto consent opcional |
| 476 | Replay timer: pra invalidar reps duvidosas |

---

## FASE 16 (ciclos 477-501) — Documentação e polish final

**Objetivo**: app pronto pra escala. Code-base sustentável.

| Ciclo | Item |
|-------|------|
| 477 | README.md profissional |
| 478 | Arquitetura.md (Astro + Supabase + Three.js) |
| 479 | DB schema diagram (mermaid) |
| 480 | Onboarding dev: como rodar local |
| 481 | Convenções: branch / PR / commit |
| 482 | Testing strategy doc |
| 483 | Test infrastructure: Vitest setup |
| 484 | Unit tests: utils críticos (strength-score, etc) |
| 485 | Integration tests: API routes principais |
| 486 | E2E tests: Playwright (login, registrar PR, comprar) |
| 487 | CI: rodar testes em PR |
| 488 | CI: rodar build em PR |
| 489 | CI: lighthouse na PR |
| 490 | Storybook pros componentes React |
| 491 | Visual regression tests (Chromatic ou Percy) |
| 492 | Error tracking: Sentry integrado |
| 493 | Performance monitoring: Vercel Speed Insights |
| 494 | Logs centralizados: Logtail/Better Stack |
| 495 | Backup automático Supabase diário |
| 496 | Disaster recovery plan |
| 497 | Runbook: como restaurar de backup |
| 498 | Status page: status.prtracker.com.br |
| 499 | Public changelog: blog com novidades |
| 500 | **Lançamento oficial v1.0** — comunicado completo |
| 501 | Champagne 🥂 |

---

## Critérios de saída por ciclo

Cada ciclo só é marcado completo se:

1. ✅ TypeScript compila sem erro
2. ✅ `npm run build` passa
3. ✅ Não regrediu funcionalidade existente
4. ✅ Commit segue padrão `tipo(escopo): descrição`
5. ✅ PR mergeado em main com squash

## Critérios de saída do projeto (cycle 501)

1. App funcional ponta a ponta: registro PR, plano de treino, dieta, e-commerce
2. Lighthouse > 90 (mobile + desktop)
3. WCAG AA passa
4. Cobertura de testes > 60% nos paths críticos
5. Backups + monitoring operando
6. 1.000 atletas ativos mensais
7. 50 PTs cadastrados
8. 30 nutris cadastrados
9. 100 boxes parceiros
10. R$100k MRR somando produto + assinaturas

## Notas operacionais

- **Cadência**: aspirar a 2-3 ciclos/dia em períodos de foco. 500 ciclos = ~6 meses.
- **Priorização**: se aparecer um bug crítico, ele entra fora da ordem.
- **Refactor**: cada 50 ciclos, 1 ciclo dedicado a debt técnico.
- **Brand check**: a cada 25 ciclos, releitura do CLAUDE.md.
- **User feedback**: cada release pode reordenar fases — esse plano é sugestão.

---

*Documento criado em 2026-05-06. Sujeito a revisão.*
