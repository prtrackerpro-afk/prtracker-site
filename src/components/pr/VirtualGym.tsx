// Namespace import garante React no escopo runtime pro JSX clássico
// (React.createElement). Default import era removido pelo linter como
// "unused" mesmo sendo necessário em runtime — namespace sempre fica.
import * as React from "react";
const { useEffect, useRef, useState } = React;
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configuratorQuery } from "../../lib/pr/plates";
import { productSlugForExercise, type ExerciseId } from "../../lib/pr/exercises";
import { REELS, type Reel } from "../../lib/pr/gym/reels";
import {
  buildAvatar,
  buildPowerRack,
  buildSquatRack,
  buildPlatform,
  buildHallPedestal,
  buildCeilingBeams,
  buildWallLogo,
  buildSkillsBoard,
  buildRunBoard,
  buildSponsorBooth,
  buildNPC,
  buildStreakPillar,
  buildBench,
  buildDumbbellRack,
  buildKettlebell,
  buildPlateTree,
  buildCableMachine,
  buildTreadmill,
  buildAssaultBike,
  buildRowingMachine,
  buildPlyoBox,
  buildCrossFitRig,
  buildChalkBucket,
  buildWaterBottle,
  buildTowel,
  buildLiftingBelt,
  buildWODBoard,
  buildClock,
  buildMirror,
  buildCinemaRoom,
  buildArcadeRoom,
  STEEL_MAT,
  type SkillBoardSlot,
  type RunSlot,
} from "../../lib/pr/gym/builders";
import {
  SKILL_CATALOG,
  SKILL_TIER_META,
  RUN_CATALOG,
  tierForReps,
  nextTierGoal,
  formatRunTime,
  parseRunTime,
  type SkillId,
  type RunDistance,
} from "../../lib/pr/gym/skills";
import { HALL_EXERCISES, UNLOCK_THRESHOLDS } from "../../lib/pr/gym/hall";
import { exerciseLabel as exerciseLabelFn } from "../../lib/pr/exercises";
import { TIER_META } from "../../lib/pr/strength-score";
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
import {
  loadLayout,
  saveLayout,
  DEFAULT_LAYOUT,
  type GymLayout,
  type GymObjectType,
} from "../../lib/pr/gym/layout";
import {
  playClick,
  playChime,
  playMystery,
  playBell,
  playWhoosh,
  startAmbient,
  stopAmbient,
  setMuted,
} from "../../lib/pr/gym/audio";
import { ParticleBurst, CameraShake } from "../../lib/pr/gym/fx";
import { getProsByType, type ProType } from "../../lib/pr/gym/pros";
import {
  levelFromXp,
  xpToNextLevel,
  type XpBreakdown,
} from "../../lib/pr/gym/xp";

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

interface GhostExercise {
  id: string;
  label: string;
}

interface SponsorSlot {
  id: string;
  title: string;
  professional: {
    name: string;
    specialty: string;
    avatarColor: string;
  } | null;
}

interface Props {
  athleteName: string;
  accent: string;
  trophies: GymTrophy[];
  /** Dias consecutivos com PR/atividade (Duolingo-style). Default 0. */
  streakDays?: number;
  /** Skills do atleta — Map skill_id → reps. Default empty. */
  skills?: Partial<Record<SkillId, number>>;
  /** Run records — Map distance → seconds. Default empty. */
  runs?: Partial<Record<RunDistance, number>>;
  /** Layout do gym salvo no Supabase (SSR). null = usa localStorage / DEFAULT. */
  initialLayout?: GymLayout | null;
  /** XP total acumulado do atleta. */
  xpTotal?: number;
  /**
   * Visit mode (V16): quando true, atleta está visitando ginásio de outro.
   * Desabilita modais de edição (skills/runs save), customização de avatar,
   * editor link. Mostra header "VISITANDO".
   */
  visitMode?: boolean;
}

