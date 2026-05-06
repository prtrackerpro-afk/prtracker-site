import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configuratorQuery } from "../../lib/pr/plates";
import { productSlugForExercise, type ExerciseId } from "../../lib/pr/exercises";
import { REELS, type Reel } from "../../lib/pr/gym/reels";
import {
  buildAvatar,
  buildTrophy,
  buildPowerRack,
  buildPlatform,
  buildBench,
  buildDumbbellRack,
  buildKettlebell,
  buildPlyoBox,
  buildBanner,
  buildCrossFitRig,
  buildPlateTree,
  buildWallPlates,
  buildCeilingBeams,
  buildWallLogo,
  buildPlatformWithRack,
  buildSquatRack,
  STEEL_MAT,
} from "../../lib/pr/gym/builders";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import {
  loadAvatarPrefs,
  saveAvatarPrefs,
  SKIN_TONES,
  HAIR_COLORS,
  TOP_COLORS,
  SHORTS_COLORS,
  type AvatarPrefs,
  type Gender,
  type HairStyle,
} from "../../lib/pr/gym/avatar-prefs";
import { resolveCollisions, type AABB, AVATAR_RADIUS } from "../../lib/pr/gym/collision";
import { buildFloorTexture, buildWallTexture } from "../../lib/pr/gym/textures";

// V4 do virtual gym. Avatar customizável (gênero, pele, cabelo, regata,
// shorts) com animação de caminhada (pernas/braços alternados). Colisão
// AABB real contra todos os equipamentos. Troféus realistas com plate
// split IWF correto + número GIGANTE. Iluminação 3-point. Floor de
// borracha texturizada. Reels honest (Em breve + Instagram da PR Tracker
// no lugar de YouTube quebrado).

export interface GymTrophy {
  color: string;
  weightKg: number;
  shortLabel: string;
  exerciseId: ExerciseId;
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
  const [customOpen, setCustomOpen] = useState(false);
  const [mode, setMode] = useState<"follow" | "orbit">("follow");
  const [avatarPrefs, setAvatarPrefs] = useState<AvatarPrefs>(loadAvatarPrefs);
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
  const activeReelRef = useRef<Reel | null>(null);
  activeReelRef.current = activeReel;
  const inputLockedRef = useRef(false);
  inputLockedRef.current =
    selected !== null || reelOpen || showTutorial || customOpen;

  function dismissTutorial() {
    setShowTutorial(false);
    try {
      localStorage.setItem("pr_gym_tutorial_seen", "1");
    } catch {
      // ignore
    }
  }

  function applyPrefs(next: AvatarPrefs) {
    setAvatarPrefs(next);
    saveAvatarPrefs(next);
  }

