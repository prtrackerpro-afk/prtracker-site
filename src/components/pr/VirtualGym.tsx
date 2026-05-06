import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configuratorQuery } from "../../lib/pr/plates";
import { productSlugForExercise, type ExerciseId } from "../../lib/pr/exercises";
import { REELS, type Reel } from "../../lib/pr/gym/reels";

// V3 of the virtual gym. Sala virou academia de verdade: power rack
// loaded with barbell, plataforma de levantamento, banco de supino,
// rack de halteres e um projetor suspenso. Avatar anda (joystick +
// WASD), câmera segue, troféus + tela do projetor são clicáveis.
//
// Three.js cru per canonical (no R3F/Drei). A ilha React possui a
// cena, input (joystick DOM + keyboard) e dois modais (troféu + Reel).
// Refs-for-mutables impedem o useEffect pesado de re-tear-down quando
// o React state muda.

export interface GymTrophy {
  /** Tier color hex. */
  color: string;
  /** Weight kg, displayed in the label and detail modal. */
  weightKg: number;
  /** Short exercise name (3-4 chars) shown on the pedestal. */
  shortLabel: string;
  /** Used to deep-link the BarbellConfigurator on the detail modal CTA. */
  exerciseId: ExerciseId;
  /** Full exercise name for the modal title. */
  exerciseLabel: string;
}

interface Props {
  athleteName: string;
  accent: string;
  trophies: GymTrophy[];
}

