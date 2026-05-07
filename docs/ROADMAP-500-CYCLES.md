# PR Tracker World — Roadmap 1350 ciclos

Plano detalhado de **1350 ciclos** de melhoria contínua. Reordenado em
**24 fases** priorizadas: primeiro a base visual do gym (equipamentos,
cenário, cinema, jogos lúdicos), depois features funcionais (avatar,
fliperama, macros, tutorial, PT/nutri), depois ops e lançamento.

Estamos em ciclo **102** (Fase 1 começando).

---

## Princípios

1. **Cada ciclo = 1 commit deployável.** Sem refactor sem feature.
2. **Realismo > complexidade.** Detalhe arquitetônico > novos sistemas.
3. **Funcional > decorativo.** App tem que servir como ferramenta de treino real.
4. **Brand-first.** Tudo passa pelo CLAUDE.md (força, conquista, premium).
5. **Cada feature nova precisa de RLS no Supabase.** Sem buracos de segurança.

---

## Mapa geral das 24 fases

| Fase | Ciclos | Tema | Total |
|------|--------|------|------:|
| 1 | 102-201 | Equipamentos proporcionais + acabamentos | 100 |
| 2 | 202-301 | Cenário (piso, paredes, iluminação) | 100 |
| 3 | 302-351 | Sala de cinema premium (projetor, fileiras) | 50 |
| 4 | 352-451 | Equipamentos funcionais (lúdico, sem XP) | 100 |
| 5 | 452-501 | Customização avatar (bonés, acessórios) | 50 |
| 6 | 502-601 | Macros / dieta diária do atleta | 100 |
| 7 | 602-701 | Tutorial onboarding completo | 100 |
| 8 | 702-1001 | Fliperama com 3 jogos online | 300 |
| 9 | 1002-1051 | Planos de treino com Personal | 50 |
| 10 | 1052-1101 | Planos de dieta com Nutri | 50 |
| 11 | 1102-1126 | Comunidade e social | 25 |
| 12 | 1127-1151 | XP avançado + leaderboards | 25 |
| 13 | 1152-1176 | Sons curados | 25 |
| 14 | 1177-1201 | Performance + acessibilidade | 25 |
| 15 | 1202-1226 | E-commerce rebuild Astro | 25 |
| 16 | 1227-1251 | Admin e operação | 25 |
| 17 | 1252-1276 | Mobile-first refinements | 25 |
| 18 | 1277-1301 | Conteúdo + SEO | 25 |
| 19 | 1302-1326 | Integrações terceiros | 25 |
| 20 | 1327-1351 | IA e personalização | 25 |
| 21 | 1352-1376 | Eventos e competições | 25 |
| 22 | 1377-1401 | Doc + testes + monitoring | 25 |
| 23 | 1402-1426 | Polish final + bugfix sweep | 25 |
| 24 | 1427-1451 | Lançamento v1.0 | 25 |

Total: **1350 ciclos**.

---

## FASE 1 (ciclos 102-201) — Equipamentos proporcionais + acabamentos

**Objetivo**: cada equipamento tem proporção correta vs o avatar (1.95m), materiais premium (chrome/steel/borracha distinguidos), parafusos visíveis, scuffs.

| Ciclo | Item |
|-------|------|
| 102 | Auditoria de proporções atuais (medir cada equipamento vs avatar 1.95m) → tabela |
| 103 | **Power Rack**: redimensionar pra 2.4m altura (vs avatar 1.95m), barras 2.2m largura |
| 104 | Power Rack: pinos J-cup com detalhes (parafuso central + presilha) |
| 105 | Power Rack: numbers/marcações de altura (canvas texture) |
| 106 | Power Rack: bumper plates 45cm diâmetro (era genérico) |
| 107 | Power Rack: chains/cabos opcionais pendurados |
| 108 | **Bench**: rebuild (1.2m comprimento, 0.45m altura sentado) |
| 109 | Bench: estofado vinil preto com costura visível (canvas) |
| 110 | Bench: pés de aço quadrados com soldas |
| 111 | Bench: rack auxiliar com 2 barras laterais |
| 112 | **Deadlift platform**: madeira clara central + borracha preta lateral |
| 113 | Deadlift: ranhuras visíveis na borracha (textura) |
| 114 | Deadlift: barra olímpica 2.2m × 28mm com knurling |
| 115 | Deadlift: spinning sleeves (collar internas + externas) |
| 116 | Plates: cor exata IWF (vermelho 25kg, azul 20kg, amarelo 15kg, verde 10kg) |
| 117 | Plates: hub central com 6 furos circulares (texture) |
| 118 | Plates: gravação "PR TRACKER" no centro (texture) |
| 119 | Plates: roughness diferenciada borracha vs metal |
| 120 | Plates: wear marks (uso) sutis |
| 121 | **Squat rack**: separado do power rack (versão minimalista) |
| 122 | **Cable Machine**: torre dual (high + low pulley) com cabos visíveis |
| 123 | Cable Machine: weight stack com pin selector |
| 124 | Cable Machine: handles dangling (D-handle, rope, bar) |
| 125 | **Treadmill**: belt textura preta com listras laterais lime |
| 126 | Treadmill: console com display canvas (km/h, time, dist) |
| 127 | Treadmill: handlebars laterais |
| 128 | **Assault Bike**: ventilador frontal com pás visíveis |
| 129 | Assault Bike: rotação animada do ventilador (idle slow) |
| 130 | Assault Bike: console com display |
| 131 | **Rowing Machine**: rail metálico longo + seat com rolamento |
| 132 | Rowing: handle com cabo retrátil + flywheel cage |
| 133 | Rowing: display Concept2-style |
| 134 | **Plyo Box**: 3 alturas (50/60/75cm) empilháveis |
| 135 | Plyo: textura madeira realista + borracha topo |
| 136 | **Kettlebell rack**: 5 KBs (8/12/16/20/24kg) com cores diferenciadas |
| 137 | KB: alça com pegada texturizada |
| 138 | **Dumbbell rack**: 10 pares (5kg-50kg) hex em ferro |
| 139 | DB: cabeças hex com knurling cinza fosco |
| 140 | **Medicine balls**: 4 cores empilhadas (4/6/8/10kg) |
| 141 | **Wall ball target**: alvo na parede + linha lime |
| 142 | **Pull-up bar**: rig com 3 estações multi-grip |
| 143 | Pull-up: anéis pendurados + corda escalada |
| 144 | **GHD machine**: completa com pads ajustáveis |
| 145 | **Reverse Hyper**: pads + carga lateral |
| 146 | **Belt squat machine**: belt + carga vertical |
| 147 | **Hack squat**: rampa inclinada + footplate |
| 148 | **Smith machine**: trilho duplo + travas amarelas |
| 149 | **Lat pulldown**: assento + thigh pad + bar reta |
| 150 | **Seated row**: footplate + handle V |
| 151 | **Leg press**: 45° com pads + carga |
| 152 | **Calf raise**: ombros + pad |
| 153 | Acabamento: parafusos visíveis (esfera pequena lime/preta) em pontos críticos |
| 154 | Acabamento: soldas (raised seam) nos pontos de junção |
| 155 | Acabamento: borracha textured nos pés (anti-slip) |
| 156 | Acabamento: stickers brand "PR TRACKER" sutis |
| 157 | Acabamento: cabos com tensão visível (catenária leve) |
| 158 | Material: chrome polido (metalness 0.95, roughness 0.1) |
| 159 | Material: steel fosco (metalness 0.7, roughness 0.4) |
| 160 | Material: borracha preta (metalness 0, roughness 0.85) |
| 161 | Material: madeira (mapa de cor + grain procedural) |
| 162 | Material: vinil estofamento (mapa de costura) |
| 163 | Pose padrão: barra carregada com plates default no rack |
| 164 | Pose padrão: dumbbell na mão do NPC powerlifter |
| 165 | Pose padrão: kettlebell pendurada da rack |
| 166 | Detalhe: chalk bucket (caixa branca com pó) |
| 167 | Detalhe: chalk dust no chão sob deadlift platform |
| 168 | Detalhe: garrafa d'água + shaker em alguns equipamentos |
| 169 | Detalhe: toalha pendurada no bench/rack |
| 170 | Detalhe: weight pin/clip 2.5/5/10kg dispersos no chão |
| 171 | Detalhe: belt de levantamento pendurado |
| 172 | Detalhe: straps + wraps sobre o rack |
| 173 | Detalhe: foam roller no canto |
| 174 | Detalhe: lacrosse ball + bandas elásticas |
| 175 | Detalhe: jump rope no chão enrolada |
| 176 | Hovering tooltip: hover no equipamento mostra nome + descrição |
| 177 | Click no equipamento: zoom-in suave da câmera |
| 178 | Glow sutil ao hover (outline lime fosco) |
| 179 | Sombras castShadow em todos os equipamentos |
| 180 | Sombras receiveShadow no chão sob equipamento |
| 181 | Reflexo do chão polido sob equipamentos premium (cubeMap reflection) |
| 182 | Animação idle: ventilador do assault bike girando |
| 183 | Animação idle: cable machine cabo balança levemente |
| 184 | Animação idle: rope rig oscilando |
| 185 | Animação idle: treadmill belt parado mas com leve refletindo luz |
| 186 | Animação idle: kettlebell handles gleam ocasional |
| 187 | Audit: todos os equipamentos check-list de proporção/material/detalhe |
| 188 | Audit: medidas vs spec real (Rogue, Eleiko, Concept2) |
| 189 | Audit: comparar lado-a-lado screenshots antes/depois |
| 190 | Audit: peer review (gerar lista pra Felipe revisar) |
| 191 | Refator: extrair `EQUIPMENT_SPECS` constants pra fonte única |
| 192 | Refator: shared materials (chrome/steel/etc) em `gym/materials.ts` |
| 193 | Refator: builder pattern padronizado (todos retornam Group + bbox) |
| 194 | Test: snapshot rendering (canvas hash) pra detectar regressão |
| 195 | Test: bbox automático verifica proporção vs avatar |
| 196 | Test: build profilling (warning se gym demora > 500ms) |
| 197 | Polish final: revisão dos top 5 mais usados (rack/bench/deadlift) |
| 198 | Polish: revisão dos cardio (treadmill/assault/rowing) |
| 199 | Polish: revisão dos auxiliares (cable/lat/leg press) |
| 200 | Polish: revisão dos detalhes (chalk/strap/towel) |
| 201 | Snapshot final + screenshot release notes |

