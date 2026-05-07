import * as THREE from "three";
import { splitPlates, BAR_KG } from "../plates";
import type { AvatarPrefs } from "./avatar-prefs";
import {
  SKILL_TIER_META,
  tierForReps,
  formatRunTime,
  type SkillId,
  type SkillTier,
  type RunDistance,
} from "./skills";

// =================================================================
// MATERIAIS COMPARTILHADOS
// =================================================================

// V16.8 cycle 72: steel um pouco mais claro + emissive sutil pra estrutura
// não ficar invisivel em zonas de pouca luz.
export const STEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a4d5a,
  roughness: 0.4,
  metalness: 0.8,
  emissive: 0x1a1a26,
  emissiveIntensity: 0.15,
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
// V16.8 cycle 71: chrome MAIS BRILHANTE + emissive sutil pra cintilar mesmo
// em zonas pouco iluminadas. Era 0.22 roughness — agora 0.12 (mais espelhado).
export const CHROME_MAT = new THREE.MeshStandardMaterial({
  color: 0xdfe2e8,
  roughness: 0.12,
  metalness: 0.95,
  emissive: 0x6a6a76,
  emissiveIntensity: 0.08,
});

// V16.8 cycles 153-160: acabamentos premium - parafusos, soldas, brand stickers
// Helper pra adicionar parafuso pequeno (esfera preta) em pontos de junção
export function addScrew(parent: THREE.Object3D, x: number, y: number, z: number, size = 0.012) {
  const screw = new THREE.Mesh(
    new THREE.SphereGeometry(size, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.4, metalness: 0.7 })
  );
  screw.position.set(x, y, z);
  parent.add(screw);
}

// Helper: solda raised seam (pequena box angular)
export function addWeldSeam(parent: THREE.Object3D, x: number, y: number, z: number, len: number, axis: "x" | "z" = "x") {
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(axis === "x" ? len : 0.01, 0.005, axis === "z" ? len : 0.01),
    new THREE.MeshStandardMaterial({ color: 0x6a6a76, roughness: 0.3, metalness: 0.85 })
  );
  seam.position.set(x, y, z);
  parent.add(seam);
}

// Helper: brand sticker "PR TRACKER" (lime canvas) num plano pequeno
let _brandStickerTex: THREE.CanvasTexture | null = null;
export function addBrandSticker(parent: THREE.Object3D, x: number, y: number, z: number, w = 0.12, rotY = 0) {
  if (!_brandStickerTex) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#01002A";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "#D8FF2C";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = "#D8FF2C";
    ctx.font = "900 32px Archivo Black, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PR TRACKER", 128, 32);
    _brandStickerTex = new THREE.CanvasTexture(c);
    _brandStickerTex.colorSpace = THREE.SRGBColorSpace;
  }
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(w, w / 4),
    new THREE.MeshBasicMaterial({ map: _brandStickerTex, transparent: true })
  );
  sticker.position.set(x, y, z);
  sticker.rotation.y = rotY;
  parent.add(sticker);
}

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
 * Avatar estilo Roblox-moderno: cabeça cubo com rosto polido, cabelo
 * 3D fora dos olhos, corpo chunky/blocky com cantos suaves. Camisa
 * PR TRACKER branded. Cores customizáveis via prefs.
 */
export function buildAvatar(prefs: AvatarPrefs): AvatarParts {
  const root = new THREE.Group();

  // Materiais por preferência. CRÍTICO: nenhum emissive na pele/cabelo,
  // senão o reflexo da luz lime ambient + o emissive da regata se
  // misturam e a pele fica com tom esverdeado horrível.
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.skin),
    roughness: 0.7,
    metalness: 0.0,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.hair),
    roughness: 0.85,
    metalness: 0.0,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.top),
    roughness: 0.75,
    metalness: 0.0,
    // Sem emissive — nas mensagens anteriores isso pintava a pele de verde.
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(prefs.shorts),
    roughness: 0.85,
    metalness: 0.0,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
    metalness: 0.1,
  });

  // Proporções estilo "stylized cartoon" — head GRANDE pra parecer
  // Animal Crossing/Viverse Retro vs realismo seco. Total ~1.95m.
  const isF = prefs.gender === "female";
  const isM = prefs.gender === "male";
  const torsoTopR = isF ? 0.20 : isM ? 0.24 : 0.22;
  const torsoBotR = isF ? 0.18 : isM ? 0.20 : 0.19;
  const hipR = isF ? 0.22 : isM ? 0.20 : 0.21;
  const shoulderHalfW = isF ? 0.22 : isM ? 0.26 : 0.24;
  // V16.8 cycle 73: avatar head 0.21 → 0.26 pra match com NPCs (consistência)
  const headR = 0.26;

  // === HEAD ESFÉRICO — round head + face simples + hair cap =====
  // User explicitly: cabeça tem que ser REDONDA. Sphere skin + face
  // plane na frente (2 olhos pretos + sorriso) + hair cap envolvente.
  const head = new THREE.Group();
  const headSize = headR * 2.0; // diametro pro pescoco

  // Skull: esfera ligeiramente alongada vertical (formato facial)
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 32, 24),
    skinMat
  );
  skull.scale.set(1.0, 1.08, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // FACE simples: 2 olhos pretos + sorriso aberto branco. Aplicado
  // como plano sutil na frente da esfera (pequeno offset).
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 512;
  faceCanvas.height = 512;
  const fctx = faceCanvas.getContext("2d")!;
  // Fundo transparente — face só os elementos, esfera skin aparece
  fctx.clearRect(0, 0, 512, 512);

  // 2 OLHOS PRETOS (ovais simples)
  fctx.fillStyle = "#000000";
  for (const cx of [185, 327]) {
    fctx.beginPath();
    fctx.ellipse(cx, 240, 24, 32, 0, 0, Math.PI * 2);
    fctx.fill();
  }

  // SORRISO ABERTO (curva preta com interior branco — dentes visíveis)
  fctx.fillStyle = "#000000";
  fctx.beginPath();
  fctx.ellipse(256, 348, 86, 38, 0, 0, Math.PI * 2);
  fctx.fill();
  fctx.fillStyle = "#ffffff";
  fctx.beginPath();
  fctx.ellipse(256, 350, 76, 28, 0, 0, Math.PI * 2);
  fctx.fill();
  // "Cobre" metade superior (faz sorriso só inferior)
  fctx.fillStyle = "rgba(0,0,0,0)"; // mantém transparente
  // Em vez disso, desenha uma forma sólida em transparente
  fctx.globalCompositeOperation = "destination-out";
  fctx.fillStyle = "#000";
  fctx.fillRect(170, 308, 172, 32);
  fctx.globalCompositeOperation = "source-over";
  // Linha do meio
  fctx.fillStyle = "#000000";
  fctx.fillRect(180, 348, 152, 3);

  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  // V16.8 cycle 100: face plane FORA da superfície do skull (era headR*0.92,
  // dentro da esfera — depth test escondia atrás do skull). Agora headR*1.005
  // + polygonOffset pra garantir render por cima.
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(headR * 1.7, headR * 1.7),
    new THREE.MeshBasicMaterial({
      map: faceTex,
      transparent: true,
      depthTest: false,
    })
  );
  face.position.set(0, 0.005, headR * 1.005);
  face.renderOrder = 5;
  head.add(face);

  // === CABELO esférico envolvente sobre a cabeça redonda =========
  // Hemisfério ligeiramente maior que o skull cobrindo top + lateral
  // + nuca, deixando só a face na frente exposta.
  if (prefs.hairStyle !== "bald") {
    // V16.8 cycle 64: hair caps mais CURTOS (não cobrem olhos) + posição
    // mais alta. Antes π/1.65 (109°) cobria abaixo da linha dos olhos.
    if (prefs.hairStyle === "short") {
      const capGeom = new THREE.SphereGeometry(
        headR + 0.025,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2.1 // ~85° — cobre top + sides + back (sem cair na face)
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.scale.set(1.0, 1.08, 1.0);
      cap.position.y = 0.02;
      cap.castShadow = true;
      head.add(cap);
      // Franja sutil na frente da testa
      const fringe = new THREE.Mesh(
        new THREE.BoxGeometry(headR * 1.4, headR * 0.2, headR * 0.5),
        hairMat
      );
      fringe.position.set(0, headR * 0.55, headR * 0.6);
      fringe.rotation.x = -0.15;
      head.add(fringe);
    } else if (prefs.hairStyle === "long") {
      const capGeom = new THREE.SphereGeometry(
        headR + 0.025,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2.2 // ~82° (era 116°)
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.scale.set(1.0, 1.08, 1.0);
      cap.position.y = 0.03;
      cap.castShadow = true;
      head.add(cap);
      // Cabelo longo nas costas (capsula achatada)
      const back = new THREE.Mesh(
        new THREE.CapsuleGeometry(headR * 0.95, 0.5, 6, 14),
        hairMat
      );
      back.scale.set(1, 1, 0.4);
      back.position.set(0, -headR * 0.7, -headR * 0.5);
      back.castShadow = true;
      head.add(back);
    } else if (prefs.hairStyle === "ponytail") {
      const capGeom = new THREE.SphereGeometry(
        headR + 0.018,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2.5 // ~72° (era 106°)
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.position.set(0, 0.03, -0.02);
      head.add(cap);
      // Tie ball atrás (esfera pequena)
      const tieBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 14, 10),
        hairMat
      );
      tieBall.position.set(0, headR * 0.15, -headR * 0.92);
      head.add(tieBall);
      // Tail descendo (cilindro inclinado)
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.03, 0.42, 14),
        hairMat
      );
      tail.position.set(0, -headR * 0.05, -headR * 1.1);
      tail.rotation.x = -0.5;
      tail.castShadow = true;
      head.add(tail);
    }
  }

  // Pescoço (cilindro cheio, conecta ao torso)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 0.08, 12),
    skinMat
  );
  neck.position.y = -headSize / 2 - 0.04;
  head.add(neck);

  // V16.8 cycle 94: REMOVIDO bloco duplicado de cabelo (era um segundo
  // pass com π/1.7 e π/1.9 — caps maiores stacking por cima do primeiro
  // bloco em π/2.1/π/2.2/π/2.5). Causava o cabelo cobrir os olhos.

  // Cabeça posicionada em y=1.88 absoluto (centro do crânio)
  head.position.y = 2.0; // cycle 74: ajustado pra cabeça 0.26
  root.add(head);

  // === TORSO + CAMISA "PR TRACKER" =============================
  // Torso é uma capsula achatada (mais human, menos cylinder de barril)
  const torsoH = 0.55;
  const torsoY = 1.10 + torsoH / 2; // = 1.375
  const torsoGeom = new THREE.CylinderGeometry(torsoTopR, torsoBotR, torsoH, 22);
  const torso = new THREE.Mesh(torsoGeom, topMat);
  torso.position.y = torsoY;
  torso.castShadow = true;
  root.add(torso);

  // Ombros arredondados (esferas) pra dar definição vs "barril"
  for (const sx of [-shoulderHalfW, shoulderHalfW]) {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 14, 12),
      topMat
    );
    shoulder.position.set(sx, torsoY + torsoH / 2 - 0.04, 0);
    shoulder.castShadow = true;
    root.add(shoulder);
  }

  // CAMISA PR TRACKER — texto SEMPRE visível, com cor contrastante.
  // Texto fica em lime se a regata é escura, e em navy se a regata é clara/lime.
  const lightTops = ["#ffffff", "#D8FF2C", "#d8ff2c", "#FFC72C", "#ffc72c"];
  const isLightTop = lightTops.includes(prefs.top);
  const textColor = isLightTop ? "#01002A" : "#D8FF2C";

  const shirtCanvas = document.createElement("canvas");
  shirtCanvas.width = 512;
  shirtCanvas.height = 256;
  const shctx = shirtCanvas.getContext("2d")!;
  shctx.clearRect(0, 0, 512, 256);
  // "PR" gigante (logo central)
  shctx.fillStyle = textColor;
  shctx.font = "900 160px Archivo Black, Inter, sans-serif";
  shctx.textAlign = "center";
  shctx.textBaseline = "middle";
  shctx.fillText("PR", 256, 100);
  // "TRACKER" abaixo
  shctx.font = "700 56px Inter, sans-serif";
  shctx.fillText("TRACKER", 256, 195);

  const shirtTex = new THREE.CanvasTexture(shirtCanvas);
  shirtTex.colorSpace = THREE.SRGBColorSpace;
  // V16.7 cycle 36: shirt 50% maior (1.6 → 2.4) pra logo visível à distância
  const shirt = new THREE.Mesh(
    new THREE.PlaneGeometry(torsoTopR * 2.4, torsoH * 0.85),
    new THREE.MeshBasicMaterial({ map: shirtTex, transparent: true })
  );
  shirt.position.set(0, torsoY + 0.03, torsoTopR + 0.005);
  root.add(shirt);

  // === HIPS / SHORTS ============================================
  const hipsH = 0.18;
  const hipsY = 1.0;
  const hips = new THREE.Mesh(
    new THREE.CylinderGeometry(hipR, hipR * 0.95, hipsH, 18),
    shortsMat
  );
  hips.position.y = hipsY;
  hips.castShadow = true;
  root.add(hips);

  // === LEGS — pés tocam o chão ==================================
  // legGroup origin = quadril (y=0.985). Parts vão pra baixo até a sola
  // do tênis encostar no chão (sole bottom y ≈ 0).
  const leftLeg = buildLeg(skinMat, shortsMat, shoeMat);
  leftLeg.position.set(-0.10, 0.985, 0);
  root.add(leftLeg);

  const rightLeg = buildLeg(skinMat, shortsMat, shoeMat);
  rightLeg.position.set(0.10, 0.985, 0);
  root.add(rightLeg);

  // === ARMS com pose natural (cycle 95) — match com NPC pose
  // (10° pra fora + 8° pra frente). Antes 7° + 3°, ainda parecia rígido.
  const leftArm = buildArm(skinMat, topMat);
  leftArm.position.set(-shoulderHalfW - 0.02, 1.62, 0);
  leftArm.rotation.z = -0.18;
  leftArm.rotation.x = -0.08;
  root.add(leftArm);

  const rightArm = buildArm(skinMat, topMat);
  rightArm.position.set(shoulderHalfW + 0.02, 1.62, 0);
  rightArm.rotation.z = 0.18;
  rightArm.rotation.x = -0.08;
  root.add(rightArm);

  return { root, leftLeg, rightLeg, leftArm, rightArm, head };
}

/**
 * Perna: shorts curto no topo (visível abaixo do hip), depois coxa,
 * panturrilha, tênis. Origin = quadril (top of thigh).
 */
function buildLeg(
  skinMat: THREE.Material,
  shortsMat: THREE.Material,
  shoeMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  // Shorts cobrindo topo da coxa (até ~10cm abaixo do hip)
  const shortsCover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.105, 0.18, 10),
    shortsMat
  );
  shortsCover.position.y = -0.09;
  shortsCover.castShadow = true;
  g.add(shortsCover);

  // Coxa (skin)
  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.07, 0.28, 10),
    skinMat
  );
  thigh.position.y = -0.32;
  thigh.castShadow = true;
  g.add(thigh);

  // Joelho (esfera pra suavizar a junção)
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skinMat);
  knee.position.y = -0.46;
  g.add(knee);

  // Panturrilha
  const calf = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.055, 0.36, 10),
    skinMat
  );
  calf.position.y = -0.65;
  calf.castShadow = true;
  g.add(calf);

  // Tornozelo
  const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), skinMat);
  ankle.position.y = -0.84;
  g.add(ankle);

  // Tênis (caixa de couro preto + sola lime)
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), shoeMat);
  shoe.position.set(0, -0.91, 0.05);
  shoe.castShadow = true;
  g.add(shoe);
  // Sola lime (assinatura visual da marca)
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.135, 0.025, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xd8ff2c, roughness: 0.5 })
  );
  sole.position.set(0, -0.97, 0.05);
  g.add(sole);

  return g;
}

/**
 * Braço: deltoide visível + sleeve da regata + bíceps + cotovelo flexionado
 * + antebraço com leve rotação + mão. Origin = ombro.
 * Cycle 96: match com NPC arm (separação forearm pra elbow flex real).
 */