export default function VirtualGym({ athleteName, accent, trophies }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<GymTrophy | null>(null);
  const [reelOpen, setReelOpen] = useState(false);
  const [activeReel, setActiveReel] = useState<Reel | null>(null);
  const [mode, setMode] = useState<"follow" | "orbit">("follow");
  // Tutorial: mostra overlay na primeira visita. localStorage persiste
  // entre sessões. SSR-safe (lazy init checa typeof window).
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return !localStorage.getItem("pr_gym_tutorial_seen");
    } catch {
      return false;
    }
  });
  const modeRef = useRef<"follow" | "orbit">("follow");
  modeRef.current = mode;
  // Refs sincronizados pro loop de animação ler sem refazer a cena.
  const activeReelRef = useRef<Reel | null>(null);
  activeReelRef.current = activeReel;
  const inputLockedRef = useRef(false);
  inputLockedRef.current = selected !== null || reelOpen || showTutorial;

  function dismissTutorial() {
    setShowTutorial(false);
    try {
      localStorage.setItem("pr_gym_tutorial_seen", "1");
    } catch {
      // localStorage indisponível (private mode etc) — ignora
    }
  }

  useEffect(() => {
    const mountMaybe = mountRef.current;
    if (!mountMaybe) return;
    const mount: HTMLDivElement = mountMaybe;

    // === Scene + renderer ===========================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#01002A");
    scene.fog = new THREE.Fog("#01002A", 14, 30);

    const rect0 = mount.getBoundingClientRect();
    const initW = Math.max(1, mount.clientWidth || rect0.width || 800);
    const initH = Math.max(1, mount.clientHeight || rect0.height || 480);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(initW, initH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, initW / initH, 0.1, 100);
    camera.position.set(0, 4.5, 6);
    camera.lookAt(0, 1.5, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.6, 0);
    controls.minDistance = 4;
    controls.maxDistance = 14;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.enablePan = false;
    controls.enabled = false; // start in follow mode; toggle button flips this

    // === Lighting ===================================================
    const hemi = new THREE.HemisphereLight(0x6f7cff, 0x0a0028, 0.7);
    scene.add(hemi);

    const accentColor = new THREE.Color(accent);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(5, 9, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    scene.add(keyLight);

    const trophyLight = new THREE.PointLight(accentColor, 2.2, 14);
    trophyLight.position.set(0, 4.2, -3.5);
    scene.add(trophyLight);

    const avatarLight = new THREE.PointLight(accentColor, 1.4, 8);
    avatarLight.position.set(0, 3.0, 1.5);
    scene.add(avatarLight);

    // === Room =======================================================
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1660, roughness: 0.85, metalness: 0.05 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0a3a, roughness: 0.9, metalness: 0.15 });

    const ROOM_W = 12;
    const ROOM_D = 12;
    const WALL_H = 5;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(ROOM_W, 12, accentColor, accentColor);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    grid.position.y = 0.002;
    scene.add(grid);

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, WALL_H), wallMat);
    backWall.position.set(0, WALL_H / 2, -ROOM_D / 2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), wallMat);
    leftWall.position.set(-ROOM_W / 2, WALL_H / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), wallMat);
    rightWall.position.set(ROOM_W / 2, WALL_H / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    const trimGeom = new THREE.BoxGeometry(ROOM_W, 0.05, 0.05);
    const trimMat = new THREE.MeshBasicMaterial({ color: accentColor });
    const trim = new THREE.Mesh(trimGeom, trimMat);
    trim.position.set(0, WALL_H - 0.3, -ROOM_D / 2 + 0.03);
    scene.add(trim);

    // Brand plaque on back wall
    const plaqueCanvas = document.createElement("canvas");
    plaqueCanvas.width = 1024;
    plaqueCanvas.height = 256;
    const pctx = plaqueCanvas.getContext("2d")!;
    pctx.fillStyle = "#01002A";
    pctx.fillRect(0, 0, 1024, 256);
    pctx.fillStyle = accent;
    pctx.font = "900 96px Archivo Black, Inter, sans-serif";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText("PR TRACKER", 512, 80);
    pctx.fillStyle = "#ffffff";
    pctx.font = "700 64px Inter, sans-serif";
    pctx.fillText(athleteName.toUpperCase(), 512, 180);
    const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: false })
    );
    plaque.position.set(0, 4.0, -ROOM_D / 2 + 0.05);
    scene.add(plaque);

    // === Shelves with trophies =====================================
    const SHELF_LEVELS = [3.0, 2.2, 1.4];
    const PER_SHELF = 4;
    const visibleTrophies = trophies.slice(0, SHELF_LEVELS.length * PER_SHELF);

    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1e1b50, roughness: 0.7, metalness: 0.2 });
    const trophiesGroup = new THREE.Group();
    scene.add(trophiesGroup);

    SHELF_LEVELS.forEach((y, shelfIdx) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.6), shelfMat);
      shelf.position.set(0, y, -ROOM_D / 2 + 0.32);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      scene.add(shelf);

      const slotTrophies = visibleTrophies.slice(shelfIdx * PER_SHELF, (shelfIdx + 1) * PER_SHELF);
      slotTrophies.forEach((t, i) => {
        const x = -2.4 + i * 1.6;
        const trophy = buildTrophy(t.color, t.weightKg, t.shortLabel);
        trophy.position.set(x, y + 0.08, -ROOM_D / 2 + 0.34);
        // Tag every descendant so raycasting any sub-mesh resolves to the trophy.
        trophy.userData.trophy = t;
        trophy.traverse((c) => {
          c.userData.trophy = t;
        });
        trophiesGroup.add(trophy);
      });
    });

    // === Projector + tela grande na parede direita =================
    // Cinema-style: tela GRANDE na parede + projetor preso ao teto
    // com cone de luz iluminando a tela. Tela é clicável (raycast)
    // pra abrir o modal de seleção de Reels.
    const projectorGroup = new THREE.Group();
    scene.add(projectorGroup);

    // Tela grande (4.8m × 2.7m em proporção 16:9 cinematográfica)
    const screenW = 4.8;
    const screenH = 2.7;
    const screenY = 2.6;
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1280;
    screenCanvas.height = 720;
    const sctx = screenCanvas.getContext("2d")!;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;

    // Frame escuro ao redor da tela
    const screenFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, screenH + 0.18, screenW + 0.18),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.3, metalness: 0.4 })
    );
    screenFrame.position.set(ROOM_W / 2 - 0.04, screenY, 0);
    projectorGroup.add(screenFrame);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW, screenH),
      new THREE.MeshBasicMaterial({ map: screenTex })
    );
    screen.position.set(ROOM_W / 2 - 0.005, screenY, 0);
    screen.rotation.y = -Math.PI / 2;
    screen.userData.kind = "projector-screen";
    projectorGroup.add(screen);

    // Projetor pendurado do "teto" (cubo preto + lente lime)
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.25, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.4, metalness: 0.5 })
    );
    projBody.position.set(0.2, WALL_H - 0.4, 0);
    projBody.castShadow = true;
    projectorGroup.add(projBody);

    const projLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.6,
        roughness: 0.2,
      })
    );
    projLens.rotation.z = Math.PI / 2;
    projLens.position.set(0.5, WALL_H - 0.4, 0);
    projectorGroup.add(projLens);

    // Cabo do projetor pro teto (cilindro fino vertical)
    const projCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x1e1b50 })
    );
    projCable.position.set(0.2, WALL_H - 0.05, 0);
    projectorGroup.add(projCable);

    // Cone de luz do projetor → tela (semitransparente)
    const lightCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, ROOM_W / 2 - 0.5, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.04,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lightCone.rotation.z = -Math.PI / 2;
    lightCone.position.set(ROOM_W / 4 + 0.5, WALL_H - 0.4 - 0.2, 0);
    projectorGroup.add(lightCone);

    function drawScreen(t: number, currentReel: Reel | null) {
      const ctx = sctx;
      const w = 1280;
      const h = 720;
      // Fundo cinema (gradiente vertical sutil)
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#01002A");
      grad.addColorStop(1, "#0a0050");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Sweep lime animado
      const sx = ((t * 0.18) % 1) * w;
      const lg = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      lg.addColorStop(0, "rgba(216,255,44,0)");
      lg.addColorStop(0.5, "rgba(216,255,44,0.12)");
      lg.addColorStop(1, "rgba(216,255,44,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      if (currentReel) {
        // "Reproduzindo" — mostra título e barra de progresso fake
        ctx.fillStyle = accent;
        ctx.font = "900 92px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(currentReel.title.toUpperCase(), w / 2, h / 2 - 60);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 28px Inter, sans-serif";
        ctx.fillText(currentReel.subtitle, w / 2, h / 2 + 8);

        // Pulse "▶ TOCANDO" no canto
        const pulse = (Math.sin(t * 3) + 1) / 2;
        ctx.fillStyle = `rgba(216,255,44,${0.5 + pulse * 0.5})`;
        ctx.font = "900 22px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("▶ NO PROJETOR", 40, h - 56);

        // Barra de progresso fake
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(40, h - 32, w - 80, 4);
        const prog = ((t * 0.05) % 1) * (w - 80);
        ctx.fillStyle = accent;
        ctx.fillRect(40, h - 32, prog, 4);
      } else {
        // Idle — invitação a clicar
        ctx.fillStyle = accent;
        ctx.font = "900 96px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PR REELS", w / 2, h / 2 - 36);
        ctx.fillStyle = "#fff";
        ctx.font = "700 32px Inter, sans-serif";
        ctx.fillText("Clica na tela para escolher", w / 2, h / 2 + 38);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 22px Inter, sans-serif";
        ctx.fillText(`${REELS.length} disponíveis`, w / 2, h / 2 + 88);
      }

      screenTex.needsUpdate = true;
    }

    // === Equipment de academia =====================================
    // Power rack canto traseiro-esquerdo, com barbell carregada na altura
    // do supino. Visual centerpiece da sala.
    const powerRack = buildPowerRack(accent);
    powerRack.position.set(-ROOM_W / 2 + 1.6, 0, -ROOM_D / 2 + 1.8);
    powerRack.rotation.y = Math.PI / 12;
    scene.add(powerRack);

    // Plataforma de levantamento — centro da sala, sob o avatar
    const platform = buildPlatform(accent);
    platform.position.set(-2, 0, 0);
    scene.add(platform);

    // Banco de supino — entre o power rack e a plataforma
    const bench = buildBench();
    bench.position.set(-3.5, 0, -2);
    bench.rotation.y = Math.PI / 6;
    scene.add(bench);

    // Rack de halteres encostado na parede esquerda
    const dumbbellRack = buildDumbbellRack();
    dumbbellRack.position.set(-ROOM_W / 2 + 0.4, 0, 2.5);
    dumbbellRack.rotation.y = Math.PI / 2;
    scene.add(dumbbellRack);

    // Banner motivacional na parede esquerda acima do rack
    const banner = buildBanner(accent);
    banner.position.set(-ROOM_W / 2 + 0.04, 3.5, 2.5);
    banner.rotation.y = Math.PI / 2;
    scene.add(banner);

    // Marcações lime no chão delimitando "lift zone" sob a plataforma
    const liftZone = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.05, 64),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.35 })
    );
    liftZone.rotation.x = -Math.PI / 2;
    liftZone.position.set(-2, 0.005, 0);
    scene.add(liftZone);

    // Kettlebells em fileira no lado direito (densidade visual)
    const kettlebellRow = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const kb = buildKettlebell(0.16 + (i % 3) * 0.02);
      kb.position.set(ROOM_W / 2 - 1.2, 0, -2.5 + i * 0.85);
      kettlebellRow.add(kb);
    }
    scene.add(kettlebellRow);

    // 2 plyo boxes empilhados perto da parede direita
    const plyo1 = buildPlyoBox(0.5);
    plyo1.position.set(ROOM_W / 2 - 2.2, 0, 3.6);
    scene.add(plyo1);
    const plyo2 = buildPlyoBox(0.4);
    plyo2.position.set(ROOM_W / 2 - 2.6, 0.5, 3.6);
    plyo2.rotation.y = Math.PI / 14;
    scene.add(plyo2);

    // Chalk bowl (detalhe pequeno num pedestal próximo à plataforma)
    const chalkBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.7, 16),
      STEEL_MAT
    );
    chalkBase.position.set(0.5, 0.35, -2.5);
    chalkBase.castShadow = true;
    scene.add(chalkBase);
    const chalkBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.95 })
    );
    chalkBowl.position.set(0.5, 0.73, -2.5);
    scene.add(chalkBowl);

    // === Avatar =====================================================
    const avatar = buildAvatar(accent);
    avatar.position.set(0, 0, 1.5);
    scene.add(avatar);

    // === Input — keyboard ==========================================
    const keys = { up: false, down: false, left: false, right: false };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") keys.up = true;
      else if (k === "s" || e.key === "ArrowDown") keys.down = true;
      else if (k === "a" || e.key === "ArrowLeft") keys.left = true;
      else if (k === "d" || e.key === "ArrowRight") keys.right = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") keys.up = false;
      else if (k === "s" || e.key === "ArrowDown") keys.down = false;
      else if (k === "a" || e.key === "ArrowLeft") keys.left = false;
      else if (k === "d" || e.key === "ArrowRight") keys.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // === Input — virtual joystick (touch + mouse) ==================
    let jx = 0;
    let jy = 0;
    const joy = joystickRef.current;
    const knob = knobRef.current;
    const JOY_RADIUS = 36;
    let joyActive = false;
    let joyCx = 0;
    let joyCy = 0;
    let joyPointerId: number | null = null;

    const onJoyDown = (e: PointerEvent) => {
      if (!joy) return;
      joyActive = true;
      joyPointerId = e.pointerId;
      const r = joy.getBoundingClientRect();
      joyCx = r.left + r.width / 2;
      joyCy = r.top + r.height / 2;
      try {
        joy.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture can fail on some browsers; safe to ignore
      }
      e.preventDefault();
    };
    const onJoyMove = (e: PointerEvent) => {
      if (!joyActive) return;
      let dx = e.clientX - joyCx;
      let dy = e.clientY - joyCy;
      const dist = Math.hypot(dx, dy);
      if (dist > JOY_RADIUS) {
        dx = (dx / dist) * JOY_RADIUS;
        dy = (dy / dist) * JOY_RADIUS;
      }
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
      jx = dx / JOY_RADIUS;
      jy = dy / JOY_RADIUS;
    };
    const onJoyUp = (e: PointerEvent) => {
      if (!joyActive) return;
      joyActive = false;
      if (knob) knob.style.transform = "";
      jx = 0;
      jy = 0;
      if (joy && joyPointerId !== null) {
        try {
          joy.releasePointerCapture(joyPointerId);
        } catch {
          // ignore
        }
      }
      joyPointerId = null;
    };
    if (joy) {
      joy.addEventListener("pointerdown", onJoyDown);
      joy.addEventListener("pointermove", onJoyMove);
      joy.addEventListener("pointerup", onJoyUp);
      joy.addEventListener("pointercancel", onJoyUp);
    }

    // === Raycast click on trophies =================================
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onCanvasDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onCanvasUp = (ev: PointerEvent) => {
      // Treat as click only if pointer didn't move much (avoid orbit-drag).
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      // Raycast em troféus + tela do projetor. Tela tem prioridade
      // por ser maior e mais central — ordenar por distância.
      const targets: THREE.Object3D[] = [trophiesGroup, screen];
      const hits = raycaster.intersectObjects(targets, true);
      const first = hits[0];
      if (first) {
        let obj: THREE.Object3D | null = first.object;
        while (obj && !obj.userData.trophy && obj.userData.kind !== "projector-screen") {
          obj = obj.parent;
        }
        if (obj?.userData.trophy) {
          setSelected(obj.userData.trophy as GymTrophy);
        } else if (obj?.userData.kind === "projector-screen") {
          setReelOpen(true);
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onCanvasDown);
    renderer.domElement.addEventListener("pointerup", onCanvasUp);

    // === Render loop ================================================
    const ROOM_HALF_W = ROOM_W / 2 - 0.6;
    const ROOM_HALF_D = ROOM_D / 2 - 0.6;
    const SHELF_BLOCK_Z = -ROOM_D / 2 + 0.7; // avatar can't walk into shelves
    const SPEED = 2.8;
    const followOffset = new THREE.Vector3(0, 4.5, 6);
    const tmpV = new THREE.Vector3();
    let raf = 0;
    const startT = performance.now();
    let lastT = startT;

    function loop(now: number) {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const t = (now - startT) / 1000;

      // Combined input: keyboard maps to forward(-z)/right(+x), joystick same convention.
      // Joystick's y is screen-down-positive — we invert so up on joystick = forward in world.
      // Quando algum modal está aberto (troféu, Reel) o input é zerado pra
      // evitar avatar andando atrás do modal.
      const inputLocked = inputLockedRef.current;
      let ix = inputLocked ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + jx;
      let iz = inputLocked ? 0 : (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + jy;
      const mag = Math.hypot(ix, iz);
      if (mag > 1) {
        ix /= mag;
        iz /= mag;
      }
      const moving = mag > 0.05;

      if (moving) {
        avatar.position.x = clamp(avatar.position.x + ix * SPEED * dt, -ROOM_HALF_W, ROOM_HALF_W);
        avatar.position.z = clamp(avatar.position.z + iz * SPEED * dt, SHELF_BLOCK_Z, ROOM_HALF_D);
        // Face direction (yaw)
        const targetAngle = Math.atan2(ix, iz);
        avatar.rotation.y = lerpAngle(avatar.rotation.y, targetAngle, 0.2);
        // Bob slower while walking
        avatar.position.y = Math.abs(Math.sin(t * 8)) * 0.06;
      } else {
        // Idle bob
        avatar.position.y = Math.sin(t * 1.6) * 0.04;
      }

      // Camera mode
      const followNow = modeRef.current === "follow";
      controls.enabled = !followNow;
      if (followNow) {
        tmpV.copy(avatar.position).add(followOffset);
        camera.position.lerp(tmpV, 0.08);
        const target = tmpV.copy(avatar.position);
        target.y = 1.6;
        controls.target.lerp(target, 0.12);
        camera.lookAt(controls.target);
      } else {
        controls.update();
      }

      drawScreen(t, activeReelRef.current);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // === Resize =====================================================
    function onResize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    requestAnimationFrame(onResize);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onCanvasDown);
      renderer.domElement.removeEventListener("pointerup", onCanvasUp);
      if (joy) {
        joy.removeEventListener("pointerdown", onJoyDown);
        joy.removeEventListener("pointermove", onJoyMove);
        joy.removeEventListener("pointerup", onJoyUp);
        joy.removeEventListener("pointercancel", onJoyUp);
      }
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat) {
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [athleteName, accent, trophies]);

  // === Modal CTA — deep-link to BarbellConfigurator ================
  const buyHref = selected
    ? `/${productSlugForExercise(selected.exerciseId)}?${configuratorQuery(
        selected.weightKg,
        selected.exerciseId,
        "pr-gym"
      )}`
    : "#";

  // IMPORTANT: usamos `position: absolute` via inline style em cada nó
  // top-level e retornamos um Fragment (não um wrapper). O <astro-island>
  // que envolve a ilha tem display inconsistente entre browsers — em iOS
  // Safari um wrapper `w-full h-full` chegou a ficar 0×0, escondendo
  // tudo. Posicionamento absolute escapa do astro-island e ancora direto
  // no container `relative` do gym.astro. Sem backdrop-blur (iOS quirk).
  return (
    <>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* Camera mode toggle — top-right of the gym */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "follow" ? "orbit" : "follow"))}
        style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
        className="text-[10px] uppercase tracking-widest font-display rounded-full border border-white/30 bg-navy-900/80 text-white px-3 py-1.5 hover:border-brand-lime hover:text-brand-lime transition"
        aria-label="Trocar modo de câmera"
      >
        {mode === "follow" ? "📷 Seguir" : "🔄 Girar"}
      </button>

      {/* Reels button (top-right, abaixo do toggle de câmera) — atalho
          quando o user não quer andar até a tela. */}
      <button
        type="button"
        onClick={() => setReelOpen(true)}
        style={{ position: "absolute", top: 50, right: 12, zIndex: 10 }}
        className="text-[10px] uppercase tracking-widest font-display rounded-full border border-brand-lime/60 bg-brand-lime/10 text-brand-lime px-3 py-1.5 hover:bg-brand-lime/20 transition"
        aria-label="Abrir Reels"
      >
        🎬 Reels
      </button>

      {/* Virtual joystick — bottom-left, always visible. Pointer events
          work for touch + mouse; on desktop the user can also use WASD. */}
      <div
        ref={joystickRef}
        style={{ position: "absolute", bottom: 16, left: 16, zIndex: 10, touchAction: "none" }}
        className="w-24 h-24 rounded-full border-2 border-white/30 bg-navy-900/60 select-none"
        aria-label="Joystick"
      >
        <div
          ref={knobRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-brand-lime/80 shadow-lg shadow-brand-lime/30 pointer-events-none transition-transform duration-75"
        />
      </div>

      {/* Trophy detail modal */}
      {selected && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 20 }}
          className="flex items-end sm:items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-navy-700 bg-navy-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: selected.color }}>
                  PR
                </div>
                <div className="font-display text-xl tracking-tight truncate">{selected.exerciseLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4 mb-4 text-center">
              <div
                className="font-display text-6xl tabular-nums"
                style={{ color: selected.color }}
              >
                {selected.weightKg}
              </div>
              <div className="text-xs uppercase tracking-widest text-navy-300 mt-1">kg</div>
            </div>
            <a
              href={buyHref}
              className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
            >
              Transformar em troféu real →
            </a>
            <p className="text-[11px] text-navy-300 mt-3 text-center leading-tight">
              Configurador abre com o peso do PR já montado na barra.
            </p>
          </div>
        </div>
      )}

      {/* Tutorial overlay — primeira visita. Dismissed em localStorage. */}
      {showTutorial && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 40 }}
          className="flex items-center justify-center bg-black/85 p-4"
          onClick={dismissTutorial}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-brand-lime/40 bg-navy-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime mb-2">
              BEM-VINDO AO SEU GINÁSIO
            </div>
            <h2 className="font-display text-xl tracking-tight mb-4">
              Como controlar
            </h2>
            <ul className="space-y-3 text-sm text-navy-300 mb-5">
              <li className="flex items-start gap-3">
                <span className="text-brand-lime font-bold tabular-nums w-12 flex-shrink-0">
                  WASD
                </span>
                <span>ou setas pra mover o avatar (desktop)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-brand-lime font-bold w-12 flex-shrink-0">●</span>
                <span>arrasta o joystick lime no canto pra mover (mobile)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-brand-lime w-12 flex-shrink-0 text-center">🏆</span>
                <span>clica num troféu pra ver o PR e comprar a versão real</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-brand-lime w-12 flex-shrink-0 text-center">🎬</span>
                <span>clica na tela do projetor pra escolher um Reel</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-brand-lime w-12 flex-shrink-0 text-center">📷</span>
                <span>botão "Girar" no canto pra câmera livre 360°</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={dismissTutorial}
              className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
            >
              Bora treinar
            </button>
            <p className="text-[10px] text-navy-300 mt-3 text-center">
              Você só vê isso uma vez.
            </p>
          </div>
        </div>
      )}

      {/* Reels modal — lista quando nenhum tocando, player quando tocando */}
      {reelOpen && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 30 }}
          className="flex items-end sm:items-center justify-center bg-black/80 p-4"
          onClick={() => {
            setReelOpen(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-navy-700 bg-navy-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-navy-700">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">PROJETOR</div>
                <div className="font-display text-lg tracking-tight">
                  {activeReel ? activeReel.title : "Escolher Reel"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReelOpen(false);
                  setActiveReel(null);
                }}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {activeReel && activeReel.ytId ? (
              <div className="bg-black">
                <div style={{ position: "relative", paddingTop: "56.25%" }}>
                  <iframe
                    title={activeReel.title}
                    src={`https://www.youtube-nocookie.com/embed/${activeReel.ytId}?autoplay=1&rel=0&modestbranding=1`}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-navy-300 min-w-0 truncate">{activeReel.subtitle}</div>
                  <button
                    type="button"
                    onClick={() => setActiveReel(null)}
                    className="text-xs text-brand-lime border border-brand-lime/40 rounded px-3 py-1.5 hover:bg-brand-lime/10 transition flex-shrink-0"
                  >
                    ← Outros Reels
                  </button>
                </div>
              </div>
            ) : activeReel && !activeReel.ytId ? (
              <div className="p-6 text-center">
                <div className="text-5xl mb-3">🎬</div>
                <div className="font-display text-xl mb-2">{activeReel.title}</div>
                <div className="text-sm text-navy-300 mb-4">{activeReel.subtitle}</div>
                <p className="text-xs text-navy-300 mb-5 leading-relaxed">
                  Quando o motor de Auto-Reel estiver pronto, cada PR seu vai virar um vídeo de 15s
                  gerado automaticamente — pronto pra story do IG.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveReel(null)}
                  className="text-xs text-brand-lime border border-brand-lime/40 rounded px-3 py-1.5 hover:bg-brand-lime/10 transition"
                >
                  ← Voltar
                </button>
              </div>
            ) : (
              <div className="p-3">
                <ul className="space-y-2 max-h-[55vh] overflow-y-auto">
                  {REELS.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setActiveReel(r)}
                        className="w-full text-left rounded-xl border border-navy-700 bg-navy-800/40 hover:border-brand-lime/40 hover:bg-brand-lime/5 transition p-3 flex items-center gap-3"
                      >
                        <div
                          className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0"
                          style={{
                            background: r.accent ?? "rgba(216,255,44,0.1)",
                            color: r.accent ? "#01002A" : "#D8FF2C",
                          }}
                        >
                          <span className="text-xl">{r.ytId ? "▶" : "✨"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.title}</div>
                          <div className="text-[11px] text-navy-300 truncate">{r.subtitle}</div>
                        </div>
                        <div className="text-[10px] text-navy-300 tabular-nums flex-shrink-0">
                          {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, "0")}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ===== helpers ====================================================

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerpAngle(a: number, b: number, t: number): number {
  // Shortest-arc lerp on a wrapped angle
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function buildTrophy(colorHex: string, weightKg: number, shortLabel: string): THREE.Group {
  const g = new THREE.Group();

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4, metalness: 0.7 })
  );
  pedestal.position.y = 0.06;
  pedestal.castShadow = true;
  g.add(pedestal);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.85, 12),
    new THREE.MeshStandardMaterial({ color: 0xc0c5cc, roughness: 0.3, metalness: 0.85 })
  );
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.42;
  g.add(shaft);

  const plateMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.5,
    metalness: 0.2,
    emissive: new THREE.Color(colorHex),
    emissiveIntensity: 0.18,
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16 - i * 0.02, 0.16 - i * 0.02, 0.05, 24),
        plateMat
      );
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side * (0.30 + i * 0.07), 0.42, 0);
      plate.castShadow = true;
      g.add(plate);
    }
  }

  // Larger invisible hit-box so taps on small mobile screens still register.
  // Children inherit userData.trophy via traverse() in the caller.
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.0, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 0.45;
  g.add(hit);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const lctx = labelCanvas.getContext("2d")!;
  lctx.fillStyle = "#e4e8ed";
  lctx.fillRect(0, 0, 256, 128);
  lctx.fillStyle = "#01002A";
  lctx.font = "900 84px Archivo Black, Inter, sans-serif";
  lctx.textAlign = "center";
  lctx.textBaseline = "middle";
  lctx.fillText(String(weightKg), 128, 60);
  lctx.fillStyle = "#5a5f68";
  lctx.font = "700 18px Inter, sans-serif";
  lctx.fillText(shortLabel.toUpperCase(), 128, 110);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.15),
    new THREE.MeshBasicMaterial({ map: labelTex, transparent: false })
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.121, 0);
  g.add(label);

  return g;
}

