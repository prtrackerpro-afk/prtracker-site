---
name: pr-tracker-3d-gym
description: Build and evolve the Virtual Gym (3D world) at /pr/gym in the PR Tracker app. Use when modifying the Three.js scene, the avatar, trophy rendering, TV/Reel screen, walking/orbit camera, or any /pr/gym/* page. Enforces stack constraints (Three.js cru, no R3F/Drei/Rapier) and brand palette (lime #D8FF2C + dark navy #01002A + IWF tier colors).
---

# PR Tracker — Virtual Gym 3D

The "World" inside the PR Tracker app — an interactive 3D gym where the athlete sees their PRs as physical trophies, watches PR Reels on a TV, and (eventually) walks an avatar around. Lives entirely under `/pr/gym` as a single React island that mounts a Three.js scene.

This skill captures the architecture, conventions, and roadmap. Read this BEFORE any change to `src/components/pr/VirtualGym.tsx` or `src/pages/pr/gym.astro`.

## Stack constraints (canonical — do not break)

- **Three.js 0.184 cru** — no React Three Fiber, no Drei, no Rapier, no cannon-es. Bundle cost matters; Astro hosts the app at `/pr/*` and the gym is one island. Pulling R3F (~50KB) is rejected until V4 (Capacitor wrap).
- **One React island** — the entire 3D world lives in a single `<VirtualGym client:only="react" />` mounted from `gym.astro`. Data flows via props (athlete name, accent color, trophies). No fetching inside the island.
- **No new physics lib** — character locomotion uses kinematic transforms (set `position` directly). For collision, use AABB checks against an authored navmesh of room rectangles.
- **No GLTF avatar in V1/V2** — start with primitive avatar (cylinders + spheres). GLTF/Ready Player Me lands in V2.5 with `GLTFLoader` + `AnimationMixer` from `three/examples/jsm/`.
- **Brand palette only**:
  - Background `#01002A`, walls `#0a0050`, floor `#040028`
  - Accent (per athlete): IWF tier color — `#9aa3b0` Iniciante / `#111111` Novato / `#43B02A` Intermediário / `#FFC72C` Avançado / `#0057B8` Elite / `#DA291C` Topo
  - Lime `#D8FF2C` is the universal accent (TV sweep, plaque highlight, fallback for athletes without body data)
  - **Never** orange `#ff5722` — not a brand color
- **Tipografia em canvas textures**: Archivo Black 900 para números/displays, Inter 700 para subtítulos. UPPERCASE sempre nos números.

## Architecture overview

```
src/
  pages/pr/
    gym.astro              # Server-rendered shell, fetches data, HUD overlay
  components/pr/
    VirtualGym.tsx         # Single React island, mounts Three.js scene
  lib/pr/
    gym/                   # NEW (V2): ECS + game systems lib
      world.ts             # World class: scene, camera, renderer lifecycle
      entities.ts          # Entity factory (avatar, trophy, npc)
      components.ts        # Component types (Position, Velocity, Trophy, Interactable)
      systems/
        input.ts           # Keyboard + virtual joystick → InputComponent
        movement.ts        # Apply velocity to position with collision
        animation.ts       # Avatar animation state machine
        camera.ts          # Third-person follow / orbit toggle
        interaction.ts     # Raycast pick → emit InteractionEvent
        render.ts          # Wraps renderer.render(scene, camera)
      ecs.ts               # Tiny ECS: World/Entity/Component/System primitives
```

**Why custom ECS instead of bitecs**: bitecs is ~12KB. For ~50 entities (1 avatar + ~30 trophies + few NPCs) the savings don't justify the dep. Hand-rolled ECS in <200 LOC keeps things explicit and inspectable.

## Roadmap (V1 → V4)

### V1 — Static room with trophies (CURRENT, partially broken)
**Goal**: Athlete loads `/pr/gym`, sees a low-poly room with their PRs as trophies on shelves, a TV on the right wall, an orbiting camera, and a stylized avatar.

Status: scaffold exists in `VirtualGym.tsx`. Bug: canvas renders empty in production (likely `aspect-ratio` + `h-full` interaction — child has no concrete height). Fix priority #1.

### V2 — Walking avatar + interactive trophies
- Replace orbit-only with **two camera modes**: third-person follow (default) + free orbit (toggle button).
- **Locomotion**: WASD on desktop, on-screen virtual joystick on mobile. Move avatar at ~2.5 units/s. Idle sway when stationary.
- **Click/tap a trophy** → modal opens with PR detail (exercise label, weight, date, link to celebrate page) + "Comprar troféu real" CTA → deep-link to BarbellConfigurator.
- **Collision**: avatar can't walk through walls or trophy pedestals. Simple AABB.
- **Phone-friendly**: 30 FPS target on mid-range Android. Cap pixel ratio at 1.5 on mobile, disable shadows below 60 FPS.

### V2.5 — Real avatar (GLTF + Mixamo)
- Swap primitive avatar for a Ready Player Me GLB (free tier, public CDN).
- Load Mixamo idle/walk/wave FBX → retarget at runtime.
- Use `THREE.AnimationMixer` for blend trees (idle ↔ walk based on velocity magnitude).

### V3 — TV with Reels + multiplayer visits
- **TV plays real PR Reels**: `THREE.VideoTexture` reading from `<video>` element fed by Supabase Storage URLs. Cycle through the athlete's last 5 PRs.
- **Multiplayer "visit a friend's gym"**: Supabase Realtime channel per gym, presence broadcasts position. Friend's avatar shown as ghost.
- **Quests overlay**: HUD shows active quest progress while in-gym.

### V4 — Native wrap + ads slots
- Capacitor wrap for App Store + Play Store. The gym island runs unchanged inside the WebView.
- **In-gym ad slots**: a billboard on the back wall renders a sponsor banner (texture from CDN). Filtered to brand-aligned sponsors only (Growth, Vitafor, Centauro). Premium tier hides ads.

## Code conventions

### Scene setup pattern
```ts
// Always: fixed pixel ratio cap, antialias on, alpha off (we control the bg).
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2));
renderer.setSize(width, height);
// Output color: sRGB so canvas textures look right
renderer.outputColorSpace = THREE.SRGBColorSpace;
```

### Canvas-to-texture for any text/number
**Never** use TextGeometry (heavy + ugly). Always use `CanvasTexture`:
```ts
const c = document.createElement("canvas"); c.width = 512; c.height = 256;
const ctx = c.getContext("2d")!;
ctx.fillStyle = "#01002A"; ctx.fillRect(0, 0, 512, 256);
ctx.fillStyle = accent;
ctx.font = "900 96px Archivo Black, Inter, sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText("PR TRACKER", 256, 128);
const tex = new THREE.CanvasTexture(c);
tex.colorSpace = THREE.SRGBColorSpace; // critical when outputColorSpace=sRGB
```

### Disposal on unmount (memory leaks are real)
The cleanup in the `useEffect` return must:
1. `cancelAnimationFrame(raf)`
2. `controls.dispose()` (OrbitControls)
3. `scene.traverse` → dispose every `geometry` and every `material`
4. `renderer.dispose()`
5. Remove the canvas DOM node

If you add new long-lived resources (textures, AnimationMixer, audio buffers), explicitly dispose them — `scene.traverse` only catches geometry+material.

### Layout pitfall (the V1 bug)
`<div ref={mountRef} className="w-full h-full">` inside an `aspect-ratio` parent does NOT compute a concrete height in all browsers. Use `position: absolute; inset: 0` on the mount or query `getBoundingClientRect()` inside `useEffect` and use that as the renderer size. Validate by logging `mount.clientHeight` on mount — if it's 0, this is the bug.

## Three.js + ECS reference

External skills cloned into `.claude/skills/threejs-ecs-ts/skills/` (Nice-Wolf-Studio plugin) cover:
- `threejs/scene-setup.md`, `instancing-advanced.md`, `animation-systems.md`, `model-loading.md`, `raycasting.md`, `performance-profiling.md`, `best-practices.md`
- `ecs/architecture.md`, `system-patterns.md`, `queries.md`, `events.md`
- `mobile/touch-input.md`, `memory-management.md`, `battery-optimization.md`
- `game-systems/input-system.md`, `collision-system.md`, `camera-system.md`, `level-system.md`

Read those when implementing the relevant V2/V2.5/V3 work.

**Do NOT** read the `react/` subfolder of that skill (R3F-specific) — we don't use R3F.

## Brand rules (CRITICAL — copied from Brand Bible)

- **Modalidades**: musculação, CrossFit, Powerlifting, Halterofilismo. Never corrida.
- **Produto físico**: barra inox usinada, anilhas plástico de alta densidade, base por produto. **Sem gravação** — never promise personalized engraving in the gym UX.
- **Tom**: premium / Nike-not-suplemento. UPPERCASE em números/displays mas sem clichê motivacional.
- **PT-BR primeiro**. EN-US é V4+.

## When NOT to use this skill

- Changes outside `/pr/gym` — use the relevant skill (`frontend-design` for 2D UI, etc.).
- 2D charts (Recharts is the answer, not Three.js).
- Adding 3D to other pages — discuss first; the cost of a second Three.js island compounds.
