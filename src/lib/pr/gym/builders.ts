import * as THREE from "three";
import { splitPlates, BAR_KG } from "../plates";
import type { AvatarPrefs } from "./avatar-prefs";

// =================================================================
// MATERIAIS COMPARTILHADOS
// =================================================================

export const STEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x2a2d3a,
  roughness: 0.4,
  metalness: 0.75,
});
export const RUBBER_MAT = new THREE.MeshStandardMaterial({
  color: 0x0a0a14,
  roughness: 0.95,
  metalness: 0.05,
});
export const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x14111e,
  roughness: 0.85,
  metalness: 0.05,
});
export const VINYL_MAT = new THREE.MeshStandardMaterial({
  color: 0x080814,
  roughness: 0.4,
  metalness: 0.1,
});
export const CHROME_MAT = new THREE.MeshStandardMaterial({
  color: 0xc0c5cc,
  roughness: 0.22,
  metalness: 0.92,
});

// =================================================================
// CORES IWF DE ANILHAS — para troféus realistas
// =================================================================

const IWF_COLOR_BY_KG: Record<number, number> = {
  25: 0xda291c,    // vermelho
  20: 0x0057b8,    // azul
  15: 0xffc72c,    // amarelo
  10: 0x43b02a,    // verde
  5: 0x111111,     // preto
  2.5: 0x2563eb,   // azul claro
  1.25: 0xc0c5cc,  // cinza
};

// =================================================================
// AVATAR V2 — corpo completo customizável
// =================================================================

export interface AvatarParts {
  root: THREE.Group;
  /** Body parts pra animação de caminhada (alternar pernas/braços). */
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  /** Cabeça pra leve idle bob. */
  head: THREE.Group;
}

/**
 * Constrói o avatar customizado. Retorna refs pras partes pra animação
 * de caminhada no loop principal.
 */
export function buildAvatar(prefs: AvatarPrefs): AvatarParts {
  const root = new THREE.Group();

  // Materiais por preferência
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.skin),
    roughness: 0.55,
    metalness: 0.05,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.hair),
    roughness: 0.7,
    metalness: 0.05,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.top),
    roughness: 0.6,
    metalness: 0.1,
    emissive: new THREE.Color(prefs.top),
    emissiveIntensity: 0.05,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.shorts),
    roughness: 0.7,
    metalness: 0.05,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
    metalness: 0.1,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a14 });

  // Proporções por gênero (fluid = média)
  const isF = prefs.gender === "female";
  const isM = prefs.gender === "male";
  const torsoTopR = isF ? 0.26 : isM ? 0.32 : 0.28;
  const torsoBotR = isF ? 0.22 : isM ? 0.28 : 0.24;
  const hipR = isF ? 0.28 : isM ? 0.26 : 0.27;
  const shoulderW = isF ? 0.36 : isM ? 0.42 : 0.38;

  // === HEAD ===
  const head = new THREE.Group();
  // Cabeça arredondada (esfera levemente achatada vertical)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 18), skinMat);
  skull.scale.set(1, 1.05, 1);
  skull.position.y = 0;
  skull.castShadow = true;
  head.add(skull);

  // Pescoço
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 0.08, 12),
    skinMat
  );
  neck.position.y = -0.18;
  head.add(neck);

  // Olhos (2 esferas pretas pequenas)
  for (const sx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat);
    eye.position.set(sx, 0.02, 0.165);
    head.add(eye);
  }

  // Cabelo conforme estilo
  if (prefs.hairStyle !== "bald") {
    if (prefs.hairStyle === "short") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      cap.position.y = 0.0;
      head.add(cap);
    } else if (prefs.hairStyle === "long") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14, 0, Math.PI * 2, 0, Math.PI / 1.6), hairMat);
      cap.position.y = -0.02;
      head.add(cap);
      // Cabelo descendo nas costas
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.08), hairMat);
      back.position.set(0, -0.16, -0.13);
      head.add(back);
    } else if (prefs.hairStyle === "ponytail") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      cap.position.y = 0;
      head.add(cap);
      // Tail
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 10), hairMat);
      tail.position.set(0, -0.05, -0.18);
      tail.rotation.x = -0.4;
      head.add(tail);
    }
  }

  head.position.y = 1.85;
  root.add(head);

  // === TORSO ===
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoTopR, torsoBotR, 0.65, 18),
    topMat
  );
  torso.position.y = 1.3;
  torso.castShadow = true;
  root.add(torso);

  // Tank top straps (2 cilindros finos sobre os ombros)
  for (const sx of [-shoulderW * 0.4, shoulderW * 0.4]) {
    const strap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8),
      topMat
    );
    strap.position.set(sx, 1.55, 0);
    strap.rotation.z = sx > 0 ? -0.1 : 0.1;
    root.add(strap);
  }

  // Logo PR Tracker no peito (mini quadrado lime sutil — só se top não for lime)
  if (prefs.top !== "#D8FF2C" && prefs.top !== "#d8ff2c") {
    const logoCanvas = document.createElement("canvas");
    logoCanvas.width = 128;
    logoCanvas.height = 64;
    const lctx = logoCanvas.getContext("2d")!;
    lctx.fillStyle = "rgba(0,0,0,0)";
    lctx.fillRect(0, 0, 128, 64);
    lctx.fillStyle = "#D8FF2C";
    lctx.font = "900 38px Archivo Black, Inter, sans-serif";
    lctx.textAlign = "center";
    lctx.textBaseline = "middle";
    lctx.fillText("PR", 64, 32);
    const logoTex = new THREE.CanvasTexture(logoCanvas);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.09),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true })
    );
    logo.position.set(0, 1.4, torsoTopR + 0.001);
    root.add(logo);
  }

  // === HIPS / SHORTS ===
  const hips = new THREE.Mesh(
    new THREE.CylinderGeometry(hipR, hipR * 0.92, 0.28, 16),
    shortsMat
  );
  hips.position.y = 0.83;
  hips.castShadow = true;
  root.add(hips);

  // Shorts visíveis (cilindro mais largo embaixo do hip)
  const shortsBlock = new THREE.Mesh(
    new THREE.CylinderGeometry(hipR * 0.96, hipR * 0.85, 0.22, 16),
    shortsMat
  );
  shortsBlock.position.y = 0.61;
  root.add(shortsBlock);

  // === LEGS ===
  const leftLeg = buildLeg(skinMat, shoeMat);
  leftLeg.position.set(-0.13, 0.5, 0);
  root.add(leftLeg);

  const rightLeg = buildLeg(skinMat, shoeMat);
  rightLeg.position.set(0.13, 0.5, 0);
  root.add(rightLeg);

  // === ARMS ===
  const leftArm = buildArm(skinMat, true);
  leftArm.position.set(-shoulderW / 2, 1.5, 0);
  root.add(leftArm);

  const rightArm = buildArm(skinMat, false);
  rightArm.position.set(shoulderW / 2, 1.5, 0);
  root.add(rightArm);

  return { root, leftLeg, rightLeg, leftArm, rightArm, head };
}