---

## FASE 2 (ciclos 202-301) — Cenário (piso, paredes, iluminação)

**Objetivo**: ginásio parece um box premium, não vazio. Detalhes arquitetônicos, deco, branding sutil.

| Ciclo | Item |
|-------|------|
| 202 | Floor: 4 zonas com cores distintas (deadlift platform, bench, cardio, lifting) |
| 203 | Floor: linhas pintadas (lanes de track) entre zonas |
| 204 | Floor: tiles 1m de borracha (texture com sulcos diagonais) |
| 205 | Floor: heavy zone (lifting) tile preto + acent lime |
| 206 | Floor: cardio zone tile cinza (azulejo industrial) |
| 207 | Floor: chalk dust mais convincente (radial fade + speckle) |
| 208 | Floor: drain grates (parecem reais — placas finas com furos) |
| 209 | Floor: sticker "BOX 1" / "BOX 2" no chão |
| 210 | Floor: número de plataforma (1-6) gravado |
| 211 | Wall: muro frontal (back) sólido com acabamento concrete |
| 212 | Wall: tijolo aparente em uma seção (texture brick procedural) |
| 213 | Wall: corkboard com cards de PRs (texture) |
| 214 | Wall: whiteboard com WOD do dia (texture canvas) |
| 215 | Wall: TV grande (1.8m) — placeholder pra Reels |
| 216 | Wall: clock analógico estilo gym (3 pra cada parede) |
| 217 | Wall: poster de motivação (canvas) — copy do CLAUDE.md |
| 218 | Wall: poster banner sponsor sutil |
| 219 | Wall: spotlights direcionados |
| 220 | Wall: corner posts já existem (cycle 99) — agora com rivets |
| 221 | Wall: graffiti lime sutil "PR" no canto |
| 222 | Wall: cabos elétricos aparentes (industrial) |
| 223 | Wall: tomadas + interruptores (detalhe) |
| 224 | Wall: tubulação industrial expostas (railing) |
| 225 | Ceiling: vigas estruturais melhores (I-beam visível) |
| 226 | Ceiling: rope rigging visível |
| 227 | Ceiling: HVAC ductos ao fundo |
| 228 | Ceiling: bandeira do Brasil pequena pendurada |
| 229 | Ceiling: bandeiras dos atletas favoritos (CrossFit games etc) |
| 230 | Ceiling: net de basketball (joga medball alto) |
| 231 | Lighting: spot tracks já existem (cycle 67-68) — agora com cabos |
| 232 | Lighting: emergency exit signs (verdes) |
| 233 | Lighting: window strips altas (luz natural fake — emissive amarelo claro) |
| 234 | Lighting: time-of-day system (manhã/dia/noite) |
| 235 | Lighting: amber sunset preset |
| 236 | Lighting: harsh midday preset |
| 237 | Lighting: blue hour preset |
| 238 | Lighting: night mode + neons mais vivos |
| 239 | Reception/entrada: espaço simulado de entrada (counter + porta) |
| 240 | Reception: water cooler + copos descartáveis |
| 241 | Reception: prateleira de suplementos (vitrine simples) |
| 242 | Reception: poster preço dos kits (PR Tracker) |
| 243 | Reception: balcão com tablet pra check-in |
| 244 | Locker room: porta entrada visível (não exploramos) |
| 245 | Banheiro: porta indicativa (ícone) |
| 246 | Bandeira lime: faixas coloridas no teto pra dividir áreas |
| 247 | Tatame: zona de mobilidade com tatame azul |
| 248 | Mat de yoga enrolado num canto |
| 249 | Espelho na parede (reflexão simples) |
| 250 | Espelho: full-length 2m × 0.6m em 4 paredes |
| 251 | Quadro de PRs: top 10 atletas do box (texture) |
| 252 | Quadro de WOD: hoje + ontem (texture) |
| 253 | Quadro do mês: aniversariantes |
| 254 | Boombox de canto (mas sem som, só decoração) |
| 255 | Lousa magnética com programação semanal |
| 256 | Bandeira PR Tracker grande na parede |
| 257 | Bandeira do estado/cidade do atleta |
| 258 | Foto antiga preto e branco de levantamento |
| 259 | Quadro do "wall of fame" (espaço pros troféus) |
| 260 | Setas direcionais no chão (pra navegação) |
| 261 | Linha lime central (entrada-saída) |
| 262 | Eco / reverb sutil no áudio (suggest engineer feel) |
| 263 | Particle: chalk explosion ao registrar PR |
| 264 | Particle: dust sob movimento contínuo |
| 265 | Particle: sweat drop sobre o avatar (sutilíssimo) |
| 266 | Sky beyond: skylight com nuvens animadas |
| 267 | Outside view: silhuetas de prédios através das janelas |
| 268 | Outside view: árvores se mexendo |
| 269 | Outside view: pôr-do-sol time-of-day |
| 270 | Branding: logo "PR TRACKER" sutil em 3 pontos |
| 271 | Branding: hashtag #PRTracker na parede |
| 272 | Branding: telefone WhatsApp (51) 98206-1914 visível |
| 273 | Branding: site prtracker.com.br no quadro |
| 274 | Welcome message inicial: avatar entra → "Bem-vindo, [NOME]" |
| 275 | Welcome: pisca sinal lime no chão indicando próxima ação |
| 276 | Detalhe: insetos voando (sutil — partículas pequenas) ❌ remove se cute demais |
| 277 | Detalhe: leaf falling (vento sutil) |
| 278 | Detalhe: scuff na parede acima do bench (chalk handprint) |
| 279 | Detalhe: rasguinho num poster |
| 280 | Detalhe: marca de bota no chão (track) |
| 281 | NPC: 3-5 NPCs pelos cantos (já existe) — agora com 2 novos |
| 282 | NPC: receptionist no counter de entrada |
| 283 | NPC: cleaner com vassoura |
| 284 | NPC: photographer com câmera (sponsor day) |
| 285 | NPC: visitante observador na bancada |
| 286 | NPC: reagem a você — wave when passes |
| 287 | NPC: idle gestures (flexionar, alongar) |
| 288 | NPC: dialogue bubbles aleatórios (CrossFit lingo) |
| 289 | NPC: outfits diversos (CrossFit, powerlifting, casual) |
| 290 | NPC: walking paths definidos |
| 291 | Audio: ambient gym chatter (low) |
| 292 | Audio: barbell drop ocasional aleatório |
| 293 | Audio: door slam ocasional |
| 294 | Audio: water cooler bubbling |
| 295 | Audio: ventilador AC zumbindo |
| 296 | Audio: clock ticking (somente perto) |
| 297 | Audit: cenário coerente (nada surreal) |
| 298 | Audit: branding pelos pontos certos sem exagero |
| 299 | Audit: lighting natural em todas zonas |
| 300 | Polish: tudo coerente entre si — tested em mobile + desktop |
| 301 | Snapshot release notes da Fase 2 |

---

## FASE 3 (ciclos 302-351) — Sala de cinema premium

**Objetivo**: Hall of Fame ganha uma "sala VIP" anexa — o atleta entra, toca seus PRs em telão, com poltronas, projetor real.

| Ciclo | Item |
|-------|------|
| 302 | Layout: alocar sala 8m × 6m anexa ao gym (separada por porta) |
| 303 | Porta de entrada: dupla com vidro + LED lime |
| 304 | Porta: animação abrir/fechar quando atleta entra |
| 305 | Carpete vermelho desde a porta (red carpet) |
| 306 | Cordões VIP (2 postes + corda) na entrada |
| 307 | Sala interior: paredes pretas absorvendo luz |
| 308 | Carpete escuro com runner lime central |
| 309 | Tela grande: 4m × 2.25m (16:9) |
| 310 | Tela: borda metálica lime |
| 311 | Tela: superfície cinza claro (não pura branca) |
| 312 | Projector real no teto: caixa preta + lente saindo |
| 313 | Projetor: cone de luz (aditivo blending) projetado |
| 314 | Projetor: animação pulsing levemente |
| 315 | Projetor: emissive lime no LED frontal |
| 316 | Speaker towers: 2 caixas pretas grandes nas laterais da tela |
| 317 | Speaker: cone subwoofer visível |
| 318 | Sound bar pendurada acima da tela |
| 319 | Poltronas: 4 fileiras × 6 cada = 24 poltronas (inclinadas) |
| 320 | Poltronas: vinil preto + lime acent |
| 321 | Poltronas: copo holder lateral |
| 322 | Step-up: cada fileira mais alta (estádio) |
| 323 | Numeração das fileiras (A-D) |
| 324 | Letras das poltronas (1-6) |
| 325 | Iluminação: floor lights na lateral do corredor |
| 326 | Iluminação: spotlights amarelos na tela quando vazia |
| 327 | Iluminação: dim global quando "filme" toca |
| 328 | TV/screen content: rotação dos PRs do atleta (canvas video texture) |
| 329 | Conteúdo: "Hall of Fame Felipe Laier" intro 5s |
| 330 | Conteúdo: split-screen do PR vs anterior |
| 331 | Conteúdo: número grande do peso animado |
| 332 | Conteúdo: data + plates do PR |
| 333 | Conteúdo: clipe de "celebration" (canvas anim) |
| 334 | Conteúdo: rotação automática (PR × PR a cada 8s) |
| 335 | Sound effect: clap quando aparece PR |
| 336 | Sound effect: drum roll antes do peso revelar |
| 337 | Sound effect: cheer audience |
| 338 | Sound effect: projector hum baixo |
| 339 | Audio: música épica (loop curto orchestral free-license) |
| 340 | Audio: volume aumenta ao entrar na sala |
| 341 | Concession stand: quiosque de pipoca (decorativo) |
| 342 | Pipoca: caixa vermelha listrada |
| 343 | Bebida: cup com canudo |
| 344 | Cartaz na parede: poster "HALL OF FAME 2026" |
| 345 | Cartaz: posters dos exercícios principais |
| 346 | Trailer interativo: "Próximo PR: ?" |
| 347 | Easter egg: créditos finais com nome dos amigos do feed |
| 348 | Sair da sala: porta volta ao gym + lighting normaliza |
| 349 | Mobile: sala redesigned em vista vertical (stack) |
| 350 | Mobile: tela maior pra ler legenda |
| 351 | Polish + audit + snapshot |