function buildAvatar(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd2a07a, roughness: 0.6 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x1e1b50, roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.6,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.1,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 16), accent);
  torso.position.y = 1.25;
  torso.castShadow = true;
  g.add(torso);

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.35, 16), navy);
  hips.position.y = 0.74;
  hips.castShadow = true;
  g.add(hips);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 12), navy);
    leg.position.set(side * 0.13, 0.21, 0);
    leg.castShadow = true;
    g.add(leg);
  }

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 12), skin);
    arm.position.set(side * 0.36, 1.3, 0);
    arm.castShadow = true;
    g.add(arm);
  }

  return g;
}

// ===== Equipment ===================================================

const STEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a2d3a,
  roughness: 0.45,
  metalness: 0.7,
});
const RUBBER_MAT = new THREE.MeshStandardMaterial({
  color: 0x0a0a14,
  roughness: 0.95,
  metalness: 0.05,
});
const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x14111e,
  roughness: 0.85,
  metalness: 0.05,
});
const VINYL_MAT = new THREE.MeshStandardMaterial({
  color: 0x080814,
  roughness: 0.4,
  metalness: 0.1,
});

/**
 * Power rack com 4 colunas, 2 J-hooks e barbell carregada de anilhas
 * IWF (vermelha 25kg + azul 20kg + amarela 15kg + verde 10kg) na altura
 * do supino. Pinta lime nos J-hooks pra dar identidade da marca.
 */