export default function VirtualGym({
  athleteName,
  accent,
  trophies,
  streakDays = 0,
  skills = {},
  runs = {},
  initialLayout = null,
  xpTotal = 0,
  visitMode = false,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const [selected, setSelected] = useState<GymTrophy | null>(null);
  const [selectedGhost, setSelectedGhost] = useState<GhostExercise | null>(null);
  const [selectedSponsor, setSelectedSponsor] = useState<SponsorSlot | null>(null);
  const [selectedProType, setSelectedProType] = useState<ProType | null>(null);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);
  const [runsModalOpen, setRunsModalOpen] = useState(false);
  const [skillsLocal, setSkillsLocal] = useState<Partial<Record<SkillId, number>>>(skills);
  const [runsLocal, setRunsLocal] = useState<Partial<Record<RunDistance, number>>>(runs);
  const [xpModalOpen, setXpModalOpen] = useState(false);
  const [xpBreakdown, setXpBreakdown] = useState<XpBreakdown | null>(null);
  const [xpLoading, setXpLoading] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
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
    selected !== null ||
    selectedGhost !== null ||
    selectedSponsor !== null ||
    selectedProType !== null ||
    skillsModalOpen ||
    runsModalOpen ||
    xpModalOpen ||
    reelOpen ||
    showTutorial ||
    customOpen;

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

  async function openXpBreakdown() {
    setXpModalOpen(true);
    if (xpBreakdown) return; // já tem cache
    setXpLoading(true);
    try {
      const res = await fetch("/api/pr/xp", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as XpBreakdown;
        setXpBreakdown(data);
      }
    } catch {
      // silent
    } finally {
      setXpLoading(false);
    }
  }

  async function saveSkill(skillId: SkillId, reps: number) {
    if (visitMode) return; // visita não escreve nada
    // Optimistic local update — só substitui se for melhor
    const current = skillsLocal[skillId] ?? 0;
    if (reps <= current) return;
    setSkillsLocal((prev) => ({ ...prev, [skillId]: reps }));
    try {
      const res = await fetch("/api/pr/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_id: skillId, reps }),
      });
      if (!res.ok) {
        // Reverte se falhou
        setSkillsLocal((prev) => ({ ...prev, [skillId]: current }));
      }
    } catch {
      setSkillsLocal((prev) => ({ ...prev, [skillId]: current }));
    }
  }

  async function saveRun(distance: RunDistance, timeSec: number) {
    if (visitMode) return; // visita não escreve nada
    const current = runsLocal[distance];
    if (current != null && timeSec >= current) return;
    setRunsLocal((prev) => ({ ...prev, [distance]: timeSec }));
    try {
      const res = await fetch("/api/pr/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distance, time_sec: timeSec }),
      });
      if (!res.ok) {
        setRunsLocal((prev) => {
          const next = { ...prev };
          if (current == null) delete next[distance];
          else next[distance] = current;
          return next;
        });
      }
    } catch {
      setRunsLocal((prev) => {
        const next = { ...prev };
        if (current == null) delete next[distance];
        else next[distance] = current;
        return next;
      });
    }
  }

  useEffect(() => {
    const mountMaybe = mountRef.current;
    if (!mountMaybe) return;
    const mount: HTMLDivElement = mountMaybe;

    // === Layout — carrega posições editáveis ==========================
    // Prioridade: prop initialLayout (SSR Supabase) > localStorage
    // > DEFAULT_LAYOUT. Sincroniza localStorage com a fonte canônica
    // pra próxima carga ser instant (cache).
    let layout = initialLayout ?? loadLayout();
    if (initialLayout) {
      // Cache local pra próxima visita ser instant
      saveLayout(initialLayout);
    }
    // Se localStorage tinha algo mas server retornou null, mantemos
    // localStorage (atleta pode estar editando offline).
    if (!initialLayout && layout === DEFAULT_LAYOUT) {
      layout = loadLayout();
    }
    const defaultByType = new Map(
      DEFAULT_LAYOUT.objects.map((o) => [o.type, o]),
    );
    const lo = (type: GymObjectType) => {
      const found = layout.objects.find((o) => o.type === type);
      return found ?? defaultByType.get(type) ?? { x: 0, z: 0, rot: 0 };
    };

    // === Scene + renderer ==========================================
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#01002A");
    // V16.7 cycle 42: fog ajustada pro mapa dobrado (era 16-32, agora 25-50)
    // Antes objetos do fundo desapareciam por estar dentro do raio fog.
    scene.fog = new THREE.Fog("#01002A", 25, 55);

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
    renderer.toneMappingExposure = 1.5;
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

    // === FX system (particles + camera shake) ====================
    const particleBurst = new ParticleBurst(400);
    scene.add(particleBurst.points);
    const cameraShake = new CameraShake();

    // === Audio init (lazy — primeiro pointerdown ativa) ==========
    const onFirstInteraction = () => {
      // Apenas garante AudioContext criado pra próximas chamadas
      playClick();
      // Inicia ambient hum sutil
      startAmbient();
      window.removeEventListener("pointerdown", onFirstInteraction);
    };
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });

    // === Lighting BRIGHT modern showroom + Hall em destaque =========
    // V7 dark theatre falhou — fitness app precisa ser bright + acolhedor.
    // Volta pra modern showroom: ambient generoso + key + fill brancos +
    // SPOTS extras nos pedestais (track lighting MAIS forte) +
    // follow spot accent no avatar.
    // V16.6 cycle 10: ambient boost + shadow camera ampliada pro mapa dobrado
    const hemi = new THREE.HemisphereLight(0xeaf0ff, 0x1a1640, 1.1);
    scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xc8cfe0, 0.8);
    scene.add(ambient);

    // Key light forte branca quente (sol) — shadow camera 2x maior pro mapa dobrado
    const keyLight = new THREE.DirectionalLight(0xfff5e0, 1.8);
    keyLight.position.set(8, 14, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Fill cool branco-azulado oposto
    const fillLight = new THREE.DirectionalLight(0xb8c8ff, 0.9);
    fillLight.position.set(-5, 7, 4);
    scene.add(fillLight);

    // Rim atrás (pra silhueta do avatar e dos pedestais)
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(0, 5, -8);
    scene.add(rim);

    // Avatar follow spot sutil (não dominante mas highlights o avatar)
    const avatarSpot = new THREE.SpotLight(0xffffff, 1.0, 18, Math.PI / 4, 0.6, 1.0);
    avatarSpot.position.set(0, 7, 6);
    scene.add(avatarSpot);
    scene.add(avatarSpot.target);

    // V16.7 cycle 46: ambient dust particles — 350 motes (era 200) pra
    // mais atmosfera no mapa dobrado.
    const dustCount = 350;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustVelocities = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      // Espalha pelo gym todo (38m × 8m alto × 34m)
      dustPositions[i * 3] = (Math.random() - 0.5) * 38;
      dustPositions[i * 3 + 1] = Math.random() * 6 + 0.5;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      // Velocidade lenta vertical + sway horizontal
      dustVelocities[i * 3] = (Math.random() - 0.5) * 0.05;
      dustVelocities[i * 3 + 1] = -0.04 - Math.random() * 0.03;
      dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xfff5e0,
      size: 0.04,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dustParticles = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dustParticles);

    // === Sala (chão escuro + 3 paredes navy near-black) ============
    // V16.7 cycle 24: paredes com cor LEVEMENTE mais clara (0x0a0a18 → 0x12121e)
    // pra dar contraste com objetos escuros à frente. Ainda fica navy.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x12121e,
      roughness: 0.95,
      metalness: 0.02,
    });
    // V16.8 cycle 97: floor com textura procedural mais rica — grid 1m
    // + sub-grid 0.5m + scuff marks (riscos) pra parecer piso usado de
    // box, não apenas grid plano.
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fctxFloor = floorCanvas.getContext("2d")!;
    // Base
    fctxFloor.fillStyle = "#0a0a14";
    fctxFloor.fillRect(0, 0, 512, 512);
    // Sub-grid 0.5m (linhas mais finas)
    fctxFloor.strokeStyle = "#14141e";
    fctxFloor.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) {
      fctxFloor.beginPath();
      fctxFloor.moveTo(i, 0);
      fctxFloor.lineTo(i, 512);
      fctxFloor.stroke();
      fctxFloor.beginPath();
      fctxFloor.moveTo(0, i);
      fctxFloor.lineTo(512, i);
      fctxFloor.stroke();
    }
    // Grid principal 1m (linhas mais visíveis)
    fctxFloor.strokeStyle = "#1f1f30";
    fctxFloor.lineWidth = 1.5;
    for (let i = 0; i <= 512; i += 64) {
      fctxFloor.beginPath();
      fctxFloor.moveTo(i, 0);
      fctxFloor.lineTo(i, 512);
      fctxFloor.stroke();
      fctxFloor.beginPath();
      fctxFloor.moveTo(0, i);
      fctxFloor.lineTo(512, i);
      fctxFloor.stroke();
    }
    // Speckle (granulado de borracha)
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      fctxFloor.fillStyle = `rgba(40, 40, 60, ${Math.random() * 0.3})`;
      fctxFloor.fillRect(x, y, 2, 2);
    }
    // Scuff marks (riscos sutis pra parecer piso usado)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const len = 8 + Math.random() * 24;
      const ang = Math.random() * Math.PI * 2;
      fctxFloor.strokeStyle = `rgba(80, 80, 95, ${0.05 + Math.random() * 0.1})`;
      fctxFloor.lineWidth = 1;
      fctxFloor.beginPath();
      fctxFloor.moveTo(x, y);
      fctxFloor.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      fctxFloor.stroke();
    }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 8); // 36x32m / 4.5m square = 8x repeats
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0x6a6a7a,
      roughness: 0.88,
      metalness: 0.1,
    });

    // V15: gym dobrou em area pra caber novos equipamentos.
    // Bounds em layout.ts: x ∈ [-18,+18], z ∈ [-16,+16].
    const ROOM_W = 36;
    const ROOM_D = 32;
    const WALL_H = 7.5;

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

    // V16.8 cycle 98: baseboard (rodapé) onde parede encontra o chão.
    // Banda escura de 0.18m com leve emissive — quebra o vazio entre
    // wall escura e floor escuro, dá profundidade arquitetônica.
    const baseboardMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c2a,
      roughness: 0.7,
      metalness: 0.2,
      emissive: 0x05050a,
      emissiveIntensity: 0.3,
    });
    const baseboardH = 0.18;
    const backBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W, baseboardH, 0.04),
      baseboardMat
    );
    backBaseboard.position.set(0, baseboardH / 2, -ROOM_D / 2 + 0.02);
    scene.add(backBaseboard);
    const leftBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, baseboardH, ROOM_D),
      baseboardMat
    );
    leftBaseboard.position.set(-ROOM_W / 2 + 0.02, baseboardH / 2, 0);
    scene.add(leftBaseboard);
    const rightBaseboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, baseboardH, ROOM_D),
      baseboardMat
    );
    rightBaseboard.position.set(ROOM_W / 2 - 0.02, baseboardH / 2, 0);
    scene.add(rightBaseboard);

    // V16.8 cycle 99: corner posts (estructural) onde paredes se encontram.
    // Coluna escura vertical com accent lime na base — define o canto do
    // ginásio em vez do plano "infinity wall".
    const cornerPostMat = new THREE.MeshStandardMaterial({
      color: 0x16162a,
      roughness: 0.65,
      metalness: 0.25,
      emissive: 0x0a0a18,
      emissiveIntensity: 0.4,
    });
    for (const cx of [-ROOM_W / 2 + 0.06, ROOM_W / 2 - 0.06]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, WALL_H, 0.12),
        cornerPostMat
      );
      post.position.set(cx, WALL_H / 2, -ROOM_D / 2 + 0.06);
      scene.add(post);
      // Accent lime band na base do post
      const postBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.04, 0.14),
        new THREE.MeshBasicMaterial({ color: accentColor })
      );
      postBand.position.set(cx, 0.22, -ROOM_D / 2 + 0.06);
      scene.add(postBand);
    }

    // === WALL LOGO gigante ATRAS dos troféus =======================
    // "PR TRACKER · HALL OF FAME" ocupando ~10m de largura na parede.
    // Domina a parede do fundo como num CrossFit box real.
    // Logo wall PR TRACKER em lime brand (#D8FF2C). Subtitle com
    // tier global do atleta (ex: "AVANÇADO" — identidade pessoal).
    // Tier vem dos trofeus: pega o de maior rank ou usa "ATLETA" default.
    const tierNames = trophies.map((t) => {
      // reverse-lookup tier por cor
      const entry = Object.values(TIER_META).find((meta) => meta.color === t.color);
      return entry?.label ?? "Atleta";
    });
    const tierByRank = (name: string) =>
      Object.values(TIER_META).find((m) => m.label === name)?.rank ?? 0;
    const topTier = tierNames.sort((a, b) => tierByRank(b) - tierByRank(a))[0] ?? "ATLETA";
    const headerSubtitle = topTier.toUpperCase();

    // V16.8 cycle 101: logo MENOR (era 9 de largura → 7) + posicionado
    // mais baixo (WALL_H - 3.2 → centro 4.3) pra não passar do trim/track
    // rail no teto e ficar inteiramente visível na parede.
    const wallLogo = buildWallLogo(7, "#D8FF2C", headerSubtitle);
    wallLogo.position.set(0, WALL_H - 3.2, -ROOM_D / 2 + 0.04);
    scene.add(wallLogo);

    // Subtítulo com NOME do atleta abaixo do logo (proeminente)
    const subPlaqueCanvas = document.createElement("canvas");
    subPlaqueCanvas.width = 2048;
    subPlaqueCanvas.height = 256;
    const sptx = subPlaqueCanvas.getContext("2d")!;
    sptx.clearRect(0, 0, 2048, 256);
    sptx.fillStyle = "#ffffff";
    sptx.font = "900 130px Archivo Black, Inter, sans-serif";
    sptx.textAlign = "center";
    sptx.textBaseline = "middle";
    sptx.fillText(athleteName.toUpperCase(), 1024, 128);
    const subTex = new THREE.CanvasTexture(subPlaqueCanvas);
    subTex.colorSpace = THREE.SRGBColorSpace;
    const subPlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 0.8),
      new THREE.MeshBasicMaterial({ map: subTex, transparent: true })
    );
    // V16.8 cycle 101: subPlaque também desce (logo desceu 1.2)
    subPlaque.position.set(0, WALL_H - 5.2, -ROOM_D / 2 + 0.05);
    scene.add(subPlaque);

    // === HALL OF FAME V7 ==========================================
    // 11 pedestais individuais (HALL_EXERCISES), cada um com SPOT
    // próprio de teto. Pedestais "ghost" pros exercícios não-PR'ed,
    // pedestais ativos com plate split + LED stripe + plaqueta.
    // Inspirado no Palmeiras "Decacampeão Brasileiro".

    // Build trophyByExercise lookup
    const trophyByExercise = new Map<string, GymTrophy>();
    for (const t of trophies) {
      trophyByExercise.set(t.exerciseId, t);
    }

    const trophiesGroup = new THREE.Group();
    scene.add(trophiesGroup);
    const ledStripes: THREE.Mesh[] = []; // pra animação pulse

    // Plataforma elevada (carpete escuro + faixa lime na frente)
    // V15: largura fixa 17m (não escala com ROOM_W) — pedestais ficariam
    // muito espaçados se usássemos toda a largura do gym dobrado.
    const fameDeckW = Math.min(ROOM_W - 1.4, 17);
    const fameDeckD = 1.4;
    const fameDeck = new THREE.Mesh(
      new THREE.BoxGeometry(fameDeckW, 0.18, fameDeckD),
      new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.65, metalness: 0.3 })
    );
    fameDeck.position.set(0, 0.09, -ROOM_D / 2 + 0.95);
    fameDeck.receiveShadow = true;
    scene.add(fameDeck);

    // Faixa lime na frente do deck (linha de demarcação) — V16.7 cycle 47:
    // mais grossa + emissive pra brilhar como fita LED de chão
    const fameStrip = new THREE.Mesh(
      new THREE.BoxGeometry(fameDeckW, 0.08, 0.08),
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 1.5,
      })
    );
    fameStrip.position.set(0, 0.22, -ROOM_D / 2 + 1.65);
    scene.add(fameStrip);

    // Carpet visual estilo museum (Palmeiras Verde) — leve glow accent
    const carpetMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.08,
    });
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(fameDeckW + 0.4, fameDeckD + 0.6),
      carpetMat
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.005, -ROOM_D / 2 + 1.2);
    scene.add(carpet);

    // 11 pedestais — espaçamento calculado pra caber em fameDeckW
    const SLOT_W = fameDeckW / HALL_EXERCISES.length; // ≈ 1.51m
    const startX = -fameDeckW / 2 + SLOT_W / 2;
    const pedestalSpots: THREE.SpotLight[] = []; // track lighting

    HALL_EXERCISES.forEach((exId, i) => {
      const t = trophyByExercise.get(exId);
      const exLabel = exerciseLabelFn(exId);
      const exShort = exLabel.length > 14 ? exLabel.slice(0, 12) + "…" : exLabel;
      const tierColorHex = t?.color ?? "#5a5a64";
      // Reverse-lookup do tier name a partir da cor
      const tierEntry = t
        ? Object.values(TIER_META).find((m) => m.color === t.color)
        : null;
      const tierName = tierEntry?.label ?? null;
      const x = startX + i * SLOT_W;

      const ped = buildHallPedestal({
        exerciseLabel: exLabel,
        exerciseShort: exShort,
        weightKg: t?.weightKg ?? null,
        tierColorHex,
        tierName,
        hasUnlocked: !!t,
      });
      ped.group.position.set(x, 0.18, -ROOM_D / 2 + 1.0);
      // Tag userData no hitBox pra raycast
      if (t) {
        ped.hitBox.userData.trophy = t;
      } else {
        ped.hitBox.userData.ghostExercise = { id: exId, label: exLabel };
      }
      trophiesGroup.add(ped.group);

      if (ped.ledStripe) ledStripes.push(ped.ledStripe);

      // Track lighting individual: spot do teto pra cada pedestal.
      // V15.1: intensidade +60% (1.4→2.2) e ângulo +20% (π/9→π/7) pro
      // troféu ficar bem destacado mesmo com mapa maior. Pedestal vazio
      // (ghost) também ficou mais visível (0.4→0.7) pra ler o nome.
      const trackSpot = new THREE.SpotLight(
        t ? 0xffffff : 0x6a7888,
        t ? 2.2 : 0.7,
        9,
        Math.PI / 7,
        0.3,
        1.0
      );
      trackSpot.position.set(x, WALL_H - 0.4, -ROOM_D / 2 + 1.0);
      trackSpot.target.position.set(x, 0.18, -ROOM_D / 2 + 1.0);
      scene.add(trackSpot);
      scene.add(trackSpot.target);
      pedestalSpots.push(trackSpot);

      // Track light visible body (pequena luminária no teto)
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.1, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4, metalness: 0.6 })
      );
      track.position.set(x, WALL_H - 0.06, -ROOM_D / 2 + 1.0);
      scene.add(track);

      // Lente da track light em cor accent emissiva.
      const trackLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.07, 12),
        new THREE.MeshStandardMaterial({
          color: t ? 0xfff2c8 : 0x6a7888,
          emissive: t ? 0xfff2c8 : 0x6a7888,
          emissiveIntensity: t ? 1.5 : 0.35,
        })
      );
      trackLens.position.set(x, WALL_H - 0.18, -ROOM_D / 2 + 1.0);
      scene.add(trackLens);

      // V16.8 cycle 68: light cone MAIS SUTIL (era 0.5 raio, agora 0.25;
      // opacity 0.08 → 0.04). Antes domínio o fundo do gym.
      if (t) {
        const lightCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, WALL_H - 0.5, 10, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xfff2c8,
            transparent: true,
            opacity: 0.04,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
        );
        lightCone.position.set(x, (WALL_H - 0.5) / 2 + 0.5, -ROOM_D / 2 + 1.0);
        scene.add(lightCone);
      }
    });

    // Track rail no teto conectando todas as luminárias
    // V16.8 cycle 93: cor mais clara + emissive sutil
    const trackRail = new THREE.Mesh(
      new THREE.BoxGeometry(fameDeckW + 0.4, 0.04, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x3a3a4a,
        roughness: 0.4,
        metalness: 0.7,
        emissive: 0x1a1a26,
        emissiveIntensity: 0.2,
      })
    );
    trackRail.position.set(0, WALL_H - 0.02, -ROOM_D / 2 + 1.0);
    scene.add(trackRail);

    // Conta troféus desbloqueados pra gamificação
    const unlockedCount = trophies.length;
    const showLedPulse = unlockedCount >= UNLOCK_THRESHOLDS.ledPulse;
    const showLaserCross = unlockedCount >= UNLOCK_THRESHOLDS.laserCross;
    const showAvatarAura = unlockedCount >= UNLOCK_THRESHOLDS.avatarAura;

    // Laser cross unlocking (6+ troféus): 2 lasers cruzando o teto
    let laserBeams: THREE.Mesh[] = [];
    if (showLaserCross) {
      const laserMat1 = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.45,
      });
      const laserMat2 = new THREE.MeshBasicMaterial({
        color: 0xff44aa,
        transparent: true,
        opacity: 0.45,
      });
      const laser1 = new THREE.Mesh(
        new THREE.BoxGeometry(fameDeckW * 1.2, 0.02, 0.02),
        laserMat1
      );
      laser1.position.set(0, WALL_H - 0.5, -ROOM_D / 2 + 1.5);
      laser1.rotation.z = 0.04;
      scene.add(laser1);
      laserBeams.push(laser1);

      const laser2 = new THREE.Mesh(
        new THREE.BoxGeometry(fameDeckW * 1.2, 0.02, 0.02),
        laserMat2
      );
      laser2.position.set(0, WALL_H - 0.55, -ROOM_D / 2 + 1.5);
      laser2.rotation.z = -0.04;
      scene.add(laser2);
      laserBeams.push(laser2);
    }

    // V7: Projetor removido — Reels acessível direto pelo botão 🎬
    // do HUD (top-right). Stage limpo, focado no Hall of Fame.

    // === Equipment minimalista (flanqueia o stage em shadow) ======
    const colliders: AABB[] = [];

    // CEILING BEAMS sutis (estrutura industrial discreta)
    const ceilingBeams = buildCeilingBeams(ROOM_W, ROOM_D, WALL_H);
    scene.add(ceilingBeams);

    // POWER RACK lado esquerdo, em shadow (apenas com dim spot)
    const powerRackPos = lo("power_rack");
    const powerRack = buildPowerRack(accent);
    powerRack.position.set(powerRackPos.x, 0, powerRackPos.z);
    powerRack.rotation.y = powerRackPos.rot + Math.PI / 8;
    powerRack.userData.playExercise = "squat";
    scene.add(powerRack);
    colliders.push({ cx: powerRackPos.x, cz: powerRackPos.z, hw: 1.0, hd: 1.0 });

    // PLATAFORMA de levantamento — recua um pouco e gira menos pra
    // não ultrapassar a parede direita.
    const platformPos = lo("platform");
    const platform = buildPlatform(accent);
    platform.position.set(platformPos.x, 0, platformPos.z);
    platform.rotation.y = platformPos.rot - Math.PI / 14;
    scene.add(platform);
    // Plataforma é baixa (6cm), avatar pisa em cima.

    // V16.8 cycles 166-175: detalhes ambientais espalhados pelo gym
    // Chalk bucket no canto da plataforma
    const chalkBucket = buildChalkBucket();
    chalkBucket.position.set(platformPos.x + 1.6, 0, platformPos.z - 1.4);
    scene.add(chalkBucket);
    // Garrafa d'água perto do power rack
    const bottle1 = buildWaterBottle(0xda291c);
    bottle1.position.set(powerRackPos.x + 0.9, 0, powerRackPos.z + 0.5);
    scene.add(bottle1);
    const bottle2 = buildWaterBottle(0x0057b8);
    bottle2.position.set(powerRackPos.x - 0.9, 0, powerRackPos.z + 0.4);
    scene.add(bottle2);
    // Toalha pendurada perto do bench (vai usar bench position quando renderizado)
    const towel1 = buildTowel(0xda291c);
    towel1.position.set(powerRackPos.x + 0.7, 0.55, powerRackPos.z - 0.6);
    scene.add(towel1);
    // Cinto de levantamento perto do power rack
    const belt = buildLiftingBelt();
    belt.position.set(powerRackPos.x - 0.7, 0.35, powerRackPos.z - 0.8);
    belt.rotation.y = 0.5;
    scene.add(belt);

    // V16.8 Fase 3: Sala de cinema anexa ao gym (canto sudoeste, fora da plataforma)
    const cinemaRoom = buildCinemaRoom(athleteName);
    cinemaRoom.position.set(-ROOM_W / 2 + 4, 0, ROOM_D / 2 - 4);
    cinemaRoom.rotation.y = Math.PI / 4;
    cinemaRoom.userData.hotspot = "cinema";
    scene.add(cinemaRoom);

    // V16.8 PR2: Sala de Fliperama ao lado do cinema (mesmo eixo, deslocada)
    const arcadeRoom = buildArcadeRoom();
    arcadeRoom.position.set(-ROOM_W / 2 + 10, 0, ROOM_D / 2 - 5.5);
    arcadeRoom.rotation.y = Math.PI / 4;
    arcadeRoom.userData.hotspot = "arcade";
    scene.add(arcadeRoom);

    // V16.8 PR3 cycles 14-20: 5 portais clicáveis no chão pra navegar
    // Diet (verde), Coach (azul), Achievements (dourado), Eventos (vermelho), Log (lime)
    const hotspotPortals: THREE.Group[] = [];
    const PORTAL_DEFS: Array<{
      id: string;
      label: string;
      sublabel: string;
      color: number;
      x: number;
      z: number;
    }> = [
      { id: "diet", label: "DIETA", sublabel: "Macros", color: 0x43b02a, x: 8, z: 6 },
      { id: "coach", label: "COACH", sublabel: "PT/Nutri", color: 0x0057b8, x: 11, z: 6 },
      { id: "achievements", label: "TROFEUS", sublabel: "Conquistas", color: 0xffc72c, x: 14, z: 6 },
      { id: "eventos", label: "EVENTOS", sublabel: "Competicoes", color: 0xda291c, x: 8, z: 9 },
      { id: "log", label: "REGISTRAR", sublabel: "Novo PR", color: 0xd8ff2c, x: 14, z: 9 },
    ];
    for (const p of PORTAL_DEFS) {
      const portal = new THREE.Group();
      portal.position.set(p.x, 0, p.z);
      portal.userData.hotspot = p.id;

      // Disco lime no chão (radius 0.7)
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.04, 24),
        new THREE.MeshStandardMaterial({
          color: p.color,
          roughness: 0.4,
          emissive: p.color,
          emissiveIntensity: 0.6,
          transparent: true,
          opacity: 0.85,
        })
      );
      disc.position.y = 0.02;
      portal.add(disc);

      // Anel externo (ring)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.03, 8, 32),
        new THREE.MeshBasicMaterial({ color: p.color })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      portal.add(ring);

      // Beam vertical (cone com aditivo)
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 2.5, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: p.color,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      beam.position.y = 1.3;
      beam.rotation.x = Math.PI;
      portal.add(beam);

      // Sign canvas com label
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512;
      labelCanvas.height = 192;
      const lctx = labelCanvas.getContext("2d")!;
      lctx.fillStyle = "rgba(1,0,42,0.9)";
      lctx.fillRect(0, 0, 512, 192);
      lctx.strokeStyle = "#" + p.color.toString(16).padStart(6, "0");
      lctx.lineWidth = 6;
      lctx.strokeRect(8, 8, 496, 176);
      lctx.fillStyle = "#" + p.color.toString(16).padStart(6, "0");
      lctx.font = "900 70px Archivo Black, Inter, sans-serif";
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.fillText(p.label, 256, 75);
      lctx.fillStyle = "#ffffff";
      lctx.font = "500 38px Inter, sans-serif";
      lctx.fillText(p.sublabel, 256, 140);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.6),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, depthTest: false })
      );
      sign.position.y = 2.8;
      sign.renderOrder = 998;
      sign.userData.isBillboard = true; // pra animar facing camera
      portal.add(sign);

      scene.add(portal);
      hotspotPortals.push(portal);
    }

    // V16.8 cycles 213-216: WOD board + relógio + espelhos na parede esquerda
    const wodBoard = buildWODBoard();
    wodBoard.position.set(-ROOM_W / 2 + 0.06, 2.0, ROOM_D / 4);
    wodBoard.rotation.y = Math.PI / 2;
    scene.add(wodBoard);

    // Relógio (3 unidades — 1 em cada parede principal)
    const clock1 = buildClock();
    clock1.position.set(0, 5.0, -ROOM_D / 2 + 0.06);
    scene.add(clock1);
    const clock2 = buildClock();
    clock2.position.set(-ROOM_W / 2 + 0.06, 5.0, -ROOM_D / 4);
    clock2.rotation.y = Math.PI / 2;
    scene.add(clock2);
    const clock3 = buildClock();
    clock3.position.set(ROOM_W / 2 - 0.06, 5.0, -ROOM_D / 4);
    clock3.rotation.y = -Math.PI / 2;
    scene.add(clock3);

    // Espelhos full-length (4 unidades — parede esquerda + direita)
    for (let i = 0; i < 2; i++) {
      const ml = buildMirror();
      ml.position.set(-ROOM_W / 2 + 0.06, 1.2, -ROOM_D / 4 + i * 1.4);
      ml.rotation.y = Math.PI / 2;
      scene.add(ml);
    }
    for (let i = 0; i < 2; i++) {
      const mr = buildMirror();
      mr.position.set(ROOM_W / 2 - 0.06, 1.2, ROOM_D / 6 + i * 1.4);
      mr.rotation.y = -Math.PI / 2;
      scene.add(mr);
    }

    // FLOOR MARKING — caminho central com track lights
    // V16.8 cycle 75: opacity 0.15 → 0.2 (mais convidativo) + tapete com gradient sim
    const aisle = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, ROOM_D - 3),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.2,
      })
    );
    aisle.rotation.x = -Math.PI / 2;
    aisle.position.set(0, 0.003, -1);
    scene.add(aisle);

    // Linha central + 2 laterais marcando os limites do aisle
    for (const lx of [-1.1, 0, 1.1]) {
      const aisleLine = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, ROOM_D - 3),
        new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: lx === 0 ? 0.6 : 0.7,
        })
      );
      aisleLine.rotation.x = -Math.PI / 2;
      aisleLine.position.set(lx, 0.005, -1);
      scene.add(aisleLine);
    }

    // === SPONSOR BOOTHS (entrada) ==================================
    // 3 kiosks comerciais perto da entrada — Nutricionista + Personal
    // Trainer + slot vago "ANUNCIE AQUI". Slot pago (R$ 99/mês) onde
    // profissionais fitness podem aparecer pros atletas. Click abre
    // modal com bio + CTA WhatsApp.
    const sponsorsGroup = new THREE.Group();
    scene.add(sponsorsGroup);

    /**
     * Helper: posiciona NPC AO LADO do balcão (booth-local +x, fora da
     * largura do banner). Garante visibilidade de qualquer ângulo de
     * câmera, independente de banner/sign occlusion.
     *
     * Local offset (sideX, 0, 0) rotacionado por θ:
     *   world.x = boothX + sideX * cos(θ)
     *   world.z = boothZ - sideX * sin(θ)
     */
    function npcBesideBooth(boothX: number, boothZ: number, rot: number, sideX = 1.3) {
      return {
        x: boothX + sideX * Math.cos(rot),
        z: boothZ - sideX * Math.sin(rot),
      };
    }

    const nutriBooth = buildSponsorBooth({
      title: "NUTRICIONISTA",
      professional: {
        name: "Camila",
        specialty: "Nutrição esportiva · CRN/RS",
        avatarColor: "#43B02A",
      },
      accentHex: "#43B02A",
      slotId: "nutri",
      theme: "nutri",
    });
    const nutriPos = lo("nutri_booth");
    nutriBooth.group.position.set(nutriPos.x, 0, nutriPos.z);
    nutriBooth.group.rotation.y = nutriPos.rot;
    sponsorsGroup.add(nutriBooth.group);
    colliders.push({ cx: nutriPos.x, cz: nutriPos.z, hw: 0.6, hd: 1.0 });

    // NPC Camila atrás do balcão, virada pra customer (mesma direção do booth)
    const nutriNPC = buildNPC({
      skinHex: "#e0b18a",
      hairHex: "#5e3a1f",
      topHex: "#43B02A",
      shortsHex: "#1e1b50",
      gender: "female",
      initial: "C",
      outfit: "labcoat",
      nameTag: "Camila · Nutri",
    });
    const nutriNpcPos = npcBesideBooth(nutriPos.x, nutriPos.z, nutriPos.rot, 2.0);
    nutriNPC.group.position.set(nutriNpcPos.x, 0, nutriNpcPos.z);
    // NPC olha PRA FRENTE (direção do booth front = booth.rot)
    nutriNPC.group.rotation.y = nutriPos.rot;
    nutriNPC.group.userData.npcSlot = "nutri";
    nutriNPC.group.traverse((c) => {
      c.userData.npcSlot = "nutri";
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
    sponsorsGroup.add(nutriNPC.group);
    // Spotlight direto na cabeça do NPC pra garantir visibilidade
    const nutriSpot = new THREE.SpotLight(0xffffff, 1.5, 6, Math.PI / 4, 0.4, 1.0);
    nutriSpot.position.set(nutriNpcPos.x, 4, nutriNpcPos.z);
    const nutriSpotTarget = new THREE.Object3D();
    nutriSpotTarget.position.set(nutriNpcPos.x, 1.8, nutriNpcPos.z);
    scene.add(nutriSpotTarget);
    nutriSpot.target = nutriSpotTarget;
    scene.add(nutriSpot);

    const npcAnimRefs: Array<{ head: THREE.Group; body: THREE.Group; phase: number }> = [
      { head: nutriNPC.head, body: nutriNPC.body, phase: 0 },
    ];

    const ptBooth = buildSponsorBooth({
      title: "PERSONAL TRAINER",
      professional: {
        name: "Bruno",
        specialty: "Powerlifting · CREF 12345-G",
        avatarColor: "#DA291C",
      },
      accentHex: "#D8FF2C",
      slotId: "pt",
      theme: "personal",
    });
    const ptPos = lo("personal_booth");
    ptBooth.group.position.set(ptPos.x, 0, ptPos.z);
    ptBooth.group.rotation.y = ptPos.rot;
    sponsorsGroup.add(ptBooth.group);
    colliders.push({ cx: ptPos.x, cz: ptPos.z, hw: 0.6, hd: 1.0 });

    // NPC Bruno atrás do balcão
    const ptNPC = buildNPC({
      skinHex: "#c08a5e",
      hairHex: "#1a1410",
      topHex: "#DA291C", // muscle tank vermelho — contraste alto contra navy bg
      shortsHex: "#111111",
      gender: "male",
      initial: "B",
      outfit: "athletic",
      nameTag: "Bruno · Personal",
    });
    const ptNpcPos = npcBesideBooth(ptPos.x, ptPos.z, ptPos.rot, 2.0);
    ptNPC.group.position.set(ptNpcPos.x, 0, ptNpcPos.z);
    ptNPC.group.rotation.y = ptPos.rot;
    ptNPC.group.userData.npcSlot = "pt";
    ptNPC.group.traverse((c) => {
      c.userData.npcSlot = "pt";
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
    sponsorsGroup.add(ptNPC.group);
    // Spotlight direto na cabeça do PT NPC
    const ptSpot = new THREE.SpotLight(0xffffff, 1.5, 6, Math.PI / 4, 0.4, 1.0);
    ptSpot.position.set(ptNpcPos.x, 4, ptNpcPos.z);
    const ptSpotTarget = new THREE.Object3D();
    ptSpotTarget.position.set(ptNpcPos.x, 1.8, ptNpcPos.z);
    scene.add(ptSpotTarget);
    ptSpot.target = ptSpotTarget;
    scene.add(ptSpot);

    npcAnimRefs.push({ head: ptNPC.head, body: ptNPC.body, phase: 1.5 });

    const emptyBooth = buildSponsorBooth({
      title: "ANUNCIE AQUI",
      professional: null,
      accentHex: "#D8FF2C",
      slotId: "empty",
    });
    const emptyPos = lo("empty_booth");
    emptyBooth.group.position.set(emptyPos.x, 0, emptyPos.z);
    emptyBooth.group.rotation.y = emptyPos.rot;
    sponsorsGroup.add(emptyBooth.group);
    colliders.push({ cx: emptyPos.x, cz: emptyPos.z, hw: 0.6, hd: 1.0 });

    // === STREAK PILLAR (Duolingo-style fogo de frequência) =========
    // Posicionado na entrada (perto do avatar) pra ser visto direto
    // ao entrar no gym. Click → modal de detalhe.
    const streakPillarParts = buildStreakPillar(streakDays);
    const streakPos = lo("streak_pillar");
    streakPillarParts.group.position.set(streakPos.x, 0, streakPos.z);
    streakPillarParts.group.rotation.y = streakPos.rot;
    streakPillarParts.group.userData.kind = "streak-pillar";
    streakPillarParts.hitBox.userData.kind = "streak-pillar";
    scene.add(streakPillarParts.group);
    colliders.push({ cx: streakPos.x, cz: streakPos.z, hw: 0.7, hd: 0.7 });
    const streakFlameRef = streakPillarParts.flame;

    // === SKILLS BOARD — angulado pro aisle central (visível andando) ===
    // Cada skill mostra reps + tier badge (Bronze/Prata/Ouro/Diamante).
    const skillsSlots: SkillBoardSlot[] = SKILL_CATALOG.map((s) => ({
      id: s.id,
      short: s.short,
      label: s.label,
      bestReps: skillsLocal[s.id] ?? 0,
    }));
    const skillsPos = lo("skills_board");
    const skillsBoardParts = buildSkillsBoard("#D8FF2C", skillsSlots);
    skillsBoardParts.group.position.set(skillsPos.x, 2.0, skillsPos.z);
    skillsBoardParts.group.rotation.y = skillsPos.rot;
    scene.add(skillsBoardParts.group);

    // Pernas do skills stand (2 colunas verticais sob o board)
    for (const dx of [-1.6, 1.6]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.2, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.6, metalness: 0.4 })
      );
      const px = skillsPos.x + dx * Math.cos(skillsPos.rot);
      const pz = skillsPos.z + dx * Math.sin(skillsPos.rot);
      leg.position.set(px, 0.6, pz);
      scene.add(leg);
    }

    // === RUN BOARD — também angulado pro aisle ====================
    const runsSlots: RunSlot[] = RUN_CATALOG.map((r) => ({
      id: r.id,
      distance: r.short,
      label: r.label,
      bestTimeSec: runsLocal[r.id] ?? null,
    }));
    const runPos = lo("run_board");
    const runBoardParts = buildRunBoard("#D8FF2C", runsSlots);
    runBoardParts.group.position.set(runPos.x, 2.2, runPos.z);
    runBoardParts.group.rotation.y = runPos.rot;
    scene.add(runBoardParts.group);

    // Pernas do run stand
    for (const dx of [-1.6, 1.6]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.4, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.6, metalness: 0.4 })
      );
      const px = runPos.x + dx * Math.cos(runPos.rot);
      const pz = runPos.z + dx * Math.sin(runPos.rot);
      leg.position.set(px, 0.7, pz);
      scene.add(leg);
    }

    // === PROJECTOR ROOM (V15 — sofá virado pra tela) ===============
    // Antes: sofá rotacionado 90° errado em relação à tela ("TV nem
    // da pra ver"). Agora: tudo é montado dentro de um Group orientado
    // pelo layout (lo("projector_room").rot), com tela frontal e sofá
    // a 2.5m de distância apontado pra ela.
    //
    // Geometria interna do grupo (rot=0 → tela aponta pra +x da sala):
    //   tela em x=-2.5, virada pro centro do grupo
    //   projetor pendurado em (0, ALTO, 0) apontando pra tela
    //   sofá em x=+1.0 virado pra -x (pra tela)
    const projRoomGroup = new THREE.Group();
    const projRoomPos = lo("projector_room");
    projRoomGroup.position.set(projRoomPos.x, 0, projRoomPos.z);
    projRoomGroup.rotation.y = projRoomPos.rot;
    scene.add(projRoomGroup);

    // Canvas da tela (regenerado a cada frame por drawProjectorScreen)
    const projScreenCanvas = document.createElement("canvas");
    projScreenCanvas.width = 1280;
    projScreenCanvas.height = 720;
    const psctx = projScreenCanvas.getContext("2d")!;
    const projScreenTex = new THREE.CanvasTexture(projScreenCanvas);
    projScreenTex.colorSpace = THREE.SRGBColorSpace;

    // Frame da tela (faixa preta atrás)
    const projScreenFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 2.4, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.3, metalness: 0.5 })
    );
    projScreenFrame.position.set(-2.5, 2.4, 0);
    projRoomGroup.add(projScreenFrame);

    // Tela (PlaneGeometry, virada pra +x — rot Y = +π/2)
    const projScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2.25),
      new THREE.MeshBasicMaterial({ map: projScreenTex })
    );
    projScreen.position.set(-2.45, 2.4, 0);
    projScreen.rotation.y = Math.PI / 2;
    projScreen.userData.kind = "projector-screen";
    projRoomGroup.add(projScreen);

    // Função pra desenhar conteúdo da tela
    function drawProjectorScreen(t: number, currentReel: Reel | null) {
      const ctx = psctx;
      const w = 1280;
      const h = 720;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#01002A");
      grad.addColorStop(1, "#0a0050");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Sweep lime
      const sx = ((t * 0.18) % 1) * w;
      const lg = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
      lg.addColorStop(0, "rgba(216,255,44,0)");
      lg.addColorStop(0.5, "rgba(216,255,44,0.12)");
      lg.addColorStop(1, "rgba(216,255,44,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      if (currentReel) {
        ctx.fillStyle = "#D8FF2C";
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
        ctx.fillText("▶ TOCANDO", 40, h - 56);
      } else {
        ctx.fillStyle = "#D8FF2C";
        ctx.font = "900 110px Archivo Black, Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PR REELS", w / 2, h / 2 - 30);
        ctx.fillStyle = "#fff";
        ctx.font = "700 36px Inter, sans-serif";
        ctx.fillText("Clica na tela", w / 2, h / 2 + 50);
        ctx.fillStyle = "#9ca3af";
        ctx.font = "500 22px Inter, sans-serif";
        ctx.fillText("Em breve · auto-Reel dos seus PRs", w / 2, h / 2 + 100);
      }
      projScreenTex.needsUpdate = true;
    }

    // Projetor pendurado entre tela e sofá. Tela está em x=-2.5 (parede),
    // sofá está em x=+1.5. Projetor fica a ~x=0 apontando pra tela (-x).
    const PROJ_X = 0.2;
    const PROJ_Y = WALL_H - 0.7;
    const projBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.4, metalness: 0.5 })
    );
    projBody.position.set(PROJ_X, PROJ_Y, 0);
    projRoomGroup.add(projBody);

    // Suporte do teto (haste vertical do teto até o projetor)
    const projMount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8),
      STEEL_MAT
    );
    projMount.position.set(PROJ_X, WALL_H - 0.4, 0);
    projRoomGroup.add(projMount);

    // Lente apontando pra -x (pra tela)
    const projLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.07, 0.08, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff5e0,
        emissive: 0xfff5e0,
        emissiveIntensity: 1.0,
      })
    );
    projLens.rotation.z = Math.PI / 2;
    projLens.position.set(PROJ_X - 0.3, PROJ_Y, 0);
    projRoomGroup.add(projLens);

    // === FEIXE DE LUZ — cone emissivo do projetor até a tela ===
    // Distância projetor → tela: PROJ_X - (-2.5) = 2.7m. Tela tem 4×2.25m.
    // Cone com ápice na lente, base no plano da tela.
    // ConeGeometry: ápice em +y, base em -y. Após rotation.z = -π/2, ápice → +x.
    // Mas queremos ápice em -x (na lente, projetando pra +x... NÃO, projetor
    // aponta pra -x onde está a tela). Então rotation.z = π/2 → ápice em -x.
    const beamLength = PROJ_X - 0.3 - (-2.5); // ~2.7m
    // V16.7 cycle 16: opacity 0.18 → 0.4 (mais que dobro). User pediu várias
    // vezes "feixe visível pra parede". 0.4 é dramático mas clean.
    const projBeam = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, beamLength, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff5e0,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    // ConeGeometry default: ápice em +y, base em -y, height ao longo de y.
    // Rotacionar +π/2 em z faz +y virar -x (eixo X negativo).
    // Resultado: ápice em -x (na tela?), base em +x (no projetor)... INVERTIDO.
    // Queremos ápice no PROJETOR (lente em x=-0.1) e base na TELA (x=-2.5).
    // Rotação z = -π/2 faz +y virar +x; ainda errado.
    // Solução: rotacionar -π/2 e depois posicionar a base no centro do cone.
    // Mais simples: rotacionar +π/2 (ápice em -x) e mover o centro pra que
    // ápice fique no projetor.
    projBeam.rotation.z = Math.PI / 2;
    // Após rotação, cone se estende ao longo de eixo X com ápice em -x e base em +x.
    // Centro do cone está no meio. Pra ápice ficar em PROJ_X - 0.35 (na lente),
    // centro precisa estar em PROJ_X - 0.35 - beamLength/2.
    // ESPERA — ápice em -x significa: cone aponta pra +x. Não é o que queremos.
    // Inverter: rotation z = -π/2 → ápice em +x, base em -x. Sim! Cone apontando -x.
    projBeam.rotation.z = -Math.PI / 2;
    // Centro: pra ápice em PROJ_X - 0.35, centro em (PROJ_X - 0.35) - beamLength/2.
    projBeam.position.set(PROJ_X - 0.35 - beamLength / 2, PROJ_Y, 0);
    projRoomGroup.add(projBeam);

    // Camada interior do feixe (mais brilhante, mais estreita) — efeito halo
    const projBeamInner = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, beamLength * 0.9, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff5e0,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    projBeamInner.rotation.z = -Math.PI / 2;
    projBeamInner.position.set(PROJ_X - 0.35 - (beamLength * 0.9) / 2, PROJ_Y, 0);
    projRoomGroup.add(projBeamInner);

    // Spotlight real iluminando a área entre projetor e tela — bem mais forte
    const beamSpot = new THREE.SpotLight(0xfff5e0, 2.0, 6, Math.PI / 6, 0.5, 1.0);
    beamSpot.position.set(PROJ_X - 0.3, PROJ_Y, 0);
    const beamSpotTarget = new THREE.Object3D();
    beamSpotTarget.position.set(-2.5, PROJ_Y - 0.4, 0);
    projRoomGroup.add(beamSpotTarget);
    beamSpot.target = beamSpotTarget;
    projRoomGroup.add(beamSpot);

    // Sofá virado pra tela (long-side perpendicular ao eixo da tela).
    // V16.7 cycle 40: cor mais quente (vinho escuro vs navy preto) + emissive
    // sutil pra parecer estofado de couro premium em vez de bloco preto.
    const sofaMat = new THREE.MeshStandardMaterial({
      color: 0x3a1a1f,
      roughness: 0.5,
      metalness: 0.2,
      emissive: 0x2a0a14,
      emissiveIntensity: 0.15,
    });
    const sofaSeat = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.32, 2.2),
      sofaMat
    );
    sofaSeat.position.set(1.5, 0.16, 0);
    sofaSeat.castShadow = true;
    projRoomGroup.add(sofaSeat);

    // Encosto atrás do sofá (no lado +x do sofá, pq olha pra -x)
    const sofaBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.5, 2.2),
      sofaMat
    );
    sofaBack.position.set(1.85, 0.48, 0);
    sofaBack.castShadow = true;
    projRoomGroup.add(sofaBack);

    // Almofadas com mesma cor quente
    for (const dz of [-0.7, 0, 0.7]) {
      const cushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.2, 0.6),
        new THREE.MeshStandardMaterial({
          color: 0x4a1f24,
          roughness: 0.7,
          emissive: 0x2a0a14,
          emissiveIntensity: 0.1,
        })
      );
      cushion.position.set(1.5, 0.42, dz);
      cushion.castShadow = true;
      projRoomGroup.add(cushion);
    }

    // Tapete sob o sofá — cor mais cinema (red-brown carpet)
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 3.0),
      new THREE.MeshBasicMaterial({
        color: 0x5a1f2a,
        transparent: true,
        opacity: 0.65,
      })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.2, 0.005, 0);
    projRoomGroup.add(rug);

    // Collider do sofá (em coords MUNDO — calculadas via group)
    {
      const worldPos = new THREE.Vector3();
      sofaSeat.getWorldPosition(worldPos);
      colliders.push({ cx: worldPos.x, cz: worldPos.z, hw: 0.5, hd: 1.2 });
    }

    // Spot ambient pra área do cinema
    const projSpot = new THREE.SpotLight(0xddc890, 0.6, 12, Math.PI / 5, 0.55, 1.4);
    projSpot.position.set(projRoomPos.x + 1, 5.5, projRoomPos.z);
    projSpot.target.position.set(projRoomPos.x - 1, 1.5, projRoomPos.z);
    scene.add(projSpot);
    scene.add(projSpot.target);

    // === V15 — equipamentos extras (todos suportam múltiplas instâncias) ===
    // Itera sobre layout.objects e renderiza cada tipo com builder próprio.
    // Para tipos singleton (já renderizados acima via `lo()`), pula aqui.
    const SINGLETON_HANDLED = new Set<GymObjectType>([
      "trophy_hall",
      "skills_board",
      "run_board",
      "streak_pillar",
      "personal_booth",
      "nutri_booth",
      "empty_booth",
      "power_rack",
      "platform",
      "projector_room",
      "spawn",
    ]);

    // Equipamentos com playExercise - registrados pra proximity check
    type EquipmentRef = {
      mesh: THREE.Object3D;
      type: string;
      exercise: string;
      x: number;
      z: number;
      rotY: number;
    };
    const equipmentRefs: EquipmentRef[] = [];
    const playableEquipments: THREE.Group[] = [];
    for (const obj of layout.objects) {
      if (SINGLETON_HANDLED.has(obj.type)) continue;
      const built = buildExtraEquipment(obj.type, accent);
      if (!built) continue;
      built.position.set(obj.x, 0, obj.z);
      built.rotation.y = obj.rot;
      scene.add(built);
      if (built.userData.playExercise) {
        playableEquipments.push(built);
        equipmentRefs.push({
          mesh: built,
          type: obj.type,
          exercise: built.userData.playExercise,
          x: obj.x,
          z: obj.z,
          rotY: obj.rot,
        });
      }
      // Collider aproximado pro AABB do equipamento
      const bbox = new THREE.Box3().setFromObject(built);
      const sx = (bbox.max.x - bbox.min.x) / 2;
      const sz = (bbox.max.z - bbox.min.z) / 2;
      colliders.push({ cx: obj.x, cz: obj.z, hw: Math.max(0.3, sx * 0.85), hd: Math.max(0.3, sz * 0.85) });
    }
    // Power rack tambem entra no proximity check
    equipmentRefs.push({
      mesh: powerRack,
      type: "power_rack",
      exercise: "squat",
      x: powerRackPos.x,
      z: powerRackPos.z,
      rotY: powerRackPos.rot + Math.PI / 8,
    });
    // Adiciona ring de proximidade em cada equipamento
    for (const eq of equipmentRefs) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.1, 32),
        new THREE.MeshBasicMaterial({
          color: 0xd8ff2c,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(eq.x, 0.02, eq.z);
      scene.add(ring);
      eq.mesh.userData.proximityRing = ring;
    }

    // === Avatar ====================================================
    const avatarParts = buildAvatar(avatarPrefs);
    // Avatar começa LONGE do stage (entrada, z=ROOM_HALF_D - 1)
    const spawnPos = lo("spawn");
    avatarParts.root.position.set(spawnPos.x, 0, spawnPos.z);
    avatarParts.root.rotation.y = spawnPos.rot;
    // V16.7 cycle 38: garante shadow casting do avatar (todos os meshes)
    avatarParts.root.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
      }
    });

    // Avatar aura (efeito 10+ troféus) — disco glow embaixo
    let avatarAura: THREE.Mesh | null = null;
    if (showAvatarAura) {
      avatarAura = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.8, 48),
        new THREE.MeshBasicMaterial({
          color: accentColor,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        })
      );
      avatarAura.rotation.x = -Math.PI / 2;
      avatarAura.position.y = 0.01;
      scene.add(avatarAura);
    }
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
    // Reused vectors/colors pra raycast handler — evita alocar a cada click.
    const tmpWorldPos = new THREE.Vector3();
    const tmpColor = new THREE.Color();
    const onCanvasUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [
        trophiesGroup,
        projScreen,
        sponsorsGroup,
        streakPillarParts.hitBox,
        skillsBoardParts.hitBox,
        runBoardParts.hitBox,
        cinemaRoom,
        arcadeRoom,
        powerRack,
        ...hotspotPortals,
        ...playableEquipments,
      ];
      const hits = raycaster.intersectObjects(targets, true);
      const first = hits[0];
      if (first) {
        let obj: THREE.Object3D | null = first.object;
        while (
          obj &&
          !obj.userData.trophy &&
          !obj.userData.ghostExercise &&
          !obj.userData.sponsorSlot &&
          !obj.userData.npcSlot &&
          !obj.userData.hotspot &&
          !obj.userData.playExercise &&
          obj.userData.kind !== "projector-screen" &&
          obj.userData.kind !== "streak-pillar" &&
          obj.userData.kind !== "skills-board" &&
          obj.userData.kind !== "run-board"
        ) {
          obj = obj.parent;
        }
        if (obj?.userData.trophy) {
          // JUICE: chime + particle burst lime + camera shake leve
          playChime();
          const trophy = obj.userData.trophy as GymTrophy;
          obj.getWorldPosition(tmpWorldPos);
          tmpWorldPos.y += 0.6;
          tmpColor.set(trophy.color);
          particleBurst.burst(tmpWorldPos, 35, tmpColor, 1.2);
          cameraShake.trigger(0.06, 0.18);
          setSelected(trophy);
        } else if (obj?.userData.ghostExercise) {
          // JUICE: mystery sound + particles roxos sutis
          playMystery();
          obj.getWorldPosition(tmpWorldPos);
          tmpWorldPos.y += 0.5;
          tmpColor.set(0x6b3aff);
          particleBurst.burst(tmpWorldPos, 18, tmpColor, 0.7);
          setSelectedGhost(obj.userData.ghostExercise as GhostExercise);
        } else if (obj?.userData.sponsorSlot || obj?.userData.npcSlot) {
          // JUICE: bell sound
          playBell();
          const slotId = (obj.userData.sponsorSlot as SponsorSlot | undefined)?.id
            ?? (obj.userData.npcSlot as string | undefined);
          if (slotId === "nutri" || slotId === "pt") {
            // Abre lista de pros (NPC fallback)
            setSelectedProType(slotId as ProType);
          } else if (slotId === "empty") {
            setSelectedSponsor({
              id: "empty",
              title: "ANUNCIE AQUI",
              professional: null,
            });
          }
        } else if (obj?.userData.kind === "projector-screen") {
          playClick();
          setReelOpen(true);
        } else if (obj?.userData.kind === "streak-pillar") {
          // JUICE: whoosh + chama particles laranja
          playWhoosh();
          obj.getWorldPosition(tmpWorldPos);
          tmpWorldPos.y += 1.6;
          tmpColor.set(0xff6020);
          particleBurst.burst(tmpWorldPos, 60, tmpColor, 1.5);
          cameraShake.trigger(0.04, 0.15);
        } else if (obj?.userData.kind === "skills-board") {
          playClick();
          if (!visitMode) setSkillsModalOpen(true);
        } else if (obj?.userData.kind === "run-board") {
          playClick();
          if (!visitMode) setRunsModalOpen(true);
        } else if (obj?.userData.playExercise) {
          // V2: ao invés de abrir modal, usa o sistema in-gym engagement.
          // Se estiver perto, engage direto. Senão, ignora (athlete precisa andar até lá).
          playClick();
          obj.getWorldPosition(tmpWorldPos);
          tmpWorldPos.y += 0.6;
          tmpColor.set(0xd8ff2c);
          particleBurst.burst(tmpWorldPos, 18, tmpColor, 0.8);
          // Engage só se estiver perto
          const dx = tmpWorldPos.x - avatarParts.root.position.x;
          const dz = tmpWorldPos.z - avatarParts.root.position.z;
          if (dx * dx + dz * dz < PROXIMITY_RADIUS * PROXIMITY_RADIUS * 1.5) {
            const eq = equipmentRefs.find((e) => e.mesh === obj || e.mesh.children.includes(obj));
            if (eq && !engagedEquipment) engageEquipment(eq);
          }
        } else if (obj?.userData.hotspot) {
          // PR3 cycles 14-20: hotspots de navegação
          playClick();
          const hotspot = obj.userData.hotspot as string;
          obj.getWorldPosition(tmpWorldPos);
          tmpWorldPos.y += 0.3;
          tmpColor.set(0xd8ff2c);
          particleBurst.burst(tmpWorldPos, 25, tmpColor, 1.0);
          // Mapeamento hotspot → URL
          const HOTSPOT_URLS: Record<string, string> = {
            cinema: "/pr/lab",
            arcade: "/pr/arcade",
            diet: "/pr/diet",
            coach: "/pr/coach",
            achievements: "/pr/achievements",
            eventos: "/pr/eventos",
            log: "/pr/log",
          };
          const url = HOTSPOT_URLS[hotspot];
          if (url) {
            // pequeno delay pra particles aparecerem
            setTimeout(() => {
              window.location.href = url;
            }, 250);
          }
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
    // V15.1: +25% pra atravessar mapa dobrado sem ficar tedioso (3.0 → 3.75)
    const SPEED = 3.75;
    const followOffset = new THREE.Vector3(0, 4.5, 6.5);
    const tmpV = new THREE.Vector3();
    let raf = 0;
    const startT = performance.now();
    let lastT = startT;
    let walkPhase = 0;

    // === IN-GYM EXERCISE SYSTEM ===
    // Quando atleta chega < PROXIMITY_RADIUS de um equipamento, prompt aparece.
    // Click no prompt (ou tecla E) "engages" — câmera muda pra close-up + avatar
    // anima fazendo o movimento. Solta espaço/release pra descer.
    const PROXIMITY_RADIUS = 1.6;
    let nearestEquipment: EquipmentRef | null = null;
    let engagedEquipment: EquipmentRef | null = null;
    let exerciseProgress = 0; // 0 = down, 1 = up
    let exercisePressed = false;
    let exerciseReps = 0;
    let exerciseWasUp = false;
    const cinematicOffset = new THREE.Vector3(2.5, 1.6, 2.5);
    const tmpCamPos = new THREE.Vector3();
    const tmpCamTarget = new THREE.Vector3();

    // Prompt UI (HTML overlay manipulated via DOM)
    const promptEl = document.getElementById("equipment-prompt");
    const promptLabelEl = document.getElementById("equipment-prompt-label");
    const exerciseHudEl = document.getElementById("exercise-hud");
    const exerciseHudTitleEl = document.getElementById("exercise-hud-title");
    const exerciseHudRepsEl = document.getElementById("exercise-hud-reps");
    const exerciseHudActionEl = document.getElementById("exercise-hud-action");
    const exerciseHudExitEl = document.getElementById("exercise-hud-exit");
    const exerciseHudBestEl = document.getElementById("exercise-hud-best");
    const exerciseHudProgressEl = document.getElementById("exercise-hud-progress");

    const EXERCISE_LABELS: Record<string, string> = {
      bench: "🏋️ Bench Press",
      squat: "🦵 Back Squat",
      deadlift: "💪 Deadlift",
      pullup: "🤸 Pull-up",
      pushup: "🔽 Push-up",
      burpee: "💥 Burpee",
      boxjump: "📦 Box Jump",
      kbswing: "🪝 KB Swing",
      run: "🏃 Treadmill Run",
      bike: "🚴 Assault Bike",
      row: "🚣 Rowing",
    };

    function findNearestEquipment(): EquipmentRef | null {
      const ax = avatarParts.root.position.x;
      const az = avatarParts.root.position.z;
      let best: EquipmentRef | null = null;
      let bestD = PROXIMITY_RADIUS * PROXIMITY_RADIUS;
      for (const eq of equipmentRefs) {
        const dx = eq.x - ax;
        const dz = eq.z - az;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) {
          bestD = d2;
          best = eq;
        }
      }
      return best;
    }

    // Barbell virtual nas mãos do avatar (mostrado apenas durante engagement
    // de bench/squat/deadlift)
    const virtualBarbell = new THREE.Group();
    {
      const bar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xdfe2e8, roughness: 0.15, metalness: 0.95 })
      );
      bar.rotation.z = Math.PI / 2;
      virtualBarbell.add(bar);
      // Plates IWF nos lados
      for (const side of [-1, 1]) {
        const plate1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16),
          new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.5 })
        );
        plate1.rotation.z = Math.PI / 2;
        plate1.position.set(side * 0.65, 0, 0);
        virtualBarbell.add(plate1);
        const plate2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16),
          new THREE.MeshStandardMaterial({ color: 0x0057b8, roughness: 0.5 })
        );
        plate2.rotation.z = Math.PI / 2;
        plate2.position.set(side * 0.7, 0, 0);
        virtualBarbell.add(plate2);
      }
    }
    virtualBarbell.visible = false;
    scene.add(virtualBarbell);

    // Virtual KB (kettlebell) pro KB swing
    const virtualKB = new THREE.Group();
    {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.5 })
      );
      virtualKB.add(ball);
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.012, 8, 16, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0xc0c5cc, roughness: 0.3, metalness: 0.7 })
      );
      handle.rotation.x = Math.PI / 2;
      handle.position.y = 0.13;
      virtualKB.add(handle);
    }
    virtualKB.visible = false;
    scene.add(virtualKB);

    function engageEquipment(eq: EquipmentRef) {
      engagedEquipment = eq;
      exerciseProgress = 0;
      exerciseReps = 0;
      exercisePressed = false;
      exerciseWasUp = false;
      // Posiciona avatar e DETERMINA POSE INICIAL do equipamento
      // Cada exercise tem (offsetX, offsetZ, rootY, rootRotX) específicos
      let offsetFwd = 0; // distância na frente do equipamento
      let offsetSide = 0;
      let initialRootY = 0;
      let initialRootRotX = 0;
      if (eq.exercise === "bench") {
        offsetFwd = 0;
        initialRootY = 0;
        initialRootRotX = 0; // EM PE (representação simplificada — bench virtual)
      } else if (eq.exercise === "squat") {
        offsetFwd = 0; // dentro do rack
        initialRootY = 0;
        initialRootRotX = 0;
      } else if (eq.exercise === "deadlift") {
        offsetFwd = 0;
        initialRootY = 0;
        initialRootRotX = 0;
      } else if (eq.exercise === "pullup") {
        offsetFwd = 0; // sob a barra
        initialRootY = 0;
        initialRootRotX = 0;
      } else if (eq.exercise === "pushup") {
        offsetFwd = 0.4;
        initialRootY = 0;
        initialRootRotX = 0;
      } else if (eq.exercise === "boxjump") {
        offsetFwd = -0.6; // 60cm na frente do box
        initialRootY = 0;
      } else if (eq.exercise === "kbswing") {
        offsetFwd = 0.5;
        initialRootY = 0;
      } else if (eq.exercise === "run") {
        offsetFwd = 0; // EM CIMA da esteira
        initialRootY = 0.18; // altura belt
      } else if (eq.exercise === "bike") {
        offsetFwd = 0; // sentado na bike
        initialRootY = -0.1;
      } else if (eq.exercise === "row") {
        offsetFwd = 0; // sentado no rower
        initialRootY = 0;
      } else {
        offsetFwd = 0.4;
      }
      const fwdX = Math.sin(eq.rotY);
      const fwdZ = Math.cos(eq.rotY);
      const sideX = Math.sin(eq.rotY + Math.PI / 2);
      const sideZ = Math.cos(eq.rotY + Math.PI / 2);
      avatarParts.root.position.set(
        eq.x + fwdX * offsetFwd + sideX * offsetSide,
        initialRootY,
        eq.z + fwdZ * offsetFwd + sideZ * offsetSide
      );
      avatarParts.root.rotation.y = eq.rotY;
      avatarParts.root.rotation.x = initialRootRotX;
      // Esconde prompt, mostra HUD
      if (promptEl) promptEl.classList.add("hidden");
      if (exerciseHudEl) {
        exerciseHudEl.classList.remove("hidden");
        if (exerciseHudTitleEl) exerciseHudTitleEl.textContent = EXERCISE_LABELS[eq.exercise] ?? eq.exercise;
        if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = "0";
        if (exerciseHudBestEl) {
          const best = localStorage.getItem("pr_play_best_" + eq.exercise) || "0";
          exerciseHudBestEl.textContent = best;
        }
        if (exerciseHudActionEl) {
          const isTap = eq.exercise === "burpee" || eq.exercise === "boxjump" || eq.exercise === "kbswing";
          const isCardio = eq.exercise === "run" || eq.exercise === "bike" || eq.exercise === "row";
          exerciseHudActionEl.textContent = isTap ? "TAP · ESPAÇO" :
                                            isCardio ? "MANTÉM · ESPAÇO" :
                                            "SEGURA · ESPAÇO";
        }
      }
      burpeePhase = 0;
      lastTapTime = 0;
      // Trava o movimento WASD enquanto engagado + limpa estado atual
      inputLockedRef.current = true;
      keys.up = keys.down = keys.left = keys.right = false;
    }

    function disengageEquipment() {
      if (!engagedEquipment) return;
      const eq = engagedEquipment;
      // Salvar best
      const prev = Number(localStorage.getItem("pr_play_best_" + eq.exercise) || "0");
      if (exerciseReps > prev) {
        localStorage.setItem("pr_play_best_" + eq.exercise, String(exerciseReps));
      }
      // Move avatar 1.6m pra frente do equipamento (sai)
      avatarParts.root.position.x += Math.sin(eq.rotY) * 1.6;
      avatarParts.root.position.z += Math.cos(eq.rotY) * 1.6;
      // Reset COMPLETO da pose (incluindo articulacoes novas)
      avatarParts.root.position.y = 0;
      avatarParts.root.rotation.x = 0;
      avatarParts.leftArm.rotation.set(-0.08, 0, -0.18);
      avatarParts.rightArm.rotation.set(-0.08, 0, 0.18);
      avatarParts.leftForearm.rotation.set(0.18, 0, 0);
      avatarParts.rightForearm.rotation.set(0.18, 0, 0);
      avatarParts.leftHand.rotation.set(0, 0, 0);
      avatarParts.rightHand.rotation.set(0, 0, 0);
      avatarParts.leftLeg.rotation.set(0, 0, 0);
      avatarParts.rightLeg.rotation.set(0, 0, 0);
      avatarParts.leftCalf.rotation.set(0, 0, 0);
      avatarParts.rightCalf.rotation.set(0, 0, 0);
      engagedEquipment = null;
      exerciseProgress = 0;
      exerciseReps = 0;
      exerciseWasUp = false;
      exercisePressed = false;
      if (exerciseHudEl) exerciseHudEl.classList.add("hidden");
      if (promptEl) promptEl.classList.add("hidden"); // Hide prompt enquanto câmera volta
      inputLockedRef.current = false;
      virtualBarbell.visible = false;
      virtualKB.visible = false;
    }

    // Click no prompt → engage
    function onPromptClick() {
      if (nearestEquipment && !engagedEquipment) {
        engageEquipment(nearestEquipment);
      }
    }
    if (promptEl) promptEl.addEventListener("click", onPromptClick);
    if (exerciseHudExitEl) exerciseHudExitEl.addEventListener("click", disengageEquipment);

    let lastTapTime = 0;
    let burpeePhase = 0; // 0=stand, 1=squat, 2=plank, 3=jump (volta a 0 = +1 rep)
    function pressExercise() {
      if (!engagedEquipment) return;
      const eq = engagedEquipment;
      if (eq.exercise === "burpee") {
        // 4-phase tap
        burpeePhase = (burpeePhase + 1) % 4;
        if (burpeePhase === 0) {
          exerciseReps++;
          if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = String(exerciseReps);
        }
        // Define progress based on phase pra animação
        exerciseProgress = burpeePhase / 4;
      } else if (eq.exercise === "boxjump") {
        exerciseProgress = 1;
        exerciseReps++;
        if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = String(exerciseReps);
        setTimeout(() => { exerciseProgress = 0; }, 600);
      } else if (eq.exercise === "kbswing") {
        const now = performance.now();
        const delta = now - lastTapTime;
        lastTapTime = now;
        if (delta > 500 && delta < 1500) {
          exerciseReps++;
          if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = String(exerciseReps);
        }
        exerciseProgress = 1;
        setTimeout(() => { exerciseProgress = 0; }, 400);
      } else {
        exercisePressed = true;
      }
    }
    function releaseExercise() {
      exercisePressed = false;
    }
    if (exerciseHudActionEl) {
      exerciseHudActionEl.addEventListener("pointerdown", function (e) { e.preventDefault(); pressExercise(); });
      exerciseHudActionEl.addEventListener("pointerup", function (e) { e.preventDefault(); releaseExercise(); });
      exerciseHudActionEl.addEventListener("pointercancel", releaseExercise);
      exerciseHudActionEl.addEventListener("pointerleave", releaseExercise);
    }

    // Keyboard handlers
    function onExerciseKeyDown(e: KeyboardEvent) {
      if (e.code === "KeyE" && nearestEquipment && !engagedEquipment) {
        e.preventDefault();
        engageEquipment(nearestEquipment);
      } else if (e.code === "Escape" && engagedEquipment) {
        e.preventDefault();
        disengageEquipment();
      } else if (e.code === "Space" && engagedEquipment) {
        e.preventDefault();
        if (!exercisePressed) pressExercise();
      }
    }
    function onExerciseKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" && engagedEquipment) {
        e.preventDefault();
        releaseExercise();
      }
    }
    window.addEventListener("keydown", onExerciseKeyDown);
    window.addEventListener("keyup", onExerciseKeyUp);

    function animateAvatarForExercise(exercise: string, p: number) {
      // p = 0 (rest/down) → 1 (peak/up)
      // Convencao: rotation.x positivo = perna/braco gira PRA TRAS (do quadril/ombro)
      //            rotation.x negativo = PRA FRENTE
      // Calf/Forearm: rotation.x positivo = flexiona JUNTAS (joelho/cotovelo dobra)
      const a = avatarParts;
      // (alias arms variavel removida — usar 'a' pra todos)
      const arms = a;
      // (silencio o noUnusedVars)
      void arms;
      switch (exercise) {
        case "bench":
          // Bench REPRESENTACIONAL: avatar em pé empurra barbell virtual pra cima
          // (representacao simplificada — bench virtual à frente do atleta)
          // Up arm rotation.x = -PI/2 (paralelo ao chão pra frente)
          // Forearm flex: 1.5 (peito) → 0.1 (estendido frente)
          a.root.rotation.x = 0;
          a.root.position.y = 0;
          a.leftLeg.rotation.x = 0;
          a.rightLeg.rotation.x = 0;
          a.leftCalf.rotation.x = 0;
          a.rightCalf.rotation.x = 0;
          a.leftArm.rotation.x = -Math.PI / 2; // pra frente paralelo
          a.rightArm.rotation.x = -Math.PI / 2;
          a.leftArm.rotation.z = -0.3;
          a.rightArm.rotation.z = 0.3;
          a.leftForearm.rotation.x = 1.5 - p * 1.4; // 90° dobrado → quase reto
          a.rightForearm.rotation.x = 1.5 - p * 1.4;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          break;

        case "squat":
          // Squat REAL: hip pivota pra trás + joelhos dobram + barbell back rack
          // p=0 (bottom): pernas MUITO dobradas (knee 1.5 rad) + hip rotation 0.5 (atras)
          // p=1 (standing): pernas retas, sem rotation
          a.root.rotation.x = 0;
          // root.y abaixa pq legs ficam dobradas (centro de massa cai)
          a.root.position.y = -(1 - p) * 0.45;
          // Hip rotation pra trás (avatar inclina ao agachar — sit back)
          a.leftLeg.rotation.x = -(1 - p) * 0.6;
          a.rightLeg.rotation.x = -(1 - p) * 0.6;
          // Joelho flex (calf gira pra frente)
          a.leftCalf.rotation.x = (1 - p) * 1.3;
          a.rightCalf.rotation.x = (1 - p) * 1.3;
          // Bracos pra cima e atras (segurando barra trapezios)
          a.leftArm.rotation.x = -1.7;
          a.rightArm.rotation.x = -1.7;
          a.leftArm.rotation.z = -0.5;
          a.rightArm.rotation.z = 0.5;
          a.leftForearm.rotation.x = 1.4; // forearm flex segurando barra
          a.rightForearm.rotation.x = 1.4;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          break;

        case "deadlift":
          // Deadlift REAL: hip baixo + torso muito inclinado + joelhos pouco dobrados +
          // bracos retos pra baixo. p=1 = lockout standing
          // Como torso lean nao tem bone, simulamos via root.rotation.x parcial
          // mas isso gira tudo. Solucao: deixar leg/arm/calf compensar.
          // Hip rotation: pra trás (deadlift hip hinge)
          a.leftLeg.rotation.x = -(1 - p) * 0.8;
          a.rightLeg.rotation.x = -(1 - p) * 0.8;
          // Joelhos pouco dobrados no deadlift (mais do que stiff, menos que squat)
          a.leftCalf.rotation.x = (1 - p) * 0.6;
          a.rightCalf.rotation.x = (1 - p) * 0.6;
          // Avatar abaixa (proporcional)
          a.root.position.y = -(1 - p) * 0.35;
          // Lean torso: simulado via root.rotation.x (gira tudo, mas
          // bracos compensam ficando retos pra baixo no espaco mundo)
          a.root.rotation.x = -(1 - p) * 0.8;
          // Bracos: rotation.x compensa o lean do root pra ficar PRA BAIXO mundo
          a.leftArm.rotation.x = (1 - p) * 0.8; // compensa lean
          a.rightArm.rotation.x = (1 - p) * 0.8;
          a.leftArm.rotation.z = -0.05;
          a.rightArm.rotation.z = 0.05;
          a.leftForearm.rotation.x = 0; // antebracos retos
          a.rightForearm.rotation.x = 0;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          break;
        case "pullup":
          // Pull-up REAL: avatar pendurado, FOREARM flex puxa o corpo pra cima
          // Pull-up bar do power rack está em y=2.58 (H-0.02)
          // Avatar mãos em y_world = root.y + 1.62 + 0.34 + 0.30 = root.y + 2.26
          // Pra mãos ficarem na bar (2.58): root.y = 2.58 - 2.26 = 0.32 (down)
          // Topo (queixo na bar): root.y = 0.55 (sobe 0.23)
          a.root.rotation.x = 0;
          a.root.position.y = 0.3 + p * 0.4;
          // Bracos pra cima (rotation.x = -PI = vertical apontando pra cima)
          a.leftArm.rotation.x = -Math.PI;
          a.rightArm.rotation.x = -Math.PI;
          a.leftArm.rotation.z = -0.3;
          a.rightArm.rotation.z = 0.3;
          // Forearm flex (cotovelo dobra) — puxa
          a.leftForearm.rotation.x = p * 2.0;
          a.rightForearm.rotation.x = p * 2.0;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          // Pernas dobradas pra trás (cruzadas) — knee flex
          a.leftLeg.rotation.x = 0.3;
          a.rightLeg.rotation.x = 0.3;
          a.leftCalf.rotation.x = 1.2; // joelhos dobrados ~70°
          a.rightCalf.rotation.x = 1.2;
          break;

        case "pushup":
          // Push-up REPRESENTACIONAL: avatar em pé empurra braços PRA BAIXO/FRENTE
          // (em vez de deitar horizontal que ficava esquisito)
          // Bracos: rotation.x = +PI/4 (pra baixo e frente)
          // Forearm flex: 1.5 (dobrado) → 0.1 (esticado)
          a.root.rotation.x = 0;
          a.root.position.y = 0;
          a.leftArm.rotation.x = Math.PI / 4;
          a.rightArm.rotation.x = Math.PI / 4;
          a.leftArm.rotation.z = -0.4;
          a.rightArm.rotation.z = 0.4;
          a.leftForearm.rotation.x = 1.5 - p * 1.4;
          a.rightForearm.rotation.x = 1.5 - p * 1.4;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          a.leftLeg.rotation.x = 0;
          a.rightLeg.rotation.x = 0;
          a.leftCalf.rotation.x = 0;
          a.rightCalf.rotation.x = 0;
          break;

        case "boxjump":
          // Box jump: 3 fases internas baseadas em p
          // p=0: crouch ready (joelhos super dobrados, baixo)
          // p=1: top of jump (estendido + braços pra cima)
          a.root.rotation.x = 0;
          a.root.position.y = p * 0.7;
          // Pernas: agachado (calf flex 1.2) → estendido (0)
          a.leftLeg.rotation.x = -(1 - p) * 0.4; // hip hinge atras
          a.rightLeg.rotation.x = -(1 - p) * 0.4;
          a.leftCalf.rotation.x = (1 - p) * 1.2;
          a.rightCalf.rotation.x = (1 - p) * 1.2;
          // Bracos: pra trás (-0.5 rotation.x) no crouch → pra frente/cima (-1.5) no jump
          a.leftArm.rotation.x = 0.5 - p * 2.0; // 0.5 (atrás) → -1.5 (cima)
          a.rightArm.rotation.x = 0.5 - p * 2.0;
          a.leftArm.rotation.z = -0.3;
          a.rightArm.rotation.z = 0.3;
          a.leftForearm.rotation.x = 0.18;
          a.rightForearm.rotation.x = 0.18;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          break;

        case "kbswing":
          // KB swing REAL: hip hinge agressivo + braços retos balançam
          // p=0 (down): torso muito inclinado, bracos entre as pernas (atras+abaixo)
          // p=1 (top): standing reto, bracos esticados pra frente altura peito
          a.root.position.y = 0;
          a.root.rotation.x = -(1 - p) * 0.5; // torso inclina
          // Pernas: leve dobra no bottom
          a.leftLeg.rotation.x = -(1 - p) * 0.3; // hip hinge
          a.rightLeg.rotation.x = -(1 - p) * 0.3;
          a.leftCalf.rotation.x = (1 - p) * 0.4;
          a.rightCalf.rotation.x = (1 - p) * 0.4;
          // Bracos: arc de baixo (rot.x +0.8 com torso inclinado = atras pernas)
          //         pra frente (rot.x -0.7 standing = horizontal frente)
          a.leftArm.rotation.x = 0.8 - p * 1.5;
          a.rightArm.rotation.x = 0.8 - p * 1.5;
          a.leftArm.rotation.z = -0.05;
          a.rightArm.rotation.z = 0.05;
          a.leftForearm.rotation.x = 0; // forearm reto (segurando KB)
          a.rightForearm.rotation.x = 0;
          a.leftHand.rotation.set(0, 0, 0);
          a.rightHand.rotation.set(0, 0, 0);
          break;
        case "run":
          // Treadmill run: pernas alternam (hip + knee flex sincronizados)
          // braços balançam contra-fase
          {
            const tt = performance.now() / 1000;
            const phase = tt * 6;
            const ls = Math.sin(phase);
            const rs = Math.sin(phase + Math.PI);
            // HIP rotation (sobe perna pra frente)
            a.leftLeg.rotation.x = ls * 0.6;
            a.rightLeg.rotation.x = rs * 0.6;
            // KNEE flex (dobra quando perna sobe)
            a.leftCalf.rotation.x = Math.max(0, ls * 1.0);
            a.rightCalf.rotation.x = Math.max(0, rs * 1.0);
            // Bracos opostos das pernas
            a.leftArm.rotation.x = -rs * 0.7;
            a.rightArm.rotation.x = -ls * 0.7;
            a.leftArm.rotation.z = -0.18;
            a.rightArm.rotation.z = 0.18;
            // Forearm flex 90° (postura de corrida)
            a.leftForearm.rotation.x = 1.2;
            a.rightForearm.rotation.x = 1.2;
            a.leftHand.rotation.set(0, 0, 0);
            a.rightHand.rotation.set(0, 0, 0);
            // Bounce vertical
            a.root.position.y = Math.abs(Math.sin(phase * 2)) * 0.04;
            a.root.rotation.x = 0;
          }
          break;

        case "bike":
          // Assault bike REAL: athlete sentado no saddle (~0.7m)
          // Pernas: pedalada circular completa
          //   - Top of pedal stroke: hip mais alto (-1.6 = perna pra cima/frente),
          //     knee SUPER dobrado (1.6 ~90°)
          //   - Bottom of stroke: hip mais baixo (-0.4), knee pouco dobrado (0.3)
          // Bracos: rotation.x = -PI/2 (paralelos pra frente segurando handle)
          //         forearm flex 1.0 (cotovelo levemente dobrado)
          {
            const tt = performance.now() / 1000;
            const phase = tt * 5;
            const ls = (Math.sin(phase) + 1) / 2; // 0-1
            const rs = (Math.sin(phase + Math.PI) + 1) / 2;
            // Sentado em saddle alto
            a.root.position.y = 0.5;
            a.root.rotation.x = -0.2; // leve lean pra frente segurando handle
            // HIP: -1.6 (perna alta) → -0.4 (perna baixa)
            a.leftLeg.rotation.x = -0.4 - ls * 1.2;
            a.rightLeg.rotation.x = -0.4 - rs * 1.2;
            // KNEE flex: 0.3 (esticado) → 1.6 (dobrado quando perna alta)
            a.leftCalf.rotation.x = 0.3 + ls * 1.3;
            a.rightCalf.rotation.x = 0.3 + rs * 1.3;
            // Bracos: pra frente paralelos, leve queda nos handles
            a.leftArm.rotation.x = -Math.PI / 2;
            a.rightArm.rotation.x = -Math.PI / 2;
            a.leftArm.rotation.z = -0.35;
            a.rightArm.rotation.z = 0.35;
            // Forearm: levemente flex (cotovelo macio segurando)
            a.leftForearm.rotation.x = 0.6;
            a.rightForearm.rotation.x = 0.6;
            a.leftHand.rotation.set(0, 0, 0);
            a.rightHand.rotation.set(0, 0, 0);
          }
          break;

        case "row":
          // Rowing REAL (Concept2 spec):
          // Avatar SENTADO em y=0.36 (altura do seat). Foot plate na frente.
          // Catch (rowP=0): joelhos super dobrados (calf colado na coxa),
          //                 shins verticais, torso lean +20° pra frente,
          //                 braços estendidos pra FRENTE em direção ao handle
          // Drive→Finish (rowP=1): pernas estendidas, torso lean back -15°,
          //                       braços puxados, cotovelos atrás, mãos no peito
          {
            const tt = performance.now() / 1000;
            const phase = tt * 1.6;
            const rowP = (Math.sin(phase) + 1) / 2;
            // Avatar SENTADO: y constante, pernas dobradas
            a.root.position.y = 0.36;
            // TORSO LEAN: catch +0.35 (pra frente) → finish -0.25 (lean back)
            a.root.rotation.x = 0.35 - rowP * 0.6;
            // PERNAS:
            // - Sentado, hip rotation precisa ser PRA CIMA (calc paralelo ao seat)
            //   No catch: pernas dobradas em ~90° (joelhos altos)
            //   No finish: pernas estendidas pra frente
            // Hip rotation positiva = perna pra TRÁS (não queremos)
            // Hip rotation negativa = perna pra FRENTE (queremos)
            // Como avatar está sentado, hip "pra frente" = -PI/2 (perna paralela ao chão)
            // Catch: hip -1.4 + knee bent muito (calf perpendicular = -1.5 do hip)
            // Finish: hip -PI/2 + knee 0 (perna estendida)
            a.leftLeg.rotation.x = -1.4 + rowP * (-Math.PI / 2 + 1.4); // -1.4 → -PI/2
            a.rightLeg.rotation.x = -1.4 + rowP * (-Math.PI / 2 + 1.4);
            // Knee: catch (1.7 super dobrado) → finish (0 estendido)
            a.leftCalf.rotation.x = (1 - rowP) * 1.7;
            a.rightCalf.rotation.x = (1 - rowP) * 1.7;
            // BRAÇOS:
            // Catch: braços estendidos pra FRENTE/cima = upper rotation.x = -1.0,
            //        forearm reto (0)
            // Finish: braços PUXADOS — upper rotation.x = +0.3 (cotovelo pra trás),
            //         forearm flex 2.0 (handle no peito)
            a.leftArm.rotation.x = -1.0 + rowP * 1.3; // -1.0 → +0.3
            a.rightArm.rotation.x = -1.0 + rowP * 1.3;
            a.leftArm.rotation.z = -0.15;
            a.rightArm.rotation.z = 0.15;
            // Forearm flex: catch (reto) → finish (dobra puxando)
            a.leftForearm.rotation.x = rowP * 2.0;
            a.rightForearm.rotation.x = rowP * 2.0;
            a.leftHand.rotation.set(0, 0, 0);
            a.rightHand.rotation.set(0, 0, 0);
          }
          break;
        case "burpee":
          // 4 fases reais com articulações
          if (p < 0.25) {
            // 1. Standing
            a.root.position.y = 0;
            a.root.rotation.x = 0;
            a.leftArm.rotation.set(-0.08, 0, -0.18);
            a.rightArm.rotation.set(-0.08, 0, 0.18);
            a.leftForearm.rotation.x = 0.18;
            a.rightForearm.rotation.x = 0.18;
            a.leftLeg.rotation.x = 0;
            a.rightLeg.rotation.x = 0;
            a.leftCalf.rotation.x = 0;
            a.rightCalf.rotation.x = 0;
          } else if (p < 0.5) {
            // 2. Squat down (deep squat)
            a.root.position.y = -0.6;
            a.root.rotation.x = 0;
            a.leftLeg.rotation.x = -0.5; // hip atras
            a.rightLeg.rotation.x = -0.5;
            a.leftCalf.rotation.x = 1.5; // joelhos super dobrados
            a.rightCalf.rotation.x = 1.5;
            a.leftArm.rotation.x = -0.6; // bracos pra frente apoiar no chao
            a.rightArm.rotation.x = -0.6;
            a.leftForearm.rotation.x = 0;
            a.rightForearm.rotation.x = 0;
          } else if (p < 0.75) {
            // 3. Plank
            a.root.rotation.x = -Math.PI / 2;
            a.root.position.y = 0.4;
            a.leftLeg.rotation.x = 0;
            a.rightLeg.rotation.x = 0;
            a.leftCalf.rotation.x = 0;
            a.rightCalf.rotation.x = 0;
            a.leftArm.rotation.x = 0;
            a.rightArm.rotation.x = 0;
            a.leftArm.rotation.z = -0.4;
            a.rightArm.rotation.z = 0.4;
            a.leftForearm.rotation.x = 0;
            a.rightForearm.rotation.x = 0;
          } else {
            // 4. Jump up (mãos pra cima)
            a.root.position.y = 0.4;
            a.root.rotation.x = 0;
            a.leftArm.rotation.x = -Math.PI;
            a.rightArm.rotation.x = -Math.PI;
            a.leftArm.rotation.z = -0.3;
            a.rightArm.rotation.z = 0.3;
            a.leftForearm.rotation.x = 0;
            a.rightForearm.rotation.x = 0;
            a.leftLeg.rotation.x = -0.2;
            a.rightLeg.rotation.x = -0.2;
            a.leftCalf.rotation.x = 0;
            a.rightCalf.rotation.x = 0;
          }
          break;
      }
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const t = (now - startT) / 1000;

      // V16.7 cycle 25: anima dust particles — descem lentamente + sway
      const dustPosArr = dustGeometry.attributes.position!.array as Float32Array;
      for (let i = 0; i < dustCount; i++) {
        const vx = dustVelocities[i * 3] ?? 0;
        const vy = dustVelocities[i * 3 + 1] ?? -0.04;
        const vz = dustVelocities[i * 3 + 2] ?? 0;
        const px = dustPosArr[i * 3] ?? 0;
        const py = dustPosArr[i * 3 + 1] ?? 0;
        const pz = dustPosArr[i * 3 + 2] ?? 0;
        dustPosArr[i * 3] = px + vx * dt * (1 + Math.sin(t * 0.3 + i) * 0.3);
        dustPosArr[i * 3 + 1] = py + vy * dt;
        dustPosArr[i * 3 + 2] = pz + vz * dt;
        // Reset quando cair abaixo do chão
        if (dustPosArr[i * 3 + 1]! < 0.2) {
          dustPosArr[i * 3 + 1] = 6.5;
          dustPosArr[i * 3] = (Math.random() - 0.5) * 38;
          dustPosArr[i * 3 + 2] = (Math.random() - 0.5) * 34;
        }
      }
      dustGeometry.attributes.position!.needsUpdate = true;

      // === EXERCISE ENGAGEMENT LOOP ===
      if (engagedEquipment) {
        // Update progress
        const eq = engagedEquipment;
        const isTapDriven = eq.exercise === "burpee" || eq.exercise === "boxjump" || eq.exercise === "kbswing";
        const isCardio = eq.exercise === "run" || eq.exercise === "bike" || eq.exercise === "row";
        // Cardio: count reps based on time pressed (1 rep / 0.6s)
        if (isCardio && exercisePressed) {
          const now = performance.now();
          if (!exerciseWasUp || now - lastTapTime > 600) {
            exerciseReps++;
            if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = String(exerciseReps);
            lastTapTime = now;
            exerciseWasUp = true;
            if (exerciseReps % 10 === 0) playChime();
          }
        }
        if (isCardio) {
          // Cardio anima continuamente quando pressed, para quando solta
          exerciseProgress = exercisePressed ? 1 : Math.max(0, exerciseProgress - dt * 2);
        }
        if (!isTapDriven && !isCardio) {
          const targetSpeed = exercisePressed ? 1.6 : -1.6;
          exerciseProgress = Math.max(0, Math.min(1, exerciseProgress + targetSpeed * dt));
          // Conta rep no peak (>0.92) e volta (<0.08)
          if (exerciseProgress > 0.92 && !exerciseWasUp) {
            exerciseWasUp = true;
            exerciseReps++;
            if (exerciseHudRepsEl) exerciseHudRepsEl.textContent = String(exerciseReps);
            // Milestone (every 5 reps) = chime + particle burst
            if (exerciseReps % 5 === 0) {
              playChime();
              tmpWorldPos.set(eq.x, 1.6, eq.z);
              tmpColor.set(0xd8ff2c);
              particleBurst.burst(tmpWorldPos, 25, tmpColor, 1.0);
            } else {
              playClick();
            }
          }
          if (exerciseProgress < 0.08) exerciseWasUp = false;
        }
        // Update progress bar
        if (exerciseHudProgressEl) {
          (exerciseHudProgressEl as HTMLElement).style.width = (exerciseProgress * 100) + "%";
        }
        animateAvatarForExercise(eq.exercise, exerciseProgress);

        // Posiciona virtual barbell pros 3 lifts principais
        const showBarbell = eq.exercise === "bench" || eq.exercise === "squat" || eq.exercise === "deadlift";
        virtualBarbell.visible = showBarbell;
        // Virtual KB pro swing
        virtualKB.visible = eq.exercise === "kbswing";
        if (eq.exercise === "kbswing") {
          // KB descreve arco entre as pernas (p=0) ate peito (p=1)
          const angle = -Math.PI / 2 - (1 - exerciseProgress) * Math.PI / 2;
          const ax = avatarParts.root.position.x;
          const az = avatarParts.root.position.z;
          // Posicao relativa frente do avatar (rotY)
          const fwd = new THREE.Vector3(Math.sin(eq.rotY), 0, Math.cos(eq.rotY));
          virtualKB.position.set(
            ax + fwd.x * Math.cos(angle) * 0.6,
            1.0 + Math.sin(angle) * 0.6,
            az + fwd.z * Math.cos(angle) * 0.6
          );
        }
        if (showBarbell) {
          // BARBELL SEGUE AS MAOS DO AVATAR (midpoint entre leftHand e rightHand mundo space)
          const lh = new THREE.Vector3();
          const rh = new THREE.Vector3();
          avatarParts.leftHand.getWorldPosition(lh);
          avatarParts.rightHand.getWorldPosition(rh);
          virtualBarbell.position.lerpVectors(lh, rh, 0.5);
          // Squat: barbell ATRAS da nuca, não nas mãos
          if (eq.exercise === "squat") {
            // Posiciona logo abaixo do pescoço (trapezios)
            virtualBarbell.position.set(
              avatarParts.root.position.x,
              avatarParts.root.position.y + 1.45,
              avatarParts.root.position.z - Math.cos(eq.rotY) * 0.05
            );
          }
          virtualBarbell.rotation.y = eq.rotY;
          // Tilt do barbell em deadlift (acompanha lean do torso)
          if (eq.exercise === "deadlift") {
            virtualBarbell.rotation.x = avatarParts.root.rotation.x;
          } else {
            virtualBarbell.rotation.x = 0;
          }
        }

        // Camera close-up por exercício (lateral pra lifts, frente pra pullup, etc)
        const lookY =
          eq.exercise === "pullup" ? 2.0 :
          eq.exercise === "bench" ? 1.4 : // alto pq bracos sobem
          eq.exercise === "pushup" ? 1.0 :
          eq.exercise === "deadlift" ? 0.8 :
          eq.exercise === "boxjump" ? 1.2 :
          eq.exercise === "row" ? 0.8 :
          eq.exercise === "bike" ? 0.9 :
          1.2;
        tmpCamTarget.set(eq.x, lookY, eq.z);
        let camDist = 3.5;
        let sideAngle = Math.PI / 2;
        let camHeight = 1.2;
        if (eq.exercise === "pullup") {
          sideAngle = 0;
          camHeight = 1.0;
          camDist = 3.5;
        } else if (eq.exercise === "bench") {
          sideAngle = Math.PI / 2; // side view
          camHeight = 1.6;
          camDist = 3.0;
        } else if (eq.exercise === "pushup") {
          sideAngle = Math.PI / 2;
          camHeight = 1.5;
          camDist = 3.0;
        } else if (eq.exercise === "boxjump" || eq.exercise === "burpee" || eq.exercise === "kbswing") {
          sideAngle = Math.PI / 3;
          camHeight = 1.6;
          camDist = 3.5;
        } else if (eq.exercise === "run" || eq.exercise === "bike" || eq.exercise === "row") {
          sideAngle = Math.PI / 3;
          camHeight = 1.4;
          camDist = 4.0;
        }
        tmpCamPos.set(
          eq.x + Math.sin(eq.rotY + sideAngle) * camDist,
          Math.max(0.6, lookY + camHeight), // nunca abaixo de y=0.6
          eq.z + Math.cos(eq.rotY + sideAngle) * camDist
        );
        camera.position.lerp(tmpCamPos, 0.08);
        camera.lookAt(tmpCamTarget);

        // Skip movement loop when engaged
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
        return;
      }

      // === PROXIMITY DETECTION ===
      // (only when not engaged + not in follow mode + not visit mode)
      if (!engagedEquipment) {
        const found = findNearestEquipment();
        if (found !== nearestEquipment) {
          nearestEquipment = found;
          if (promptEl && promptLabelEl) {
            if (found) {
              promptLabelEl.textContent =
                "[E] usar " + (EXERCISE_LABELS[found.exercise] ?? found.exercise);
              promptEl.classList.remove("hidden");
            } else {
              promptEl.classList.add("hidden");
            }
          }
        }
        // Pulsing highlight no equipamento mais proximo (efeito de "aura")
        for (const eq of equipmentRefs) {
          if (!eq.mesh.userData.proximityRing) continue;
          const ring = eq.mesh.userData.proximityRing as THREE.Mesh;
          const isNear = eq === found;
          (ring.material as THREE.MeshBasicMaterial).opacity = isNear
            ? 0.4 + Math.sin(t * 4) * 0.2
            : 0;
        }
      }

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

        // Walk cycle: pernas e braços alternados (com knee flex realista)
        walkPhase += dt * 8;
        const swing = Math.sin(walkPhase) * 0.55;
        avatarParts.leftLeg.rotation.x = swing;
        avatarParts.rightLeg.rotation.x = -swing;
        // Knee flex quando perna sobe (rotation.x positivo)
        avatarParts.leftCalf.rotation.x = Math.max(0, swing) * 0.8;
        avatarParts.rightCalf.rotation.x = Math.max(0, -swing) * 0.8;
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
        // Knee tambem volta a 0
        avatarParts.leftCalf.rotation.x = lerpAngle(
          avatarParts.leftCalf.rotation.x, 0, 0.1
        );
        avatarParts.rightCalf.rotation.x = lerpAngle(
          avatarParts.rightCalf.rotation.x, 0, 0.1
        );
        // Cycle 96: idle preserva pose natural (-0.08 = leve pra frente)
        // em vez de lerp pra 0 (braços rígidos pendulares).
        avatarParts.leftArm.rotation.x = lerpAngle(
          avatarParts.leftArm.rotation.x,
          -0.08,
          0.1
        );
        avatarParts.rightArm.rotation.x = lerpAngle(
          avatarParts.rightArm.rotation.x,
          -0.08,
          0.1
        );
        avatarParts.root.position.y = Math.sin(t * 1.6) * 0.03;
        avatarParts.head.rotation.y = Math.sin(t * 0.8) * 0.05;
      }

      // Camera mode + shake offset
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
      // Aplica camera shake (sutil offset)
      const shake = cameraShake.update(dt);
      camera.position.add(shake);

      // Update particles
      particleBurst.update(dt);

      // === GAMIFICATION ANIMATIONS ================================
      // LED stripe pulse (3+ trofeus desbloqueados)
      if (showLedPulse) {
        const pulse = (Math.sin(t * 2.5) + 1) / 2; // 0..1
        for (const led of ledStripes) {
          // varia opacidade do material (precisa ser MeshBasic)
          const mat = led.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.6 + pulse * 0.4;
          mat.transparent = true;
        }
      }

      // Laser cross (6+ trofeus): rotaciona suavemente
      if (showLaserCross && laserBeams.length === 2) {
        const lb1 = laserBeams[0];
        const lb2 = laserBeams[1];
        if (lb1) lb1.rotation.z = 0.04 + Math.sin(t * 0.8) * 0.05;
        if (lb2) lb2.rotation.z = -0.04 + Math.cos(t * 0.7) * 0.05;
      }

      // Avatar follow spot — segue o avatar
      avatarSpot.position.set(
        avatarParts.root.position.x,
        7,
        avatarParts.root.position.z + 4
      );
      avatarSpot.target.position.copy(avatarParts.root.position);
      avatarSpot.target.position.y = 1.0;

      // Atualiza tela do projetor da sala de Reels
      drawProjectorScreen(t, activeReelRef.current);

      // V16.7 cycle 12: NPC anim mais visível — bob 4x maior + sway 2x
      // Bug: head.position.y absoluto era 2.05, somando 0.025 dá pouco efeito.
      // Agora bob de 0.1 (10cm vai pra cima/baixo) + tilt da cabeça.
      for (const npc of npcAnimRefs) {
        npc.head.position.y = 2.05 + Math.sin(t * 1.4 + npc.phase) * 0.08;
        npc.head.rotation.z = Math.sin(t * 0.9 + npc.phase) * 0.05;
        npc.body.rotation.y = Math.sin(t * 0.7 + npc.phase) * 0.08;
      }

      // V16.7 cycle 29: billboard tags — sempre face camera
      sponsorsGroup.traverse((obj) => {
        if (obj.userData.isBillboard) {
          obj.lookAt(camera.position);
        }
      });

      // Anima chama do streak pillar (flicker + scale pulse)
      const flameScale = 1 + Math.sin(t * 8) * 0.08 + Math.sin(t * 13) * 0.04;
      streakFlameRef.scale.set(flameScale, flameScale * 1.1, flameScale);
      streakFlameRef.rotation.y = Math.sin(t * 2) * 0.1;

      // Avatar aura (10+ trofeus) — anima glow pulsante na ring abaixo
      if (avatarAura) {
        const auraScale = 1 + Math.sin(t * 2) * 0.05;
        avatarAura.scale.set(auraScale, 1, auraScale);
        const auraMat = avatarAura.material as THREE.MeshBasicMaterial;
        auraMat.opacity = 0.4 + Math.sin(t * 2) * 0.15;
        // Mantém aura debaixo do avatar
        avatarAura.position.x = avatarParts.root.position.x;
        avatarAura.position.z = avatarParts.root.position.z;
      }

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
      window.removeEventListener("keydown", onExerciseKeyDown);
      window.removeEventListener("keyup", onExerciseKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onCanvasDown);
      renderer.domElement.removeEventListener("pointerup", onCanvasUp);
      if (joy) {
        joy.removeEventListener("pointerdown", onJoyDown);
        joy.removeEventListener("pointermove", onJoyMove);
        joy.removeEventListener("pointerup", onJoyUp);
        joy.removeEventListener("pointercancel", onJoyUp);
      }
      // Audio: para o ambient hum + dispose canvas textures (vazavam VRAM)
      stopAmbient();
      projScreenTex.dispose();
      controls.dispose();
      particleBurst.dispose();
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
  // Deps: rebuild da cena quando atleta/troféus/avatar mudam.
  // skillsLocal/runsLocal incluídos pq o board 3D mostra os valores atuais —
  // sem eles, salvar uma skill no modal não atualizaria o painel até reload.
  // Trade-off conhecido: rebuild custoso, mas raro (1-2x por sessão).
  }, [athleteName, accent, trophies, avatarPrefs, skillsLocal, runsLocal, streakDays]);

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

      {/* TOP-LEFT HUD: Streak + Próxima conquista + Audio toggle */}
      <div
        style={{ position: "absolute", top: 12, left: 12, zIndex: 10 }}
        className="flex flex-col gap-2 items-start"
      >
        {/* STREAK Duolingo-style */}
        <div className="flex items-center gap-2 rounded-full bg-navy-900/90 border-2 border-orange-500/70 px-3.5 py-2 shadow-lg shadow-orange-500/20">
          <span className="text-xl leading-none">🔥</span>
          <div className="flex items-baseline gap-1">
            <span
              className="font-display text-lg tabular-nums leading-none"
              style={{
                color:
                  streakDays >= 30
                    ? "#ff44aa"
                    : streakDays >= 7
                    ? "#ff5050"
                    : streakDays >= 3
                    ? "#ff8030"
                    : "#ffa050",
              }}
            >
              {streakDays}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-navy-300 leading-none">
              {streakDays === 1 ? "dia" : "dias"}
            </span>
          </div>
        </div>

        {/* PROGRESSO — meta clara "X/11 troféus" */}
        <div className="flex items-center gap-2 rounded-full bg-navy-900/90 border-2 border-brand-lime/70 px-3.5 py-2 shadow-lg shadow-brand-lime/20">
          <span className="text-base leading-none">🏆</span>
          <span className="font-display text-sm tabular-nums leading-none text-brand-lime">
            {trophies.length}<span className="text-navy-300">/11</span>
          </span>
        </div>

        {/* LEVEL pill — clica abre breakdown */}
        {(() => {
          const lvl = levelFromXp(xpTotal);
          const next = xpToNextLevel(xpTotal);
          const xpDisplay =
            xpTotal >= 10000
              ? `${(xpTotal / 1000).toFixed(1)}k`
              : String(xpTotal);
          return (
            <button
              type="button"
              onClick={() => {
                playClick();
                openXpBreakdown();
              }}
              className="group relative flex items-center gap-2 rounded-full bg-navy-900/90 border-2 border-fuchsia-500/70 hover:border-fuchsia-400 hover:bg-fuchsia-500/10 px-3.5 py-2 transition shadow-lg shadow-fuchsia-500/20"
              aria-label="Ver breakdown de XP"
            >
              <span className="text-base leading-none">✨</span>
              <span className="font-display text-sm leading-none text-fuchsia-300">
                LVL {lvl}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-navy-300 leading-none tabular-nums">
                {xpDisplay} XP
              </span>
              {/* Mini progress bar embaixo */}
              <span
                className="absolute left-3 right-3 bottom-0.5 h-0.5 bg-fuchsia-500/20 rounded-full overflow-hidden"
                aria-hidden="true"
              >
                <span
                  className="block h-full bg-fuchsia-400 transition-all"
                  style={{ width: `${next.pctInLevel}%` }}
                />
              </span>
            </button>
          );
        })()}

        {/* Próxima conquista (primeiro ghost da lista) */}
        {(() => {
          const nextGhost = HALL_EXERCISES.find(
            (id) => !trophies.find((t) => t.exerciseId === id)
          );
          if (!nextGhost) return null;
          return (
            <a
              href={`/pr/log?ex=${nextGhost}`}
              className="flex items-center gap-2 rounded-full bg-navy-900/90 border-2 border-white/30 px-3.5 py-2 hover:border-brand-lime/60 hover:bg-brand-lime/10 transition shadow-md"
              onClick={() => playClick()}
            >
              <span className="text-[10px] uppercase tracking-widest text-navy-300 leading-none">
                Próximo
              </span>
              <span className="text-xs font-semibold text-white leading-none">
                {exerciseLabelFn(nextGhost as ExerciseId)}
              </span>
              <span className="text-xs text-brand-lime leading-none">→</span>
            </a>
          );
        })()}

        {/* Audio mute toggle */}
        <button
          type="button"
          onClick={() => {
            const newMuted = !audioMuted;
            setAudioMuted(newMuted);
            setMuted(newMuted);
            if (!newMuted) playClick();
          }}
          className="flex items-center gap-2 rounded-full bg-navy-900/90 border-2 border-white/30 px-3.5 py-2 text-[10px] uppercase tracking-widest text-navy-300 hover:text-white hover:border-white/50 transition shadow-md"
          aria-label={audioMuted ? "Ativar som" : "Mute"}
        >
          <span className="text-base leading-none">{audioMuted ? "🔇" : "🔊"}</span>
          {audioMuted ? "Mutado" : "Som"}
        </button>
      </div>

      {/* Top-right HUD: Camera + Reels + Customize */}
      <div
        style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}
        className="flex flex-col gap-2 items-end"
      >
        <button
          type="button"
          onClick={() => setMode((m) => (m === "follow" ? "orbit" : "follow"))}
          className="text-[10px] uppercase tracking-widest font-display rounded-full border-2 border-white/40 bg-navy-900/90 text-white px-3.5 py-2 hover:border-brand-lime hover:text-brand-lime transition shadow-md"
          aria-label="Trocar modo de câmera"
        >
          {mode === "follow" ? "📷 Seguir" : "🔄 Girar"}
        </button>
        <button
          type="button"
          onClick={() => setReelOpen(true)}
          className="text-[10px] uppercase tracking-widest font-display rounded-full border-2 border-brand-lime/70 bg-brand-lime/15 text-brand-lime px-3.5 py-2 hover:bg-brand-lime/30 transition shadow-md shadow-brand-lime/10"
          aria-label="Abrir Reels"
        >
          🎬 Reels
        </button>
        {!visitMode && (
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="text-[10px] uppercase tracking-widest font-display rounded-full border-2 border-white/40 bg-navy-900/90 text-white px-3.5 py-2 hover:border-brand-lime hover:text-brand-lime transition shadow-md"
            aria-label="Customizar avatar"
          >
            👤 Avatar
          </button>
        )}
      </div>

      {/* Joystick */}
      <div
        ref={joystickRef}
        style={{ position: "absolute", bottom: 16, left: 16, zIndex: 10, touchAction: "none" }}
        className="w-28 h-28 rounded-full border-2 border-brand-lime/40 bg-navy-900/80 select-none shadow-lg shadow-brand-lime/10"
        aria-label="Joystick"
      >
        <div
          ref={knobRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-brand-lime shadow-lg shadow-brand-lime/40 pointer-events-none transition-transform duration-75"
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

      {/* Ghost trophy modal — exercício sem PR registrado */}
      {selectedGhost && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 25 }}
          className="flex items-end sm:items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedGhost(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-navy-700 bg-navy-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300">
                  EXERCÍCIO
                </div>
                <div className="font-display text-xl tracking-tight truncate">
                  {selectedGhost.label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGhost(null)}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-5 mb-4 text-center">
              <div className="text-6xl mb-2 opacity-40">?</div>
              <div className="text-sm text-navy-300 leading-tight">
                Você ainda não registrou um PR de{" "}
                <span className="text-white">{selectedGhost.label}</span>.
              </div>
            </div>
            <a
              href={`/pr/log?ex=${selectedGhost.id}`}
              className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
            >
              Desbloquear este pedestal →
            </a>
            <button
              type="button"
              onClick={() => setSelectedGhost(null)}
              className="block w-full text-center text-xs text-navy-300 hover:text-white mt-3"
            >
              Voltar pro ginásio
            </button>
          </div>
        </div>
      )}

      {/* Pro directory list modal — quando clica NPC sem contratante */}
      {selectedProType && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 28 }}
          className="flex items-end sm:items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedProType(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border-2 border-brand-lime/50 bg-navy-900 shadow-2xl shadow-brand-lime/15 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-navy-700">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
                  PROFISSIONAIS DISPONÍVEIS
                </div>
                <div className="font-display text-lg tracking-tight">
                  {selectedProType === "nutri" ? "Nutricionistas" : "Personal Trainers"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProType(null)}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
                {getProsByType(selectedProType).map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-navy-700 bg-navy-800/40 p-3"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-12 h-12 rounded-full grid place-items-center font-display text-xl flex-shrink-0"
                        style={{ background: p.avatarColor, color: "#01002A" }}
                      >
                        {p.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm leading-tight">{p.name}</div>
                        <div className="text-[11px] text-navy-300 leading-tight">
                          {p.city} · {p.state}
                        </div>
                        <div className="text-[10px] text-brand-lime mt-0.5">{p.specialty}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/${p.whatsapp}`}
                        target="_blank"
                        rel="noopener"
                        className="flex-1 text-center text-xs rounded-lg bg-brand-lime text-navy-900 font-semibold px-3 py-2 hover:opacity-90 transition"
                      >
                        💬 WhatsApp
                      </a>
                      <a
                        href={`https://instagram.com/${p.instagram}`}
                        target="_blank"
                        rel="noopener"
                        className="flex-1 text-center text-xs rounded-lg border border-navy-600 text-white px-3 py-2 hover:bg-navy-800 transition"
                      >
                        📷 Instagram
                      </a>
                    </div>
                    <div className="text-[10px] text-navy-300 mt-2 text-right">
                      {p.credential}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-navy-300 mt-3 text-center">
                PR Tracker valida CREF / CRN antes de aprovar cada profissional
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sponsor booth modal — Nutricionista / PT / Slot vago */}
      {selectedSponsor && (
        <div
          style={{ position: "absolute", inset: 0, zIndex: 28 }}
          className="flex items-end sm:items-center justify-center bg-black/75 p-4"
          onClick={() => setSelectedSponsor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-brand-lime/40 bg-navy-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-navy-700">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
                  {selectedSponsor.professional ? "PROFISSIONAL FITNESS" : "SLOT DISPONÍVEL"}
                </div>
                <div className="font-display text-lg tracking-tight">{selectedSponsor.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSponsor(null)}
                className="text-navy-300 hover:text-white text-lg leading-none"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {selectedSponsor.professional ? (
              <div className="p-5 max-h-[75vh] overflow-y-auto">
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-20 h-20 rounded-full grid place-items-center font-display text-3xl flex-shrink-0"
                    style={{
                      background: selectedSponsor.professional.avatarColor,
                      color: "#01002A",
                    }}
                  >
                    {selectedSponsor.professional.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-display text-xl tracking-tight">
                      {selectedSponsor.professional.name}
                    </div>
                    <div className="text-xs text-navy-300">
                      {selectedSponsor.professional.specialty}
                    </div>
                  </div>
                </div>

                {/* Marketplace — dietas (Nutri) ou treinos (PT) */}
                <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime mb-2 mt-4">
                  {selectedSponsor.id === "nutri" ? "DIETAS DISPONÍVEIS" : "TREINOS DISPONÍVEIS"}
                </div>
                <ul className="space-y-2 mb-4">
                  {(selectedSponsor.id === "nutri"
                    ? [
                        { title: "Cutting 12 semanas", subtitle: "Hipertrofia · 2.300 kcal/dia", price: "R$ 89" },
                        { title: "Bulking limpo", subtitle: "Ganho de massa · 3.200 kcal/dia", price: "R$ 89" },
                        { title: "Plano competição", subtitle: "Powerlifting peak week", price: "R$ 149" },
                      ]
                    : [
                        { title: "Hipertrofia 4×/sem", subtitle: "Push-Pull-Legs · 12 semanas", price: "R$ 99" },
                        { title: "Powerlifting 5/3/1", subtitle: "Foco em PR · 16 semanas", price: "R$ 129" },
                        { title: "CrossFit conditioning", subtitle: "WODs progressivos", price: "R$ 89" },
                      ]
                  ).map((item) => (
                    <li
                      key={item.title}
                      className="rounded-xl border border-navy-700 bg-navy-800/40 p-3 flex items-center gap-3 hover:border-brand-lime/40 transition"
                    >
                      <div className="text-2xl flex-shrink-0">
                        {selectedSponsor.id === "nutri" ? "🥗" : "💪"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{item.title}</div>
                        <div className="text-[11px] text-navy-300 truncate">{item.subtitle}</div>
                      </div>
                      <div className="text-xs font-bold text-brand-lime tabular-nums flex-shrink-0">
                        {item.price}
                      </div>
                    </li>
                  ))}
                </ul>

                <a
                  href="https://wa.me/5551982061914"
                  target="_blank"
                  rel="noopener"
                  className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition mb-2"
                >
                  💬 Comprar pelo WhatsApp
                </a>
                <a
                  href="https://instagram.com/pr.tracker"
                  target="_blank"
                  rel="noopener"
                  className="block w-full text-center rounded-lg border border-navy-600 text-white font-semibold px-4 py-2.5 hover:bg-navy-800 transition text-sm"
                >
                  📷 Ver Instagram
                </a>
                <p className="text-[10px] text-navy-300 text-center mt-3">
                  Slot patrocinado · PR Tracker valida CREF / CRN antes de aprovar
                </p>
              </div>
            ) : (
              <div className="p-5">
                <div className="rounded-xl bg-brand-lime/10 border border-brand-lime/30 p-4 mb-4 text-center">
                  <div className="text-3xl mb-2">📣</div>
                  <div className="font-display text-2xl tracking-tight text-brand-lime mb-1">
                    R$ 99/mês
                  </div>
                  <div className="text-xs text-navy-300">
                    Apareça no gym virtual de atletas BR
                  </div>
                </div>
                <p className="text-sm text-navy-300 mb-4 leading-relaxed">
                  É nutricionista, personal trainer, fisio ou coach? Coloque seu
                  perfil em destaque dentro do ginásio virtual de cada atleta PR
                  Tracker. Quando alguém clica, vai direto pro seu WhatsApp.
                </p>
                <ul className="text-xs text-navy-300 space-y-2 mb-5">
                  <li>✓ Foto + nome + especialidade no booth</li>
                  <li>✓ Botão direto pro seu WhatsApp + Instagram</li>
                  <li>✓ Validamos seu CREF / CRN antes</li>
                  <li>✓ Cancela quando quiser</li>
                </ul>
                <a
                  href="https://wa.me/5551982061914?text=Quero%20anunciar%20no%20PR%20Tracker"
                  target="_blank"
                  rel="noopener"
                  className="block w-full text-center rounded-lg bg-brand-lime text-navy-900 font-semibold px-4 py-3 hover:opacity-90 transition"
                >
                  Quero anunciar →
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedSponsor(null)}
                  className="block w-full text-center text-xs text-navy-300 hover:text-white mt-3"
                >
                  Voltar pro ginásio
                </button>
              </div>
            )}
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
            className="w-full max-w-md rounded-2xl border-2 border-brand-lime/40 bg-navy-900 shadow-2xl shadow-brand-lime/10 overflow-hidden"
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

      {/* Skills (ginásticos) modal — input reps por skill */}
      {skillsModalOpen && (
        <SkillsModal
          skills={skillsLocal}
          onClose={() => setSkillsModalOpen(false)}
          onSave={saveSkill}
        />
      )}

      {/* Run records modal — input tempo por distância */}
      {runsModalOpen && (
        <RunsModal
          runs={runsLocal}
          onClose={() => setRunsModalOpen(false)}
          onSave={saveRun}
        />
      )}

      {/* XP breakdown modal */}
      {xpModalOpen && (
        <XpBreakdownModal
          fallbackTotal={xpTotal}
          breakdown={xpBreakdown}
          loading={xpLoading}
          onClose={() => setXpModalOpen(false)}
        />
      )}
    </>
  );
}

// =================================================================
// XpBreakdownModal — mostra de onde vem cada XP (PR / skill / run / streak)
// =================================================================

interface XpBreakdownModalProps {
  fallbackTotal: number;
  breakdown: XpBreakdown | null;
  loading: boolean;
  onClose: () => void;
}

function XpBreakdownModal({
  fallbackTotal,
  breakdown,
  loading,
  onClose,
}: XpBreakdownModalProps) {
  const total = breakdown?.total ?? fallbackTotal;
  const lvl = breakdown?.level ?? levelFromXp(total);
  const next = xpToNextLevel(total);

  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 32 }}
      className="flex items-end sm:items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-fuchsia-500/50 bg-navy-900 shadow-2xl shadow-fuchsia-500/15 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-navy-700">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-300">
              ✨ EXPERIÊNCIA
            </div>
            <div className="font-display text-lg tracking-tight">
              Level {lvl}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-navy-300 hover:text-white text-lg leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* XP total + barra de progresso */}
          <div className="rounded-xl border border-navy-700 bg-navy-800/40 p-4 mb-4 text-center">
            <div className="font-display text-4xl tabular-nums text-fuchsia-300">
              {total.toLocaleString("pt-BR")}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-navy-300 mt-1">
              XP TOTAL
            </div>
            <div className="mt-3">
              <div className="h-2 bg-navy-900 rounded-full overflow-hidden border border-navy-700">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-600 to-fuchsia-300 transition-all"
                  style={{ width: `${next.pctInLevel}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-navy-300 mt-1.5 tabular-nums">
                <span>Lvl {lvl}</span>
                <span>+{next.needed.toLocaleString("pt-BR")} XP pra Lvl {lvl + 1}</span>
              </div>
            </div>
          </div>

          {/* Breakdown por fonte */}
          {loading && !breakdown ? (
            <div className="text-center text-sm text-navy-300 py-6">
              Calculando...
            </div>
          ) : breakdown ? (
            <>
              <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300 mb-2">
                DE ONDE VEM
              </div>
              <ul className="space-y-1.5 mb-4">
                <BreakdownRow
                  emoji="🏋️"
                  label="PRs de força"
                  amount={breakdown.bySource.lift_pr}
                  total={total}
                  color="#D8FF2C"
                />
                <BreakdownRow
                  emoji="🤸"
                  label="Skills (BMU/MU/...)"
                  amount={breakdown.bySource.skill_tier}
                  total={total}
                  color="#7df9ff"
                />
                <BreakdownRow
                  emoji="🏃"
                  label="Corridas"
                  amount={breakdown.bySource.run_pr}
                  total={total}
                  color="#43B02A"
                />
                <BreakdownRow
                  emoji="🔥"
                  label="Dias com PR (streak)"
                  amount={breakdown.bySource.streak_day}
                  total={total}
                  color="#ff8030"
                />
              </ul>
              <p className="text-[10px] text-navy-300 leading-tight px-1">
                XP é ganho só em recordes batidos — bater 100kg de novo não dá
                XP, só superar.
              </p>
            </>
          ) : (
            <div className="text-center text-sm text-navy-300 py-4">
              Sem dados ainda. Bate seu primeiro PR pra começar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BreakdownRowProps {
  emoji: string;
  label: string;
  amount: number;
  total: number;
  color: string;
}

function BreakdownRow({ emoji, label, amount, total, color }: BreakdownRowProps) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <li className="rounded-lg bg-navy-800/40 border border-navy-700 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{emoji}</span>
        <span className="text-xs text-navy-100 flex-1 truncate">{label}</span>
        <span className="text-sm font-display tabular-nums" style={{ color }}>
          {amount.toLocaleString("pt-BR")}
        </span>
      </div>
      <div className="mt-1 h-1 bg-navy-900 rounded-full overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </li>
  );
}

// =================================================================
// SkillsModal — registra reps consecutivos por skill (BMU/MU/HSPU/...)
// =================================================================

interface SkillsModalProps {
  skills: Partial<Record<SkillId, number>>;
  onClose: () => void;
  onSave: (skillId: SkillId, reps: number) => Promise<void>;
}

function SkillsModal({ skills, onClose, onSave }: SkillsModalProps) {
  const [editing, setEditing] = useState<SkillId | null>(null);
  const [draftReps, setDraftReps] = useState("");

  function startEdit(skillId: SkillId) {
    setEditing(skillId);
    setDraftReps(String(skills[skillId] ?? ""));
  }

  async function commitEdit() {
    if (!editing) return;
    const n = Math.floor(Number(draftReps));
    if (Number.isFinite(n) && n >= 0) {
      await onSave(editing, n);
    }
    setEditing(null);
    setDraftReps("");
  }

  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 28 }}
      className="flex items-end sm:items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-brand-lime/50 bg-navy-900 shadow-2xl shadow-brand-lime/15 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-navy-700">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
              GINÁSTICOS
            </div>
            <div className="font-display text-lg tracking-tight">
              Quantos consecutivos?
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-navy-300 hover:text-white text-lg leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-navy-300 px-2 mb-3 leading-tight">
            Tier sobe com reps consecutivos: <b className="text-brand-lime">3</b>{" "}
            Bronze · <b className="text-brand-lime">5</b> Prata ·{" "}
            <b className="text-brand-lime">10</b> Ouro ·{" "}
            <b className="text-brand-lime">20</b> Diamante.
          </p>
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
            {SKILL_CATALOG.map((s) => {
              const reps = skills[s.id] ?? 0;
              const tier = tierForReps(reps);
              const meta = SKILL_TIER_META[tier];
              const goal = nextTierGoal(reps);
              const isEdit = editing === s.id;
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-navy-700 bg-navy-800/40 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full grid place-items-center font-display text-sm flex-shrink-0 border-2"
                      style={{
                        background: meta.color,
                        color: meta.textColor,
                        borderColor: tier === "locked" ? "transparent" : "#D8FF2C",
                      }}
                    >
                      {s.short}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{s.label}</div>
                      <div className="text-[11px] text-navy-300">
                        {reps > 0 ? (
                          <>
                            <span className="text-white font-bold tabular-nums">{reps}</span> reps ·{" "}
                            <span style={{ color: meta.color }}>{meta.label}</span>
                          </>
                        ) : (
                          <span className="opacity-60">Bloqueado</span>
                        )}
                      </div>
                      {goal && (
                        <div className="text-[10px] text-brand-lime mt-0.5">
                          +{goal.repsToGo} pra {SKILL_TIER_META[goal.tier].label}
                        </div>
                      )}
                    </div>
                    {!isEdit ? (
                      <button
                        type="button"
                        onClick={() => startEdit(s.id)}
                        className="text-xs rounded-lg bg-brand-lime text-navy-900 font-semibold px-3 py-1.5 hover:opacity-90 transition flex-shrink-0"
                      >
                        {reps > 0 ? "Atualizar" : "Registrar"}
                      </button>
                    ) : null}
                  </div>
                  {isEdit && (
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max="5000"
                        value={draftReps}
                        onChange={(e) => setDraftReps(e.target.value)}
                        autoFocus
                        placeholder="reps consecutivos"
                        className="flex-1 rounded-lg bg-navy-900 border border-navy-600 text-white px-3 py-2 text-sm focus:border-brand-lime focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={commitEdit}
                        className="text-xs rounded-lg bg-brand-lime text-navy-900 font-semibold px-3 py-2 hover:opacity-90 transition"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setDraftReps("");
                        }}
                        className="text-xs text-navy-300 hover:text-white px-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// RunsModal — registra tempo por distância (5K/10K/21K/42K)
// =================================================================

interface RunsModalProps {
  runs: Partial<Record<RunDistance, number>>;
  onClose: () => void;
  onSave: (distance: RunDistance, timeSec: number) => Promise<void>;
}

function RunsModal({ runs, onClose, onSave }: RunsModalProps) {
  const [editing, setEditing] = useState<RunDistance | null>(null);
  const [draftTime, setDraftTime] = useState("");
  const [parseError, setParseError] = useState(false);

  function startEdit(distance: RunDistance) {
    setEditing(distance);
    const cur = runs[distance];
    setDraftTime(cur ? formatRunTime(cur) : "");
    setParseError(false);
  }

  async function commitEdit() {
    if (!editing) return;
    const sec = parseRunTime(draftTime);
    if (sec == null) {
      setParseError(true);
      return;
    }
    await onSave(editing, sec);
    setEditing(null);
    setDraftTime("");
    setParseError(false);
  }

  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: 28 }}
      className="flex items-end sm:items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border-2 border-brand-lime/50 bg-navy-900 shadow-2xl shadow-brand-lime/15 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-navy-700">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
              MEUS RPs · CORRIDA
            </div>
            <div className="font-display text-lg tracking-tight">
              Seus melhores tempos
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-navy-300 hover:text-white text-lg leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-navy-300 px-2 mb-3 leading-tight">
            Formato: <b className="text-brand-lime">MM:SS</b> ou{" "}
            <b className="text-brand-lime">HH:MM:SS</b>. Salvamos só se for mais
            rápido que seu PR atual.
          </p>
          <ul className="space-y-2">
            {RUN_CATALOG.map((r) => {
              const sec = runs[r.id];
              const isEdit = editing === r.id;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-navy-700 bg-navy-800/40 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-lg grid place-items-center font-display text-base flex-shrink-0"
                      style={{
                        background: sec != null ? "#D8FF2C" : "#2d2d3a",
                        color: sec != null ? "#01002A" : "#9ca3af",
                      }}
                    >
                      {r.short}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{r.label}</div>
                      <div className="text-[13px] tabular-nums">
                        {sec != null ? (
                          <span className="text-white font-bold">
                            {formatRunTime(sec)}
                          </span>
                        ) : (
                          <span className="text-navy-300 opacity-60">— : — : —</span>
                        )}
                      </div>
                    </div>
                    {!isEdit ? (
                      <button
                        type="button"
                        onClick={() => startEdit(r.id)}
                        className="text-xs rounded-lg bg-brand-lime text-navy-900 font-semibold px-3 py-1.5 hover:opacity-90 transition flex-shrink-0"
                      >
                        {sec != null ? "Atualizar" : "Registrar"}
                      </button>
                    ) : null}
                  </div>
                  {isEdit && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={draftTime}
                          onChange={(e) => {
                            setDraftTime(e.target.value);
                            setParseError(false);
                          }}
                          autoFocus
                          placeholder={r.id === "5k" ? "22:30" : r.id === "42k" ? "04:15:00" : "48:12"}
                          className={`flex-1 rounded-lg bg-navy-900 border text-white px-3 py-2 text-sm tabular-nums focus:outline-none ${
                            parseError ? "border-red-500" : "border-navy-600 focus:border-brand-lime"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={commitEdit}
                          className="text-xs rounded-lg bg-brand-lime text-navy-900 font-semibold px-3 py-2 hover:opacity-90 transition"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setDraftTime("");
                            setParseError(false);
                          }}
                          className="text-xs text-navy-300 hover:text-white px-2"
                        >
                          ✕
                        </button>
                      </div>
                      {parseError && (
                        <p className="text-[10px] text-red-400 mt-1">
                          Formato inválido. Use MM:SS ou HH:MM:SS.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// =================================================================
// HELPERS
// =================================================================

/**
 * Builder dispatcher pros equipamentos do V15 (multiple-instance).
 * Singletons (boards, booths, streak, etc) ainda são construídos
 * inline no componente porque têm side-effects (raycast hitBox,
 * NPCs animados, etc).
 */
function buildExtraEquipment(
  type: GymObjectType,
  accentHex: string
): THREE.Group | null {
  let g: THREE.Group | null = null;
  let playExercise: string | null = null;
  switch (type) {
    case "bench":
      g = buildBench();
      playExercise = "bench";
      break;
    case "squat_rack":
      g = buildSquatRack(accentHex);
      playExercise = "squat";
      break;
    case "dumbbell_rack":
      g = buildDumbbellRack();
      playExercise = "pushup";
      break;
    case "kettlebell":
      g = buildKettlebell(0.18);
      playExercise = "kbswing";
      break;
    case "plate_tree":
      g = buildPlateTree();
      break;
    case "cable_machine":
      g = buildCableMachine(accentHex);
      playExercise = "pullup";
      break;
    case "treadmill":
      g = buildTreadmill(accentHex);
      playExercise = "run";
      break;
    case "assault_bike":
      g = buildAssaultBike(accentHex);
      playExercise = "bike";
      break;
    case "rowing_machine":
      g = buildRowingMachine(accentHex);
      playExercise = "row";
      break;
    case "plyo_box":
      g = buildPlyoBox(0.6);
      playExercise = "boxjump";
      break;
    case "crossfit_rig":
      g = buildCrossFitRig(4.0, 2.0).group;
      playExercise = "pullup";
      break;
    default:
      return null;
  }
  if (g && playExercise) {
    g.userData.playExercise = playExercise;
  }
  return g;
}

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