---

## FASE 4 (ciclos 352-451) — Equipamentos funcionais lúdicos

**Objetivo**: atleta clica num equipamento e brinca de "treinar". Não conta XP, não vale PR. Pura diversão.

| Ciclo | Item |
|-------|------|
| 352 | UI overlay "Modo Brincadeira ON" canto superior |
| 353 | Disclaimer: "Isso não conta como treino real" |
| 354 | **Bench Press**: clique abre minigame |
| 355 | Bench: animação avatar deita no bench |
| 356 | Bench: barra surgindo nas mãos |
| 357 | Bench: clique = empurra a barra (rep) |
| 358 | Bench: contador de reps |
| 359 | Bench: peso ajustável 20-200kg slider |
| 360 | Bench: barra trava se peso muito alto pra rep |
| 361 | Bench: "set complete" + tap pra próximo set |
| 362 | Bench: somatório do volume da sessão |
| 363 | **Squat**: avatar agacha sob a barra |
| 364 | Squat: clique = squat down + up |
| 365 | Squat: animação fluida com elbow flex |
| 366 | Squat: depth check (parallel parallel) |
| 367 | Squat: form rating (good/ok/no rep) — randomizado |
| 368 | **Deadlift**: avatar puxa do chão |
| 369 | Deadlift: barra sobe até hip lock |
| 370 | Deadlift: drop animation realista |
| 371 | Deadlift: rep counter + max attempt |
| 372 | **Pull-up**: avatar pendura na barra |
| 373 | Pull-up: clique = sobe até o queixo |
| 374 | Pull-up: contador + grip variations (overhand/underhand) |
| 375 | **Push-up**: avatar plank |
| 376 | Push-up: clique pra rep |
| 377 | Push-up: variations (knee/regular/diamond) |
| 378 | **Burpee**: combinação push-up + jump |
| 379 | Burpee: animação completa fluida |
| 380 | **Box Jump**: avatar pula no plyo box |
| 381 | Box Jump: alturas progressivas (50/60/75) |
| 382 | **Wall Ball**: avatar pega medball + lança alvo |
| 383 | Wall Ball: trajetória física simples |
| 384 | Wall Ball: hit detection no alvo |
| 385 | **Kettlebell Swing**: avatar swing 2 mãos |
| 386 | KB: trajetória ascending até peito |
| 387 | KB: peso variável |
| 388 | **Snatch**: olympic lift completo |
| 389 | Snatch: posições (start, pull, catch, recover) |
| 390 | Snatch: form rating |
| 391 | **Clean & Jerk**: 2 movimentos consecutivos |
| 392 | C&J: timing crítico |
| 393 | **Treadmill**: clique + manter pra correr |
| 394 | Treadmill: belt rolling animado |
| 395 | Treadmill: speed slider |
| 396 | Treadmill: distance counter |
| 397 | Treadmill: avatar legs cycling |
| 398 | **Assault Bike**: clique + manter pra pedalar |
| 399 | Bike: ventilador acelera |
| 400 | Bike: calorias counter |
| 401 | Bike: avatar legs alternando |
| 402 | **Rowing**: pull animation |
| 403 | Rowing: meters counter + 500m split |
| 404 | Rowing: avatar reach + drive |
| 405 | **Battle rope**: avatar dual wave |
| 406 | Battle rope: ropes oscilando seno fluido |
| 407 | **Sled push**: avatar empurra sled pelo gym |
| 408 | Sled: weight visible no sled |
| 409 | **Climbing rope**: avatar sobe corda |
| 410 | Rope: hand-over-hand animation |
| 411 | **Sandbag carry**: avatar carrega 60kg |
| 412 | Sandbag: posições (zercher, shoulder, bear hug) |
| 413 | **Atlas stones**: avatar pick + place sobre platform |
| 414 | Atlas: stones de 3 pesos diferentes |
| 415 | **Farmer walk**: 2 dumbbells nas mãos |
| 416 | Farmer: avatar marcha pelo gym |
| 417 | Master controls: pausar/sair do brincadeira mode (ESC) |
| 418 | Master: stats da sessão (total reps, volume, calorias) |
| 419 | Master: salvar log opcional (mas marca "lúdico") |
| 420 | Animation: idle breathing entre reps |
| 421 | Animation: sweat drops após X reps |
| 422 | Animation: panting (heavy breathing) após sets |
| 423 | Sound: barbell click no rack |
| 424 | Sound: plates clank ao bater |
| 425 | Sound: grunt vocal masculino/feminino |
| 426 | Sound: foot stomp |
| 427 | Sound: rope swoosh |
| 428 | Camera: zoom-in suave no exercício |
| 429 | Camera: angle do exercício (deadlift = side view) |
| 430 | Camera: cinematic slow-mo no PR random |
| 431 | UI: barra de "fadiga" caricata sobe |
| 432 | UI: barra de fadiga muito alta = avatar cansado |
| 433 | UI: emoji reactions: 💪🔥💯 ao bom rep |
| 434 | UI: skull emoji ao falhar |
| 435 | Multiplayer hint: "amigos podem entrar" (futuro fase 8) |
| 436 | Easter egg: 100 reps consecutivas = badge "Maluco" |
| 437 | Easter egg: tentar 1000kg = animação pet golfinho |
| 438 | Difficulty: easy/normal/hard (timing window) |
| 439 | Difficulty: hard tem form rating mais rigoroso |
| 440 | Difficulty: avatar gira pra ângulo difícil |
| 441 | Mobile: tap longo = continuar rep auto |
| 442 | Mobile: gestos (swipe up = jump) |
| 443 | Mobile: haptic feedback em cada rep |
| 444 | Persistência: alta marca local (não no banco) |
| 445 | Persistência: high score por exercício salvo localStorage |
| 446 | Leaderboard local-only (não competição global) |
| 447 | Leaderboard: meu best rep counter por exercício |
| 448 | "Treinou 30 reps no joguinho!" toast |
| 449 | Tutorial pequeno na primeira vez |
| 450 | Polish + bug sweep + mobile test |
| 451 | Snapshot release notes Fase 4 |

---

## FASE 5 (ciclos 452-501) — Customização avatar

**Objetivo**: avatar deixa de ser "boneco genérico" e vira identidade visual.

| Ciclo | Item |
|-------|------|
| 452 | Schema `pr_avatar_prefs` + RLS (owner-only write, owner+friends read) |
| 453 | Endpoint `GET/PUT /api/pr/avatar` |
| 454 | Página `/pr/avatar` redesenhada com novas seções |
| 455 | Builder: **boné básico** (BasicCap) |
| 456 | Builder: boné backwards (BackwardsCap) |
| 457 | Builder: snapback flat brim |
| 458 | Builder: beanie (touca) |
| 459 | Builder: bandana |
| 460 | Builder: óculos aviator |
| 461 | Builder: óculos wayfarer |
| 462 | Builder: lifting glasses |
| 463 | Builder: sunglasses esportivos |
| 464 | Builder: wristband (sweatband simples) |
| 465 | Builder: wristband colorido (vermelho/azul/amarelo IWF) |
| 466 | Builder: cinto de levantamento (couro preto) |
| 467 | Builder: knee sleeves (par) |
| 468 | Builder: lifting shoes (talo wood + heel) |
| 469 | Builder: cross-training shoes (lime + branco) |
| 470 | Builder: barba curta |
| 471 | Builder: barba longa |
| 472 | Builder: bigode + cavanhaque |
| 473 | Builder: tatuagem faixa lime no bíceps |
| 474 | Builder: tatuagem peitoral PR Tracker logo |
| 475 | Builder: tatuagem full sleeve |
| 476 | Builder: ear plugs (nano) |
| 477 | Builder: lip ring (sutil) |
| 478 | Picker UI: live preview rotacionável (canvas mini React) |
| 479 | Picker UI: tabs (Cabeça/Tronco/Pernas/Acessórios) |
| 480 | Sistema unlocks: certos itens só liberados por XP/PRs |
| 481 | Item especial: boné PR Tracker (lime) — unlock 5 PRs |
| 482 | Cinto: unlock primeiro PR Deadlift > 1.5×BW |
| 483 | Wristband Olímpico: unlock por tier (vermelho 25kg → tier Avançado) |
| 484 | Camiseta: estampar exercício favorito (canvas dinâmico) |
| 485 | Short customizável (cor) |
| 486 | Tênis customizável (cor sola) |
| 487 | Idle: respiração (scale torso 0.99-1.01 a cada 2s) |
| 488 | Idle: piscar (face canvas alterna 1× a cada 4-6s) |
| 489 | Idle: weight shift sutil (rotation.z root ±0.02) |
| 490 | Render avatar no perfil `/pr/profile` (preview) |
| 491 | Render avatar na NavBar quando logado |
| 492 | Snapshot do avatar PNG (botão "compartilhar") |
| 493 | Compartilhar: gera card lime com avatar + último PR |
| 494 | Save state: indicator "salvando..." |
| 495 | Save state: erro retry |
| 496 | Edit history: undo last change |
| 497 | Reset to default button |
| 498 | Random preset button |
| 499 | Audit: a11y (keyboard nav nos pickers) |
| 500 | Polish + mobile test |
| 501 | Snapshot Fase 5 |

---

## FASE 6 (ciclos 502-601) — Macros / dieta diária