function buildPowerRack(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.5,
    metalness: 0.4,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.15,
  });

  const W = 1.6;
  const D = 1.4;
  const H = 2.6;
  // 4 colunas verticais
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), STEEL_MAT);
      col.position.set(x, H / 2, z);
      col.castShadow = true;
      g.add(col);
    }
  }
  // Travessa superior frente
  const topFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.08, 0.08), STEEL_MAT);
  topFront.position.set(0, H, D / 2);
  g.add(topFront);
  // Travessa superior trás
  const topBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.08, 0.08), STEEL_MAT);
  topBack.position.set(0, H, -D / 2);
  g.add(topBack);
  // Travessa inferior pra estabilizar
  const baseFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.05, 0.4), STEEL_MAT);
  baseFront.position.set(0, 0.025, D / 2 + 0.16);
  g.add(baseFront);
  const baseBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.05, 0.4), STEEL_MAT);
  baseBack.position.set(0, 0.025, -D / 2 - 0.16);
  g.add(baseBack);

  // J-hooks lime na altura do supino (~1.2m)
  for (const x of [-W / 2, W / 2]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.16), accent);
    hook.position.set(x, 1.25, D / 2 - 0.04);
    g.add(hook);
  }

  // Barbell apoiada nos J-hooks — tubo + 2 lados de anilhas IWF
  const barbell = buildLoadedBarbell();
  barbell.position.set(0, 1.32, D / 2 - 0.04);
  g.add(barbell);

  return g;
}