function buildLeg(skinMat: THREE.Material, shoeMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Coxa (mais grossa em cima, afina)
  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.085, 0.42, 10),
    skinMat
  );
  thigh.position.y = -0.21;
  thigh.castShadow = true;
  g.add(thigh);
  // Panturrilha
  const calf = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.06, 0.4, 10),
    skinMat
  );
  calf.position.y = -0.61;
  calf.castShadow = true;
  g.add(calf);
  // Tênis (caixa preta)
  const shoe = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.09, 0.26),
    shoeMat
  );
  shoe.position.set(0, -0.86, 0.04);
  shoe.castShadow = true;
  g.add(shoe);
  // Sole (faixa lime sutil pra "tênis de academia")
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.018, 0.27),
    new THREE.MeshStandardMaterial({ color: 0xd8ff2c, roughness: 0.5 })
  );
  sole.position.set(0, -0.91, 0.04);
  g.add(sole);
  return g;
}

function buildArm(skinMat: THREE.Material, _isLeft: boolean): THREE.Group {
  const g = new THREE.Group();
  // Braço (com bíceps mais grosso no topo)
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.07, 0.36, 10),
    skinMat
  );
  upper.position.y = -0.18;
  upper.castShadow = true;
  g.add(upper);
  // Antebraço
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.058, 0.34, 10),
    skinMat
  );
  lower.position.y = -0.52;
  lower.castShadow = true;
  g.add(lower);
  // Mão (esfera)
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skinMat);
  hand.position.y = -0.71;
  g.add(hand);
  return g;
}

// =================================================================
// TROFÉU V2 — mini-barbell com plate split real do PR
// =================================================================

/**
 * Trophy realista: pedestal + barbell carregada com as anilhas IWF
 * que de fato compõem o peso do PR. Número GIGANTE na frente do
 * pedestal pra ser legível à distância.
 */