function buildArm(skinMat: THREE.Material, topMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Deltoide (esfera no ombro pra musculatura visível)
  const delt = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 10), skinMat);
  delt.position.y = 0;
  g.add(delt);
  // Mangueta da regata cobrindo o topo do braço
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.08, 10),
    topMat
  );
  sleeve.position.y = -0.03;
  g.add(sleeve);
  // Bíceps
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.06, 0.26, 10),
    skinMat
  );
  upper.position.y = -0.2;
  upper.castShadow = true;
  g.add(upper);
  // Cotovelo (esfera)
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skinMat);
  elbow.position.y = -0.34;
  g.add(elbow);
  // Forearm em group separado pra elbow flex real
  const forearm = new THREE.Group();
  forearm.position.y = -0.34;
  forearm.rotation.x = 0.18; // ~10° flex
  g.add(forearm);
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.052, 0.26, 10),
    skinMat
  );
  lower.position.y = -0.15;
  lower.castShadow = true;
  forearm.add(lower);
  // Mão — capsule achatada
  const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.04, 6, 8), skinMat);
  hand.scale.set(1.0, 1.0, 1.4);
  hand.position.y = -0.32;
  hand.castShadow = true;
  forearm.add(hand);
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

  // PEDESTAL CHEIO — bloco sólido alto pra ser visualmente uma "torre
  // de troféu". Dimensões: 1.4m largura × 0.85m altura × 0.55m profundidade.
  // Fica sobre a prateleira / chão. Número gigante ocupa a frente toda.
  const pedW = 1.4;
  const pedH = 0.85;
  const pedD = 0.55;

  // Bloco principal (corpo do pedestal)
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x14111e,
    roughness: 0.55,
    metalness: 0.35,
  });
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(pedW, pedH, pedD),
    pedestalMat
  );
  pedestal.position.y = pedH / 2;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  g.add(pedestal);

  // Faixa de acento na BASE do pedestal (linha lime grossa)
  const baseStrip = new THREE.Mesh(
    new THREE.BoxGeometry(pedW + 0.01, 0.04, pedD + 0.01),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  baseStrip.position.y = 0.02;
  g.add(baseStrip);

  // Topo arredondado (placa onde a barbell descansa)
  const topPlate = new THREE.Mesh(
    new THREE.BoxGeometry(pedW + 0.06, 0.06, pedD + 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x2a2540,
      roughness: 0.4,
      metalness: 0.5,
    })
  );
  topPlate.position.y = pedH + 0.03;
  topPlate.castShadow = true;
  g.add(topPlate);

  // PAINEL FRONTAL — número GIGANTE ocupando a frente quase toda do
  // pedestal (90% × 80%). Aplicado como textura BasicMaterial direto
  // no plane, fica sempre visível e não depende de iluminação.
  const numCanvas = document.createElement("canvas");
  numCanvas.width = 1024;
  numCanvas.height = 768;
  const nctx = numCanvas.getContext("2d")!;
  // Fundo navy escuro
  nctx.fillStyle = "#0a0828";
  nctx.fillRect(0, 0, 1024, 768);
  // Borda dupla lime (fina + grossa pra dar profundidade)
  nctx.strokeStyle = accentHex;
  nctx.lineWidth = 8;
  nctx.strokeRect(20, 20, 984, 728);
  nctx.lineWidth = 2;
  nctx.strokeRect(40, 40, 944, 688);
  // Tag "PR" pequena no topo
  nctx.fillStyle = accentHex;
  nctx.font = "900 60px Archivo Black, Inter, sans-serif";
  nctx.textAlign = "center";
  nctx.textBaseline = "middle";
  nctx.fillText("PR", 512, 110);
  // NÚMERO GIGANTE
  nctx.fillStyle = accentHex;
  nctx.font = "900 480px Archivo Black, Inter, sans-serif";
  const numStr = String(Math.round(weightKg));
  nctx.fillText(numStr, 512, 410);
  // KG suffix
  nctx.fillStyle = "#9ca3af";
  nctx.font = "700 80px Inter, sans-serif";
  nctx.fillText("KG", 512, 620);
  // Exercise abaixo
  nctx.fillStyle = "#ffffff";
  nctx.font = "500 48px Inter, sans-serif";
  nctx.fillText(exerciseShort.toUpperCase(), 512, 695);

  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  // Painel ocupa 92% da largura e 88% da altura do pedestal
  const numPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(pedW * 0.92, pedH * 0.88),
    new THREE.MeshBasicMaterial({ map: numTex })
  );
  // Centrado verticalmente no pedestal, ligeiramente à frente da face
  numPlate.position.set(0, pedH / 2, pedD / 2 + 0.005);
  g.add(numPlate);

  // BARBELL CARREGADA em cima do pedestal — peça centerpiece visual
  const barbell = buildMiniBarbell(weightKg);
  barbell.position.set(0, pedH + 0.18, 0);
  g.add(barbell);

  // Hit-box invisível pro raycast (cobre todo o troféu)
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(pedW + 0.3, pedH + 0.6, pedD + 0.3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = (pedH + 0.6) / 2;
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

  // Bar (cilindro horizontal) + sleeves — escala 1.4x do anterior pra
  // dar presença em cima do pedestal maior.
  const BAR_LEN = 1.3;
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, BAR_LEN, 16),
    CHROME_MAT
  );
  bar.rotation.z = Math.PI / 2;
  g.add(bar);

  // Sleeves (mais grossos onde encaixam anilhas)
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.32, 16),
      STEEL_MAT
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * (BAR_LEN / 2 - 0.16), 0, 0);
    g.add(sleeve);
  }

  // Anilhas em ordem (greedy descending) — raios maiores
  for (const side of [-1, 1]) {
    let offset = 0.5;
    for (const pair of split.pairs) {
      const colorHex = IWF_COLOR_BY_KG[pair.kg] ?? 0x9ca3af;
      const radius = 0.1 + (pair.kg / 25) * 0.08;
      const thickness = 0.035 + (pair.kg / 25) * 0.02;
      // V16.8 cycle 91: emissive boost mini-barbell plates
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.25,
        emissive: colorHex,
        emissiveIntensity: 0.25,
      });
      for (let i = 0; i < pair.count; i++) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, thickness, 28),
          mat
        );
        plate.rotation.z = Math.PI / 2;
        plate.position.set(side * (offset + thickness / 2), 0, 0);
        plate.castShadow = true;
        g.add(plate);
        offset += thickness;
      }
    }
    // Clamp
    if (split.pairs.length > 0) {
      const clamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16),
        STEEL_MAT
      );
      clamp.rotation.z = Math.PI / 2;
      clamp.position.set(side * (offset + 0.025), 0, 0);
      g.add(clamp);
    }
  }

  // Se peso baixo, sem anilhas, mostra só a barra (já visível)


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

  // V16.8 cycle 103: proporcoes ajustadas pro avatar 1.95m (era 2.6/1.6/1.4
  // = power rack tamanho gigante). Agora match com Rogue R-3 / Eleiko XF80.
  const W = 1.40;
  const D = 1.20;
  const H = 2.40;

  // 4 colunas com furos visíveis (decals canvas) — recurso característico
  // de power rack pra ajustar altura dos hooks/safety pins.
  // V16.8 cycle 105: + numeros (1-24) ao lado de cada furo pra visual mais
  // tecnico (estilo Rogue Monster com hole numbering).
  const colCanvas = document.createElement("canvas");
  colCanvas.width = 64;
  colCanvas.height = 512;
  const cctx = colCanvas.getContext("2d")!;
  cctx.fillStyle = "#2a2d3a";
  cctx.fillRect(0, 0, 64, 512);
  // Furos de ajuste em série
  cctx.fillStyle = "#0a0a14";
  for (let i = 0; i < 24; i++) {
    cctx.beginPath();
    cctx.arc(32, 16 + i * 20, 5, 0, Math.PI * 2);
    cctx.fill();
  }
  // Numeros do furo (1-24) na lateral
  cctx.fillStyle = "#5a5a6a";
  cctx.font = "bold 10px Inter, sans-serif";
  cctx.textAlign = "left";
  cctx.textBaseline = "middle";
  for (let i = 0; i < 24; i++) {
    const num = String(24 - i).padStart(2, "0");
    cctx.fillText(num, 44, 16 + i * 20);
  }
  const colTex = new THREE.CanvasTexture(colCanvas);
  colTex.colorSpace = THREE.SRGBColorSpace;
  colTex.wrapT = THREE.ClampToEdgeWrapping;
  const colMat = new THREE.MeshStandardMaterial({
    map: colTex,
    roughness: 0.4,
    metalness: 0.7,
  });
  // V16.8 cycle 103: colunas mais finas (0.09 → 0.07) — Rogue R-3 = 7×7cm
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.07, H, 0.07), colMat);
      col.position.set(x, H / 2, z);
      col.castShadow = true;
      g.add(col);
    }
  }

  // Travessas top + back (estrutura)
  const topFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.1, 0.1), STEEL_MAT);
  topFront.position.set(0, H, D / 2);
  g.add(topFront);
  const topBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.1, 0.1), STEEL_MAT);
  topBack.position.set(0, H, -D / 2);
  g.add(topBack);
  // Pull-up bar topo (ligando top front e back, no centro)
  const pullupBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, D, 12),
    CHROME_MAT
  );
  pullupBar.rotation.x = Math.PI / 2;
  pullupBar.position.set(0, H - 0.02, 0);
  g.add(pullupBar);

  // Bases (sapatas mais largas pra estabilidade)
  const baseFront = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.06, 0.4), STEEL_MAT);
  baseFront.position.set(0, 0.03, D / 2 + 0.16);
  g.add(baseFront);
  const baseBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.06, 0.4), STEEL_MAT);
  baseBack.position.set(0, 0.03, -D / 2 - 0.16);
  g.add(baseBack);
  // Conexão entre as bases (perpendicular)
  for (const sx of [-W / 2 - 0.1, W / 2 + 0.1]) {
    const baseLink = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, D), STEEL_MAT);
    baseLink.position.set(sx, 0.025, 0);
    g.add(baseLink);
  }

  // V16.8 cycle 104: J-hooks com detalhamento (corpo + braco horizontal +
  // parafuso central preto + presilha lateral pra fixacao realista)
  for (const x of [-W / 2, W / 2]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.18), accent);
    hook.position.set(x, 1.25, D / 2 - 0.04);
    g.add(hook);
    // Braço do hook (barra horizontal pra segurar a barbell)
    const hookArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.12), accent);
    hookArm.position.set(x, 1.34, D / 2 - 0.12);
    g.add(hookArm);
    // Parafuso central (esfera preta) — detalhe visual de montagem
    const screw = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.4, metalness: 0.6 })
    );
    screw.position.set(x, 1.25, D / 2 - 0.04);
    g.add(screw);
    // Presilha lateral (pin de seguranca em forma de L)
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8),
      STEEL_MAT
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(x + (x > 0 ? 0.05 : -0.05), 1.22, D / 2 - 0.04);
    g.add(pin);
  }

  // Pinos de segurança horizontais (safety pins — altura 0.9m)
  for (const sz of [D / 2 - 0.05, -D / 2 + 0.05]) {
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, W + 0.02, 10),
      STEEL_MAT
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.9, sz);
    g.add(pin);
  }

  // Estante de pesos na base traseira (4 anilhas armazenadas)
  const stockColors = [0xda291c, 0x0057b8, 0xffc72c, 0x43b02a];
  for (let i = 0; i < 4; i++) {
    const radius = 0.22 - i * 0.015;
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.04, 20),
      new THREE.MeshStandardMaterial({
        color: stockColors[i] ?? 0x9aa3b0,
        roughness: 0.5,
        metalness: 0.15,
      })
    );
    plate.rotation.z = Math.PI / 2;
    plate.position.set(W / 2 - 0.04, 0.27, -D / 2 - 0.05 + i * 0.06);
    plate.castShadow = true;
    g.add(plate);
  }

  // Barbell carregada nos hooks
  const barbell = buildLoadedBarbell();
  barbell.position.set(0, 1.32, D / 2 - 0.04);
  g.add(barbell);

  // V16.8 cycle 156: brand sticker no top crossbar
  addBrandSticker(g, 0, H + 0.06, D / 2, 0.3);
  // Cycle 153: parafusos visiveis nos cantos das colunas (top + bottom)
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      addScrew(g, x, 0.04, z, 0.014);     // base
      addScrew(g, x, H - 0.04, z, 0.014); // topo
    }
  }
  // Cycle 154: soldas no encontro top crossbar com colunas
  for (const x of [-W / 2, W / 2]) {
    addWeldSeam(g, x, H, D / 2, 0.08, "x");
    addWeldSeam(g, x, H, -D / 2, 0.08, "x");
  }

  return g;
}