**Objetivo**: tracker de macros standalone (sem nutri obrigatório). Atleta loga refeição → vê macros do dia.

| Ciclo | Item |
|-------|------|
| 502 | Schema: `pr_food_db` (id, name, kcal/100g, protein, carbs, fat, fiber, brand) |
| 503 | Schema: `pr_meal_log` (athlete_id, datetime, food_id, qty_g, meal_type) |
| 504 | RLS: athlete owner-only |
| 505 | Seed food_db: 100 alimentos brasileiros básicos |
| 506 | Seed: arroz/feijão/carne/frango/peixe/ovo/leite/queijo/whey/batata-doce/aveia |
| 507 | Seed: 200 mais (frutas, verduras, lanches) |
| 508 | Seed: 200 mais (suplementos, fast food, padaria) |
| 509 | Endpoint `GET /api/food/search?q=arroz` |
| 510 | Endpoint `POST /api/meal/log` |
| 511 | Endpoint `GET /api/meal/today` |
| 512 | Endpoint `DELETE /api/meal/[id]` |
| 513 | Página `/pr/diet` (sem nutri obrigatório) |
| 514 | UI: 6 cards de refeição (café/lanche manhã/almoço/lanche tarde/jantar/ceia) |
| 515 | UI: cada card mostra macros + kcal acumulado |
| 516 | UI: "+ adicionar alimento" → modal autocomplete |
| 517 | UI: autocomplete instantâneo (debounce 200ms) |
| 518 | UI: input de quantidade (g) |
| 519 | UI: botão portion shortcut (1 colher = 15g, 1 xícara = 250ml) |
| 520 | UI: salvar = card atualiza |
| 521 | UI: macros do dia agregado (P/C/G/kcal) |
| 522 | UI: gráfico pie macros |
| 523 | UI: barra horizontal kcal vs target |
| 524 | UI: target customizável (manual ou via formula) |
| 525 | Calculadora: TDEE (Mifflin-St Jeor) |
| 526 | Calculadora: BMR + activity multiplier |
| 527 | Calculadora: bulk (+500 kcal), cut (-500 kcal), maintain |
| 528 | Macros split: padrão 30/40/30 ajustável |
| 529 | Salvar target em `pr_diet_targets` |
| 530 | UI: "Hoje 1850 / 2200 kcal" gauge |
| 531 | UI: notificação se ultrapassar target |
| 532 | UI: avg da semana |
| 533 | UI: histórico últimos 7 dias |
| 534 | UI: histórico últimos 30 dias |
| 535 | UI: search alimentos com filtro (vegano, lactose-free) |
| 536 | UI: favorites (estrelar alimentos comuns) |
| 537 | UI: refeições recentes (últimas 5 atalho) |
| 538 | UI: "duplicar refeição de ontem" |
| 539 | UI: copiar refeição inteira pra outro dia |
| 540 | UI: planejar refeição amanhã |
| 541 | Foto: upload da foto da refeição (Supabase Storage) |
| 542 | Foto: thumbnail no card |
| 543 | Foto: galeria de refeições do mês |
| 544 | Receita salvar: combinar 5 alimentos = nova receita |
| 545 | Receita: macros calculados auto |
| 546 | Receita: usar receita = adiciona todos ingredientes |
| 547 | Barcode scan (mobile camera) — busca por código |
| 548 | Barcode: integração com banco aberto |
| 549 | OCR: foto do rótulo extrai macros |
| 550 | Voice input: "comi 100g de arroz e 200g de frango" |
| 551 | Voice: transcribe + parse |
| 552 | Sugestões: baseado em meta + histórico |
| 553 | Sugestões: alimentos similares para variar |
| 554 | Hidratação: contador de copos d'água |
| 555 | Hidratação: meta diária |
| 556 | Hidratação: notificação a cada 2h |
| 557 | Suplementos: log de whey/creatina/multi |
| 558 | Suplementos: horário programado |
| 559 | Suplementos: notificação |
| 560 | Bioimpedância: log peso/%BF semanal |
| 561 | Gráfico: peso × tempo |
| 562 | Gráfico: %BF × tempo |
| 563 | Gráfico: massa magra × tempo |
| 564 | Gráfico: kcal vs peso (correlação) |
| 565 | Foto progressiva: frente/lado/costas |
| 566 | Foto progressiva: comparação semana 1 vs hoje |
| 567 | Mood log: emoji após refeição |
| 568 | Energy log: 1-10 após treino |
| 569 | Sleep log: horas dormidas |
| 570 | Stress log: 1-10 |
| 571 | Insights: "energia baixa quando carb < 200g" |
| 572 | Insights: "peso pico aos domingos" |
| 573 | Insights: "performance melhor com 8h sono" |
| 574 | Export CSV: tudo do mês |
| 575 | Export PDF: relatório semanal |
| 576 | Compartilhar nutri: gera link read-only |
| 577 | Lembrete: notificação push antes de cada refeição |
| 578 | Lembrete: ajustável por refeição |
| 579 | Lembrete: silencioso fim de semana opt |
| 580 | Streak: dias seguidos com 6 refeições |
| 581 | Streak: dias seguidos batendo target |
| 582 | Streak: badge "Disciplinado" 7/30/90 dias |
| 583 | Mobile: bottom sheet pra add rápido |
| 584 | Mobile: swipe pra deletar item |
| 585 | Mobile: hold pra editar quantidade |
| 586 | Mobile: 3D touch shortcut (futuro) |
| 587 | Imports MyFitnessPal CSV |
| 588 | Imports Tudo Gostoso receitas |
| 589 | Restrições: vegano, vegetariano, low-carb, keto |
| 590 | Restrições: filtro food_db automaticamente |
| 591 | Alergias: cadastrar (lactose, glúten, mariscos) |
| 592 | Alergias: alerta vermelho se food contém |
| 593 | Diabetic mode: contador glicídico |
| 594 | Indice glicêmico no food_db |
| 595 | Custom food: usuário cria entrada custom |
| 596 | Custom food: privado por padrão |
| 597 | Custom food: opt-in pra public (revisão admin) |
| 598 | Submit food: usuário sugere food faltante |
| 599 | Admin food review: aprovar/rejeitar |
| 600 | Polish + mobile test + a11y |
| 601 | Snapshot Fase 6 |

---

## FASE 7 (ciclos 602-701) — Tutorial onboarding

**Objetivo**: novo atleta entra → 5 minutos depois bateu seu primeiro PR + entendeu o gym.

| Ciclo | Item |
|-------|------|
| 602 | Schema: `pr_tutorial_progress` (athlete_id, step, completed_at) |
| 603 | RLS owner-only |
| 604 | Tutorial state machine (12 steps) |
| 605 | Step 1: Welcome modal "Olá [NOME]!" |
| 606 | Step 1: Brand intro 2 frases |
| 607 | Step 2: Avatar criação básica (skin/cabelo/cor) |
| 608 | Step 2: Save avatar |
| 609 | Step 3: Tour pelo gym (camera move automático) |
| 610 | Step 3: Highlight cada zona com legenda |
| 611 | Step 3: Pause em cada equipamento principal |
| 612 | Step 3: Skip option (botão "pular tour") |
| 613 | Step 4: Registro do primeiro PR |
| 614 | Step 4: Form pre-preenchido (deadlift sugestão) |
| 615 | Step 4: Submit → animação celebrate |
| 616 | Step 5: Hall of Fame visit (camera move pra Hall) |
| 617 | Step 5: Mostra trophy desbloqueado |
| 618 | Step 5: Explica plates split |
| 619 | Step 6: Skills section (menu → pull-ups, hand-stand) |
| 620 | Step 6: Logar primeiro skill |
| 621 | Step 7: Run section (5k/10k/half marathon) |
| 622 | Step 7: Logar primeira corrida |
| 623 | Step 8: Friends — adicionar 1 amigo (sugestão) |
| 624 | Step 8: Convite via WhatsApp/copia link |
| 625 | Step 9: Profile completo (BW, sexo, foto) |
| 626 | Step 9: Strength score calculado |
| 627 | Step 10: Streak system explicado |
| 628 | Step 10: Mostra como manter |
| 629 | Step 11: Personalização gym (rearrange) |
| 630 | Step 11: Drag um item |
| 631 | Step 12: Conclusão + celebra |
| 632 | Step 12: Próximos passos |
| 633 | Step 12: Link pra plano de treino opt-in |
| 634 | Tooltip system: hover em qualquer botão mostra dica primeira vez |
| 635 | Tooltip: dismiss permanente |
| 636 | Coach mark (arrow pulsing) sobre próxima ação |
| 637 | Progress bar tutorial (1/12, 2/12...) |
| 638 | Pause/resume tutorial (sair e voltar continua) |
| 639 | Restart tutorial: opção em settings |
| 640 | Skip individual: cada step pode ser pulado |
| 641 | Tutorial completion: badge "Iniciado" |
| 642 | Tutorial completion: XP boost 100 |
| 643 | Tutorial: voice over opcional (tts) |
| 644 | Tutorial: multilíngue pt/en (futuro) |
| 645 | Mini-tutorials por feature: |
| 646 | Mini: como ler tier de força |
| 647 | Mini: como funciona Gym Rats widget |
| 648 | Mini: o que é Wilks/DOTS |
| 649 | Mini: como compartilhar PR |
| 650 | Mini: como editar gym layout |
| 651 | Mini: como vincular PT |
| 652 | Mini: como vincular nutri |
| 653 | Mini: como usar tracker de macros |
| 654 | Mini: como entrar em evento |
| 655 | Mini: como participar fliperama (futuro F8) |
| 656 | Help center: página `/pr/help` |
| 657 | Help: FAQ |
| 658 | Help: vídeos curtos (loom embeds) |
| 659 | Help: contact form |
| 660 | Search no help (instant) |
| 661 | Search: top queries logadas pra melhorar conteúdo |
| 662 | Onboarding email sequence (5 emails) |
| 663 | Email 1: "Bem-vindo PR Tracker" |
| 664 | Email 2: "5 dicas pra primeiro PR" |
| 665 | Email 3: "Conheça o gym virtual" |
| 666 | Email 4: "Como vincular um PT" |
| 667 | Email 5: "Promoção primeira compra" |
| 668 | A/B test: tutorial completo vs skip option upfront |
| 669 | Analytics: dropout em cada step |
| 670 | Analytics: tempo médio em cada step |
| 671 | Improvements: top 3 steps com maior dropout |
| 672 | Gamification: tutorial vira "Quest 0" no quest system |
| 673 | NPC guide: "treinador" virtual NPC com diálogo |
| 674 | NPC guide: aparece nos primeiros 5 logins |
| 675 | NPC guide: 3-5 frases por step |
| 676 | NPC guide: skip ou continuar |
| 677 | Mobile: vertical layout step-by-step |
| 678 | Mobile: full-screen modal por step |
| 679 | Mobile: swipe pra próximo step |
| 680 | Desktop: side panel com checkpoint list |
| 681 | Desktop: split view (gym + instruction) |
| 682 | Replay tutorial completo (settings) |
| 683 | Skip everything (advanced user) com confirmação |
| 684 | Achievement: completou tutorial em < 10min |
| 685 | Achievement: completou tutorial sem skip |
| 686 | Tutorial pra PT (fase 9): como cadastrar atletas |
| 687 | Tutorial pra Nutri (fase 10): como criar plano |
| 688 | Tutorial pra Box (futuro): como gerenciar comunidade |
| 689 | Loading state: skeleton durante busca de assets |
| 690 | Error states: friendly messages com sugestão |
| 691 | Confirmation antes de finalizar tutorial |
| 692 | Quick actions menu: "o que fazer agora?" |
| 693 | Daily tip: 1 dica curta no topo do dashboard |
| 694 | Discovery prompts: "você sabia que pode X?" |
| 695 | Onboarding A/B variant: "rapid" 3-step |
| 696 | Onboarding A/B variant: "detalhado" 12-step |
| 697 | Decision: o que ganha conversão |
| 698 | Refinements baseado em data |
| 699 | Localização final: tudo em pt-BR |
| 700 | Polish + a11y + mobile test |
| 701 | Snapshot release Fase 7 |