export function buildTrophy(
  weightKg: number,
  exerciseShort: string,
  accentHex: string
): THREE.Group {
  const g = new THREE.Group();

  // Pedestal (base larga pro número caber)
  const pedW = 1.0;
  const pedH = 0.18;
  const pedD = 0.35;
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(pedW, pedH, pedD),
    new THREE.MeshStandardMaterial({
      color: 0x14111e,
      roughness: 0.55,
      metalness: 0.4,
    })
  );
  pedestal.position.y = pedH / 2;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  g.add(pedestal);

  // Faixa de acento na borda superior do pedestal
  const accentStrip = new THREE.Mesh(
    new THREE.BoxGeometry(pedW, 0.012, 0.04),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  accentStrip.position.set(0, pedH + 0.003, pedD / 2);
  g.add(accentStrip);

  // Big number panel na FRENTE do pedestal
  const numCanvas = document.createElement("canvas");
  numCanvas.width = 1024;
  numCanvas.height = 512;
  const nctx = numCanvas.getContext("2d")!;
  // Fundo navy
  nctx.fillStyle = "#01002A";
  nctx.fillRect(0, 0, 1024, 512);
  // Borda lime fina
  nctx.strokeStyle = accentHex;
  nctx.lineWidth = 6;
  nctx.strokeRect(8, 8, 1008, 496);
  // Big kg
  nctx.fillStyle = accentHex;
  nctx.font = "900 360px Archivo Black, Inter, sans-serif";
  nctx.textAlign = "center";
  nctx.textBaseline = "middle";
  const numStr = String(Math.round(weightKg));
  nctx.fillText(numStr, 512, 220);
  // KG suffix
  nctx.fillStyle = "#9ca3af";
  nctx.font = "700 64px Inter, sans-serif";
  nctx.fillText("KG", 512, 400);
  // Exercise
  nctx.fillStyle = "#ffffff";
  nctx.font = "500 38px Inter, sans-serif";
  nctx.fillText(exerciseShort.toUpperCase(), 512, 460);

  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const numPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(pedW * 0.92, pedH * 5.2),
    new THREE.MeshBasicMaterial({ map: numTex })
  );
  numPlate.position.set(0, pedH * 2.7, pedD / 2 + 0.001);
  g.add(numPlate);

  // Mini-barbell em cima do pedestal carregada com plate split real
  const barbell = buildMiniBarbell(weightKg);
  barbell.position.set(0, pedH + 0.02, 0);
  g.add(barbell);

  // Hit-box pro raycast (cobre o trophy todo)
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(pedW + 0.3, 1.2, pedD + 0.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 0.55;
  g.add(hit);

  return g;
}

/**
 * Mini-barbell carregada com as anilhas IWF que compõem o peso.
 * Usa splitPlates (lib/pr/plates.ts) — mesmo algoritmo do configurator.
 */
function buildMiniBarbell(weightKg: number): THREE.Group {
  const g = new THREE.Group();
  const split = splitPlates(weightKg);

  // Bar (cilindro horizontal) + sleeves
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.85, 14),
    CHROME_MAT
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.18;
  g.add(bar);

  // Sleeves (mais grossos onde encaixam anilhas)
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.22, 14),
      STEEL_MAT
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * 0.4, 0.18, 0);
    g.add(sleeve);
  }

  // Anilhas em ordem (greedy descending)
  for (const side of [-1, 1]) {
    let offset = 0.32;
    for (const pair of split.pairs) {
      const colorHex = IWF_COLOR_BY_KG[pair.kg] ?? 0x9ca3af;
      // Raio escala com peso pra anilha grande aparecer maior
      const radius = 0.06 + (pair.kg / 25) * 0.05;
      const thickness = 0.022 + (pair.kg / 25) * 0.015;
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.45,
        metalness: 0.15,
        emissive: colorHex,
        emissiveIntensity: 0.18,
      });
      for (let i = 0; i < pair.count; i++) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, thickness, 24),
          mat
        );
        plate.rotation.z = Math.PI / 2;
        plate.position.set(side * (offset + thickness / 2), 0.18, 0);
        plate.castShadow = true;
        g.add(plate);
        offset += thickness;
      }
    }
    // Mini clamp
    if (split.pairs.length > 0) {
      const clamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.025, 12),
        STEEL_MAT
      );
      clamp.rotation.z = Math.PI / 2;
      clamp.position.set(side * (offset + 0.02), 0.18, 0);
      g.add(clamp);
    }
  }

  // Se não conseguiu fazer split (peso < 20kg), mostra só a barra
  if (split.pairs.length === 0) {
    const noPlateLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.5 })
    );
    noPlateLabel.position.y = 0.05;
    noPlateLabel.rotation.x = -Math.PI / 2;
    g.add(noPlateLabel);
  }

  return g;
}

