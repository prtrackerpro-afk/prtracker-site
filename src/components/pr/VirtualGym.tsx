import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configuratorQuery } from "../../lib/pr/plates";
import { productSlugForExercise, type ExerciseId } from "../../lib/pr/exercises";

// V2 of the virtual gym. Avatar walks (joystick + WASD), camera follows
// in third-person, trophies are clickable and open a detail modal with
// CTA to buy the real trophy via the BarbellConfigurator deep-link.
//
// Three.js cru per canonical (no R3F/Drei). The single React island owns
// the scene, the input layer (joystick DOM overlay + keyboard), and the
// modal. Refs-for-mutables keeps the heavy useEffect from tearing down
// when React state changes.

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
  const [mode, setMode] = useState<"follow" | "orbit">("follow");
  const modeRef = useRef<"follow" | "orbit">("follow");
  modeRef.current = mode;

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

    // === TV on the right wall ======================================
    const tvFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.8, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4 })
    );
    tvFrame.position.set(ROOM_W / 2 - 0.05, 2.4, 0);
    scene.add(tvFrame);

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 768;
    screenCanvas.height = 432;
    const sctx = screenCanvas.getContext("2d")!;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 1.6),
      new THREE.MeshBasicMaterial({ map: screenTex })
    );
    screen.position.set(ROOM_W / 2 - 0.02, 2.4, 0);
    screen.rotation.y = -Math.PI / 2;
    scene.add(screen);

    function drawScreen(t: number) {
      const ctx = sctx;
      const w = 768;
      const h = 432;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#01002A");
      grad.addColorStop(1, "#0a0050");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const sx = ((t * 0.25) % 1) * w;
      const lg = ctx.createLinearGradient(sx - 100, 0, sx + 100, 0);
      lg.addColorStop(0, "rgba(216,255,44,0)");
      lg.addColorStop(0.5, "rgba(216,255,44,0.18)");
      lg.addColorStop(1, "rgba(216,255,44,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = accent;
      ctx.font = "900 56px Archivo Black, Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PR REELS", w / 2, h / 2 - 18);
      ctx.fillStyle = "#9ca3af";
      ctx.font = "500 18px Inter, sans-serif";
      ctx.fillText("EM BREVE · 15s · GERADOS NA HORA", w / 2, h / 2 + 32);
      screenTex.needsUpdate = true;
    }

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
      const hits = raycaster.intersectObject(trophiesGroup, true);
      const first = hits[0];
      if (first) {
        let obj: THREE.Object3D | null = first.object;
        while (obj && !obj.userData.trophy) obj = obj.parent;
        if (obj && obj.userData.trophy) {
          setSelected(obj.userData.trophy as GymTrophy);
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
      let ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + jx;
      let iz = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + jy;
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

      drawScreen(t);
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

      {/* TEMP DIAGNOSTIC: faixa magenta no topo. Se voce ve isso, a
          ilha React montou. Vou remover assim que confirmar. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          background: "#ff00aa",
          color: "#000",
          fontWeight: 700,
          textAlign: "center",
          lineHeight: "28px",
          fontSize: 12,
          zIndex: 50,
          letterSpacing: "0.2em",
        }}
      >
        REACT-OK · {trophies.length} TROFÉU(S) · TIER {accent.toUpperCase()}
      </div>

      {/* Camera mode toggle — top-right of the gym */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "follow" ? "orbit" : "follow"))}
        style={{ position: "absolute", top: 40, right: 12, zIndex: 10 }}
        className="text-[10px] uppercase tracking-widest font-display rounded-full border border-white/30 bg-navy-900/80 text-white px-3 py-1.5 hover:border-brand-lime hover:text-brand-lime transition"
        aria-label="Trocar modo de câmera"
      >
        {mode === "follow" ? "📷 Seguir" : "🔄 Girar"}
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