/** Barbell carregada com 4 anilhas por lado nas cores IWF. */
function buildLoadedBarbell(): THREE.Group {
  const g = new THREE.Group();
  // Barra (cilindro horizontal em x)
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 2.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xc0c5cc, roughness: 0.25, metalness: 0.9 })
  );
  bar.rotation.z = Math.PI / 2;
  g.add(bar);

  // Sleeves (mais grossos nas pontas onde encaixam anilhas)
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16),
      STEEL_MAT
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * 0.95, 0, 0);
    g.add(sleeve);
  }

  // Anilhas IWF (vermelha 25, azul 20, amarela 15, verde 10) por lado
  const plates = [
    { kg: 25, color: 0xda291c, radius: 0.22 },
    { kg: 20, color: 0x0057b8, radius: 0.2 },
    { kg: 15, color: 0xffc72c, radius: 0.18 },
    { kg: 10, color: 0x43b02a, radius: 0.16 },
  ];
  for (const side of [-1, 1]) {
    plates.forEach((p, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.5,
        metalness: 0.15,
        emissive: p.color,
        emissiveIntensity: 0.08,
      });
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(p.radius, p.radius, 0.05, 24),
        mat
      );
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side * (0.78 + i * 0.06), 0, 0);
      plate.castShadow = true;
      g.add(plate);
    });
    // Mini presilha (clamp) prendendo as anilhas
    const clamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12),
      STEEL_MAT
    );
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(side * 1.06, 0, 0);
    g.add(clamp);
  }

  return g;
}