---

## FASE 8 (ciclos 702-1001) — Fliperama com 3 jogos online competitivos

**Objetivo**: na sala do gym (ou anexa) tem fliperama. Atleta joga 3 jogos fitness-themed contra amigos em tempo real.

### Setup do fliperama (702-751)

| Ciclo | Item |
|-------|------|
| 702 | Layout: alocar área 6m × 4m no canto noroeste do gym |
| 703 | 3 cabines arcade lado-a-lado (1.8m altura cada) |
| 704 | Cabine: caixa neon (lime + magenta) |
| 705 | Cabine: tela CRT-look 60cm × 45cm |
| 706 | Cabine: control panel com joystick + 4 botões |
| 707 | Cabine: marquee no topo com nome do jogo |
| 708 | Cabine: coin slot (decorativo — gratuito) |
| 709 | Cabine: speakers laterais |
| 710 | Cabine: chão padrão xadrez preto/branco |
| 711 | Iluminação: neon ribbons no chão |
| 712 | Iluminação: track lights coloridas |
| 713 | Disco ball pendurada (rotacional sutil) |
| 714 | Carpete vermelho até a entrada do fliperama |
| 715 | Posters retro nas paredes (Donkey Kong, Pacman parodies) |
| 716 | Quadro de high scores (canvas dinâmico) |
| 717 | Música de fundo arcade (chiptune loop) |
| 718 | Sound effect: coin insert |
| 719 | Sound effect: button click |
| 720 | Sound effect: joystick clack |
| 721 | NPC: outro atleta jogando ao lado (idle anim) |
| 722 | NPC: shouts ao ganhar/perder |
| 723 | Schema: `pr_arcade_games` (id, name, top_score) |
| 724 | Schema: `pr_arcade_scores` (athlete_id, game_id, score, played_at) |
| 725 | Schema: `pr_arcade_matches` (id, game_id, players[], winner, ts) |
| 726 | RLS: scores read-public, write-owner |
| 727 | Endpoint `POST /api/arcade/score` |
| 728 | Endpoint `GET /api/arcade/leaderboard/:game` |
| 729 | Endpoint `GET /api/arcade/me/:game` |
| 730 | Realtime: Supabase Realtime channel `arcade:lobby` |
| 731 | Realtime: presence (quem está jogando) |
| 732 | Matchmaking: lobby simples (espera 2 jogadores) |
| 733 | Matchmaking: invitação direta a amigos |
| 734 | UI: lista de salas abertas |
| 735 | UI: botão "criar sala" |
| 736 | UI: spectator mode (assistir match) |
| 737 | UI: chat in-game (rapido emoji/texto) |
| 738 | Avatar: visível no fliperama enquanto joga |
| 739 | Avatar: posição "joga em pé" pose |
| 740 | Anti-cheat: scores assinados |
| 741 | Anti-cheat: rate limit |
| 742 | Anti-cheat: review manual de top scores |
| 743 | Reward: XP por jogar (não competitivo, só engagement) |
| 744 | Reward: trophy semanal arcade ganhador |
| 745 | Reward: badge "Arcade Master" |
| 746 | Mobile: fliperama vertical layout |
| 747 | Mobile: touch controls custom |
| 748 | Auth: anonymous mode (sem login pra spec) |
| 749 | Auth: jogar requer login |
| 750 | Spectate without login |
| 751 | Audit + polish |

### Jogo 1: BARBELL BOUNCE (752-851) — Endless runner com tema lifting

| Ciclo | Item |
|-------|------|
| 752 | Concept: avatar puxa um trenó pula obstáculos |
| 753 | Engine: Canvas 2D ou WebGL via Pixi |
| 754 | Cena: gym horizontal scrolling |
| 755 | Avatar: animação corrida/jump |
| 756 | Obstáculos: barras altas (precisa pular) |
| 757 | Obstáculos: barras baixas (precisa abaixar) |
| 758 | Obstáculos: weights jogadas (desviar) |
| 759 | Obstáculos: walls (precisa empurrar) |
| 760 | Power-ups: shake protein (+stamina) |
| 761 | Power-ups: PR sticker (×2 score por 5s) |
| 762 | Power-ups: chalk bag (slow time 3s) |
| 763 | Power-ups: belt (invincibility 5s) |
| 764 | Score: distância × velocidade |
| 765 | Score: combo bonus (3 obstáculos sem hit) |
| 766 | Vidas: 3 max, perde 1 por obstáculo errado |
| 767 | Aumento dificuldade: velocidade aumenta |
| 768 | Aumento: spawn rate increase |
| 769 | Sound: footstep cadencia |
| 770 | Sound: jump grunt |
| 771 | Sound: power-up jingle |
| 772 | Sound: game over horn |
| 773 | UI: HUD score canto superior |
| 774 | UI: HUD vidas (3 mini-corações) |
| 775 | UI: HUD power-up timer |
| 776 | Background: parallax 3 layers (back wall, mid equipment, foreground) |
| 777 | Background: NPCs torcendo |
| 778 | Background: fire particle system mobile |
| 779 | Multiplayer: split screen 2P |
| 780 | Multiplayer: race mode (quem sobrevive mais) |
| 781 | Multiplayer: handicap pra jogadores diferentes níveis |
| 782 | Online sync: posição via Supabase Realtime |
| 783 | Online sync: lag compensation simples |
| 784 | Lobby: convite amigo |
| 785 | Lobby: rematch button |
| 786 | Lobby: troca avatar entre matches |
| 787 | Replay: salvar replay top 10 (canvas record) |
| 788 | Visual: dia/noite cycle conforme tempo de jogo |
| 789 | Visual: weather random (chuva sutil = slippery) |
| 790 | Boss: Cada 30s aparece "boss" obstáculo (atlas stone gigante) |
| 791 | Boss: precisa fazer combo de jumps pra derrotar |
| 792 | Bonus level: powerlifting platform (deadlift heavy) |
| 793 | Endgame: "1km" mark = level up |
| 794 | Customization: skins do avatar usar prefs reais |
| 795 | Tutorial in-game: primeiros 30s mostra controles |
| 796 | Pause: ESC pausa |
| 797 | Settings: volume sfx/music |
| 798 | Settings: graphics low/high |
| 799 | High score table: top 10 |
| 800 | Daily challenge: target específico do dia |
| 801 | Weekly challenge: combinação de obstáculos |
| 802 | Achievement: "1km sem hit" |
| 803 | Achievement: "10 power-ups num run" |
| 804 | Achievement: "boss sem dano" |
| 805 | Polish gameplay: hitbox refinado |
| 806 | Polish: jump arc físico |
| 807 | Polish: animation easing |
| 808 | Polish: feedback visual em hit |
| 809 | Polish: screen shake intencional |
| 810 | Mobile: tap pra jump |
| 811 | Mobile: swipe down pra slide |
| 812 | Mobile: long press pra power-up |
| 813 | Mobile: vertical full screen |
| 814 | Performance: 60fps target mid-range |
| 815 | Performance: low mode 30fps fallback |
| 816 | Performance: asset preload |
| 817 | Bug bash session 1 |
| 818 | Bug bash session 2 |
| 819 | Bug bash session 3 |
| 820 | Beta test interno |
| 821 | Live ops: leaderboard mensal |
| 822 | Live ops: temporada 1 cosmetics |
| 823 | Crossover: usa equipment 3D do gym como obstáculo |
| 824 | Crossover: avatar real customizado |
| 825 | Crossover: trofeus reais visiveis no background |
| 826 | Loadtest: 100 partidas simultâneas |
| 827 | Loadtest: stress no realtime |
| 828 | Loadtest: db scaling |
| 829 | A/B: easy vs hard inicial |
| 830 | A/B: power-up frequência |
| 831 | A/B: gamemode default |
| 832 | Final balance pass |
| 833 | Mascot: barbell anim mascote do jogo |
| 834 | Soundtrack final: 3 tracks chiptune |
| 835 | Story mode opcional 5 niveis |
| 836 | Story: cutscene intro (canvas anim) |
| 837 | Story: 5 levels com bosses |
| 838 | Story: ending com créditos |
| 839 | Localização: pt/en strings |
| 840 | Acessibilidade: cor-blind palette |
| 841 | Acessibilidade: high contrast mode |
| 842 | Acessibilidade: screen reader basic |
| 843 | Marketing assets: GIF gameplay |
| 844 | Marketing: thumbnail PNG |
| 845 | Press release internal |
| 846 | Trailer 30s |
| 847 | Banner em-breve no fliperama |
| 848 | Launch event: 24h tournament |
| 849 | Launch leaderboard prizes |
| 850 | Post-launch monitoring |
| 851 | Snapshot do jogo 1 |