function buildLoadedBarbell(): THREE.Group {
  // V16.8 cycles 106-107: plates com texture canvas (hub central + 6 furos +
  // gravacao "PR TRACKER") + cores IWF exatas + raios proporcionais reais
  // (45cm bumper plate = radius 0.225). Antes plates pareciam plastico fake.
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 12), CHROME_MAT);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  // V16.8 cycle 115: spinning sleeves com knurling (collar interna + externa)
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 16), STEEL_MAT);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * 0.95, 0, 0);
    g.add(sleeve);
    // Collar interna (anel maior) — separa knurled grip da sleeve
    const innerCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.025, 16),
      STEEL_MAT
    );
    innerCollar.rotation.z = Math.PI / 2;
    innerCollar.position.set(side * 0.76, 0, 0);
    g.add(innerCollar);
  }

  // V16.8 cycle 116: cores IWF exatas Pantone match
  const plates = [
    { color: 0xda291c, radius: 0.225, label: "25" }, // Pantone 485 C
    { color: 0x0057b8, radius: 0.225, label: "20" }, // Pantone 2935 C
    { color: 0xffc72c, radius: 0.225, label: "15" }, // Pantone 123 C
    { color: 0x43b02a, radius: 0.225, label: "10" }, // Pantone 361 C
  ];

  // V16.8 cycle 117-118: plate texture com hub central (6 furos) + brand
  function plateTexture(colorHex: number, label: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    const hexStr = "#" + colorHex.toString(16).padStart(6, "0");
    // Plate face cor solida
    ctx.fillStyle = hexStr;
    ctx.fillRect(0, 0, 512, 512);
    // Hub central (circulo cinza interno)
    ctx.fillStyle = "#1a1a26";
    ctx.beginPath();
    ctx.arc(256, 256, 90, 0, Math.PI * 2);
    ctx.fill();
    // 6 furos circulares no hub
    ctx.fillStyle = "#0a0a14";
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const fx = 256 + Math.cos(ang) * 60;
      const fy = 256 + Math.sin(ang) * 60;
      ctx.beginPath();
      ctx.arc(fx, fy, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    // Bore central (furo da barra)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(256, 256, 28, 0, Math.PI * 2);
    ctx.fill();
    // Numero do peso GIGANTE
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 130px Archivo Black, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 256, 410);
    // "KG" embaixo do numero
    ctx.font = "bold 36px Inter, sans-serif";
    ctx.fillText("KG", 256, 470);
    // Brand "PR TRACKER" curvada em arco
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Inter, sans-serif";
    ctx.save();
    ctx.translate(256, 256);
    ctx.rotate(-Math.PI / 2);
    const brand = "PR TRACKER";
    const radius = 180;
    for (let i = 0; i < brand.length; i++) {
      const a = (i - brand.length / 2) * 0.13;
      ctx.save();
      ctx.rotate(a);
      ctx.fillText(brand[i], 0, -radius);
      ctx.restore();
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  for (const side of [-1, 1]) {
    plates.forEach((p, i) => {
      const tex = plateTexture(p.color, p.label);
      // Material faces (frente/trás): canvas com gravacao
      const faceMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.55,
        metalness: 0.1,
        emissive: p.color,
        emissiveIntensity: 0.12,
      });
      // Material edge (lateral cilindro): cor solida
      const edgeMat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.85, // borracha
        metalness: 0,
      });
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(p.radius, p.radius, 0.05, 32),
        [edgeMat, faceMat, faceMat]
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
  // V16.8 cycles 112-114: deadlift platform com madeira clara central +
  // borracha texturizada lateral (ranhuras visiveis) + chalk dust sutil.
  // Dimensoes spec real: 1.2m madeira × 1.6m borracha cada lado, 3m comprimento
  const g = new THREE.Group();
  const accentRubber = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.92,
    metalness: 0,
  });
  // V16.8 cycle 113: ranhuras na borracha texturizada (canvas)
  const rubberCanvas = document.createElement("canvas");
  rubberCanvas.width = 256;
  rubberCanvas.height = 256;
  const rctx = rubberCanvas.getContext("2d")!;
  rctx.fillStyle = "#0a0a14";
  rctx.fillRect(0, 0, 256, 256);
  // Ranhuras diagonais (anti-slip)
  rctx.strokeStyle = "#1a1a26";
  rctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 12) {
    rctx.beginPath();
    rctx.moveTo(i, 0);
    rctx.lineTo(i + 256, 256);
    rctx.stroke();
  }
  const rubberTex = new THREE.CanvasTexture(rubberCanvas);
  rubberTex.colorSpace = THREE.SRGBColorSpace;
  rubberTex.wrapS = THREE.RepeatWrapping;
  rubberTex.wrapT = THREE.RepeatWrapping;
  rubberTex.repeat.set(3, 6);
  const sideRubberMat = new THREE.MeshStandardMaterial({
    map: rubberTex,
    roughness: 0.92,
    metalness: 0,
  });

  const center = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 3.0), WOOD_MAT);
  center.position.y = 0.03;
  center.receiveShadow = true;
  g.add(center);
  for (const x of [-1.4, 1.4]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 3.0), sideRubberMat);
    side.position.set(x, 0.03, 0);
    side.receiveShadow = true;
    g.add(side);
  }
  // Faixa lime de demarcacao (cycle 112: era preta, agora accent)
  for (const x of [-0.6, 0.6]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 3.0), accentRubber);
    line.position.set(x, 0.031, 0);
    g.add(line);
  }
  // V16.8 cycle 167: chalk dust no centro (mancha branca sutil)
  const chalkCanvas = document.createElement("canvas");
  chalkCanvas.width = 256;
  chalkCanvas.height = 256;
  const cctx = chalkCanvas.getContext("2d")!;
  cctx.clearRect(0, 0, 256, 256);
  // Mancha de chalk radial gradient
  const grad = cctx.createRadialGradient(128, 128, 10, 128, 128, 100);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.4, "rgba(240,240,255,0.25)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 256, 256);
  // Speckle sutil
  for (let i = 0; i < 30; i++) {
    const x = 60 + Math.random() * 136;
    const y = 60 + Math.random() * 136;
    cctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.3})`;
    cctx.fillRect(x, y, 2, 2);
  }
  const chalkTex = new THREE.CanvasTexture(chalkCanvas);
  chalkTex.colorSpace = THREE.SRGBColorSpace;
  const chalkPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshBasicMaterial({
      map: chalkTex,
      transparent: true,
      depthWrite: false,
    })
  );
  chalkPlane.rotation.x = -Math.PI / 2;
  chalkPlane.position.set(0, 0.062, 0.4);
  g.add(chalkPlane);
  return g;
}

/**
 * Banco de supino REAL: bench horizontal flat + 2 postes verticais
 * de cada lado da cabeça segurando uma barbell carregada com anilhas.
 *
 * Eixo Z = comprimento do banco (atleta deita ao longo de Z, cabeça
 * em -Z, pés em +Z). Postes ficam em -Z (lado da cabeça).
 */
export function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const benchPad = new THREE.MeshStandardMaterial({
    color: 0x7c1f1f,
    roughness: 0.65,
    metalness: 0.15,
  });
  const stitchMat = new THREE.MeshBasicMaterial({ color: 0x1a0a0a });

  // V16.8 cycle 108: proporcoes ajustadas pra bench press IPF (era 1.4×0.34×0.12,
  // assento 0.5m). Agora width 0.30m + height 0.10m + assento 0.45m (Eleiko Bench).
  const BENCH_LEN = 1.3;
  const PAD_W = 0.30;
  const PAD_H = 0.10;
  const SEAT_Y = 0.45;

  // === ESTOFADO HORIZONTAL (peça única — bench press é PLANO) ===
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(PAD_W, PAD_H, BENCH_LEN),
    benchPad
  );
  seat.position.set(0, SEAT_Y - PAD_H / 2, 0);
  seat.castShadow = true;
  g.add(seat);

  // Costuras visíveis correndo ao longo do banco (linhas pretas vinyl)
  for (const sx of [-0.13, 0.13]) {
    const stitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, PAD_H + 0.005, BENCH_LEN - 0.04),
      stitchMat
    );
    stitch.position.set(sx, SEAT_Y - PAD_H / 2, 0);
    g.add(stitch);
  }
  // Costura horizontal central
  const stitchCenter = new THREE.Mesh(
    new THREE.BoxGeometry(PAD_W - 0.04, 0.005, 0.005),
    stitchMat
  );
  stitchCenter.position.set(0, SEAT_Y, 0);
  g.add(stitchCenter);

  // === ESTRUTURA DE AÇO (frame em Z, cobrindo toda a extensão) ===
  const frameRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, BENCH_LEN),
    STEEL_MAT
  );
  frameRail.position.set(0, SEAT_Y - PAD_H - 0.03, 0);
  g.add(frameRail);

  // === SAPATAS — pés do banco (lados oposto: cabeça e pés) ===
  for (const z of [-BENCH_LEN / 2 + 0.1, BENCH_LEN / 2 - 0.1]) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.06, 0.08),
      STEEL_MAT
    );
    foot.position.set(0, 0.03, z);
    foot.castShadow = true;
    g.add(foot);
    // Pés de borracha
    for (const sx of [-0.32, 0.32]) {
      const rubFoot = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.025, 0.08),
        RUBBER_MAT
      );
      rubFoot.position.set(sx, 0.012, z);
      g.add(rubFoot);
    }
  }

  // Coluna diagonal conectando o frame às sapatas (visual triângulo de apoio)
  for (const sz of [-BENCH_LEN / 2 + 0.1, BENCH_LEN / 2 - 0.1]) {
    const diag = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.4, 0.05),
      STEEL_MAT
    );
    diag.position.set(0, 0.22, sz);
    g.add(diag);
  }

  // === POSTES VERTICAIS PRA BARBELL — só no LADO DA CABEÇA (-Z) ===
  // 2 postes laterais altos com J-hooks segurando barbell carregada
  const POST_X = 0.36;
  const POST_H = 1.05;
  const POST_Z = -BENCH_LEN / 2 - 0.1; // logo atrás da cabeça do atleta
  for (const sx of [-POST_X, POST_X]) {
    // Poste vertical
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, POST_H, 0.06),
      STEEL_MAT
    );
    post.position.set(sx, POST_H / 2, POST_Z);
    post.castShadow = true;
    g.add(post);
    // Sapata dos postes (bem larga, conectada à sapata da cabeça)
    const postFoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.05, 0.18),
      STEEL_MAT
    );
    postFoot.position.set(sx, 0.025, POST_Z + 0.05);
    g.add(postFoot);
    // J-hook no topo (suporte da barbell — formato em U virado)
    const hookBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.18, 0.05),
      STEEL_MAT
    );
    hookBack.position.set(sx, POST_H - 0.04, POST_Z);
    g.add(hookBack);
    const hookSeat = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.16),
      STEEL_MAT
    );
    hookSeat.position.set(sx, POST_H - 0.13, POST_Z + 0.06);
    g.add(hookSeat);
  }

  // === BARBELL CARREGADA APOIADA NOS J-HOOKS ===
  // Barra horizontal cromada cruzando os 2 postes
  const BAR_Y = POST_H - 0.11;
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 2.2, 14),
    CHROME_MAT
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, BAR_Y, POST_Z + 0.06);
  bar.castShadow = true;
  g.add(bar);

  // Sleeves (parte mais grossa da barra onde anilhas vão)
  for (const side of [-1, 1]) {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.4, 14),
      STEEL_MAT
    );
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(side * 0.95, BAR_Y, POST_Z + 0.06);
    g.add(sleeve);
  }

  // Anilhas IWF nos sleeves (vermelha 25kg + azul 20kg de cada lado)
  const platesPerSide = [
    { color: 0xda291c, radius: 0.22, offset: 0.78 }, // 25kg
    { color: 0x0057b8, radius: 0.2, offset: 0.86 }, // 20kg
  ];
  for (const side of [-1, 1]) {
    for (const p of platesPerSide) {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(p.radius, p.radius, 0.05, 24),
        new THREE.MeshStandardMaterial({
          color: p.color,
          roughness: 0.5,
          metalness: 0.15,
          emissive: p.color,
          emissiveIntensity: 0.08,
        })
      );
      plate.rotation.z = Math.PI / 2;
      plate.position.set(side * p.offset, BAR_Y, POST_Z + 0.06);
      plate.castShadow = true;
      g.add(plate);
    }
    // Clamp na ponta
    const clamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12),
      STEEL_MAT
    );
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(side * 1.06, BAR_Y, POST_Z + 0.06);
    g.add(clamp);
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
  // V16.8 cycles 138-139: hex dumbbell com knurling no handle (textura
  // canvas) + cabecas hex visiveis com cor ferro fosco. Handle mais curto
  // (0.32 → 0.26) pra match com hex dumbbell real (~12 polegadas).
  const g = new THREE.Group();
  // Knurling texture pro handle
  const knurlCanvas = document.createElement("canvas");
  knurlCanvas.width = 64;
  knurlCanvas.height = 64;
  const kctx = knurlCanvas.getContext("2d")!;
  kctx.fillStyle = "#444";
  kctx.fillRect(0, 0, 64, 64);
  kctx.strokeStyle = "#222";
  kctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    kctx.beginPath();
    kctx.moveTo(i * 6, 0);
    kctx.lineTo(i * 6 + 32, 64);
    kctx.stroke();
    kctx.beginPath();
    kctx.moveTo(i * 6 + 32, 0);
    kctx.lineTo(i * 6, 64);
    kctx.stroke();
  }
  const knurlTex = new THREE.CanvasTexture(knurlCanvas);
  knurlTex.colorSpace = THREE.SRGBColorSpace;
  knurlTex.wrapS = THREE.RepeatWrapping;
  knurlTex.repeat.set(8, 1);
  const handleMat = new THREE.MeshStandardMaterial({
    map: knurlTex,
    roughness: 0.55,
    metalness: 0.65,
  });
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.26, 10),
    handleMat
  );
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  // Hex heads (ferro fosco escuro com knurling sutil)
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f,
    roughness: 0.65,
    metalness: 0.55,
  });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(headRadius, headRadius, 0.13, 6),
      headMat
    );
    head.rotation.z = Math.PI / 2;
    head.position.set(side * 0.15, 0, 0);
    head.castShadow = true;
    g.add(head);
    // Brand "PR" pequena na face
    const brandCanvas = document.createElement("canvas");
    brandCanvas.width = 128;
    brandCanvas.height = 128;
    const bctx = brandCanvas.getContext("2d")!;
    bctx.clearRect(0, 0, 128, 128);
    bctx.fillStyle = "#D8FF2C";
    bctx.font = "900 36px Archivo Black, Inter, sans-serif";
    bctx.textAlign = "center";
    bctx.textBaseline = "middle";
    bctx.fillText("PR", 64, 64);
    const brandTex = new THREE.CanvasTexture(brandCanvas);
    brandTex.colorSpace = THREE.SRGBColorSpace;
    const brand = new THREE.Mesh(
      new THREE.PlaneGeometry(headRadius * 1.4, headRadius * 1.4),
      new THREE.MeshBasicMaterial({ map: brandTex, transparent: true })
    );
    brand.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    brand.position.set(side * (0.15 + 0.07), 0, 0);
    g.add(brand);
  }
  return g;
}

export function buildKettlebell(scale: number): THREE.Group {
  // V16.8 cycles 136-137: KB com cor competition (mapeada por scale aproximado)
  // 8kg=rosa, 12kg=azul, 16kg=amarelo, 20kg=roxo, 24kg=verde, 32kg=vermelho
  const g = new THREE.Group();
  // Aproximacao da cor IKFF competition por tamanho
  let color = 0x141420;
  if (scale < 0.13) color = 0xff66aa;       // 8kg pink
  else if (scale < 0.16) color = 0x0057b8;  // 12kg blue
  else if (scale < 0.19) color = 0xffc72c;  // 16kg yellow
  else if (scale < 0.22) color = 0x6a3da3;  // 20kg purple
  else if (scale < 0.25) color = 0x43b02a;  // 24kg green
  else color = 0xda291c;                     // 32kg+ red
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(scale, 16, 12),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.25,
      emissive: color,
      emissiveIntensity: 0.08,
    })
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
  const W = size * 1.2;
  const H = size;
  const D = size * 1.2;

  // Madeira escura
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x2a1f1a,
    roughness: 0.9,
    metalness: 0.05,
  });

  // Corpo
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), woodMat);
  box.position.y = H / 2;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);

  // Edges em madeira clara (visual de quinas reforçadas)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box.geometry),
    new THREE.LineBasicMaterial({ color: 0x6a4a2a })
  );
  edges.position.y = H / 2;
  g.add(edges);

  // Topo texturizado (textura de plywood)
  const topCanvas = document.createElement("canvas");
  topCanvas.width = 256;
  topCanvas.height = 256;
  const tctx = topCanvas.getContext("2d")!;
  tctx.fillStyle = "#2a1f1a";
  tctx.fillRect(0, 0, 256, 256);
  tctx.strokeStyle = "#3a2a1f";
  tctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    tctx.beginPath();
    tctx.moveTo(0, i * 32);
    tctx.lineTo(256, i * 32 + 8);
    tctx.stroke();
  }
  tctx.strokeStyle = "#6a4a2a";
  tctx.lineWidth = 6;
  tctx.strokeRect(3, 3, 250, 250);
  const topTex = new THREE.CanvasTexture(topCanvas);
  topTex.colorSpace = THREE.SRGBColorSpace;
  const topFace = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.99, D * 0.99),
    new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.85 })
  );
  topFace.rotation.x = -Math.PI / 2;
  topFace.position.y = H + 0.001;
  g.add(topFace);

  // Frente com número da altura em cm + listras horizontais (efeito plywood)
  const frontCanvas = document.createElement("canvas");
  frontCanvas.width = 256;
  frontCanvas.height = 256;
  const fctx = frontCanvas.getContext("2d")!;
  for (let i = 0; i < 12; i++) {
    fctx.fillStyle = i % 2 === 0 ? "#2a1f1a" : "#332419";
    fctx.fillRect(0, i * 22, 256, 22);
  }
  fctx.strokeStyle = "#D8FF2C";
  fctx.lineWidth = 3;
  fctx.strokeRect(8, 8, 240, 240);
  const cm = Math.round(size * 100);
  fctx.fillStyle = "#D8FF2C";
  fctx.font = "900 110px Archivo Black, Inter, sans-serif";
  fctx.textAlign = "center";
  fctx.textBaseline = "middle";
  fctx.fillText(String(cm), 128, 110);
  fctx.fillStyle = "#9a8a6a";
  fctx.font = "700 28px Inter, sans-serif";
  fctx.fillText("CM", 128, 180);
  const frontTex = new THREE.CanvasTexture(frontCanvas);
  frontTex.colorSpace = THREE.SRGBColorSpace;
  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.85 });
  const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.95), frontMat);
  frontFace.position.set(0, H / 2, D / 2 + 0.001);
  g.add(frontFace);

  // Traseira espelhada
  const backFace = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.95), frontMat);
  backFace.position.set(0, H / 2, -D / 2 - 0.001);
  backFace.rotation.y = Math.PI;
  g.add(backFace);

  return g;
}

// =================================================================
// CROSSFIT RIG — estrutura central alta com rings, ropes, pull-up bars
// =================================================================

export interface CrossFitRig {
  group: THREE.Group;
  /** Rings que balançam levemente (animação no loop). */
  rings: THREE.Group[];
  /** Ropes que balançam levemente. */
  ropes: THREE.Group[];
}

/**
 * Rig central de CrossFit. 6 colunas de aço + travessas superiores
 * + pull-up bars em 3 vãos + 2 pares de rings + 2 ropes pendurando.
 */
export function buildCrossFitRig(width: number, depth: number): CrossFitRig {
  const group = new THREE.Group();
  const rings: THREE.Group[] = [];
  const ropes: THREE.Group[] = [];

  const H = 3.6; // altura do rig (alto, dá presença)
  const colR = 0.06;
  // 6 colunas verticais em 2 fileiras (3 frente, 3 trás), 3 vãos
  for (const z of [-depth / 2, depth / 2]) {
    for (let i = 0; i < 4; i++) {
      const x = -width / 2 + (i / 3) * width;
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(colR, H, colR),
        STEEL_MAT
      );
      col.position.set(x, H / 2, z);
      col.castShadow = true;
      group.add(col);
    }
  }

  // Travessas horizontais conectando colunas no topo (pull-up bars)
  // 3 vãos de pull-up bar (cilindros entre colunas adjacentes da frente)
  for (let i = 0; i < 3; i++) {
    const xL = -width / 2 + (i / 3) * width;
    const xR = -width / 2 + ((i + 1) / 3) * width;
    const xMid = (xL + xR) / 2;
    const len = xR - xL;

    // Pull-up bar (cilindro horizontal, em z=+depth/2)
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, len, 12),
      CHROME_MAT
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(xMid, H - 0.04, depth / 2);
    bar.castShadow = true;
    group.add(bar);

    // Bar nas costas tambem (paralela atras)
    const barBack = bar.clone();
    barBack.position.set(xMid, H - 0.04, -depth / 2);
    group.add(barBack);

    // Travessa de teto conectando frente e trás (formando uma "U" invertido)
    const topConnector = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, depth),
      STEEL_MAT
    );
    topConnector.position.set(xMid, H, 0);
    group.add(topConnector);
  }

  // Travessas laterais conectando topo da frente com topo da trás (frames)
  for (let i = 0; i < 4; i++) {
    const x = -width / 2 + (i / 3) * width;
    const sideRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, depth),
      STEEL_MAT
    );
    sideRail.position.set(x, H, 0);
    group.add(sideRail);
  }

  // 2 pares de rings pendurando no vão central + lateral
  const ringPositions = [
    { x: -width / 6, z: 0 },
    { x: width / 6, z: 0 },
  ];
  for (const pos of ringPositions) {
    // Cada par tem 2 rings espaçados 0.5m
    const pairGroup = new THREE.Group();
    pairGroup.position.set(pos.x, H, pos.z);

    for (const sx of [-0.25, 0.25]) {
      const ringGroup = new THREE.Group();
      // Strap (faixa que prende ao teto)
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 1.4, 0.005),
        new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.85 })
      );
      strap.position.y = -0.7;
      ringGroup.add(strap);
      // O ring (anel de madeira)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.085, 0.018, 10, 24),
        new THREE.MeshStandardMaterial({
          color: 0xa06832,
          roughness: 0.5,
          metalness: 0.05,
        })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -1.45;
      ringGroup.add(ring);
      ringGroup.position.set(sx, 0, 0);
      pairGroup.add(ringGroup);
      rings.push(ringGroup);
    }
    group.add(pairGroup);
  }

  // 2 cordas penduradas (ropes) — cilindros longos texturizados
  const ropePositions = [-width / 2 + width / 3, width / 2 - width / 3];
  for (const x of ropePositions) {
    const ropeGroup = new THREE.Group();
    ropeGroup.position.set(x, H, depth / 2 + 0.4);
    // Corda (cilindro longo cor castanha)
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8),
      new THREE.MeshStandardMaterial({
        color: 0x6b4a2a,
        roughness: 0.85,
        metalness: 0,
      })
    );
    rope.position.y = -1.3;
    ropeGroup.add(rope);
    // Nó na ponta de baixo (esfera)
    const knot = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3318, roughness: 0.9 })
    );
    knot.position.y = -2.65;
    ropeGroup.add(knot);
    group.add(ropeGroup);
    ropes.push(ropeGroup);
  }

  return { group, rings, ropes };
}

// =================================================================
// PLATE TREE — armazenamento vertical de anilhas no canto
// =================================================================

export function buildPlateTree(): THREE.Group {
  const g = new THREE.Group();

  // Base T grande
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.06, 0.7),
    STEEL_MAT
  );
  base.position.y = 0.03;
  base.castShadow = true;
  g.add(base);

  // Coluna central
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.6, 12),
    STEEL_MAT
  );
  post.position.y = 0.86;
  g.add(post);

  // 4 pinos horizontais saindo (peg) com anilhas IWF empilhadas
  const pegHeights = [0.3, 0.6, 0.9, 1.2];
  const pegPlates = [
    { kg: 25, color: 0xda291c, count: 3 },
    { kg: 20, color: 0x0057b8, count: 3 },
    { kg: 15, color: 0xffc72c, count: 3 },
    { kg: 10, color: 0x43b02a, count: 4 },
  ];

  pegHeights.forEach((y, idx) => {
    // 2 pegs (frente e trás) por nível
    for (const dz of [-0.25, 0.25]) {
      const peg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 0.32, 10),
        STEEL_MAT
      );
      peg.rotation.x = Math.PI / 2;
      peg.position.set(0, y, dz * 0.6);
      g.add(peg);

      // Anilhas no peg — V16.7 cycle 26: emissive sutil pra anilhas brilharem
      const data = pegPlates[idx];
      if (!data) continue;
      const radius = 0.08 + (data.kg / 25) * 0.07;
      const thickness = 0.025;
      const plateMat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.45,
        metalness: 0.15,
        emissive: data.color,
        emissiveIntensity: 0.12,
      });
      for (let i = 0; i < data.count; i++) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, thickness, 24),
          plateMat
        );
        plate.rotation.x = Math.PI / 2;
        plate.position.set(0, y, dz * (0.6 - 0.04 - i * thickness));
        plate.castShadow = true;
        g.add(plate);
      }
    }
  });

  return g;
}


// =================================================================
// CEILING BEAMS — vigas de aço industriais visíveis
// =================================================================

export function buildCeilingBeams(roomW: number, roomD: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a22,
    roughness: 0.55,
    metalness: 0.5,
  });
  const rivetMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a46,
    roughness: 0.4,
    metalness: 0.7,
  });

  /**
   * Cria uma viga com perfil I-beam (top flange + web + bottom flange).
   * "axis" define o eixo da viga (X = longitudinal, Z = transversal).
   */
  function makeIBeam(length: number, axis: "x" | "z"): THREE.Group {
    const beam = new THREE.Group();
    const flangeW = 0.16; // largura da flange
    const flangeH = 0.04; // espessura da flange
    const webH = 0.16; // altura do web (alma da viga)
    const webW = 0.04; // espessura do web

    // Top flange
    const top = new THREE.Mesh(
      axis === "x"
        ? new THREE.BoxGeometry(length, flangeH, flangeW)
        : new THREE.BoxGeometry(flangeW, flangeH, length),
      beamMat
    );
    top.position.y = webH / 2 + flangeH / 2;
    beam.add(top);

    // Bottom flange
    const bot = new THREE.Mesh(
      axis === "x"
        ? new THREE.BoxGeometry(length, flangeH, flangeW)
        : new THREE.BoxGeometry(flangeW, flangeH, length),
      beamMat
    );
    bot.position.y = -webH / 2 - flangeH / 2;
    beam.add(bot);

    // Web (alma central)
    const web = new THREE.Mesh(
      axis === "x"
        ? new THREE.BoxGeometry(length, webH, webW)
        : new THREE.BoxGeometry(webW, webH, length),
      beamMat
    );
    beam.add(web);

    // Rivets (pequenos pontos espalhados ao longo da flange superior)
    const rivetCount = Math.max(3, Math.floor(length / 1.5));
    for (let i = 0; i < rivetCount; i++) {
      const t = (i + 0.5) / rivetCount;
      const offset = -length / 2 + t * length;
      const rivet = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 4),
        rivetMat
      );
      if (axis === "x") {
        rivet.position.set(offset, webH / 2 + flangeH + 0.02, 0);
      } else {
        rivet.position.set(0, webH / 2 + flangeH + 0.02, offset);
      }
      beam.add(rivet);
    }

    return beam;
  }

  // Vigas longitudinais (eixo X — span pela largura da sala)
  for (let i = 0; i < 5; i++) {
    const z = -roomD / 2 + (i / 4) * roomD;
    const beam = makeIBeam(roomW, "x");
    beam.position.set(0, height - 0.18, z);
    g.add(beam);
  }
  // Travessas (eixo Z — span pela profundidade)
  for (let i = 0; i < 5; i++) {
    const x = -roomW / 2 + (i / 4) * roomW;
    const beam = makeIBeam(roomD, "z");
    beam.position.set(x, height - 0.05, 0);
    g.add(beam);
  }

  return g;
}

// =================================================================
// WALL LOGO — texto "PR TRACKER" gigante na parede
// =================================================================

export function buildWallLogo(
  width: number,
  accentHex: string,
  subtitle?: string
): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 4096;
  c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 4096, 1024);

  // Outline duplo
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 12;
  ctx.font = "900 540px Archivo Black, Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText("PR TRACKER", 2048, 440);

  ctx.fillStyle = accentHex;
  ctx.fillText("PR TRACKER", 2048, 440);

  if (subtitle) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 90px Inter, sans-serif";
    ctx.fillText(subtitle, 2048, 820);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  return logo;
}

// =================================================================
// HALL PEDESTAL — pedestal individual para Hall of Fame V7
// Estilo Palmeiras Decacampeão Brasileiro: pedestal off-white,
// LED stripe na cor do tier, plaqueta com kg + exercise, mini-
// barbell "My PR Set" com plate split real do peso.
// Para exercícios sem PR: ghost pedestal dim com "?" + "DESBLOQUEAR".
// =================================================================

export interface HallPedestalParts {
  group: THREE.Group;
  /** LED stripe pulsante (animação no loop). null se ghost. */
  ledStripe: THREE.Mesh | null;
  /** Mesh ref pro raycast → modal. */
  hitBox: THREE.Mesh;
}

export interface HallPedestalProps {
  exerciseLabel: string;
  exerciseShort: string;
  weightKg: number | null; // null = ghost pedestal (não desbloqueado)
  tierColorHex: string; // cor do tier (ou cinza se ghost)
  tierName?: string | null; // ex: "Avançado" — opcional
  hasUnlocked: boolean;
}

export function buildHallPedestal(props: HallPedestalProps): HallPedestalParts {
  const group = new THREE.Group();
  const { exerciseLabel, exerciseShort, weightKg, tierColorHex, tierName, hasUnlocked } = props;

  // === BASE branca off-white estilo museum ====================
  const baseW = 0.75;
  const baseH = 1.05;
  const baseD = 0.5;
  const baseColor = hasUnlocked ? 0xf2f2ee : 0x4a4a52; // off-white vs cinza dim
  const baseMat = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: 0.5,
    metalness: 0.05,
  });
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, baseH, baseD),
    baseMat
  );
  base.position.y = baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Inset bevel inferior — efeito de "flutuando" via box menor
  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(baseW * 0.92, 0.04, baseD * 0.92),
    new THREE.MeshStandardMaterial({
      color: hasUnlocked ? 0xe2e2dc : 0x35353a,
      roughness: 0.7,
    })
  );
  inset.position.y = 0.03;
  group.add(inset);

  // === LED STRIPE no topo da base, na cor do tier =============
  let ledStripe: THREE.Mesh | null = null;
  if (hasUnlocked) {
    const ledMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tierColorHex),
    });
    ledStripe = new THREE.Mesh(
      new THREE.BoxGeometry(baseW + 0.01, 0.025, baseD + 0.01),
      ledMat
    );
    ledStripe.position.y = baseH;
    group.add(ledStripe);

    // Glow externo via segundo plano levemente maior, semitransp
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(baseW + 0.06, 0.05, baseD + 0.06),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(tierColorHex),
        transparent: true,
        opacity: 0.18,
      })
    );
    glow.position.y = baseH;
    group.add(glow);
  } else {
    // LED apagado pro ghost
    const dimLed = new THREE.Mesh(
      new THREE.BoxGeometry(baseW + 0.01, 0.018, baseD + 0.01),
      new THREE.MeshBasicMaterial({ color: 0x252530 })
    );
    dimLed.position.y = baseH;
    group.add(dimLed);
  }

  // === PLAQUETA frontal — kg + exercise (ou ? + DESBLOQUEAR) ==
  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 768;
  plaqueCanvas.height = 512;
  const pctx = plaqueCanvas.getContext("2d")!;

  if (hasUnlocked && weightKg != null) {
    // Plaqueta UNLOCKED: fundo branco, número GIGANTE em tier color
    pctx.fillStyle = "#ffffff";
    pctx.fillRect(0, 0, 768, 512);
    // Borda grossa na cor do tier
    pctx.strokeStyle = tierColorHex;
    pctx.lineWidth = 14;
    pctx.strokeRect(7, 7, 754, 498);
    // Tag tier name no topo (ex: "AVANÇADO")
    pctx.fillStyle = tierColorHex;
    pctx.font = "900 50px Archivo Black, Inter, sans-serif";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText(tierName ? tierName.toUpperCase() : "PR", 384, 70);
    // Número GIGANTE
    pctx.fillStyle = "#01002A";
    pctx.font = "900 260px Archivo Black, Inter, sans-serif";
    pctx.fillText(String(Math.round(weightKg)), 384, 260);
    // KG
    pctx.fillStyle = "#4d4d51";
    pctx.font = "700 56px Inter, sans-serif";
    pctx.fillText("KG", 384, 400);
    // Exercise embaixo
    pctx.fillStyle = "#01002A";
    pctx.font = "600 36px Inter, sans-serif";
    pctx.fillText(exerciseShort.toUpperCase(), 384, 465);
  } else {
    // Plaqueta GHOST: fundo cinza, "?" gigante
    pctx.fillStyle = "#1a1a22";
    pctx.fillRect(0, 0, 768, 512);
    pctx.strokeStyle = "#3a3a44";
    pctx.lineWidth = 8;
    pctx.strokeRect(4, 4, 760, 504);
    // "?" gigante
    pctx.fillStyle = "#3a3a44";
    pctx.font = "900 320px Archivo Black, Inter, sans-serif";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText("?", 384, 240);
    // Exercise nome
    pctx.fillStyle = "#6a6a74";
    pctx.font = "600 38px Inter, sans-serif";
    pctx.fillText(exerciseShort.toUpperCase(), 384, 400);
    // Call to action
    pctx.fillStyle = "#9a9aa4";
    pctx.font = "500 28px Inter, sans-serif";
    pctx.fillText("DESBLOQUEAR", 384, 460);
  }

  const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(baseW * 0.92, baseH * 0.78),
    new THREE.MeshBasicMaterial({ map: plaqueTex })
  );
  plaque.position.set(0, baseH / 2, baseD / 2 + 0.005);
  group.add(plaque);

  // === MINI-BARBELL com plate split em cima do pedestal ==========
  // V16.8 cycle 87: showStand com cor mais quente (gold accent) + emissive
  if (hasUnlocked && weightKg != null) {
    const showStand = new THREE.Mesh(
      new THREE.BoxGeometry(baseW * 0.92, 0.04, baseD * 0.92),
      new THREE.MeshStandardMaterial({
        color: 0x4a4250,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x2a2540,
        emissiveIntensity: 0.2,
      })
    );
    showStand.position.y = baseH + 0.045;
    group.add(showStand);

    const barbell = buildMiniBarbell(weightKg);
    barbell.position.set(0, baseH + 0.18, 0);
    group.add(barbell);
  }

  // === ETIQUETA do exercício na parte da frente do pedestal ====
  // V16.7 cycle 20: auto-fit fontSize pra exercícios longos (CLEAN_AND_JERK)
  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = 768;
  tagCanvas.height = 96;
  const tctx = tagCanvas.getContext("2d")!;
  tctx.clearRect(0, 0, 768, 96);
  tctx.fillStyle = hasUnlocked ? tierColorHex : "#5a5a64";
  tctx.fillRect(0, 0, 768, 96);
  tctx.fillStyle = hasUnlocked ? "#01002A" : "#9a9aa4";
  const exTitle = exerciseLabel.toUpperCase();
  let tagFontSize = 56;
  tctx.font = `900 ${tagFontSize}px Archivo Black, Inter, sans-serif`;
  while (tctx.measureText(exTitle).width > 720 && tagFontSize > 24) {
    tagFontSize -= 4;
    tctx.font = `900 ${tagFontSize}px Archivo Black, Inter, sans-serif`;
  }
  tctx.textAlign = "center";
  tctx.textBaseline = "middle";
  tctx.fillText(exTitle, 384, 48);
  const tagTex = new THREE.CanvasTexture(tagCanvas);
  tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(baseW + 0.06, 0.12),
    new THREE.MeshBasicMaterial({ map: tagTex })
  );
  tag.position.set(0, 0.16, baseD / 2 + 0.005);
  group.add(tag);

  // === HIT BOX invisível pro raycast ===========================
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(baseW + 0.3, baseH + 0.6, baseD + 0.3),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = (baseH + 0.6) / 2;
  group.add(hitBox);

  return { group, ledStripe, hitBox };
}

// =================================================================
// SKILLS BADGES — display de ginásticos / movimentos não-weight
// (BMU, MU, HSPU, T2B, DU, Pistol com tiers Bronze/Prata/Ouro/Diamante)
// =================================================================

export interface SkillBoardSlot {
  id: SkillId;
  short: string;
  label: string;
  /** Reps consecutivos atuais. 0 = locked. */
  bestReps: number;
}

export interface SkillsBoardParts {
  group: THREE.Group;
  /** Plane invisível pra raycast — abre modal de input. */
  hitBox: THREE.Mesh;
}

/**
 * Painel mural de skills badges. 6 medalhas circulares na parede.
 * Cada badge mostra: sigla + reps + tier (locked/unlocked/bronze/silver/gold/diamond).
 */
export function buildSkillsBoard(accentHex: string, slots: SkillBoardSlot[]): SkillsBoardParts {
  const g = new THREE.Group();

  // Fundo do painel (placa preta com borda lime)
  const boardW = 4.0;
  const boardH = 1.8;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0a0a16, roughness: 0.7, metalness: 0.2 })
  );
  g.add(board);

  // Borda lime
  const borderTop = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, 0.04, 0.08),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  borderTop.position.y = boardH / 2;
  g.add(borderTop);
  const borderBot = borderTop.clone();
  borderBot.position.y = -boardH / 2;
  g.add(borderBot);

  // Título "GINÁSTICOS" — GIGANTE + neon glow effect
  const titleCanvas = document.createElement("canvas");
  titleCanvas.width = 2048;
  titleCanvas.height = 384;
  const tctx = titleCanvas.getContext("2d")!;
  tctx.clearRect(0, 0, 2048, 384);
  // Glow effect (camadas progressivas)
  for (let glow = 0; glow < 3; glow++) {
    tctx.shadowColor = accentHex;
    tctx.shadowBlur = 30 - glow * 10;
    tctx.fillStyle = accentHex;
    tctx.font = "900 220px Archivo Black, Inter, sans-serif";
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillText("GINÁSTICOS", 1024, 130);
  }
  tctx.shadowBlur = 0;
  tctx.fillStyle = "#9ca3af";
  tctx.font = "500 56px Inter, sans-serif";
  tctx.fillText("Toque pra registrar · Bronze · Prata · Ouro · Diamante", 1024, 280);
  const titleTex = new THREE.CanvasTexture(titleCanvas);
  titleTex.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW * 0.96, 0.7),
    new THREE.MeshBasicMaterial({ map: titleTex, transparent: true })
  );
  title.position.set(0, boardH / 2 - 0.4, 0.04);
  g.add(title);

  // 6 badges circulares (3 colunas × 2 linhas)
  const COLS = 3;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const x = -boardW / 2 + 0.6 + col * ((boardW - 1.2) / (COLS - 1));
    const y = 0.05 - row * 0.5;

    const tier: SkillTier = tierForReps(slot.bestReps);
    const meta = SKILL_TIER_META[tier];
    const isUnlocked = tier !== "locked";

    // Disco da badge — V16.8 cycle 85: 22% maior pra ler de longe
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28),
      new THREE.MeshStandardMaterial({
        color: meta.color,
        roughness: 0.3,
        metalness: 0.6,
        emissive: meta.color,
        emissiveIntensity: isUnlocked ? 0.5 : 0,
      })
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.set(x, y, 0.05);
    g.add(badge);

    // Anel externo lime — V16.8 cycle 86: maior + emissive
    if (isUnlocked && tier !== "unlocked") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.245, 0.018, 12, 36),
        new THREE.MeshStandardMaterial({
          color: accentHex,
          emissive: accentHex,
          emissiveIntensity: 1.0,
        })
      );
      ring.position.set(x, y, 0.06);
      g.add(ring);
    }

    // Sigla + reps + tier label no centro do disco (canvas)
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = meta.textColor;
    ctx.font = "900 60px Archivo Black, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(slot.short, 128, 92);
    if (isUnlocked) {
      ctx.font = "900 40px Archivo Black, Inter, sans-serif";
      ctx.fillText(String(slot.bestReps), 128, 150);
      ctx.font = "700 22px Inter, sans-serif";
      ctx.fillText(meta.label.toUpperCase(), 128, 190);
    } else {
      ctx.font = "900 50px Inter, sans-serif";
      ctx.fillText("?", 128, 165);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sigla = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    sigla.position.set(x, y, 0.08);
    g.add(sigla);
  }

  // Hit box invisível pra raycast (board inteiro abre modal)
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.set(0, 0, 0.05);
  hitBox.userData.kind = "skills-board";
  g.add(hitBox);

  return { group: g, hitBox };
}

// =================================================================
// RUNNING BENCHMARKS — display de tempos de corrida (5K/10K/21K/42K)
// Estilo "MEUS RPs" (placa preta + accent lime)
// =================================================================

export interface RunSlot {
  /** ID interno: "5k" | "10k" | "21k" | "42k". */
  id: RunDistance;
  /** Sigla pra display: "5KM" / "10KM" / etc. */
  distance: string;
  /** Nome cheio: "5 km", "Meia maratona". */
  label: string;
  /** Melhor tempo em segundos. Null = locked. */
  bestTimeSec: number | null;
}

export const DEFAULT_RUN_SLOTS: RunSlot[] = [
  { id: "5k", distance: "5KM", label: "5 km", bestTimeSec: null },
  { id: "10k", distance: "10KM", label: "10 km", bestTimeSec: null },
  { id: "21k", distance: "21KM", label: "Meia maratona", bestTimeSec: null },
  { id: "42k", distance: "42KM", label: "Maratona", bestTimeSec: null },
];

export interface RunBoardParts {
  group: THREE.Group;
  hitBox: THREE.Mesh;
}

/** Painel mural com 4 slots de tempo de corrida. */
export function buildRunBoard(accentHex: string, slots: RunSlot[]): RunBoardParts {
  const g = new THREE.Group();

  const boardW = 4.0;
  const boardH = 2.6;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0a0a16, roughness: 0.7, metalness: 0.2 })
  );
  g.add(board);

  // Borda lime
  const borderL = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, boardH, 0.08),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  borderL.position.x = -boardW / 2;
  g.add(borderL);
  const borderR = borderL.clone();
  borderR.position.x = boardW / 2;
  g.add(borderR);

  // Título com ícone de corredor SVG-like canvas + neon glow
  const titleCanvas = document.createElement("canvas");
  titleCanvas.width = 2048;
  titleCanvas.height = 384;
  const tctx = titleCanvas.getContext("2d")!;
  tctx.clearRect(0, 0, 2048, 384);

  // Ícone de corredor à esquerda do título
  // (figura simplificada feita com paths — corpo em movimento)
  function drawRunner(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, color: string) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 14 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Cabeça
    ctx.beginPath();
    ctx.arc(cx, cy - 90 * scale, 30 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Tronco (inclinado pra frente)
    ctx.beginPath();
    ctx.moveTo(cx - 15 * scale, cy - 60 * scale);
    ctx.lineTo(cx + 25 * scale, cy + 40 * scale);
    ctx.stroke();
    // Braço atrás (dobrado)
    ctx.beginPath();
    ctx.moveTo(cx - 10 * scale, cy - 30 * scale);
    ctx.lineTo(cx - 60 * scale, cy);
    ctx.lineTo(cx - 35 * scale, cy + 30 * scale);
    ctx.stroke();
    // Braço frente (dobrado)
    ctx.beginPath();
    ctx.moveTo(cx + 5 * scale, cy - 30 * scale);
    ctx.lineTo(cx + 60 * scale, cy + 10 * scale);
    ctx.lineTo(cx + 50 * scale, cy + 50 * scale);
    ctx.stroke();
    // Perna trás (estendida)
    ctx.beginPath();
    ctx.moveTo(cx + 25 * scale, cy + 40 * scale);
    ctx.lineTo(cx - 30 * scale, cy + 90 * scale);
    ctx.lineTo(cx - 60 * scale, cy + 100 * scale);
    ctx.stroke();
    // Perna frente (dobrada, no ar)
    ctx.beginPath();
    ctx.moveTo(cx + 25 * scale, cy + 40 * scale);
    ctx.lineTo(cx + 70 * scale, cy + 50 * scale);
    ctx.lineTo(cx + 60 * scale, cy + 110 * scale);
    ctx.stroke();
    // Linhas de movimento atrás
    ctx.lineWidth = 6 * scale;
    ctx.strokeStyle = color + "88";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 100 * scale - i * 20 * scale, cy - 30 * scale + i * 30 * scale);
      ctx.lineTo(cx - 70 * scale - i * 20 * scale, cy - 30 * scale + i * 30 * scale);
      ctx.stroke();
    }
  }
  drawRunner(tctx, 380, 150, 1.2, accentHex);

  // Texto "CORRIDA" com glow
  for (let glow = 0; glow < 3; glow++) {
    tctx.shadowColor = accentHex;
    tctx.shadowBlur = 30 - glow * 10;
    tctx.fillStyle = accentHex;
    tctx.font = "900 200px Archivo Black, Inter, sans-serif";
    tctx.textAlign = "left";
    tctx.textBaseline = "middle";
    tctx.fillText("CORRIDA", 540, 130);
  }
  tctx.shadowBlur = 0;
  tctx.fillStyle = "#9ca3af";
  tctx.font = "500 50px Inter, sans-serif";
  tctx.fillText("Recordes Pessoais", 540, 250);

  const titleTex = new THREE.CanvasTexture(titleCanvas);
  titleTex.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW * 0.96, 0.7),
    new THREE.MeshBasicMaterial({ map: titleTex, transparent: true })
  );
  title.position.set(0, boardH / 2 - 0.4, 0.04);
  g.add(title);

  // Painel "MEUS RPs" inspirado no produto físico — 4 linhas com pílulas
  // de distância à esquerda e tempo à direita, separadas por linha lime.
  const rowsTop = 0.55; // primeira linha começa abaixo do título
  const rowH = 0.42;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const unlocked = slot.bestTimeSec != null;
    const x = 0;
    const y = rowsTop - i * rowH;

    // Linha background com sutil border
    const rowBg = new THREE.Mesh(
      new THREE.BoxGeometry(boardW * 0.9, rowH * 0.9, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0x14111e,
        roughness: 0.7,
        metalness: 0.15,
      })
    );
    rowBg.position.set(x, y, 0.04);
    g.add(rowBg);

    // Pílula da distância (esquerda) — caixa lime claro/cinza
    const pillW = 1.3;
    const pillBg = new THREE.Mesh(
      new THREE.BoxGeometry(pillW, rowH * 0.7, 0.04),
      new THREE.MeshStandardMaterial({
        color: unlocked ? accentHex : 0x2d2d3a,
        roughness: 0.4,
        metalness: 0.4,
        emissive: unlocked ? accentHex : 0x000000,
        emissiveIntensity: unlocked ? 0.3 : 0,
      })
    );
    pillBg.position.set(-boardW * 0.45 + pillW / 2 + 0.05, y, 0.07);
    g.add(pillBg);

    // Texto distância no centro da pílula
    const cD = document.createElement("canvas");
    cD.width = 384;
    cD.height = 128;
    const ctxD = cD.getContext("2d")!;
    ctxD.clearRect(0, 0, 384, 128);
    ctxD.fillStyle = unlocked ? "#01002A" : "#9ca3af";
    ctxD.font = "900 84px Archivo Black, Inter, sans-serif";
    ctxD.textAlign = "center";
    ctxD.textBaseline = "middle";
    ctxD.fillText(slot.distance, 192, 64);
    const texD = new THREE.CanvasTexture(cD);
    texD.colorSpace = THREE.SRGBColorSpace;
    const distTxt = new THREE.Mesh(
      new THREE.PlaneGeometry(pillW, rowH * 0.7),
      new THREE.MeshBasicMaterial({ map: texD, transparent: true })
    );
    distTxt.position.set(pillBg.position.x, y, 0.1);
    g.add(distTxt);

    // Pílula tempo (direita) — borda lime se unlocked
    const timeW = 1.7;
    const timeBg = new THREE.Mesh(
      new THREE.BoxGeometry(timeW, rowH * 0.7, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x0a0a16,
        roughness: 0.6,
        metalness: 0.2,
      })
    );
    timeBg.position.set(boardW * 0.45 - timeW / 2 - 0.05, y, 0.07);
    g.add(timeBg);

    // Borda lime fina ao redor (só pra unlocked)
    if (unlocked) {
      const borderTop = new THREE.Mesh(
        new THREE.BoxGeometry(timeW, 0.02, 0.05),
        new THREE.MeshBasicMaterial({ color: accentHex })
      );
      borderTop.position.set(timeBg.position.x, y + rowH * 0.34, 0.1);
      g.add(borderTop);
      const borderBot = borderTop.clone();
      borderBot.position.y = y - rowH * 0.34;
      g.add(borderBot);
    }

    // Texto tempo
    const cT = document.createElement("canvas");
    cT.width = 512;
    cT.height = 128;
    const ctxT = cT.getContext("2d")!;
    ctxT.clearRect(0, 0, 512, 128);
    ctxT.textAlign = "center";
    ctxT.textBaseline = "middle";
    if (unlocked && slot.bestTimeSec != null) {
      ctxT.fillStyle = "#ffffff";
      ctxT.font = "900 70px Archivo Black, Inter, sans-serif";
      ctxT.fillText(formatRunTime(slot.bestTimeSec), 256, 64);
    } else {
      // Cadeado pra locked
      ctxT.fillStyle = "#6a6a74";
      ctxT.font = "900 64px Inter, sans-serif";
      ctxT.fillText("🔒", 256, 64);
    }
    const texT = new THREE.CanvasTexture(cT);
    texT.colorSpace = THREE.SRGBColorSpace;
    const timeTxt = new THREE.Mesh(
      new THREE.PlaneGeometry(timeW, rowH * 0.7),
      new THREE.MeshBasicMaterial({ map: texT, transparent: true })
    );
    timeTxt.position.set(timeBg.position.x, y, 0.1);
    g.add(timeTxt);
  }

  // Hit box pra raycast (board inteiro abre modal)
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.set(0, 0, 0.05);
  hitBox.userData.kind = "run-board";
  g.add(hitBox);

  return { group: g, hitBox };
}

// =================================================================
// NPC AVATAR — figura 3D dos profissionais parceiros (Nutri / PT)
// Versão simplificada do buildAvatar, sem face customizável — só
// proporções + cores definidas pelo painel.
// =================================================================

export interface NPCParts {
  group: THREE.Group;
  /** Cabeça pra leve idle bob. */
  head: THREE.Group;
  /** Body pra leve sway. */
  body: THREE.Group;
}

export interface NPCProps {
  skinHex: string;
  hairHex: string;
  topHex: string;
  shortsHex: string;
  /** "male" / "female" pra proporções. */
  gender: "male" | "female" | "fluid";
  /** Inicial pra mostrar no peito (ex: "C", "B"). */
  initial: string;
  /**
   * Outfit profissional opcional — adiciona elementos visuais característicos:
   *   "labcoat" → jaleco branco aberto sobre o top (Nutricionista)
   *   "athletic" → muscle tank com listras + apito (Personal Trainer)
   *   undefined → neutro (sem outfit extra)
   */
  outfit?: "labcoat" | "athletic";
  /** Name tag flutuante acima da cabeça (ex: "CAMILA · NUTRI"). */
  nameTag?: string;
}

export function buildNPC(props: NPCProps): NPCParts {
  const root = new THREE.Group();
  const { skinHex, hairHex, topHex, shortsHex, gender, initial, outfit, nameTag } = props;

  // V16.3: emissive AGRESSIVO (era 0.35, agora 0.7) pra cabeça ficar
  // visível mesmo em zona escura. Trade-off: NPC parece "fluorescente"
  // de perto, mas é melhor isso que cabeça invisível.
  const skinColor = new THREE.Color(skinHex);
  const skinMat = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.7,
    emissive: skinColor,
    emissiveIntensity: 0.7,
  });
  const hairColor = new THREE.Color(hairHex);
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.85,
    emissive: hairColor,
    emissiveIntensity: 0.6,
  });
  const topColor = new THREE.Color(topHex);
  const topMat = new THREE.MeshStandardMaterial({
    color: topColor,
    roughness: 0.7,
    emissive: topColor,
    emissiveIntensity: 0.25,
  });
  const shortsColor = new THREE.Color(shortsHex);
  const shortsMat = new THREE.MeshStandardMaterial({
    color: shortsColor,
    roughness: 0.85,
    emissive: shortsColor,
    emissiveIntensity: 0.2,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
    emissive: 0x111111,
    emissiveIntensity: 0.2,
  });

  const isF = gender === "female";
  const isM = gender === "male";
  const torsoR = isF ? 0.18 : isM ? 0.22 : 0.20;
  // V16.5 CYCLE 4: depois do basketball test confirmou que head sempre
  // foi renderizada, ajusto pra tamanho realista mas ainda 50% maior
  // (0.21 → 0.32) pra garantir visibilidade à distância da câmera.
  const headR = 0.32;

  // === HEAD — geometria pura ===
  const head = new THREE.Group();

  // Skull (esfera skin) — tamanho aumentado vs avatar pra dar destaque NPC
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 24, 18),
    skinMat
  );
  skull.scale.set(1.0, 1.06, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // Olhos — escalados proporcional ao headR pra parecer naturais com head maior
  const eyeR = headR * 0.11; // raio do olho
  const eyeOffsetX = headR * 0.33; // distância horizontal do centro
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a14 });
  for (const sx of [-eyeOffsetX, eyeOffsetX]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(eyeR, 10, 8),
      eyeMat
    );
    eye.position.set(sx, headR * 0.14, headR * 0.92);
    head.add(eye);
    // Reflexo branco
    const sparkle = new THREE.Mesh(
      new THREE.SphereGeometry(eyeR * 0.35, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sparkle.position.set(sx + eyeR * 0.3, headR * 0.18, headR * 0.95);
    head.add(sparkle);
  }

  // Boca — escalada também
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(headR * 0.38, headR * 0.06, 0.005),
    new THREE.MeshBasicMaterial({ color: 0x4a1f1f })
  );
  mouth.position.set(0, -headR * 0.33, headR * 0.94);
  head.add(mouth);

  // Cabelo — hemisfério MAIS CURTO (era π/1.8 ≈ 100°, agora π/2.5 ≈ 72°)
  // pra não cobrir os olhos. Position.y = +0.02 também sobe um pouco.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(headR + 0.02, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.5),
    hairMat
  );
  hair.position.y = 0.04;
  hair.castShadow = true;
  head.add(hair);

  // Franja sutil na frente da testa (box achatado horizontal)
  const fringe = new THREE.Mesh(
    new THREE.BoxGeometry(headR * 1.4, headR * 0.18, headR * 0.5),
    hairMat
  );
  fringe.position.set(0, headR * 0.55, headR * 0.55);
  fringe.rotation.x = -0.15;
  head.add(fringe);

  // Female: mecha lateral
  if (isF) {
    for (const sx of [-1, 1]) {
      const sideHair = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.045, 0.14, 4, 6),
        hairMat
      );
      sideHair.position.set(sx * (headR + 0.005), -0.05, headR * 0.4);
      sideHair.rotation.z = sx * 0.15;
      head.add(sideHair);
    }
  }

  // Orelhas — escaladas proporcional
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 0.13, 8, 6),
      skinMat
    );
    ear.scale.set(0.5, 0.9, 0.4);
    ear.position.set(sx * headR, headR * 0.05, 0);
    head.add(ear);
  }

  // Pescoço — escalado pro head maior, mais robusto
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(headR * 0.32, headR * 0.4, 0.14, 12),
    skinMat
  );
  neck.position.y = -headR - 0.04;
  neck.castShadow = true;
  head.add(neck);

  // Posição da cabeça — y=2.05 acima do torso (head maior precisa mais alto)
  head.position.y = 2.05;
  root.add(head);

  // V16.7 cycle 28: name tag flutuante acima da cabeça (canvas)
  if (nameTag) {
    const tagCanvas = document.createElement("canvas");
    tagCanvas.width = 512;
    tagCanvas.height = 96;
    const tctx = tagCanvas.getContext("2d")!;
    tctx.clearRect(0, 0, 512, 96);
    // Fundo arredondado escuro
    tctx.fillStyle = "rgba(1,0,42,0.85)";
    tctx.beginPath();
    tctx.roundRect(6, 6, 500, 84, 18);
    tctx.fill();
    tctx.strokeStyle = "#D8FF2C";
    tctx.lineWidth = 3;
    tctx.beginPath();
    tctx.roundRect(6, 6, 500, 84, 18);
    tctx.stroke();
    // Texto
    tctx.fillStyle = "#D8FF2C";
    tctx.font = "900 44px Archivo Black, Inter, sans-serif";
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillText(nameTag.toUpperCase(), 256, 50);
    const tagTex = new THREE.CanvasTexture(tagCanvas);
    tagTex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.18),
      new THREE.MeshBasicMaterial({
        map: tagTex,
        transparent: true,
        depthTest: false, // sempre visível, não occlui
      })
    );
    tag.renderOrder = 999; // renderiza por último (no topo)
    tag.position.y = 2.7;
    tag.userData.isBillboard = true; // marker pra animation loop fazer face-camera
    root.add(tag);
  }

  // === TORSO + INITIAL ===
  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoR, torsoR * 0.92, 0.55, 18),
    topMat
  );
  torso.position.y = 1.375;
  torso.castShadow = true;
  body.add(torso);

  // Inicial no peito
  const initCanvas = document.createElement("canvas");
  initCanvas.width = 256;
  initCanvas.height = 256;
  const ictx = initCanvas.getContext("2d")!;
  ictx.clearRect(0, 0, 256, 256);
  ictx.fillStyle = "#01002A";
  ictx.beginPath();
  ictx.arc(128, 128, 70, 0, Math.PI * 2);
  ictx.fill();
  ictx.fillStyle = topHex;
  ictx.font = "900 110px Archivo Black, Inter, sans-serif";
  ictx.textAlign = "center";
  ictx.textBaseline = "middle";
  ictx.fillText(initial, 128, 134);
  const initTex = new THREE.CanvasTexture(initCanvas);
  initTex.colorSpace = THREE.SRGBColorSpace;
  const chestBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ map: initTex, transparent: true })
  );
  chestBadge.position.set(0, 1.43, torsoR + 0.005);
  body.add(chestBadge);

  // Hip
  const hip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.20, 0.18, 16),
    shortsMat
  );
  hip.position.y = 1.0;
  body.add(hip);

  // === OUTFIT EXTRA — jaleco (nutri) ou muscle tank (personal) ===
  if (outfit === "labcoat") {
    // Jaleco branco aberto — 2 panos laterais sobre o top + colar verde-claro
    const coatMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
    });
    const collarMat = new THREE.MeshStandardMaterial({
      color: 0x43B02A,
      roughness: 0.7,
    });
    // 2 abas frontais (lapelas) — caixas finas verticais nas laterais frontais
    for (const sx of [-0.13, 0.13]) {
      const lapel = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.62, 0.04),
        coatMat
      );
      lapel.position.set(sx, 1.36, torsoR + 0.005);
      lapel.castShadow = true;
      body.add(lapel);
    }
    // Lateral esquerda + direita (forro)
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.55, 0.36),
        coatMat
      );
      side.position.set(sx * (torsoR + 0.02), 1.38, 0);
      side.castShadow = true;
      body.add(side);
    }
    // Colar verde
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.05, 0.2),
      collarMat
    );
    collar.position.set(0, 1.66, torsoR * 0.6);
    body.add(collar);
    // Bolso esquerdo do jaleco com caneta verde (detalhe)
    const pocket = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.07, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.85 })
    );
    pocket.position.set(-0.13, 1.22, torsoR + 0.018);
    body.add(pocket);
    const pen = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.05, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x43B02A })
    );
    pen.position.set(-0.13, 1.245, torsoR + 0.025);
    body.add(pen);
  } else if (outfit === "athletic") {
    // Muscle tank — top mais curto + listras laterais lime + cordão de apito
    const limeStripe = new THREE.MeshStandardMaterial({
      color: 0xD8FF2C,
      roughness: 0.4,
      metalness: 0.2,
      emissive: 0xD8FF2C,
      emissiveIntensity: 0.15,
    });
    // 2 listras laterais verticais sobre o top
    for (const sx of [-1, 1]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.55, 0.02),
        limeStripe
      );
      stripe.position.set(sx * (torsoR - 0.02), 1.38, torsoR);
      body.add(stripe);
    }
    // Logo PT no peito (texto canvas)
    const ptCanvas = document.createElement("canvas");
    ptCanvas.width = 256;
    ptCanvas.height = 256;
    const pctx = ptCanvas.getContext("2d")!;
    pctx.clearRect(0, 0, 256, 256);
    pctx.fillStyle = "#D8FF2C";
    pctx.font = "900 130px Archivo Black, Inter, sans-serif";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText("PT", 128, 134);
    const ptTex = new THREE.CanvasTexture(ptCanvas);
    ptTex.colorSpace = THREE.SRGBColorSpace;
    const ptBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ map: ptTex, transparent: true })
    );
    ptBadge.position.set(0.05, 1.55, torsoR + 0.006);
    body.add(ptBadge);
    // Apito (cilindro lime no peito esquerdo)
    const whistleString = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.3, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x141414 })
    );
    whistleString.position.set(-0.06, 1.5, torsoR + 0.01);
    whistleString.rotation.z = 0.15;
    body.add(whistleString);
    const whistle = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.025),
      new THREE.MeshStandardMaterial({ color: 0xc0c5cc, metalness: 0.7, roughness: 0.3 })
    );
    whistle.position.set(-0.1, 1.36, torsoR + 0.02);
    body.add(whistle);
  }

  root.add(body);

  // === Pernas ===
  for (const sx of [-0.1, 0.1]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.985, 0);
    const shorts = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.105, 0.18, 10),
      shortsMat
    );
    shorts.position.y = -0.09;
    leg.add(shorts);
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.07, 0.28, 10),
      skinMat
    );
    thigh.position.y = -0.32;
    leg.add(thigh);
    const calf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.055, 0.36, 10),
      skinMat
    );
    calf.position.y = -0.65;
    leg.add(calf);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.09, 0.24),
      shoeMat
    );
    shoe.position.set(0, -0.91, 0.05);
    leg.add(shoe);
    root.add(leg);
  }

  // === Braços com pose natural — upper inclinado, lower com leve flexão ===
  // V16.8 cycle 62: braços não pendulares. Upper rotacionado pra fora (5°)
  // + lower com elbow flex (15°) pra parecer relaxado em vez de boneco rigido.
  // Ombro com esfera deltoide (musculatura visível).
  const shoulderHalfW = isF ? 0.22 : isM ? 0.26 : 0.24;
  for (const dir of [-1, 1]) {
    const sx = dir * (shoulderHalfW + 0.02);
    const arm = new THREE.Group();
    arm.position.set(sx, 1.62, 0);
    // Pose: braço inclinado pra fora + frente (mãos não tocam corpo)
    arm.rotation.z = dir * 0.18; // 10° pra fora
    arm.rotation.x = -0.08; // leve pra frente

    // Deltoide (esfera no ombro pra musculatura)
    const delt = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 10),
      skinMat
    );
    delt.position.y = 0;
    arm.add(delt);

    // Upper arm
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.06, 0.28, 10),
      skinMat
    );
    upper.position.y = -0.18;
    arm.add(upper);

    // Cotovelo (esfera) + lower arm com leve flexão
    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 10, 8),
      skinMat
    );
    elbow.position.y = -0.34;
    arm.add(elbow);

    // Forearm em grupo separado pra ter rotation de cotovelo
    const forearm = new THREE.Group();
    forearm.position.y = -0.34;
    forearm.rotation.x = 0.18; // ~10° elbow flex
    arm.add(forearm);
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.052, 0.28, 10),
      skinMat
    );
    lower.position.y = -0.16;
    forearm.add(lower);

    // Mão — capsule achatada (parece punho mais que bola)
    const hand = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.06, 0.05, 6, 8),
      skinMat
    );
    hand.scale.set(1.0, 1.0, 1.4); // achata em z (frente-trás)
    hand.position.y = -0.34;
    hand.castShadow = true;
    forearm.add(hand);

    root.add(arm);
  }

  return { group: root, head, body };
}

// =================================================================
// STREAK PILLAR — totem de fogo Duolingo-style
// =================================================================

export interface StreakPillarParts {
  group: THREE.Group;
  /** Mesh da chama pra animar pulsar/flicker. */
  flame: THREE.Group;
  hitBox: THREE.Mesh;
}

/**
 * Pilar visual com contador de streak (X dias consecutivos com PR).
 * Visual: base preta + número GIGANTE em fogo + chama animada em cima.
 */
export function buildStreakPillar(streakDays: number): StreakPillarParts {
  const g = new THREE.Group();

  // Base do pilar (cilindro escuro)
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 1.6, 16),
    new THREE.MeshStandardMaterial({
      color: 0x14111e,
      roughness: 0.5,
      metalness: 0.4,
    })
  );
  base.position.y = 0.8;
  base.castShadow = true;
  g.add(base);

  // LED ring na base (lime accent)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xff6020 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);

  // Painel frontal com NÚMERO gigante
  const numCanvas = document.createElement("canvas");
  numCanvas.width = 768;
  numCanvas.height = 768;
  const nctx = numCanvas.getContext("2d")!;
  nctx.fillStyle = "#0a0010";
  nctx.fillRect(0, 0, 768, 768);

  // Borda dupla orange
  const flameColor = streakDays >= 30 ? "#ff44aa" : streakDays >= 7 ? "#ff3030" : streakDays >= 3 ? "#ff8030" : "#ffa050";
  nctx.strokeStyle = flameColor;
  nctx.lineWidth = 14;
  nctx.strokeRect(12, 12, 744, 744);

  // Header "STREAK"
  nctx.fillStyle = flameColor;
  nctx.font = "900 80px Archivo Black, Inter, sans-serif";
  nctx.textAlign = "center";
  nctx.textBaseline = "middle";
  nctx.fillText("STREAK", 384, 100);

  // Emoji fogo gigante embaixo do número
  nctx.font = "120px sans-serif";
  nctx.fillText("🔥", 384, 220);

  // Número
  nctx.fillStyle = "#ffffff";
  nctx.font = "900 380px Archivo Black, Inter, sans-serif";
  nctx.fillText(String(streakDays), 384, 460);

  // "DIAS"
  nctx.fillStyle = flameColor;
  nctx.font = "900 90px Archivo Black, Inter, sans-serif";
  nctx.fillText(streakDays === 1 ? "DIA" : "DIAS", 384, 620);

  // Subtexto motivacional
  nctx.fillStyle = "#9ca3af";
  nctx.font = "500 32px Inter, sans-serif";
  const sub =
    streakDays === 0
      ? "Treina hoje pra começar"
      : streakDays >= 7
      ? "Não pode parar agora!"
      : "Mantenha a chama";
  nctx.fillText(sub, 384, 700);

  const numTex = new THREE.CanvasTexture(numCanvas);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const numPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ map: numTex })
  );
  numPanel.position.set(0, 0.85, 0.61);
  g.add(numPanel);

  // === CHAMA 3D em cima — cycle 37: AINDA maior pra visibilidade ===
  const flame = new THREE.Group();
  flame.position.set(0, 1.65, 0);

  // Layer 1: chama externa (laranja transparente)
  const f1 = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 1.4, 14),
    new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    })
  );
  f1.position.y = 0.7;
  flame.add(f1);

  // Layer 2: chama média (amarela)
  const f2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.1, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffaa30,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })
  );
  f2.position.y = 0.65;
  flame.add(f2);

  // Layer 3: núcleo (amarelo claro brilhante)
  const f3 = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.8, 14),
    new THREE.MeshBasicMaterial({
      color: 0xffe080,
    })
  );
  f3.position.y = 0.6;
  flame.add(f3);

  // Halo emissive embaixo da chama (efeito calor irradiando)
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.7, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.02;
  flame.add(halo);

  g.add(flame);

  // PointLight no topo da chama pra iluminar área (visível à distância)
  const flameLight = new THREE.PointLight(0xff7030, 0.8, 4, 1.5);
  flameLight.position.set(0, 2.0, 0);
  g.add(flameLight);

  // Hit-box pra raycast
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.8, 0.8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = 1.4;
  hitBox.userData.kind = "streak-pillar";
  g.add(hitBox);

  return { group: g, flame, hitBox };
}

// =================================================================
// SPONSOR BOOTH — kiosk comercial pra Nutricionista / PT / etc
// Slot pago de monetização: profissional anuncia serviços online
// dentro do gym virtual do atleta. Click abre modal com bio + CTA.
// =================================================================

export interface SponsorBoothProps {
  title: string; // ex: "NUTRICIONISTA"
  professional: {
    name: string;
    specialty: string;
    avatarColor: string; // cor do bloco-avatar (placeholder até foto real)
  } | null; // null = slot vago "ANUNCIE AQUI"
  /** Cor do header do booth. */
  accentHex: string;
  /** ID do slot pra raycast/click. */
  slotId: string;
}

export interface SponsorBoothParts {
  group: THREE.Group;
  hitBox: THREE.Mesh;
}

/**
 * Theme do booth — adiciona props característicos no balcão:
 *   "nutri"   → comidas saudáveis (maçã, banana, garrafa d'água) + placa "NUTRI"
 *   "personal" → anilha de peso + cronômetro + placa "PERSONAL"
 *   undefined → balcão limpo
 */
type BoothTheme = "nutri" | "personal";

export function buildSponsorBooth(
  props: SponsorBoothProps & { theme?: BoothTheme }
): SponsorBoothParts {
  const g = new THREE.Group();
  const { title, professional, accentHex, slotId, theme } = props;
  const isEmpty = professional == null;
  const accentColor = new THREE.Color(accentHex);

  // === PISO do booth (tapete delimitando a área) ===
  const floorW = 2.4;
  const floorD = 1.6;
  const boothFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorD),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.12,
    })
  );
  boothFloor.rotation.x = -Math.PI / 2;
  boothFloor.position.set(0, 0.01, 0);
  g.add(boothFloor);

  // Borda lime do tapete (linha demarcatória)
  const boothBorder = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 0.96, 4, 1, Math.PI / 4),
    new THREE.MeshBasicMaterial({ color: accentColor, side: THREE.DoubleSide })
  );
  // RingGeometry com 4 segmentos vira quadrado, mas precisamos retângulo —
  // V16.8 cycle 92: borda lime do booth com emissive (mais visível)
  const edgeMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.7,
  });
  for (const dz of [-floorD / 2, floorD / 2]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(floorW, 0.03, 0.05),
      edgeMat
    );
    edge.position.set(0, 0.02, dz);
    g.add(edge);
  }
  for (const dx of [-floorW / 2, floorW / 2]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.03, floorD),
      edgeMat
    );
    edge.position.set(dx, 0.02, 0);
    g.add(edge);
  }
  // Descarta o ring helper
  boothBorder.geometry.dispose();
  boothBorder.material.dispose();

  // === BASE / counter (com profundidade e tampo separado) ===
  const baseW = 1.8;
  const baseH = 1.0;
  const baseD = 0.6;
  const baseColor = isEmpty ? 0x1a1a26 : 0x14111e;
  // Carcaça do balcão
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, baseH * 0.92, baseD * 0.95),
    new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.55,
      metalness: 0.3,
    })
  );
  base.position.set(0, (baseH * 0.92) / 2, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  // Tampo (pedra/laminado sobre o balcão — overhang nas laterais)
  const counterTop = new THREE.Mesh(
    new THREE.BoxGeometry(baseW + 0.08, 0.05, baseD + 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x2a2a36,
      roughness: 0.3,
      metalness: 0.5,
    })
  );
  counterTop.position.set(0, baseH * 0.92 + 0.025, 0);
  counterTop.castShadow = true;
  g.add(counterTop);

  // Faixa de acento horizontal na frente
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, 0.06, 0.04),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.6,
    })
  );
  stripe.position.set(0, baseH - 0.18, baseD / 2);
  g.add(stripe);

  // === BANNER no topo (header com título + foto + nome) ===
  // V16.1: banner mais BAIXO (1.0 em vez de 1.6) — antes ocluía a cabeça
  // do NPC quando renderizado atrás do booth. Sign grande agora vai
  // ACIMA do banner pra ainda dar identidade vertical.
  const bannerW = 1.7;
  const bannerH = 1.0;
  const bannerY = baseH + bannerH / 2 + 0.6;

  // Posts (2 verticais segurando o banner) — agora com base alargada (sapata)
  for (const sx of [-bannerW / 2 - 0.05, bannerW / 2 + 0.05]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, baseH + bannerH + 0.2, 0.06),
      STEEL_MAT
    );
    post.position.set(sx, (baseH + bannerH + 0.2) / 2, -0.05);
    post.castShadow = true;
    g.add(post);
    // Sapata embutida no piso
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.04, 0.16),
      STEEL_MAT
    );
    foot.position.set(sx, 0.02, -0.05);
    g.add(foot);
  }

  // === LED strip emissivo na borda superior do banner (neon) ===
  const ledTop = new THREE.Mesh(
    new THREE.BoxGeometry(bannerW + 0.04, 0.04, 0.04),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.2,
    })
  );
  ledTop.position.set(0, bannerY + bannerH / 2 + 0.05, 0.06);
  g.add(ledTop);

  // Banner canvas
  const bnrCanvas = document.createElement("canvas");
  bnrCanvas.width = 1024;
  bnrCanvas.height = 1024;
  const bctx = bnrCanvas.getContext("2d")!;
  // Fundo
  bctx.fillStyle = isEmpty ? "#0a0a16" : "#0a0a16";
  bctx.fillRect(0, 0, 1024, 1024);
  // Borda
  bctx.strokeStyle = accentHex;
  bctx.lineWidth = 12;
  if (isEmpty) {
    bctx.setLineDash([18, 12]);
  }
  bctx.strokeRect(8, 8, 1008, 1008);
  bctx.setLineDash([]);

  // Header bar (color) — auto-fit pra "PERSONAL TRAINER" longo
  bctx.fillStyle = accentHex;
  bctx.fillRect(20, 20, 984, 130);
  bctx.fillStyle = "#01002A";
  let titleSize = 70;
  bctx.font = `900 ${titleSize}px Archivo Black, Inter, sans-serif`;
  while (bctx.measureText(title).width > 940 && titleSize > 30) {
    titleSize -= 4;
    bctx.font = `900 ${titleSize}px Archivo Black, Inter, sans-serif`;
  }
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText(title, 512, 85);

  if (isEmpty) {
    // Slot vago: "ANUNCIE AQUI" + descrição
    bctx.fillStyle = "#9ca3af";
    bctx.font = "900 100px Archivo Black, Inter, sans-serif";
    bctx.fillText("ANUNCIE", 512, 400);
    bctx.fillText("AQUI", 512, 510);
    bctx.fillStyle = "#ffffff";
    bctx.font = "500 32px Inter, sans-serif";
    bctx.fillText("Profissional fitness?", 512, 660);
    bctx.fillText("Apareça pra atletas BR", 512, 700);
    bctx.fillStyle = accentHex;
    bctx.font = "900 36px Archivo Black, Inter, sans-serif";
    bctx.fillText("R$ 99/MÊS", 512, 800);
    bctx.fillStyle = "#ffffff";
    bctx.font = "500 28px Inter, sans-serif";
    bctx.fillText("→ TOQUE AQUI", 512, 870);
  } else {
    // Avatar circular placeholder
    bctx.fillStyle = professional!.avatarColor;
    bctx.beginPath();
    bctx.arc(512, 380, 130, 0, Math.PI * 2);
    bctx.fill();
    // Inicial do nome no centro
    bctx.fillStyle = "#ffffff";
    bctx.font = "900 140px Archivo Black, Inter, sans-serif";
    bctx.fillText(
      professional!.name.charAt(0).toUpperCase(),
      512,
      400
    );
    // Nome
    bctx.fillStyle = "#ffffff";
    bctx.font = "900 56px Archivo Black, Inter, sans-serif";
    bctx.fillText(professional!.name.toUpperCase(), 512, 580);
    // Specialty
    bctx.fillStyle = "#9ca3af";
    bctx.font = "500 32px Inter, sans-serif";
    bctx.fillText(professional!.specialty, 512, 640);
    // CTA
    bctx.fillStyle = accentHex;
    bctx.font = "900 44px Archivo Black, Inter, sans-serif";
    bctx.fillText("FALAR AGORA", 512, 770);
    bctx.fillStyle = "#ffffff";
    bctx.font = "500 26px Inter, sans-serif";
    bctx.fillText("→ WhatsApp / Instagram", 512, 830);
  }

  const bnrTex = new THREE.CanvasTexture(bnrCanvas);
  bnrTex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(bannerW, bannerH),
    new THREE.MeshBasicMaterial({ map: bnrTex })
  );
  banner.position.set(0, bannerY, 0.01);
  g.add(banner);

  // === SIGN GIGANTE no topo da estrutura (NUTRI / PERSONAL / ANUNCIE) ===
  // Painel vertical alto bem destacado, neon glow effect.
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 1024;
  signCanvas.height = 384;
  const sctx = signCanvas.getContext("2d")!;
  sctx.fillStyle = "#0a0a16";
  sctx.fillRect(0, 0, 1024, 384);
  // Borda lime
  sctx.strokeStyle = accentHex;
  sctx.lineWidth = 10;
  sctx.strokeRect(8, 8, 1008, 368);
  // Texto com glow neon — auto-fit fontSize pra textos longos não cortarem
  const signText =
    theme === "nutri"
      ? "NUTRI"
      : theme === "personal"
      ? "PERSONAL"
      : isEmpty
      ? "ANUNCIE"
      : "PARCEIRO";
  // Cycle 5: ajusta tamanho da fonte pra caber em 950px (canvas 1024 com margem)
  let signFontSize = 220;
  sctx.font = `900 ${signFontSize}px Archivo Black, Inter, sans-serif`;
  while (sctx.measureText(signText).width > 950 && signFontSize > 60) {
    signFontSize -= 10;
    sctx.font = `900 ${signFontSize}px Archivo Black, Inter, sans-serif`;
  }
  for (let glow = 0; glow < 3; glow++) {
    sctx.shadowColor = accentHex;
    sctx.shadowBlur = 40 - glow * 12;
    sctx.fillStyle = accentHex;
    sctx.font = `900 ${signFontSize}px Archivo Black, Inter, sans-serif`;
    sctx.textAlign = "center";
    sctx.textBaseline = "middle";
    sctx.fillText(signText, 512, 192);
  }
  sctx.shadowBlur = 0;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 0.75),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
  );
  const signY = baseH + bannerH + 1.0;
  signMesh.position.set(0, signY, 0.02);
  g.add(signMesh);
  // Borda do sign em emissive (efeito letreiro)
  const signBorderTop = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.04, 0.05),
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 1.5,
    })
  );
  signBorderTop.position.set(0, signY + 0.4, 0.04);
  g.add(signBorderTop);
  const signBorderBot = signBorderTop.clone();
  signBorderBot.position.y = signY - 0.4;
  g.add(signBorderBot);

  // === PROPS NO BALCÃO (theme-specific) ===
  const counterTopY = baseH * 0.92 + 0.05; // y do tampo do balcão
  if (theme === "nutri") {
    // === Comidas saudáveis no balcão ===
    // Maçã vermelha (cilindro + folha)
    const apple = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xda291c, roughness: 0.5, metalness: 0.05 })
    );
    apple.scale.set(1.0, 0.95, 1.0);
    apple.position.set(-0.55, counterTopY + 0.07, 0.05);
    apple.castShadow = true;
    g.add(apple);
    // Folha verde da maçã
    const appleLeaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.005, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x43B02A })
    );
    appleLeaf.position.set(-0.55, counterTopY + 0.13, 0.05);
    appleLeaf.rotation.z = 0.3;
    g.add(appleLeaf);
    // Cabinho da maçã
    const appleStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.025, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3a1f })
    );
    appleStem.position.set(-0.55, counterTopY + 0.135, 0.05);
    g.add(appleStem);

    // Banana (cilindro curvo simulado por caixas)
    const bananaMat = new THREE.MeshStandardMaterial({ color: 0xFFC72C, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), bananaMat);
      // Curva sutil de banana (Y descendo nos extremos)
      const t = i / 3;
      const curve = -Math.sin(t * Math.PI) * 0.015;
      seg.position.set(-0.3 + i * 0.04, counterTopY + 0.04 - curve, 0.05);
      seg.castShadow = true;
      g.add(seg);
    }

    // Garrafa d'água (cilindro alto azul translúcido + tampa)
    const bottleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.045, 0.22, 12),
      new THREE.MeshStandardMaterial({
        color: 0x80c0ff,
        transparent: true,
        opacity: 0.5,
        roughness: 0.2,
        metalness: 0.1,
      })
    );
    bottleBody.position.set(0.1, counterTopY + 0.11, 0.05);
    bottleBody.castShadow = true;
    g.add(bottleBody);
    const bottleCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10),
      new THREE.MeshStandardMaterial({ color: 0x0057B8 })
    );
    bottleCap.position.set(0.1, counterTopY + 0.235, 0.05);
    g.add(bottleCap);
    // Label da garrafa (faixa lime)
    const bottleLabel = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.06, 0.001),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    bottleLabel.position.set(0.1, counterTopY + 0.1, 0.094);
    g.add(bottleLabel);

    // Tablet/prancheta com plano alimentar (canvas)
    const tabletBg = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.02, 0.22),
      new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.5 })
    );
    tabletBg.position.set(0.45, counterTopY + 0.02, 0.05);
    g.add(tabletBg);
    // Linhas escritas (papel com plano)
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.001, 0.005),
        new THREE.MeshBasicMaterial({ color: 0x5a5a64 })
      );
      line.position.set(0.45, counterTopY + 0.031, -0.04 + i * 0.04);
      g.add(line);
    }
    // Logo lime do plano
    const tabletLogo = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.001, 0.04),
      new THREE.MeshBasicMaterial({ color: accentColor })
    );
    tabletLogo.position.set(0.55, counterTopY + 0.031, 0.07);
    g.add(tabletLogo);
  } else if (theme === "personal") {
    // === Equipamento de personal no balcão ===
    // Anilha 10kg verde no balcão (deitada)
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x43B02A,
      roughness: 0.5,
      metalness: 0.15,
      emissive: 0x43B02A,
      emissiveIntensity: 0.05,
    });
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24),
      platMat
    );
    plate.position.set(-0.55, counterTopY + 0.015, 0.0);
    plate.castShadow = true;
    g.add(plate);
    // "10" texto na anilha
    const plateLabel = document.createElement("canvas");
    plateLabel.width = 128;
    plateLabel.height = 128;
    const plctx = plateLabel.getContext("2d")!;
    plctx.fillStyle = "#01002A";
    plctx.font = "900 70px Archivo Black, Inter, sans-serif";
    plctx.textAlign = "center";
    plctx.textBaseline = "middle";
    plctx.fillText("10", 64, 64);
    const plateTex = new THREE.CanvasTexture(plateLabel);
    plateTex.colorSpace = THREE.SRGBColorSpace;
    const plateText = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true })
    );
    plateText.rotation.x = -Math.PI / 2;
    plateText.position.set(-0.55, counterTopY + 0.032, 0.0);
    g.add(plateText);

    // Cronômetro digital (caixa preta com display lime)
    const timer = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.5 })
    );
    timer.position.set(0.0, counterTopY + 0.03, 0.0);
    timer.castShadow = true;
    g.add(timer);
    // Display do timer (canvas)
    const timerCanvas = document.createElement("canvas");
    timerCanvas.width = 256;
    timerCanvas.height = 96;
    const tmctx = timerCanvas.getContext("2d")!;
    tmctx.fillStyle = "#0a0a14";
    tmctx.fillRect(0, 0, 256, 96);
    tmctx.fillStyle = accentHex;
    tmctx.font = "900 70px Archivo Black, Inter, sans-serif";
    tmctx.textAlign = "center";
    tmctx.textBaseline = "middle";
    tmctx.fillText("01:42", 128, 48);
    const timerTex = new THREE.CanvasTexture(timerCanvas);
    timerTex.colorSpace = THREE.SRGBColorSpace;
    const timerScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.05),
      new THREE.MeshBasicMaterial({ map: timerTex })
    );
    timerScreen.position.set(0.0, counterTopY + 0.03, 0.052);
    g.add(timerScreen);

    // Resistance band enrolada (toroide laranja)
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.012, 8, 18),
      new THREE.MeshStandardMaterial({ color: 0xff6020, roughness: 0.7 })
    );
    band.rotation.x = Math.PI / 2;
    band.position.set(0.4, counterTopY + 0.02, 0.05);
    g.add(band);
    const band2 = band.clone();
    band2.position.y = counterTopY + 0.04;
    band2.rotation.z = 0.3;
    g.add(band2);

    // Apito branco no balcão
    const whistle = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.025, 0.04),
      new THREE.MeshStandardMaterial({ color: 0xc0c5cc, metalness: 0.7, roughness: 0.3 })
    );
    whistle.position.set(0.6, counterTopY + 0.015, 0.05);
    g.add(whistle);
  }

  // Hit-box pro raycast (todo o booth)
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(baseW + 0.2, baseH + bannerH + 0.4, baseD + 0.2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitBox.position.y = (baseH + bannerH + 0.4) / 2;
  hitBox.userData.sponsorSlot = { id: slotId, title, professional };
  g.add(hitBox);

  return { group: g, hitBox };
}

// =================================================================
// SQUAT RACK — versão compacta pra acoplar com plataforma
// =================================================================

export function buildSquatRack(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.5,
    metalness: 0.4,
  });
  const W = 1.4;
  const H = 2.3;
  // 2 colunas verticais (frente)
  for (const x of [-W / 2, W / 2]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), STEEL_MAT);
    col.position.set(x, H / 2, 0);
    col.castShadow = true;
    g.add(col);
    // Base
    const baseFoot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.5), STEEL_MAT);
    baseFoot.position.set(x, 0.025, 0);
    g.add(baseFoot);
  }
  // Travessa superior
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.06, 0.08), STEEL_MAT);
  topBar.position.set(0, H, 0);
  g.add(topBar);
  // J-hooks lime
  for (const x of [-W / 2, W / 2]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.16), accent);
    hook.position.set(x, 1.55, 0.05);
    g.add(hook);
  }
  // Barbell apoiada nos hooks
  const barbell = buildLoadedBarbell();
  barbell.position.set(0, 1.65, 0.05);
  g.add(barbell);

  return g;
}

// =================================================================
// V15 — equipamentos extras pra editor: treadmill, assault bike,
// rowing machine, cable machine. Geometria simplificada mas
// reconhecível à distância.
// =================================================================

/** Esteira ergométrica — base larga + console vertical na frente. */
export function buildTreadmill(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x14111e,
    roughness: 0.7,
    metalness: 0.3,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.5,
    metalness: 0.4,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.2,
  });

  // Correia texturizada (linhas perpendiculares simulando a esteira)
  const beltCanvas = document.createElement("canvas");
  beltCanvas.width = 128;
  beltCanvas.height = 512;
  const bctx = beltCanvas.getContext("2d")!;
  bctx.fillStyle = "#0a0a14";
  bctx.fillRect(0, 0, 128, 512);
  // Listras horizontais (segmentos da correia)
  bctx.fillStyle = "#1a1a26";
  for (let i = 0; i < 40; i++) {
    bctx.fillRect(0, i * 13, 128, 6);
  }
  const beltTex = new THREE.CanvasTexture(beltCanvas);
  beltTex.colorSpace = THREE.SRGBColorSpace;
  // V16.8 cycle 125: belt 0.7 → 0.55m (real treadmill spec). Comprimento mantido.
  const beltDeck = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.92 })
  );
  beltDeck.position.set(0, 0.18, 0.1);
  beltDeck.castShadow = true;
  beltDeck.receiveShadow = true;
  g.add(beltDeck);

  // Cilindros nas pontas da correia (rolos da esteira — visual de máquina real)
  for (const sz of [-0.7, 0.9]) {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12),
      STEEL_MAT
    );
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0, 0.18, sz);
    g.add(roller);
  }

  // Carcaça lateral — match width nova belt
  for (const sx of [-0.34, 0.34]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 1.6), baseMat);
    side.position.set(sx, 0.13, 0.1);
    side.castShadow = true;
    g.add(side);
    // Faixa lime em cada lateral (acento visual)
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.02, 1.5),
      accent
    );
    stripe.position.set(sx, 0.22, 0.1);
    g.add(stripe);
  }

  // Coluna do console (postes em A pra mais estabilidade)
  for (const sx of [-0.32, 0.32]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 0.07), STEEL_MAT);
    post.position.set(sx, 0.78, -0.78);
    post.castShadow = true;
    g.add(post);
  }

  // Console com display detalhado (canvas)
  const consoleBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.36, 0.1),
    baseMat
  );
  consoleBody.position.set(0, 1.32, -0.78);
  consoleBody.castShadow = true;
  g.add(consoleBody);

  // Display canvas com info típica de esteira (km/h, tempo, distância)
  const displayCanvas = document.createElement("canvas");
  displayCanvas.width = 512;
  displayCanvas.height = 192;
  const dctx = displayCanvas.getContext("2d")!;
  dctx.fillStyle = "#0a0a14";
  dctx.fillRect(0, 0, 512, 192);
  // 3 mini displays
  dctx.fillStyle = "#1a1a26";
  dctx.fillRect(20, 20, 150, 152);
  dctx.fillRect(180, 20, 152, 152);
  dctx.fillRect(342, 20, 150, 152);
  // Labels
  dctx.fillStyle = "#9ca3af";
  dctx.font = "700 18px Inter, sans-serif";
  dctx.textAlign = "center";
  dctx.fillText("VELOCIDADE", 95, 50);
  dctx.fillText("TEMPO", 256, 50);
  dctx.fillText("DISTÂNCIA", 417, 50);
  // Valores em lime
  dctx.fillStyle = accentHex;
  dctx.font = "900 50px Archivo Black, Inter, sans-serif";
  dctx.fillText("12.5", 95, 110);
  dctx.fillText("32:14", 256, 110);
  dctx.fillText("6.7", 417, 110);
  dctx.fillStyle = "#9ca3af";
  dctx.font = "500 18px Inter, sans-serif";
  dctx.fillText("KM/H", 95, 150);
  dctx.fillText("MIN", 256, 150);
  dctx.fillText("KM", 417, 150);
  const displayTex = new THREE.CanvasTexture(displayCanvas);
  displayTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.28),
    new THREE.MeshBasicMaterial({ map: displayTex, transparent: true })
  );
  screen.position.set(0, 1.32, -0.72);
  g.add(screen);

  // Handlebars laterais (curvados — pegador realista)
  for (const sx of [-0.4, 0.4]) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10),
      STEEL_MAT
    );
    bar.position.set(sx, 1.05, -0.45);
    bar.rotation.x = Math.PI / 2;
    g.add(bar);
    // Grip rubber
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.18, 10),
      RUBBER_MAT
    );
    grip.position.set(sx, 1.05, -0.3);
    grip.rotation.x = Math.PI / 2;
    g.add(grip);
  }

  // Botões emergency stop / quick speed (pequenos detalhes vermelhos no console)
  const emergencyBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12),
    new THREE.MeshStandardMaterial({
      color: 0xda291c,
      emissive: 0xda291c,
      emissiveIntensity: 0.5,
    })
  );
  emergencyBtn.position.set(0, 1.18, -0.74);
  g.add(emergencyBtn);

  return g;
}

/** Assault bike — bicicleta com ventoinha grande na frente. */
export function buildAssaultBike(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.5,
    metalness: 0.4,
  });

  // Quadro da bike (X)
  const frameLow = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 1.0),
    STEEL_MAT
  );
  frameLow.position.set(0, 0.45, 0);
  frameLow.castShadow = true;
  g.add(frameLow);

  // Banco
  const seatPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.5, 0.06),
    STEEL_MAT
  );
  seatPost.position.set(0, 0.7, 0.4);
  g.add(seatPost);
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.06, 0.34),
    VINYL_MAT
  );
  seat.position.set(0, 0.95, 0.4);
  seat.castShadow = true;
  g.add(seat);

  // Pedais
  for (const sx of [-0.18, 0.18]) {
    const crank = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.18, 0.04),
      STEEL_MAT
    );
    crank.position.set(sx, 0.3, 0.1);
    g.add(crank);
    const pedal = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.04, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 })
    );
    pedal.position.set(sx, 0.22, 0.1);
    g.add(pedal);
  }

  // Coluna da ventoinha
  const fanPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 1.1, 0.1),
    STEEL_MAT
  );
  fanPost.position.set(0, 0.55, -0.3);
  g.add(fanPost);

  // Ventoinha (grande)
  const fanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.04, 8, 32),
    STEEL_MAT
  );
  fanRing.position.set(0, 0.95, -0.42);
  fanRing.rotation.y = Math.PI / 2;
  g.add(fanRing);
  // Pás (4 cruzadas)
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 0.06, 0.04),
      accent
    );
    blade.rotation.x = (i * Math.PI) / 4;
    blade.position.set(0, 0.95, -0.42);
    g.add(blade);
  }
  // Hub central
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 8),
    accent
  );
  hub.position.set(0, 0.95, -0.42);
  g.add(hub);

  // Handlebars
  for (const dir of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.06),
      STEEL_MAT
    );
    arm.position.set(dir * 0.2, 1.1, -0.15);
    arm.rotation.y = dir * 0.4;
    g.add(arm);
  }

  return g;
}

/** Rowing machine (Concept2-style). */
export function buildRowingMachine(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.5,
    metalness: 0.4,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x14111e,
    roughness: 0.7,
    metalness: 0.3,
  });

  // Trilho longo (rail) — eixo Z, longo
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 1.8),
    STEEL_MAT
  );
  rail.position.set(0, 0.35, 0);
  rail.castShadow = true;
  g.add(rail);

  // Pés / base
  for (const z of [-0.85, 0.85]) {
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.1),
      baseMat
    );
    foot.position.set(0, 0.03, z);
    foot.castShadow = true;
    g.add(foot);
  }

  // Coluna lateral baixa do rail
  const lowerSupport = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.32, 0.06),
    STEEL_MAT
  );
  lowerSupport.position.set(0, 0.16, 0.7);
  g.add(lowerSupport);

  // Banco deslizante
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.08, 0.28),
    VINYL_MAT
  );
  seat.position.set(0, 0.42, 0.0);
  seat.castShadow = true;
  g.add(seat);

  // Estrutura da ventoinha (frente — z negativo)
  const fanHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16),
    baseMat
  );
  fanHousing.rotation.z = Math.PI / 2;
  fanHousing.position.set(0, 0.4, -1.0);
  fanHousing.castShadow = true;
  g.add(fanHousing);

  // Display em cima da ventoinha
  const displayPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.7, 0.06),
    STEEL_MAT
  );
  displayPost.position.set(0, 0.75, -1.0);
  g.add(displayPost);
  const display = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.18, 0.06),
    accent
  );
  display.position.set(0, 1.15, -1.0);
  g.add(display);

  // Cabo (catenária visual entre handle e ventoinha)
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x666870,
    roughness: 0.6,
    metalness: 0.3,
  });
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6),
    cableMat
  );
  cable.position.set(0, 0.4, -0.85);
  cable.rotation.x = Math.PI / 2;
  g.add(cable);

  // Pegador (handle horizontal — efeito remo real)
  const handleBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10),
    STEEL_MAT
  );
  handleBar.position.set(0, 0.4, -0.68);
  handleBar.rotation.z = Math.PI / 2;
  g.add(handleBar);
  // Grips de borracha
  for (const sx of [-0.16, 0.16]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.08, 8),
      RUBBER_MAT
    );
    grip.position.set(sx, 0.4, -0.68);
    grip.rotation.z = Math.PI / 2;
    g.add(grip);
  }

  // Display canvas com info de remo (split, distância, watts)
  const rowDisplayCanvas = document.createElement("canvas");
  rowDisplayCanvas.width = 256;
  rowDisplayCanvas.height = 144;
  const rdctx = rowDisplayCanvas.getContext("2d")!;
  rdctx.fillStyle = "#01002A";
  rdctx.fillRect(0, 0, 256, 144);
  rdctx.fillStyle = accentHex;
  rdctx.font = "900 60px Archivo Black, Inter, sans-serif";
  rdctx.textAlign = "center";
  rdctx.textBaseline = "middle";
  rdctx.fillText("1:42", 128, 50);
  rdctx.fillStyle = "#9ca3af";
  rdctx.font = "700 20px Inter, sans-serif";
  rdctx.fillText("/500m", 128, 90);
  rdctx.fillStyle = "#fff";
  rdctx.font = "700 24px Inter, sans-serif";
  rdctx.fillText("245 W", 128, 120);
  const rowDisplayTex = new THREE.CanvasTexture(rowDisplayCanvas);
  rowDisplayTex.colorSpace = THREE.SRGBColorSpace;
  // Mesh adicional com canvas texture sobreposta ao display sólido (não
  // reatribui display.material — TypeScript reclama por divergir do tipo
  // declarado na criação).
  const displayCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.16),
    new THREE.MeshBasicMaterial({ map: rowDisplayTex })
  );
  displayCanvas.position.set(0, 1.15, -0.97);
  g.add(displayCanvas);

  // Footplates (pés ergonômicos)
  for (const sx of [-0.18, 0.18]) {
    const footplate = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.85 })
    );
    footplate.position.set(sx, 0.3, -0.78);
    footplate.rotation.x = -Math.PI / 12;
    g.add(footplate);
    // Strap lime no footplate (visual de pés afivelados)
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.012, 0.05),
      accent
    );
    strap.position.set(sx, 0.34, -0.74);
    strap.rotation.x = -Math.PI / 12;
    g.add(strap);
  }

  // Faixa lime ao redor da ventoinha (visual identidade Concept2-ish)
  const fanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.012, 6, 32),
    accent
  );
  fanRing.rotation.y = Math.PI / 2;
  fanRing.position.set(0, 0.4, -1.0);
  g.add(fanRing);

  return g;
}

/** Cable machine (estação dupla, polia alta + baixa). */
export function buildCableMachine(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.4,
    metalness: 0.5,
    emissive: new THREE.Color(accentHex),
    emissiveIntensity: 0.15,
  });
  const stackPlateMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a26,
    roughness: 0.35,
    metalness: 0.7,
  });
  const stackHousingMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a14,
    roughness: 0.45,
    metalness: 0.5,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x666870,
    roughness: 0.6,
    metalness: 0.3,
  });

  const W = 2.2;
  const H = 2.6;
  const STACK_W = 0.4;
  const STACK_D = 0.45;
  const STACK_H = 1.5;

  // Base unificada conectando as 2 estações
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.4, 0.12, STACK_D + 0.3),
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.6, metalness: 0.5 })
  );
  base.position.set(0, 0.06, -STACK_D / 2);
  base.receiveShadow = true;
  base.castShadow = true;
  g.add(base);

  // Faixa lime na frente da base (visual identidade)
  const baseStripe = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.4, 0.04, 0.06),
    accent
  );
  baseStripe.position.set(0, 0.13, 0.02);
  g.add(baseStripe);

  for (const sx of [-W / 2, W / 2]) {
    // Coluna vertical principal (atrás do stack)
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, H, 0.18),
      STEEL_MAT
    );
    col.position.set(sx, H / 2, -STACK_D - 0.05);
    col.castShadow = true;
    g.add(col);

    // === STACK DE PESOS — visualmente reconhecível ===
    // Carcaça externa (caixa que encerra o stack) — apenas frente + 2 laterais
    // pra deixar as plaquetas visíveis (tipo máquina real onde olha pelo vidro)
    // Lateral esquerda
    const housingL = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, STACK_H, STACK_D),
      stackHousingMat
    );
    housingL.position.set(sx - STACK_W / 2 - 0.02, STACK_H / 2 + 0.15, -STACK_D / 2);
    housingL.castShadow = true;
    g.add(housingL);
    // Lateral direita
    const housingR = housingL.clone();
    housingR.position.x = sx + STACK_W / 2 + 0.02;
    g.add(housingR);
    // Topo (tampa do stack)
    const housingTop = new THREE.Mesh(
      new THREE.BoxGeometry(STACK_W + 0.08, 0.04, STACK_D),
      stackHousingMat
    );
    housingTop.position.set(sx, STACK_H + 0.17, -STACK_D / 2);
    g.add(housingTop);
    // Fundo (parede traseira do stack)
    const housingBack = new THREE.Mesh(
      new THREE.BoxGeometry(STACK_W + 0.08, STACK_H, 0.04),
      stackHousingMat
    );
    housingBack.position.set(sx, STACK_H / 2 + 0.15, -STACK_D - 0.02);
    g.add(housingBack);

    // === PLAQUETAS DE PESO empilhadas (10 plaquetas visíveis) ===
    // Cada plaqueta com pequeno gap entre elas (efeito metal empilhado)
    const PLATE_COUNT = 10;
    const plateH = (STACK_H - 0.15) / PLATE_COUNT;
    for (let i = 0; i < PLATE_COUNT; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(STACK_W * 0.92, plateH * 0.85, STACK_D * 0.85),
        stackPlateMat
      );
      plate.position.set(
        sx,
        0.18 + i * plateH + plateH / 2,
        -STACK_D / 2
      );
      g.add(plate);
      // Linha lateral mais clara em cada plaqueta (detalhe metal usinado)
      const plateLine = new THREE.Mesh(
        new THREE.BoxGeometry(STACK_W * 0.94, 0.012, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x4a4a56, roughness: 0.3, metalness: 0.8 })
      );
      plateLine.position.set(sx, 0.18 + i * plateH + plateH * 0.42, -0.04);
      g.add(plateLine);
    }

    // Pino seletor lime (mais grosso e visível, indica peso selecionado)
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.16, 10),
      accent
    );
    pin.rotation.z = Math.PI / 2;
    pin.position.set(sx, 0.55, -0.04);
    g.add(pin);
    // Cabeça T do pino (pra dar pra ver de longe)
    const pinHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 8),
      accent
    );
    pinHead.position.set(sx, 0.55, 0.05);
    g.add(pinHead);

    // === HASTE GUIA central do stack (steel rod que as plaquetas deslizam) ===
    const guideRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, STACK_H, 8),
      CHROME_MAT
    );
    guideRod.position.set(sx, STACK_H / 2 + 0.15, -STACK_D / 2);
    g.add(guideRod);

    // === POLIA TOP (cilindro horizontal com sulco pro cabo) ===
    const pulleyHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.16),
      stackHousingMat
    );
    pulleyHousing.position.set(sx, H - 0.18, 0.12);
    pulleyHousing.castShadow = true;
    g.add(pulleyHousing);
    const pulley = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16),
      CHROME_MAT
    );
    pulley.rotation.x = Math.PI / 2;
    pulley.position.set(sx, H - 0.18, 0.18);
    g.add(pulley);
    // Sulco interno da polia (anel mais escuro)
    const pulleyGroove = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.012, 8, 16),
      stackHousingMat
    );
    pulleyGroove.rotation.x = Math.PI / 2;
    pulleyGroove.position.set(sx, H - 0.18, 0.18);
    g.add(pulleyGroove);

    // === CABO (cylinder vertical conectando polia ao handle) ===
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1.5, 8),
      cableMat
    );
    cable.position.set(sx, H / 2, 0.18);
    g.add(cable);

    // === HANDLE (pegador retangular) ===
    const handleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.22, 10),
      CHROME_MAT
    );
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(sx, 1.4, 0.18);
    handleBar.castShadow = true;
    g.add(handleBar);
    // Anel conector entre cabo e handle
    const handleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.022, 0.006, 8, 16),
      CHROME_MAT
    );
    handleRing.position.set(sx, 1.5, 0.18);
    g.add(handleRing);
  }

  return g;
}