/**
 * Plataforma de levantamento padrão (madeira escura central + 2 painéis
 * de borracha lime laterais — referência clara pra quem é do meio).
 */
function buildPlatform(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accentRubber = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.85,
    metalness: 0.05,
  });

  // Centro de madeira (3m × 1.2m)
  const center = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 3.0), WOOD_MAT);
  center.position.y = 0.03;
  center.receiveShadow = true;
  g.add(center);

  // 2 painéis de borracha lime nas laterais (1.2m cada)
  for (const x of [-1.4, 1.4]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 3.0), accentRubber);
    side.position.set(x, 0.03, 0);
    side.receiveShadow = true;
    g.add(side);
  }

  // Detalhes: linhas escuras separando madeira/borracha (visual de plataforma real)
  for (const x of [-0.6, 0.6]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 3.0), RUBBER_MAT);
    line.position.set(x, 0.031, 0);
    g.add(line);
  }

  return g;
}

/** Banco de supino plano olímpico, com base T e 2 suportes de barra. */
function buildBench(): THREE.Group {
  const g = new THREE.Group();

  // Assento (1.2m × 0.3m × 0.1m alto a 0.45m)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 1.2), VINYL_MAT);
  seat.position.set(0, 0.5, 0);
  seat.castShadow = true;
  g.add(seat);

  // Base T (centro + 2 pés perpendiculares nas pontas)
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 1.2), STEEL_MAT);
  trunk.position.set(0, 0.23, 0);
  g.add(trunk);
  for (const z of [-0.55, 0.55]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), STEEL_MAT);
    foot.position.set(0, 0.025, z);
    g.add(foot);
  }

  // 2 suportes verticais frontais (rack)
  for (const z of [-0.45, 0.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), STEEL_MAT);
    post.position.set(0.4, 0.525, z);
    g.add(post);
  }

  return g;
}