### Jogo 2: PROTEIN SHAKER MIXER (852-921) — Match-3 / puzzle

| Ciclo | Item |
|-------|------|
| 852 | Concept: misturar ingredients no shaker pra matar fome |
| 853 | Tabuleiro 8×8 grid de tiles |
| 854 | Tiles: whey, banana, peanut, oat, milk, ice, frog (jokes) |
| 855 | Mecânica match-3: alinha 3+ iguais |
| 856 | Combo: match-4 = bomba; match-5 = laser |
| 857 | Score: pontos por tile + combo |
| 858 | Time mode: 2 minutos |
| 859 | Move mode: 25 movimentos |
| 860 | Multiplayer modes: 1v1 turn-based |
| 861 | 1v1 simultâneo (cada um próprio tabuleiro) |
| 862 | Sabotage: combo enviado adversário (linha lixo) |
| 863 | Realtime sync: score continuo |
| 864 | Power-ups: hammer (destrói 1 tile) |
| 865 | Power-ups: shuffle |
| 866 | Power-ups: pause time 5s |
| 867 | Power-ups: peek next tiles |
| 868 | Visual: tiles realistas (whey scoop, banana real) |
| 869 | Visual: shaker no centro recebendo bebida |
| 870 | Visual: shaker enche progressivamente |
| 871 | Visual: shaker explodindo bonus |
| 872 | Sound: tile click |
| 873 | Sound: match swoosh |
| 874 | Sound: combo crescendo |
| 875 | Sound: bomba explosion |
| 876 | UI: timer ou move counter |
| 877 | UI: combo counter |
| 878 | UI: avatar do oponente |
| 879 | UI: chat quick |
| 880 | Lobby + matchmaking |
| 881 | Tutorial: 30s arrastar tile |
| 882 | Tutorial: matches especiais |
| 883 | Tutorial: power-ups |
| 884 | Achievements (10) |
| 885 | High scores |
| 886 | Daily challenge |
| 887 | Weekly tournament |
| 888 | Mobile: touch swipe |
| 889 | Mobile: haptic em match |
| 890 | Performance optimization |
| 891 | A11y: keyboard nav |
| 892 | A11y: cor-blind |
| 893 | A11y: high contrast |
| 894 | Bug bash 1-3 |
| 895 | Bug bash 1-3 cont. |
| 896 | Bug bash 1-3 cont. |
| 897 | Beta test |
| 898 | Polish animations |
| 899 | Polish particles |
| 900 | Polish music |
| 901 | Soundtrack 2 tracks |
| 902 | Cosmetics: skins do tabuleiro |
| 903 | Cosmetics: theme natal/halloween |
| 904 | Anti-cheat |
| 905 | Localização |
| 906 | Loadtest |
| 907 | Marketing GIF |
| 908 | Marketing thumb |
| 909 | Trailer 30s |
| 910 | Launch event |
| 911 | Crossover: avatar do gym aparece misturando |
| 912 | Reward: XP no app real |
| 913 | Reward: badge "Mestre Shaker" |
| 914 | Difficulty curve refinement |
| 915 | Power-up balance |
| 916 | A/B test gamemode default |
| 917 | A/B test tile colors |
| 918 | Final tweaks |
| 919 | Performance final |
| 920 | Documentation |
| 921 | Snapshot jogo 2 |

### Jogo 3: WOD SPRINT (922-1001) — Battle Royale fitness

| Ciclo | Item |
|-------|------|
| 922 | Concept: 8 jogadores, 3 minutos, completam exercises do WOD |
| 923 | Cada player tem painel próprio |
| 924 | WOD do dia escolhido aleatório (ou friend match) |
| 925 | Exercícios: burpees, squats, push-ups, KB swings, box jumps |
| 926 | Mecânica: tap rítmico no botão certo |
| 927 | Mecânica: timing perfect/good/missed |
| 928 | Score: reps × accuracy multiplier |
| 929 | HUD: lista de exercises e progresso |
| 930 | HUD: timer 3min countdown |
| 931 | HUD: posição em tempo real (1-8) |
| 932 | HUD: oponentes mini-avatares |
| 933 | Lobby: 8 spots |
| 934 | Lobby: ready check |
| 935 | Lobby: balance teams (matchmaking ELO) |
| 936 | Realtime: cada rep sincronizado |
| 937 | Realtime: 100 events/sec target |
| 938 | Server tick: 30Hz |
| 939 | Client prediction simples |
| 940 | Lag compensation |
| 941 | Top 3 ganham reward XP |
| 942 | Loser: feedback friendly |
| 943 | Spectator mode |
| 944 | Replay system |
| 945 | Visual: avatares 3D em mini-arena |
| 946 | Visual: exercise indicator (current rep) |
| 947 | Visual: form feedback (verde/amarelo/vermelho) |
| 948 | Sound: countdown 3-2-1 |
| 949 | Sound: rep counter clack |
| 950 | Sound: cheer crowd |
| 951 | Sound: announcer ("BURPEE TIME!") |
| 952 | Tutorial: 1 minuto solo prática |
| 953 | Tutorial: cada exercise mostrado |
| 954 | Tutorial: timing exemplo |
| 955 | Multiplayer modes: 2v2 |
| 956 | Multiplayer: 4v4 |
| 957 | Multiplayer: 8 free-for-all |
| 958 | Daily WOD: predefinido pra todos |
| 959 | Custom WOD: friend lobby pode escolher |
| 960 | Power-ups: timing slowdown |
| 961 | Power-ups: rep multiplier |
| 962 | Power-ups: confuse opponent |
| 963 | UI cooldowns |
| 964 | Achievements (15) |
| 965 | Leaderboards: daily, weekly, monthly |
| 966 | ELO ranking |
| 967 | Seasons: 1 mês cada |
| 968 | Season rewards: cosmetics |
| 969 | Cosmetics: avatar emote |
| 970 | Cosmetics: arena skin |
| 971 | Cosmetics: trail effect |
| 972 | Mobile: thumb-friendly tap zones |
| 973 | Mobile: portrait mode |
| 974 | Performance: GPU-friendly avatar count |
| 975 | Performance: 8 avatars otimizados |
| 976 | Performance: instancing |
| 977 | Performance: shadow off em 8-player |
| 978 | Bug bash 1-4 |
| 979 | Bug bash cont. |
| 980 | Bug bash cont. |
| 981 | Bug bash cont. |
| 982 | Beta test 50 players |
| 983 | Beta feedback iteration 1 |
| 984 | Beta feedback iteration 2 |
| 985 | Anti-cheat: rate limit reps |
| 986 | Anti-cheat: server validation |
| 987 | Anti-cheat: ban system |
| 988 | Loadtest: 1000 concurrents |
| 989 | Loadtest: realtime stress |
| 990 | Marketing assets |
| 991 | Trailer |
| 992 | Launch tournament 100 players |
| 993 | Prize: physical trophy mini |
| 994 | Press release |
| 995 | Localização pt/en |
| 996 | A11y final |
| 997 | Polish animations |
| 998 | Polish sound mix |
| 999 | Final balance |
| 1000 | Snapshot jogo 3 |
| 1001 | **MILESTONE: Fliperama complete** 🎮 |

---

## FASE 9 (ciclos 1002-1051) — Planos de treino com Personal

| Ciclo | Item |
|-------|------|
| 1002 | Schema `pr_coaches` (PT profile) |
| 1003 | Schema `pr_coach_athletes` (vínculo) |
| 1004 | Schema `pr_workout_plans` |
| 1005 | Schema `pr_workout_days` |
| 1006 | Schema `pr_workout_exercises` |
| 1007 | RLS policies |
| 1008 | `/pr/coach` dashboard |
| 1009 | `/pr/coach/athlete/[id]` |
| 1010 | Editor `/pr/coach/plan/[id]` drag-drop |
| 1011 | `/pr/plan` athlete view |
| 1012 | Card exercício do dia + vídeo embed |
| 1013 | Check-in: marca "feito" + RPE |
| 1014 | Histórico: volume/intensidade semana |
| 1015 | Notificação push "hora do treino" |
| 1016 | Comentários athlete↔PT |
| 1017 | Convite: token link |
| 1018 | Onboarding: anamnese inicial |
| 1019 | `/pr/coaches` discovery |
| 1020 | Avaliação física inicial |
| 1021 | Gráfico evolução BW × semanas |
| 1022 | Templates de plano (PT salva) |
| 1023 | Cópia de plano athlete↔athlete |
| 1024 | Limite gratuito: 3 atletas |
| 1025 | Pago ilimitado |
| 1026 | Gateway pagamento |
| 1027 | Recibo automático |
| 1028 | Email confirmação |
| 1029 | Calendário semanal visual |
| 1030 | Vídeo upload de execução |
| 1031 | PT review do video + feedback |
| 1032 | Workout timer in-app |
| 1033 | Rest timer entre séries |
| 1034 | Histórico exercício (PR previous) |
| 1035 | Sugestão peso baseado em últimas 4 semanas |
| 1036 | Auto-deload alert |
| 1037 | Plateau detection |
| 1038 | Periodização templates (linear, conjugate, etc) |
| 1039 | Block periodization editor |
| 1040 | Microcycle visualization |
| 1041 | Mobile-first: workout em tela única |
| 1042 | Tap pra check-in |
| 1043 | Voice note: athlete envia |
| 1044 | PT dashboard: alunos por status (ativo/atraso/concluído) |
| 1045 | Métricas PT: % aderência, NPS dos alunos |
| 1046 | Export plan PDF |
| 1047 | Print friendly |
| 1048 | Calendário Google sync (futuro) |
| 1049 | Polish + a11y |
| 1050 | Bug bash + mobile test |
| 1051 | Snapshot Fase 9 |