// =================================================================
// EQUIPMENT
// =================================================================

export function buildPowerRack(accentHex: string): THREE.Group {
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
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), STEEL_MAT);
      col.position.set(x, H / 2, z);
      col.castShadow = true;
      g.add(col);
    }
  }
  const topFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.08, 0.08), STEEL_MAT);
  topFront.position.set(0, H, D / 2);
  g.add(topFront);
  const topBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.08, 0.08), STEEL_MAT);
  topBack.position.set(0, H, -D / 2);
  g.add(topBack);
  const baseFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.05, 0.4), STEEL_MAT);
  baseFront.position.set(0, 0.025, D / 2 + 0.16);
  g.add(baseFront);
  const baseBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.05, 0.4), STEEL_MAT);
  baseBack.position.set(0, 0.025, -D / 2 - 0.16);
  g.add(baseBack);

  for (const x of [-W / 2, W / 2]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.16), accent);
    hook.position.set(x, 1.25, D / 2 - 0.04);
    g.add(hook);
  }

  const barbell = buildLoadedBarbell();
  barbell.position.set(0, 1.32, D / 2 - 0.04);
  g.add(barbell);

  return g;
}

function buildLoadedBarbell(): THREE.Group {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 12), CHROME_MAT);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16), STEEL_MAT);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * 0.95, 0, 0);
    g.add(sleeve);
  }
  const plates = [
    { color: 0xda291c, radius: 0.22 },
    { color: 0x0057b8, radius: 0.2 },
    { color: 0xffc72c, radius: 0.18 },
    { color: 0x43b02a, radius: 0.16 },
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
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), STEEL_MAT);
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(side * 1.06, 0, 0);
    g.add(clamp);
  }
  return g;
}

export function buildPlatform(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accentRubber = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.85,
    metalness: 0.05,
  });
  const center = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 3.0), WOOD_MAT);
  center.position.y = 0.03;
  center.receiveShadow = true;
  g.add(center);
  for (const x of [-1.4, 1.4]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 3.0), accentRubber);
    side.position.set(x, 0.03, 0);
    side.receiveShadow = true;
    g.add(side);
  }
  for (const x of [-0.6, 0.6]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 3.0), RUBBER_MAT);
    line.position.set(x, 0.031, 0);
    g.add(line);
  }
  return g;
}

export function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 1.2), VINYL_MAT);
  seat.position.set(0, 0.5, 0);
  seat.castShadow = true;
  g.add(seat);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.46, 1.2), STEEL_MAT);
  trunk.position.set(0, 0.23, 0);
  g.add(trunk);
  for (const z of [-0.55, 0.55]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), STEEL_MAT);
    foot.position.set(0, 0.025, z);
    g.add(foot);
  }
  for (const z of [-0.45, 0.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 0.06), STEEL_MAT);
    post.position.set(0.4, 0.525, z);
    g.add(post);
  }
  return g;
}

export function buildDumbbellRack(): THREE.Group {
  const g = new THREE.Group();
  const RACK_W = 3.0;
  const LEVELS = [
    { y: 0.3, depth: 0.6 },
    { y: 0.7, depth: 0.5 },
    { y: 1.1, depth: 0.4 },
  ];
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

function buildDumbbell(headRadius: number): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8),
    CHROME_MAT
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

export function buildKettlebell(scale: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(scale, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.5, metalness: 0.4 })
  );
  body.position.y = scale;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(scale * 0.3, scale * 0.4, scale * 0.3, 12),
    STEEL_MAT
  );
  neck.position.y = scale * 1.95;
  g.add(neck);
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

export function buildPlyoBox(size: number): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.2, size, size * 1.2),
    new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.85, metalness: 0.05 })
  );
  box.position.y = size / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: 0x4d4d51 })
  );
  edges.position.y = size / 2;
  g.add(edges);
  return g;
}

export function buildBanner(accentHex: string): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#01002A";
  ctx.fillRect(0, 0, 2048, 512);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 24, 512);
  ctx.fillRect(2024, 0, 24, 512);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "700 96px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("VOCÊ NÃO LEMBRA SÓ", 1024, 180);
  ctx.fillStyle = accentHex;
  ctx.font = "900 168px Archivo Black, Inter, sans-serif";
  ctx.fillText("DO NÚMERO.", 1024, 340);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "500 36px Inter, sans-serif";
  ctx.fillText("PR TRACKER", 1024, 450);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 1.0),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  return banner;
}
