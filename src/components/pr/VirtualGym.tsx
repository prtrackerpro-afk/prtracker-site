import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// V1 of the virtual gym. Pure Three.js, runs as a React island. Renders
// an isometric-style room with the athlete's PRs as 3D trophies on
// shelves, a TV mounted on the wall (placeholder for PR video reels),
// and a stylized low-poly avatar. Camera orbits around the avatar with
// touch + mouse support.
//
// Data fed via props — no fetching here. The page composes the 3D scene
// with athlete name + tier + lift list and we just render.

export interface GymTrophy {
  /** Tier color hex. */
  color: string;
  /** Weight kg, displayed in the label. */
  weightKg: number;
  /** Short exercise name (3-4 chars) shown on the pedestal. */
  shortLabel: string;
}

interface Props {
  athleteName: string;
  /** Hex for the athlete's overall tier — used for accent lighting + plaque. */
  accent: string;
  trophies: GymTrophy[];
}

export default function VirtualGym({ athleteName, accent, trophies }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mountMaybe = mountRef.current;
    if (!mountMaybe) return;
    const mount: HTMLDivElement = mountMaybe;

    // === Scene + renderer ===========================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#01002A");
    scene.fog = new THREE.Fog("#01002A", 14, 30);

    // Initial size — fall back to container's bounding rect since
    // clientWidth/Height can be 0 during hydration when the parent
    // uses aspect-ratio CSS. ResizeObserver below corrects on layout.
    const rect0 = mount.getBoundingClientRect();
    const width = Math.max(1, mount.clientWidth || rect0.width || 800);
    const height = Math.max(1, mount.clientHeight || rect0.height || 480);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(7, 5.5, 9);
    camera.lookAt(0, 1.5, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.6, 0);
    controls.minDistance = 5;
    controls.maxDistance = 14;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.enablePan = false;

    // === Lighting ===================================================
    // Hemisphere gives ambient color shift (sky vs ground) much more
    // legible than a flat AmbientLight on a near-monochromatic palette.
    const hemi = new THREE.HemisphereLight(0x6f7cff, 0x0a0028, 0.7);
    scene.add(hemi);

    // Brand-accent rim light from above
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

    // Two accent point lights for depth: one over the trophies, one over
    // the avatar, both in tier color to color-tag the athlete's identity.
    const trophyLight = new THREE.PointLight(accentColor, 2.2, 14);
    trophyLight.position.set(0, 4.2, -3.5);
    scene.add(trophyLight);

    const avatarLight = new THREE.PointLight(accentColor, 1.4, 8);
    avatarLight.position.set(0, 3.0, 1.5);
    scene.add(avatarLight);

    // === Room (3 walls + floor + ceiling) ===========================
    // Walls bumped from #0a0050 → #1a1660 so they read against the
    // #01002A bg. The previous near-equal values made the room invisible.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1660,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0d0a3a,
      roughness: 0.9,
      metalness: 0.15,
    });

    const ROOM_W = 12;
    const ROOM_D = 12;
    const WALL_H = 5;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Floor grid lines (faint accent) — bumped opacity so the floor reads.
    const grid = new THREE.GridHelper(ROOM_W, 12, accentColor, accentColor);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    grid.position.y = 0.002;
    scene.add(grid);

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, WALL_H), wallMat);
    backWall.position.set(0, WALL_H / 2, -ROOM_D / 2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), wallMat);
    leftWall.position.set(-ROOM_W / 2, WALL_H / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, WALL_H), wallMat);
    rightWall.position.set(ROOM_W / 2, WALL_H / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Wall trim line at top in accent color
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

    // === Shelves with trophies on the back wall ====================
    const SHELF_LEVELS = [3.0, 2.2, 1.4]; // y heights
    const PER_SHELF = 4;
    const visibleTrophies = trophies.slice(0, SHELF_LEVELS.length * PER_SHELF);

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b50,
      roughness: 0.7,
      metalness: 0.2,
    });

    SHELF_LEVELS.forEach((y, shelfIdx) => {
      // Shelf plank
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 0.6), shelfMat);
      shelf.position.set(0, y, -ROOM_D / 2 + 0.32);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      scene.add(shelf);

      const slotTrophies = visibleTrophies.slice(
        shelfIdx * PER_SHELF,
        (shelfIdx + 1) * PER_SHELF
      );
      slotTrophies.forEach((t, i) => {
        const x = -2.4 + i * 1.6;
        const trophy = buildTrophy(t.color, t.weightKg, t.shortLabel);
        trophy.position.set(x, y + 0.08, -ROOM_D / 2 + 0.34);
        scene.add(trophy);
      });
    });

    // === TV on the right wall =======================================
    const tvFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.8, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4 })
    );
    tvFrame.position.set(ROOM_W / 2 - 0.05, 2.4, 0);
    scene.add(tvFrame);

    // TV "screen" — animated noise + brand placeholder
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
      // Animated lime sweep
      const sx = ((t * 0.25) % 1) * w;
      const lg = ctx.createLinearGradient(sx - 100, 0, sx + 100, 0);
      lg.addColorStop(0, "rgba(216,255,44,0)");
      lg.addColorStop(0.5, "rgba(216,255,44,0.18)");
      lg.addColorStop(1, "rgba(216,255,44,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      // Center text
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

    // === Stylized avatar ============================================
    const avatar = buildAvatar(accent);
    avatar.position.set(0, 0, 1.5);
    avatar.castShadow = true;
    scene.add(avatar);

    // === Resize handler =============================================
    // Belt-and-suspenders: ResizeObserver covers most cases, but during
    // hydration with aspect-ratio CSS the first observation can fire
    // with 0×0. We also schedule an rAF resize to catch the case where
    // the parent has just laid out.
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

    // === Render loop ================================================
    let raf = 0;
    const start = performance.now();
    function loop(now: number) {
      const t = (now - start) / 1000;
      controls.update();
      // Avatar idle bob
      avatar.position.y = Math.sin(t * 1.6) * 0.05;
      // Trophy glow pulse
      drawScreen(t);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat) {
          (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [athleteName, accent, trophies]);

  // `position: absolute; inset: 0` instead of `w-full h-full` because
  // an aspect-ratio parent can momentarily report 0×0 during hydration,
  // which would size the renderer at 0×0 and render an empty canvas.
  return <div ref={mountRef} className="absolute inset-0" />;
}

function buildTrophy(colorHex: string, weightKg: number, shortLabel: string): THREE.Group {
  const g = new THREE.Group();

  // Pedestal (silver)
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.4, metalness: 0.7 })
  );
  pedestal.position.y = 0.06;
  pedestal.castShadow = true;
  g.add(pedestal);

  // Bar shaft
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.85, 12),
    new THREE.MeshStandardMaterial({ color: 0xc0c5cc, roughness: 0.3, metalness: 0.85 })
  );
  shaft.rotation.z = Math.PI / 2;
  shaft.position.y = 0.42;
  g.add(shaft);

  // Plates each side (2 colored)
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

  // Weight label texture on pedestal top
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

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), skin);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  // Torso (lime tank top)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 16), accent);
  torso.position.y = 1.25;
  torso.castShadow = true;
  g.add(torso);

  // Lower body (navy shorts)
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.30, 0.35, 16), navy);
  hips.position.y = 0.74;
  hips.castShadow = true;
  g.add(hips);

  // Legs
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.7, 12), navy);
    leg.position.set(side * 0.13, 0.21, 0);
    leg.castShadow = true;
    g.add(leg);
  }

  // Arms
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.6, 12), skin);
    arm.position.set(side * 0.36, 1.3, 0);
    arm.castShadow = true;
    g.add(arm);
  }

  return g;
}