---

## FASE 10 (ciclos 1052-1101) — Planos de dieta com Nutri

| Ciclo | Item |
|-------|------|
| 1052 | Schema `pr_meal_plans` (header com macros target) |
| 1053 | Schema `pr_meals` (refeição) |
| 1054 | Schema `pr_meal_items` (alimento + qty) |
| 1055 | RLS policies |
| 1056 | `/pr/nutri` dashboard |
| 1057 | Editor `/pr/nutri/plan/[id]` 6 refeições |
| 1058 | Calc auto kcal/macros |
| 1059 | Athlete view: dieta do dia |
| 1060 | Check-off refeição feita |
| 1061 | Substituições pré-cadastradas |
| 1062 | Lista compras semanal |
| 1063 | Anamnese: alergias, restrições |
| 1064 | Aderência diária % |
| 1065 | Bioimpedância log |
| 1066 | Hidratação tracker |
| 1067 | Suplementos cadastro |
| 1068 | Foto progressiva |
| 1069 | Comparação semana 1 vs hoje |
| 1070 | Convite nutri↔atleta token |
| 1071 | `/pr/nutricionistas` discovery |
| 1072 | Limite gratuito 3 atletas |
| 1073 | Assinatura R$49/mês |
| 1074 | Combo PT+Nutri |
| 1075 | Receitas: nutri salva |
| 1076 | Receitas: athlete usa direto |
| 1077 | Foto rótulo OCR (futuro) |
| 1078 | Barcode scan |
| 1079 | Plano de 4 semanas com progressão |
| 1080 | Export PDF |
| 1081 | Print friendly |
| 1082 | Histórico ajustes do plano |
| 1083 | Comentários athlete↔nutri |
| 1084 | Voice note |
| 1085 | Nutri dashboard: NPS dos alunos |
| 1086 | Nutri dashboard: aderência dos alunos |
| 1087 | Suporte estilos: vegano, keto, low-carb, paleo |
| 1088 | Filtros food_db por estilo |
| 1089 | Receitas por estilo |
| 1090 | Suplementação avançada |
| 1091 | Pre-workout / post-workout meal |
| 1092 | Diabetes mode integration |
| 1093 | Reflux mode integration |
| 1094 | LGPD: pedido exclusão dados |
| 1095 | Backup mensal automático |
| 1096 | Mobile UI |
| 1097 | a11y |
| 1098 | Loadtest |
| 1099 | Bug bash |
| 1100 | Polish |
| 1101 | Snapshot Fase 10 |

---

## FASE 11 (ciclos 1102-1126) — Comunidade e social

| Ciclo | Item |
|-------|------|
| 1102 | Sistema followers (sem reciprocidade) |
| 1103 | Feed prioriza seguidos |
| 1104 | Sugestões "atletas pra seguir" |
| 1105 | Posts curtos (PR auto + opcional update) |
| 1106 | Foto/vídeo no PR (Storage 30s max) |
| 1107 | Reações expandidas (5 emojis) |
| 1108 | Comentários (200 chars) |
| 1109 | Notif push "X reagiu" |
| 1110 | Mentions @atleta |
| 1111 | Hashtags #deadlift |
| 1112 | Trending semana |
| 1113 | Box page `/pr/box/[handle]` |
| 1114 | Vínculo athlete↔box |
| 1115 | Box leaderboard |
| 1116 | Box challenges mensais |
| 1117 | Stories 24h |
| 1118 | DMs 1:1 |
| 1119 | Grupos modalidade |
| 1120 | Anti-spam rate limit |
| 1121 | Block/Mute/Report |
| 1122 | Mod dashboard |
| 1123 | LGPD exclusão |
| 1124 | Termos atualizados |
| 1125 | Polish |
| 1126 | Snapshot |

---

## FASE 12 (ciclos 1127-1151) — XP avançado

| Ciclo | Item |
|-------|------|
| 1127 | Daily login streak |
| 1128 | Daily quest |
| 1129 | Weekly quest |
| 1130 | Monthly quest |
| 1131 | Level system |
| 1132 | Title system (Novato/Inter/Avançado/Elite) |
| 1133 | Badges 100kg DL |
| 1134 | Badge Streak King |
| 1135 | Badge Comeback |
| 1136 | Badge Mentor |
| 1137 | `/pr/achievements` |
| 1138 | Leaderboard global |
| 1139 | Leaderboard categoria (CF/PL/LPO) |
| 1140 | Leaderboard regional |
| 1141 | Leaderboard semanal |
| 1142 | Trophy permanente top 3 |
| 1143 | Bonus aniversário |
| 1144 | Bonus feriado |
| 1145 | Boost vínculo PT |
| 1146 | Boost completo plano semana |
| 1147 | Anti-cheat XP rate |
| 1148 | Audit log XP |
| 1149 | Notification badges |
| 1150 | Polish |
| 1151 | Snapshot |

---

## FASE 13 (ciclos 1152-1176) — Sons curados

| Ciclo | Item |
|-------|------|
| 1152 | SFX barbell drop |
| 1153 | SFX plate clank |
| 1154 | SFX door creak |
| 1155 | SFX footstep |
| 1156 | SFX NPC laugh |
| 1157 | SFX crowd cheer |
| 1158 | 5 tracks lo-fi originais |
| 1159 | Cross-fade tracks |
| 1160 | Volume slider |
| 1161 | Mute total |
| 1162 | Track muda por hora |
| 1163 | Track especial PR day |
| 1164 | TV Reels content rotation |
| 1165 | TV volume control |
| 1166 | TV close-up |
| 1167 | Spatial audio |
| 1168 | NPC TTS short |
| 1169 | PT NPC dica do dia |
| 1170 | Nutri NPC receita |
| 1171 | Audio settings page |
| 1172 | Equalizer 3 bandas |
| 1173 | Persist last-volume |
| 1174 | Pause em tab inativa |
| 1175 | Polish |
| 1176 | Snapshot |

---

## FASE 14 (ciclos 1177-1201) — Performance + a11y

| Ciclo | Item |
|-------|------|
| 1177 | Lighthouse baseline |
| 1178 | LCP optimization |
| 1179 | Three.js instancing |
| 1180 | LOD NPCs |
| 1181 | Frustum culling |
| 1182 | Shadow map adaptativo |
| 1183 | Pixel ratio cap |
| 1184 | Material/geometry dispose |
| 1185 | React lazy load gym |
| 1186 | Memoization |
| 1187 | Virtualized lists |
| 1188 | Critical CSS |
| 1189 | Service worker |
| 1190 | PWA install |
| 1191 | Offline fallback |
| 1192 | A11y alt all images |
| 1193 | A11y aria-labels |
| 1194 | Focus trap modais |
| 1195 | Skip links |
| 1196 | prefers-reduced-motion |
| 1197 | Contraste AA |
| 1198 | Keyboard nav completa |
| 1199 | i18n setup |
| 1200 | Polish |
| 1201 | Snapshot |

---

## FASE 15 (ciclos 1202-1226) — E-commerce rebuild

| Ciclo | Item |
|-------|------|
| 1202 | `/produto/my-pr-set` Astro |
| 1203 | `/produto/deadlift-set` |
| 1204 | `/produto/power-rack-set` |
| 1205 | `/produto/bench-press-set` |
| 1206 | Configurador "Monte sua barra" |
| 1207 | Carrinho persiste localStorage |
| 1208 | Resumo do pedido |
| 1209 | Validação max plates |
| 1210 | Stock real-time |
| 1211 | Frete CEP |
| 1212 | Cupom + validação |
| 1213 | Pix gateway |
| 1214 | Cartão 6× sem juros |
| 1215 | Email confirmação |
| 1216 | `/pedido/[id]` tracking |
| 1217 | Reviews + photo |
| 1218 | Camiseta com tamanho |
| 1219 | Anilhas avulsas |
| 1220 | Wishlist |
| 1221 | Abandono carrinho email |
| 1222 | Imposto cálculo |
| 1223 | Frete Melhor Envio API |
| 1224 | Polish |
| 1225 | Loadtest |
| 1226 | Snapshot |

---

## FASE 16 (ciclos 1227-1251) — Admin e operação

| Ciclo | Item |
|-------|------|
| 1227 | `/admin` dashboard |
| 1228 | `/admin/atletas` |
| 1229 | `/admin/coaches` |
| 1230 | `/admin/orders` kanban |
| 1231 | `/admin/inventory` |
| 1232 | `/admin/coupons` |
| 1233 | `/admin/influencers` |
| 1234 | `/admin/boxes` |
| 1235 | Comissão calc cron |
| 1236 | Export CSV |
| 1237 | Email mensal comissão |
| 1238 | `/admin/feed-mod` |
| 1239 | `/admin/reports` |
| 1240 | `/admin/audit` |
| 1241 | `/admin/refund` |
| 1242 | `/admin/comms` broadcast |
| 1243 | `/admin/integrations` |
| 1244 | Bling sync polish |
| 1245 | Mercado Livre polish |
| 1246 | Google Merchant polish |
| 1247 | Followup queue |
| 1248 | NPS survey 30d |
| 1249 | NPS dashboard |
| 1250 | Postmortem template |
| 1251 | Snapshot |

---

## FASE 17 (ciclos 1252-1276) — Mobile-first