/**
 * Rack de halteres em pirâmide (3 níveis, pesos crescendo pra cima).
 * Esse é o item visualmente mais "academia" — torna a sala convincente.
 */
function buildDumbbellRack(): THREE.Group {
  const g = new THREE.Group();

  // Estrutura de 3 prateleiras inclinadas (como rack real)
  const RACK_W = 3.0;
  const LEVELS = [
    { y: 0.3, depth: 0.6 },
    { y: 0.7, depth: 0.5 },
    { y: 1.1, depth: 0.4 },
  ];
  // 4 pés verticais
  for (const x of [-RACK_W / 2 + 0.1, RACK_W / 2 - 0.1]) {
    for (const z of [-0.3, 0.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), STEEL_MAT);
      post.position.set(x, 0.7, z);
      g.add(post);
    }
  }
  LEVELS.forEach((lv, levelIdx) => {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(RACK_W, 0.04, lv.depth),
      STEEL_MAT
    );
    shelf.position.set(0, lv.y, 0);
    shelf.receiveShadow = true;
    g.add(shelf);

    // Halteres em pares no nível (pesos crescentes do menor pro maior)
    const PAIRS = 5;
    for (let i = 0; i < PAIRS; i++) {
      const x = -RACK_W / 2 + 0.4 + (i / (PAIRS - 1)) * (RACK_W - 0.8);
      const dumbbell = buildDumbbell(0.08 + levelIdx * 0.02);
      dumbbell.position.set(x, lv.y + 0.12, 0);
      g.add(dumbbell);
    }
  });

  return g;
}