  useEffect(() => {
    const mountMaybe = mountRef.current;
    if (!mountMaybe) return;
    const mount: HTMLDivElement = mountMaybe;

    // === Scene + renderer ==========================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#01002A");
    scene.fog = new THREE.Fog("#01002A", 16, 32);

    const rect0 = mount.getBoundingClientRect();
    const initW = Math.max(1, mount.clientWidth || rect0.width || 800);
    const initH = Math.max(1, mount.clientHeight || rect0.height || 480);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(initW, initH);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45; // bem mais bright (era 1.05)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, initW / initH, 0.1, 100);
    camera.position.set(0, 4.5, 7);
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
    controls.enabled = false;

    const accentColor = new THREE.Color(accent);

    // === Lighting BRIGHT — academia diurna real ===================
    // Inspiração: KUBE Box / Rogue gym dia. Branco, claro, definido.
    // Accent SÓ em pontos mirados (trophies, projetor, rig).
    const hemi = new THREE.HemisphereLight(0xeef2ff, 0x2a2540, 1.1);
    scene.add(hemi);

    // KEY light (sol grande, branco) — bem mais forte
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.4);
    keyLight.position.set(6, 11, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Fill light forte (oposto, branca-fria)
    const fillLight = new THREE.DirectionalLight(0xcce0ff, 0.95);
    fillLight.position.set(-6, 8, 4);
    scene.add(fillLight);

    // Rim light traseira (silhueta)
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0, 5, -10);
    scene.add(rim);

    // 4 spotlights de teto (industriais visíveis, distribuídos)
    const ceilingSpots: THREE.SpotLight[] = [];
    const spotPositions = [
      { x: -4, z: -4 },
      { x: 4, z: -4 },
      { x: -4, z: 4 },
      { x: 4, z: 4 },
    ];
    for (const p of spotPositions) {
      const s = new THREE.SpotLight(0xfff5e0, 1.4, 12, Math.PI / 5, 0.5, 1.4);
      s.position.set(p.x, 6.4, p.z);
      s.target.position.set(p.x, 0, p.z);
      scene.add(s);
      scene.add(s.target);
      ceilingSpots.push(s);
    }

    // Accent point light em cima dos troféus (Hall of Fame)
    const trophyLight = new THREE.PointLight(accentColor, 3.0, 8);
    trophyLight.position.set(0, 4.5, -5.5);
    scene.add(trophyLight);

    // Accent no projetor
    const projAccent = new THREE.PointLight(accentColor, 1.2, 3);
    projAccent.position.set(0.8, 5.5, 0);
    scene.add(projAccent);

    // === Sala (chão texturizado + 3 paredes + trim) ================
    const floorTex = buildFloorTexture(8);
    const wallTex = buildWallTexture();

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      color: 0x1a1660,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.85,
      metalness: 0.15,
    });

    const ROOM_W = 18;
    const ROOM_D = 16;
    const WALL_H = 7.0; // teto mais alto pra acomodar rig + ceiling beams

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // (Floor markings agora ficam abaixo, depois do equipamento.)

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

    // Trim accent linha no topo da parede do fundo
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    trim.position.set(0, WALL_H - 0.3, -ROOM_D / 2 + 0.04);
    scene.add(trim);

    // === WALL LOGO gigante ATRAS dos troféus =======================
    // "PR TRACKER · HALL OF FAME" ocupando ~10m de largura na parede.
    // Domina a parede do fundo como num CrossFit box real.
    const wallLogo = buildWallLogo(11, accent);
    wallLogo.position.set(0, WALL_H - 1.6, -ROOM_D / 2 + 0.04);
    scene.add(wallLogo);

    // Subtítulo com nome do atleta abaixo do logo
    const subPlaqueCanvas = document.createElement("canvas");
    subPlaqueCanvas.width = 1536;
    subPlaqueCanvas.height = 192;
    const sptx = subPlaqueCanvas.getContext("2d")!;
    sptx.fillStyle = "#01002A";
    sptx.fillRect(0, 0, 1536, 192);
    sptx.fillStyle = "#ffffff";
    sptx.font = "700 80px Inter, sans-serif";
    sptx.textAlign = "center";
    sptx.textBaseline = "middle";
    sptx.fillText(athleteName.toUpperCase(), 768, 96);
    const subTex = new THREE.CanvasTexture(subPlaqueCanvas);
    subTex.colorSpace = THREE.SRGBColorSpace;
    const subPlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 0.6),
      new THREE.MeshBasicMaterial({ map: subTex, transparent: true })
    );
    subPlaque.position.set(0, WALL_H - 3.6, -ROOM_D / 2 + 0.05);
    scene.add(subPlaque);

    // === HALL OF FAME — troféus em fileira no chão contra parede do fundo ==
    // V5: troféus baseados no chão (não em prateleiras) — visualmente
    // mais imponentes, número GIGANTE legível. Hall of fame de até 6
    // PRs em ordem de tier rank → kg desc.
    const MAX_TROPHIES = 6;
    const visibleTrophies = trophies.slice(0, MAX_TROPHIES);
    const trophiesGroup = new THREE.Group();
    scene.add(trophiesGroup);

    // Plataforma elevada de 15cm onde os troféus ficam (cinematográfico)
    const fameDeck = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W - 1.5, 0.15, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.6, metalness: 0.4 })
    );
    fameDeck.position.set(0, 0.075, -ROOM_D / 2 + 0.85);
    fameDeck.receiveShadow = true;
    scene.add(fameDeck);

    // Faixa lime na frente do deck
    const fameStrip = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W - 1.5, 0.04, 0.06),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    fameStrip.position.set(0, 0.155, -ROOM_D / 2 + 1.42);
    scene.add(fameStrip);

    // Troféus espaçados — cada um ocupa ~1.7m horizontal
    const SLOT_WIDTH = 1.8;
    const totalWidth = (visibleTrophies.length - 1) * SLOT_WIDTH;
    visibleTrophies.forEach((t, i) => {
      const x = -totalWidth / 2 + i * SLOT_WIDTH;
      const trophy = buildTrophy(t.weightKg, t.shortLabel, t.color);
      // Sentado em cima do fameDeck (deck top y=0.15)
      trophy.position.set(x, 0.15, -ROOM_D / 2 + 0.95);
      trophy.userData.trophy = t;
      trophy.traverse((c) => {
        c.userData.trophy = t;
      });
      trophiesGroup.add(trophy);
    });

    // === Projetor + tela cinema ====================================
    const projectorGroup = new THREE.Group();
    scene.add(projectorGroup);

    const screenW = 5.4;
    const screenH = 3.0;
    const screenY = 2.7;
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1280;
    screenCanvas.height = 720;
    const sctx = screenCanvas.getContext("2d")!;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;

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

    // Projetor pendurado no teto
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.25, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.4, metalness: 0.5 })
    );
    projBody.position.set(0.5, WALL_H - 0.4, 0);
    projBody.castShadow = true;
    projectorGroup.add(projBody);
    const projLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.6,
      })
    );
    projLens.rotation.z = Math.PI / 2;
    projLens.position.set(0.8, WALL_H - 0.4, 0);
    projectorGroup.add(projLens);
    const projCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6),
      new THREE.MeshBasicMaterial({ color: 0x1e1b50 })
    );
    projCable.position.set(0.5, WALL_H - 0.05, 0);
    projectorGroup.add(projCable);
    const lightCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, ROOM_W / 2 - 0.6, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    lightCone.rotation.z = -Math.PI / 2;
    lightCone.position.set(ROOM_W / 4 + 0.5, WALL_H - 0.6, 0);
    projectorGroup.add(lightCone);

    function drawScreen(t: number, currentReel: Reel | null) {
      const ctx = sctx;
      const w = 1280;
      const h = 720;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#01002A");
      grad.addColorStop(1, "#0a0050");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const sx = ((t * 0.18) % 1) * w;
      const lg = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      lg.addColorStop(0, "rgba(216,255,44,0)");
      lg.addColorStop(0.5, "rgba(216,255,44,0.12)");
      lg.addColorStop(1, "rgba(216,255,44,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      if (currentReel) {
        ctx.fillStyle = accent;
        ctx.font = "900 92px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(currentReel.title.toUpperCase(), w / 2, h / 2 - 60);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 28px Inter, sans-serif";
        ctx.fillText(currentReel.subtitle, w / 2, h / 2 + 8);
        const pulse = (Math.sin(t * 3) + 1) / 2;
        ctx.fillStyle = `rgba(216,255,44,${0.5 + pulse * 0.5})`;
        ctx.font = "900 22px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("▶ NO PROJETOR", 40, h - 56);
      } else {
        ctx.fillStyle = accent;
        ctx.font = "900 110px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PR REELS", w / 2, h / 2 - 30);
        ctx.fillStyle = "#fff";
        ctx.font = "700 36px Inter, sans-serif";
        ctx.fillText("Clica na tela para ver", w / 2, h / 2 + 50);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 22px Inter, sans-serif";
        ctx.fillText(`${REELS.length} disponíveis · em breve auto-Reel`, w / 2, h / 2 + 100);
      }
      screenTex.needsUpdate = true;
    }

    // === Equipment + colliders =====================================
    // CrossFit box layout. Cada equipamento adiciona um AABB no array
    // colliders pra avatar não atravessar.
    const colliders: AABB[] = [];

    // === CEILING BEAMS (estrutura industrial visivel no teto) =====
    const ceilingBeams = buildCeilingBeams(ROOM_W, ROOM_D, WALL_H);
    scene.add(ceilingBeams);

    // === RIG CENTRAL DE CROSSFIT (pull-up bars + rings + ropes) ====
    // 6.5m largura × 2.2m profundidade, centro da sala recuado.
    // Avatar pode caminhar sob o rig pra interagir com rings.
    const rig = buildCrossFitRig(6.5, 2.2);
    rig.group.position.set(0, 0, -0.5);
    scene.add(rig.group);
    // Colliders das colunas do rig (só os pilares verticais)
    for (const dz of [-1.1, 1.1]) {
      for (let i = 0; i < 4; i++) {
        const colX = -6.5 / 2 + (i / 3) * 6.5;
        colliders.push({ cx: colX, cz: -0.5 + dz, hw: 0.1, hd: 0.1 });
      }
    }
    // Refs pras anim do rig (rings + ropes balançam)
    const rigRings = rig.rings;
    const rigRopes = rig.ropes;

    // === 3 SQUAT RACKS alinhados na parede do fundo (à esquerda dos troféus) ==
    const rackPositions = [-7.5, -5.5, -3.5];
    for (const x of rackPositions) {
      const rack = buildSquatRack(accent);
      rack.position.set(x, 0, -ROOM_D / 2 + 1.8);
      scene.add(rack);
      colliders.push({
        cx: x,
        cz: -ROOM_D / 2 + 1.8,
        hw: 0.85,
        hd: 0.45,
      });
    }

    // === 2 PLATAFORMAS LADO A LADO (centro-esquerda) ===============
    const platform1 = buildPlatformWithRack(accent);
    platform1.position.set(-6, 0, 4);
    scene.add(platform1);

    const platform2 = buildPlatformWithRack(accent);
    platform2.position.set(-2.5, 0, 4);
    scene.add(platform2);

    // === MIRROR WALL na parede esquerda (THREE.Reflector) ==========
    // Espelho gigante 6m × 2.5m na parede esquerda, parte mid-superior
    const mirror = new Reflector(new THREE.PlaneGeometry(6, 2.5), {
      color: 0x303040,
      textureWidth: 1024,
      textureHeight: 1024,
    });
    mirror.position.set(-ROOM_W / 2 + 0.04, 2.6, -2);
    mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);

    // Frame escuro ao redor do mirror
    const mirrorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 2.65, 6.15),
      new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.4, metalness: 0.5 })
    );
    mirrorFrame.position.set(-ROOM_W / 2 + 0.02, 2.6, -2);
    scene.add(mirrorFrame);

    // === BANCO DE SUPINO ==========================================
    const bench = buildBench();
    bench.position.set(-7, 0, -1);
    bench.rotation.y = Math.PI / 6;
    scene.add(bench);
    colliders.push({ cx: -7, cz: -1, hw: 0.6, hd: 0.7 });

    // === RACK DE HALTERES =========================================
    const dumbbellRack = buildDumbbellRack();
    dumbbellRack.position.set(-ROOM_W / 2 + 0.5, 0, 5.5);
    dumbbellRack.rotation.y = Math.PI / 2;
    scene.add(dumbbellRack);
    colliders.push({ cx: -ROOM_W / 2 + 0.5, cz: 5.5, hw: 0.4, hd: 1.6 });

    // === BANNER MOTIVACIONAL (parede direita) =====================
    const banner = buildBanner(accent);
    banner.position.set(ROOM_W / 2 - 0.04, 4.8, -5);
    banner.rotation.y = -Math.PI / 2;
    scene.add(banner);

    // === PLATE TREE (canto traseiro direito) ======================
    const plateTree = buildPlateTree();
    plateTree.position.set(ROOM_W / 2 - 1.2, 0, -ROOM_D / 2 + 1.5);
    scene.add(plateTree);
    colliders.push({
      cx: ROOM_W / 2 - 1.2,
      cz: -ROOM_D / 2 + 1.5,
      hw: 0.4,
      hd: 0.4,
    });

    // === ANILHAS NA PAREDE (decoração colorida — parede direita) ===
    const wallPlates = buildWallPlates(2, 6);
    wallPlates.position.set(ROOM_W / 2 - 0.04, 1.5, 2);
    wallPlates.rotation.y = -Math.PI / 2;
    scene.add(wallPlates);

    // === KETTLEBELLS (8 unidades em fileira no canto direito) =====
    for (let i = 0; i < 8; i++) {
      const kb = buildKettlebell(0.18 + (i % 4) * 0.02);
      const x = ROOM_W / 2 - 0.6;
      const z = -ROOM_D / 2 + 4 + i * 0.55;
      kb.position.set(x, 0, z);
      scene.add(kb);
      colliders.push({ cx: x, cz: z, hw: 0.24, hd: 0.24 });
    }

    // === PLYO BOXES (3 empilhados — visual stacks) ================
    const plyo1 = buildPlyoBox(0.6);
    plyo1.position.set(ROOM_W / 2 - 2.5, 0, ROOM_D / 2 - 1.5);
    scene.add(plyo1);
    colliders.push({
      cx: ROOM_W / 2 - 2.5,
      cz: ROOM_D / 2 - 1.5,
      hw: 0.4,
      hd: 0.4,
    });

    const plyo2 = buildPlyoBox(0.5);
    plyo2.position.set(ROOM_W / 2 - 3.5, 0, ROOM_D / 2 - 1.5);
    scene.add(plyo2);
    colliders.push({
      cx: ROOM_W / 2 - 3.5,
      cz: ROOM_D / 2 - 1.5,
      hw: 0.32,
      hd: 0.32,
    });

    const plyo3 = buildPlyoBox(0.4);
    plyo3.position.set(ROOM_W / 2 - 2.5, 0.6, ROOM_D / 2 - 1.5);
    plyo3.rotation.y = Math.PI / 16;
    scene.add(plyo3);

    // === CHALK BOWL ================================================
    const chalkBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.7, 16),
      STEEL_MAT
    );
    chalkBase.position.set(0.5, 0.35, 6);
    chalkBase.castShadow = true;
    scene.add(chalkBase);
    const chalkBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.14, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.95 })
    );
    chalkBowl.position.set(0.5, 0.73, 6);
    scene.add(chalkBowl);
    colliders.push({ cx: 0.5, cz: 6, hw: 0.22, hd: 0.22 });

    // === FLOOR MARKINGS (linhas + circulo central olímpico) =======
    // Quadrado de competição (2m × 2m no centro-frente)
    const compZone = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 4, 1, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.25 })
    );
    compZone.rotation.x = -Math.PI / 2;
    compZone.position.set(0, 0.005, 5);
    scene.add(compZone);

    // Linha lime atravessando a sala (lane marker estilo box)
    const laneLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, ROOM_D - 2),
      new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.5 })
    );
    laneLine.rotation.x = -Math.PI / 2;
    laneLine.position.set(0, 0.004, 0);
    scene.add(laneLine);

    // === Avatar ====================================================
    const avatarParts = buildAvatar(avatarPrefs);
    avatarParts.root.position.set(0, 0, 2);
    scene.add(avatarParts.root);

    // === Input — keyboard =========================================
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

    // === Joystick virtual =========================================
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
        // ignore
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
    const onJoyUp = () => {
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

    // === Raycast em troféus + tela do projetor ====================
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const onCanvasDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const onCanvasUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
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

    // === Render loop ==============================================
    const ROOM_HALF_W = ROOM_W / 2 - AVATAR_RADIUS - 0.3;
    const ROOM_HALF_D = ROOM_D / 2 - AVATAR_RADIUS - 0.3;
    // Avatar não pode chegar mais perto do que isso da parede do fundo
    // (trophy hall deck termina em z=-ROOM_D/2 + 1.45 = -6.55).
    const SHELF_BLOCK_Z = -ROOM_D / 2 + 2.0;
    const SPEED = 3.0;
    const followOffset = new THREE.Vector3(0, 4.5, 6.5);
    const tmpV = new THREE.Vector3();
    let raf = 0;
    const startT = performance.now();
    let lastT = startT;
    let walkPhase = 0;

    function loop(now: number) {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const t = (now - startT) / 1000;

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
        // Posição candidata
        let nx = avatarParts.root.position.x + ix * SPEED * dt;
        let nz = avatarParts.root.position.z + iz * SPEED * dt;
        // Clamp na sala
        nx = Math.max(-ROOM_HALF_W, Math.min(ROOM_HALF_W, nx));
        nz = Math.max(SHELF_BLOCK_Z, Math.min(ROOM_HALF_D, nz));
        // Resolve colisão AABB com equipamentos
        const r = resolveCollisions(nx, nz, colliders);
        avatarParts.root.position.x = r.x;
        avatarParts.root.position.z = r.z;

        // Direção do avatar (yaw lerp)
        const targetAngle = Math.atan2(ix, iz);
        avatarParts.root.rotation.y = lerpAngle(
          avatarParts.root.rotation.y,
          targetAngle,
          0.22
        );

        // Walk cycle: pernas e braços alternados
        walkPhase += dt * 8;
        const swing = Math.sin(walkPhase) * 0.55;
        avatarParts.leftLeg.rotation.x = swing;
        avatarParts.rightLeg.rotation.x = -swing;
        avatarParts.leftArm.rotation.x = -swing * 0.7;
        avatarParts.rightArm.rotation.x = swing * 0.7;
        // Pequeno bounce vertical durante a caminhada
        avatarParts.root.position.y = Math.abs(Math.sin(walkPhase)) * 0.04;
      } else {
        // Idle — relaxa pernas/braços, leve bob da cabeça
        avatarParts.leftLeg.rotation.x = lerpAngle(
          avatarParts.leftLeg.rotation.x,
          0,
          0.1
        );
        avatarParts.rightLeg.rotation.x = lerpAngle(
          avatarParts.rightLeg.rotation.x,
          0,
          0.1
        );
        avatarParts.leftArm.rotation.x = lerpAngle(
          avatarParts.leftArm.rotation.x,
          0,
          0.1
        );
        avatarParts.rightArm.rotation.x = lerpAngle(
          avatarParts.rightArm.rotation.x,
          0,
          0.1
        );
        avatarParts.root.position.y = Math.sin(t * 1.6) * 0.03;
        avatarParts.head.rotation.y = Math.sin(t * 0.8) * 0.05;
      }

      // Camera mode
      const followNow = modeRef.current === "follow";
      controls.enabled = !followNow;
      if (followNow) {
        tmpV.copy(avatarParts.root.position).add(followOffset);
        camera.position.lerp(tmpV, 0.08);
        const target = tmpV.copy(avatarParts.root.position);
        target.y = 1.7;
        controls.target.lerp(target, 0.12);
        camera.lookAt(controls.target);
      } else {
        controls.update();
      }

      // Anima rings + ropes do rig (balanço sutil pra dar vida)
      for (let i = 0; i < rigRings.length; i++) {
        const r = rigRings[i];
        if (r) r.rotation.x = Math.sin(t * 1.5 + i * 0.5) * 0.05;
      }
      for (let i = 0; i < rigRopes.length; i++) {
        const r = rigRopes[i];
        if (r) {
          r.rotation.z = Math.sin(t * 1.2 + i) * 0.04;
          r.rotation.x = Math.cos(t * 0.9 + i * 0.7) * 0.03;
        }
      }

      drawScreen(t, activeReelRef.current);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // === Resize ====================================================
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
  }, [athleteName, accent, trophies, avatarPrefs]);

  // === Modal CTA — deep-link to BarbellConfigurator =================
  const buyHref = selected
    ? `/${productSlugForExercise(selected.exerciseId)}?${configuratorQuery(
        selected.weightKg,
        selected.exerciseId,
        "pr-gym"
      )}`
    : "#";

  return (
    <>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* Top-right HUD: Camera + Reels + Customize */}
      <div
        style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
        className="flex flex-col gap-2 items-end"
      >
        <button
          type="button"
          onClick={() => setMode((m) => (m === "follow" ? "orbit" : "follow"))}
          className="text-[10px] uppercase tracking-widest font-display rounded-full border border-white/30 bg-navy-900/80 text-white px-3 py-1.5 hover:border-brand-lime hover:text-brand-lime transition"
          aria-label="Trocar modo de câmera"
        >
          {mode === "follow" ? "📷 Seguir" : "🔄 Girar"}
        </button>
        <button
          type="button"
          onClick={() => setReelOpen(true)}
          className="text-[10px] uppercase tracking-widest font-display rounded-full border border-brand-lime/60 bg-brand-lime/10 text-brand-lime px-3 py-1.5 hover:bg-brand-lime/20 transition"
          aria-label="Abrir Reels"
        >
          🎬 Reels
        </button>
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="text-[10px] uppercase tracking-widest font-display rounded-full border border-white/30 bg-navy-900/80 text-white px-3 py-1.5 hover:border-brand-lime hover:text-brand-lime transition"
          aria-label="Customizar avatar"
        >
          👤 Avatar
        </button>
      </div>

      {/* Joystick */}
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

      {/* Tutorial overlay */}
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
            <h2 className="font-display text-xl tracking-tight mb-4">Como controlar</h2>
            <ul className="space-y-3 text-sm text-navy-300 mb-5">
              <li className="flex items-start gap-3">
                <span className="text-brand-lime font-bold tabular-nums w-12 flex-shrink-0">WASD</span>
                <span>ou setas pra mover (desktop)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-brand-lime w-12 flex-shrink-0 text-center">●</span>
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
                <span className="text-brand-lime w-12 flex-shrink-0 text-center">👤</span>
                <span>customize o seu avatar no botão do canto</span>
              </li>
            </ul>
            <button
              type="button"
              onClick={dismissTutorial}
              className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
            >
              Bora treinar
            </button>
            <p className="text-[10px] text-navy-300 mt-3 text-center">Você só vê isso uma vez.</p>
          </div>
        </div>
      )}

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
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: selected.color }}>PR</div>
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
              <div className="font-display text-6xl tabular-nums" style={{ color: selected.color }}>
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

      {/* Reels modal */}
      {reelOpen && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 30 }}
          className="flex items-end sm:items-center justify-center bg-black/80 p-4"
          onClick={() => {
            setReelOpen(false);
            setActiveReel(null);
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
                  {activeReel ? activeReel.title : "Escolher conteúdo"}
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

            {!activeReel ? (
              <div className="p-3">
                <ul className="space-y-2 max-h-[55vh] overflow-y-auto">
                  {REELS.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (r.kind === "external" && r.externalUrl) {
                            window.open(r.externalUrl, "_blank", "noopener");
                          } else {
                            setActiveReel(r);
                          }
                        }}
                        className="w-full text-left rounded-xl border border-navy-700 bg-navy-800/40 hover:border-brand-lime/40 hover:bg-brand-lime/5 transition p-3 flex items-center gap-3"
                      >
                        <div
                          className="w-12 h-12 rounded-lg grid place-items-center flex-shrink-0 text-xl"
                          style={{
                            background: r.accent ? `${r.accent}22` : "rgba(216,255,44,0.1)",
                            color: r.accent ?? "#D8FF2C",
                          }}
                        >
                          <span>{r.emoji ?? "▶"}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.title}</div>
                          <div className="text-[11px] text-navy-300 truncate">{r.subtitle}</div>
                        </div>
                        <div className="text-[10px] text-navy-300 flex-shrink-0">
                          {r.kind === "external" ? "↗" : r.kind === "comingsoon" ? "Em breve" : "▶"}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : activeReel.kind === "youtube" && activeReel.ytId ? (
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
                    ← Outros
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="text-5xl mb-3">{activeReel.emoji ?? "🎬"}</div>
                <div className="font-display text-xl mb-2">{activeReel.title}</div>
                <div className="text-sm text-navy-300 mb-4">{activeReel.subtitle}</div>
                <p className="text-xs text-navy-300 mb-5 leading-relaxed">
                  {activeReel.kind === "comingsoon"
                    ? "Quando o motor de Auto-Reel estiver pronto, cada PR seu vai virar um vídeo de 15s gerado automaticamente — pronto pra story do IG."
                    : "Conteúdo disponível em outro canal."}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveReel(null)}
                  className="text-xs text-brand-lime border border-brand-lime/40 rounded px-3 py-1.5 hover:bg-brand-lime/10 transition"
                >
                  ← Voltar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customize avatar modal */}
      {customOpen && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 35 }}
          className="flex items-end sm:items-center justify-center bg-black/80 p-4"
          onClick={() => setCustomOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-brand-lime/30 bg-navy-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-navy-700">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">SEU AVATAR</div>
                <div className="font-display text-lg tracking-tight">Customizar</div>
              </div>
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Gênero (afeta proporções) */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-navy-300 mb-2">
                  Tipo de corpo
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["fluid", "male", "female"] as Gender[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => applyPrefs({ ...avatarPrefs, gender: g })}
                      className={`rounded-lg border px-2 py-2 text-xs transition ${
                        avatarPrefs.gender === g
                          ? "border-brand-lime bg-brand-lime/10 text-brand-lime"
                          : "border-navy-600 text-navy-300 hover:border-navy-500"
                      }`}
                    >
                      {g === "fluid" ? "Fluid" : g === "male" ? "Masc" : "Fem"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pele */}
              <SwatchRow
                label="Pele"
                colors={SKIN_TONES}
                value={avatarPrefs.skin}
                onChange={(c) => applyPrefs({ ...avatarPrefs, skin: c })}
              />

              {/* Estilo de cabelo */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-navy-300 mb-2">
                  Cabelo
                </div>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {(["short", "long", "ponytail", "bald"] as HairStyle[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => applyPrefs({ ...avatarPrefs, hairStyle: s })}
                      className={`rounded-lg border px-2 py-2 text-[11px] transition ${
                        avatarPrefs.hairStyle === s
                          ? "border-brand-lime bg-brand-lime/10 text-brand-lime"
                          : "border-navy-600 text-navy-300 hover:border-navy-500"
                      }`}
                    >
                      {s === "short" ? "Curto" : s === "long" ? "Longo" : s === "ponytail" ? "Rabo" : "Careca"}
                    </button>
                  ))}
                </div>
                {avatarPrefs.hairStyle !== "bald" && (
                  <SwatchRow
                    label="Cor"
                    colors={HAIR_COLORS}
                    value={avatarPrefs.hair}
                    onChange={(c) => applyPrefs({ ...avatarPrefs, hair: c })}
                  />
                )}
              </div>

              {/* Regata */}
              <SwatchRow
                label="Regata"
                colors={TOP_COLORS}
                value={avatarPrefs.top}
                onChange={(c) => applyPrefs({ ...avatarPrefs, top: c })}
              />

              {/* Shorts */}
              <SwatchRow
                label="Shorts"
                colors={SHORTS_COLORS}
                value={avatarPrefs.shorts}
                onChange={(c) => applyPrefs({ ...avatarPrefs, shorts: c })}
              />

              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
              >
                Pronto
              </button>
              <p className="text-[10px] text-navy-300 text-center -mt-2">
                Mudanças salvas automaticamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =================================================================
// HELPERS
// =================================================================

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

interface SwatchRowProps {
  label: string;
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
}

function SwatchRow({ label, colors, value, onChange }: SwatchRowProps) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-navy-300 mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const active = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-label={`Cor ${c}`}
              className={`w-9 h-9 rounded-full border-2 transition ${
                active ? "border-brand-lime scale-110" : "border-navy-600 hover:border-navy-400"
              }`}
              style={{ background: c }}
            />
          );
        })}
      </div>
    </div>
  );
}