| Ciclo | Item |
|-------|------|
| 1252 | Bottom nav 4 tabs |
| 1253 | Bottom badge notif |
| 1254 | Pull-to-refresh feed |
| 1255 | Swipe entre posts |
| 1256 | Joystick bigger tap |
| 1257 | Pinch zoom gym |
| 1258 | Tap longo NPC menu |
| 1259 | Rotate horizontal sugere fullscreen |
| 1260 | Form inputs large |
| 1261 | Date pickers nativos |
| 1262 | Câmera nativa foto |
| 1263 | Geo: sugerir box/PT cidade |
| 1264 | Push notif iOS/Android |
| 1265 | Web Share API |
| 1266 | Vibration API |
| 1267 | Haptics PR |
| 1268 | Add Home Screen |
| 1269 | Splash screen |
| 1270 | Status bar color |
| 1271 | Notch safe-area |
| 1272 | Skeleton loaders |
| 1273 | Optimistic UI |
| 1274 | Offline indicator |
| 1275 | Polish |
| 1276 | Snapshot |

---

## FASE 18 (ciclos 1277-1301) — Conteúdo + SEO

| Ciclo | Item |
|-------|------|
| 1277 | Blog `/blog` |
| 1278 | 5 artigos seed |
| 1279 | Artigo Wilks vs DOTS |
| 1280 | Artigo Periodização iniciantes |
| 1281 | Artigo Box parceiro |
| 1282 | Sitemap.xml dinâmico |
| 1283 | robots.txt |
| 1284 | OG image dinâmico |
| 1285 | Schema Product |
| 1286 | Schema Organization |
| 1287 | Schema Breadcrumb |
| 1288 | Canonical URLs |
| 1289 | hreflang setup |
| 1290 | Lighthouse > 90 mobile |
| 1291 | Hero copy A/B |
| 1292 | Landing creators |
| 1293 | Landing box parceiro |
| 1294 | Landing black friday |
| 1295 | Email newsletter capture |
| 1296 | Welcome email seq |
| 1297 | Re-engagement email |
| 1298 | Birthday email |
| 1299 | UTM tracking |
| 1300 | GA4 + Pixel |
| 1301 | Snapshot |

---

## FASE 19 (ciclos 1302-1326) — Integrações terceiros

| Ciclo | Item |
|-------|------|
| 1302 | Hevy API explore |
| 1303 | Hevy OAuth |
| 1304 | Hevy import histórico |
| 1305 | Hevy webhook real-time |
| 1306 | Strong app integration |
| 1307 | Strava import runs |
| 1308 | MyFitnessPal import meals |
| 1309 | Apple Health bridge BW |
| 1310 | Google Fit bridge |
| 1311 | Garmin connect |
| 1312 | Polar Beat HR |
| 1313 | Spotify playlist profile |
| 1314 | YouTube import vídeo |
| 1315 | Instagram cross-post |
| 1316 | TikTok cross-post |
| 1317 | Discord bot box |
| 1318 | Slack bot b2b |
| 1319 | Bling sync polish |
| 1320 | Tiny ERP alt |
| 1321 | Resend domain próprio |
| 1322 | Stripe alt MP |
| 1323 | Pagar.me 3a opção |
| 1324 | Webhooks pra devs |
| 1325 | Zapier integration |
| 1326 | Snapshot |

---

## FASE 20 (ciclos 1327-1351) — IA e personalização

| Ciclo | Item |
|-------|------|
| 1327 | Plateau detection 30d |
| 1328 | Sugestão acessórios destravar |
| 1329 | Volume semanal análise |
| 1330 | Auto-deload alert |
| 1331 | RPE prediction 1RM |
| 1332 | Wilks/DOTS calc embed |
| 1333 | Sinclair, IPF GL |
| 1334 | Comparação peer group |
| 1335 | Heatmap semanal |
| 1336 | Insight "PR aos domingos" |
| 1337 | Insight "8h sono melhor" |
| 1338 | Imagem AI mockup troféu |
| 1339 | Coach AI sandbox |
| 1340 | Nutri AI sandbox |
| 1341 | Form analysis vídeo ML |
| 1342 | Voice journal |
| 1343 | Mood tracking |
| 1344 | Sleep correlação |
| 1345 | Stress correlação |
| 1346 | Periodização AI block |
| 1347 | Recommendation box |
| 1348 | Recommendation similar atleta |
| 1349 | Spam detection AI |
| 1350 | Toxicity filter |
| 1351 | Snapshot |

---

## FASE 21 (ciclos 1352-1376) — Eventos competições

| Ciclo | Item |
|-------|------|
| 1352 | Schema events |
| 1353 | Schema categories |
| 1354 | Schema athletes inscrição |
| 1355 | Schema workouts/provas |
| 1356 | Schema scores |
| 1357 | `/eventos` lista pública |
| 1358 | Inscrição pagamento |
| 1359 | Email + ticket QR |
| 1360 | Live leaderboard |
| 1361 | Score input juiz |
| 1362 | Categorias M/F × idade × nível |
| 1363 | Brackets 1x1 strongman |
| 1364 | Cronômetro embarcado |
| 1365 | Stream embed |
| 1366 | Foto pós-evento batch |
| 1367 | Resultados publicados |
| 1368 | Certificado PDF |
| 1369 | XP bonus top 3 |
| 1370 | Badge evento |
| 1371 | Próximos eventos box |
| 1372 | Histórico athlete |
| 1373 | Box organizador dashboard |
| 1374 | Refund automático cancel |
| 1375 | LGPD foto consent |
| 1376 | Snapshot |

---

## FASE 22 (ciclos 1377-1401) — Doc + testes + monitoring

| Ciclo | Item |
|-------|------|
| 1377 | README profissional |
| 1378 | Arquitetura.md |
| 1379 | DB schema mermaid |
| 1380 | Onboarding dev |
| 1381 | Convenções branch/PR/commit |
| 1382 | Testing strategy doc |
| 1383 | Vitest setup |
| 1384 | Unit tests utils |
| 1385 | API integration tests |
| 1386 | Playwright E2E |
| 1387 | CI tests PR |
| 1388 | CI build PR |
| 1389 | CI lighthouse PR |
| 1390 | Storybook setup |
| 1391 | Visual regression |
| 1392 | Sentry integrado |
| 1393 | Vercel Speed Insights |
| 1394 | Logs centralizados |
| 1395 | Backup automático Supabase |
| 1396 | DR plan |
| 1397 | Runbook |
| 1398 | Status page |
| 1399 | Public changelog |
| 1400 | Polish |
| 1401 | Snapshot |

---

## FASE 23 (ciclos 1402-1426) — Polish final + bugfix sweep

| Ciclo | Item |
|-------|------|
| 1402 | Bug bash session 1 (gym) |
| 1403 | Bug bash session 2 (avatar) |
| 1404 | Bug bash session 3 (PT) |
| 1405 | Bug bash session 4 (nutri) |
| 1406 | Bug bash session 5 (macros) |
| 1407 | Bug bash session 6 (tutorial) |
| 1408 | Bug bash session 7 (fliperama) |
| 1409 | Bug bash session 8 (e-commerce) |
| 1410 | Performance audit final |
| 1411 | Accessibility audit final |
| 1412 | Security audit (OWASP) |
| 1413 | RLS audit (todas tabelas) |
| 1414 | Penetration test interno |
| 1415 | Loadtest 10k concurrent |
| 1416 | Mobile devices test (iOS/Android) |
| 1417 | Browser matrix (Chrome/Safari/Firefox/Edge) |
| 1418 | Brand consistency review |
| 1419 | Copy review pt-BR |
| 1420 | Image asset optimization |
| 1421 | Final Lighthouse |
| 1422 | Final Web Vitals |
| 1423 | Pre-launch checklist |
| 1424 | Communication plan |
| 1425 | Rollback plan |
| 1426 | Snapshot |

---

## FASE 24 (ciclos 1427-1451) — Lançamento v1.0

| Ciclo | Item |
|-------|------|
| 1427 | Marketing landing pre-launch |
| 1428 | Email campaign opt-in |
| 1429 | Social media plan |
| 1430 | Influencer briefing |
| 1431 | Box partner briefing |
| 1432 | Press kit |
| 1433 | Trailer 60s |
| 1434 | Reels series 5 |
| 1435 | Stories 10 |
| 1436 | Beta program 100 atletas |
| 1437 | Beta feedback iteration 1 |
| 1438 | Beta feedback iteration 2 |
| 1439 | Public beta open |
| 1440 | Bug fixes urgentes |
| 1441 | Performance final tweaks |
| 1442 | Documentação pública |
| 1443 | Help center final |
| 1444 | Suporte chat ativo |
| 1445 | Launch day soft (segunda) |
| 1446 | Launch day hard (sexta) |
| 1447 | Launch event live (Insta) |
| 1448 | Press release |
| 1449 | Post-launch monitoring 72h |
| 1450 | Post-launch retrospective |
| 1451 | **🥂 PR Tracker World v1.0 LIVE** |

---

## Critérios de saída por ciclo

Cada ciclo só é marcado completo se:

1. ✅ TypeScript compila sem erro
2. ✅ `npm run build` passa
3. ✅ Não regrediu funcionalidade existente
4. ✅ Commit segue padrão `tipo(escopo): descrição`
5. ✅ PR mergeado em main com squash

## Critérios de saída do projeto (cycle 1451)

1. App funcional ponta a ponta: PR registro, plano treino, dieta, e-commerce, fliperama
2. Lighthouse > 90 (mobile + desktop)
3. WCAG AA passa
4. Cobertura testes > 60% paths críticos
5. Backups + monitoring operando
6. 5.000 atletas ativos mensais
7. 100 PTs cadastrados
8. 50 nutris cadastrados
9. 200 boxes parceiros
10. R$300k MRR (produto + assinaturas + arcade premium)

## Notas operacionais

- **Cadência**: 2-3 ciclos/dia em foco. 1350 ciclos = ~16-20 meses.
- **Priorização**: bug crítico fura ordem.
- **Refactor**: cada 50 ciclos, 1 dedicado a debt técnico.
- **Brand check**: cada 25 ciclos, releitura do CLAUDE.md.
- **User feedback**: cada release pode reordenar fases — esse plano é sugestão.

---

*Documento criado em 2026-05-06. Atualizado em 2026-05-07.*
*Total de 1350 ciclos planejados.*