/** Haltere individual (handle + 2 cabeças hexagonais). */
function buildDumbbell(headRadius: number): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8),
    new THREE.MeshStandardMaterial({ color: 0xc0c5cc, roughness: 0.3, metalness: 0.85 })
  );
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(headRadius, headRadius, 0.13, 6),
      RUBBER_MAT
    );
    head.rotation.z = Math.PI / 2;
    head.position.set(side * 0.18, 0, 0);
    head.castShadow = true;
    g.add(head);
  }
  return g;
}

/** Kettlebell estilizado — esfera + alça em arco. */
function buildKettlebell(scale: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(scale, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.5, metalness: 0.4 })
  );
  body.position.y = scale;
  body.castShadow = true;
  g.add(body);
  // Pescoço
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.3, scale * 0.4, scale * 0.3, 12),
    STEEL_MAT
  );
  neck.position.y = scale * 1.95;
  g.add(neck);
  // Alça (torus)
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(scale * 0.6, scale * 0.1, 8, 16, Math.PI),
    STEEL_MAT
  );
  handle.position.y = scale * 2.3;
  handle.rotation.x = Math.PI / 2;
  handle.rotation.z = Math.PI;
  g.add(handle);
  return g;
}

/** Plyo box quadrado de espuma — cubo macio. */
function buildPlyoBox(size: number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.2, size, size * 1.2),
    new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.85, metalness: 0.05 })
  );
  box.position.y = size / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  // Quinas chanfradas via wireframe sutil
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: 0x4d4d51 })
  );
  edges.position.y = size / 2;
  g.add(edges);
  return g;
}

/**
 * Banner motivacional — plane com canvas-texture na cor da marca.
 * Copy "VOCÊ NÃO LEMBRA SÓ DO NÚMERO." (Brand Bible §intensidade).
 */
function buildBanner(accentHex: string): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  // Fundo navy escuro
  ctx.fillStyle = "#01002A";
  ctx.fillRect(0, 0, 2048, 512);
  // Borda lateral (faixa lime)
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 24, 512);
  ctx.fillRect(2024, 0, 24, 512);
  // Linha "VOCÊ NÃO LEMBRA SÓ" em cinza
  ctx.fillStyle = "#9ca3af";
  ctx.font = "700 96px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VOCÊ NÃO LEMBRA SÓ", 1024, 180);
  // Linha "DO NÚMERO" em accent (Archivo Black)
  ctx.fillStyle = accentHex;
  ctx.font = "900 168px Archivo Black, Inter, sans-serif";
  ctx.fillText("DO NÚMERO.", 1024, 340);
  // Subtítulo
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 36px Inter, sans-serif";
  ctx.fillText("PR TRACKER", 1024, 450);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 1.0),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false })
  );
  banner.rotation.z = 0;
  return banner;
}
