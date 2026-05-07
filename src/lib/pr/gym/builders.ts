import * as THREE from "three";
import { splitPlates, BAR_KG } from "../plates";
import type { AvatarPrefs } from "./avatar-prefs";
import { BODY_PROPORTIONS } from "./avatar-prefs";
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

  // Body type multiplicadores — afeta peito/barriga/braço/perna
  const props = BODY_PROPORTIONS[prefs.bodyType] ?? BODY_PROPORTIONS.normal;

  // Base por gender, depois aplicado bodyType chestWidth multiplier
  const baseTorsoTopR = isF ? 0.20 : isM ? 0.24 : 0.22;
  const baseTorsoBotR = isF ? 0.18 : isM ? 0.20 : 0.19;
  const baseHipR = isF ? 0.22 : isM ? 0.20 : 0.21;
  const baseShoulderHalfW = isF ? 0.22 : isM ? 0.26 : 0.24;

  const torsoTopR = baseTorsoTopR * props.chestWidth;
  const torsoBotR = baseTorsoBotR * props.bellyWidth;
  const hipR = baseHipR * Math.max(props.bellyWidth * 0.85, 0.95); // hips acompanham menos
  const shoulderHalfW = baseShoulderHalfW * props.chestWidth;

  const headR = 0.21; // BIGGER (era 0.165) — visível de qualquer ângulo

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
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(headR * 1.7, headR * 1.7),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true })
  );
  face.position.set(0, 0.005, headR * 0.92);
  head.add(face);

  // === CABELO esférico envolvente sobre a cabeça redonda =========
  // Hemisfério ligeiramente maior que o skull cobrindo top + lateral
  // + nuca, deixando só a face na frente exposta.
  if (prefs.hairStyle !== "bald") {
    if (prefs.hairStyle === "short") {
      // Cap hemisférica sólida cobrindo top + sides + back
      const capGeom = new THREE.SphereGeometry(
        headR + 0.02,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 1.65
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.scale.set(1.0, 1.08, 1.0);
      cap.position.y = -0.02;
      cap.castShadow = true;
      head.add(cap);
    } else if (prefs.hairStyle === "long") {
      // Cap maior + cabelo longo descendo nas costas
      const capGeom = new THREE.SphereGeometry(
        headR + 0.025,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 1.55
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.scale.set(1.0, 1.08, 1.0);
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
      // Cap puxada pra trás
      const capGeom = new THREE.SphereGeometry(
        headR + 0.018,
        32,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 1.7
      );
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.position.set(0, 0, -0.02);
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

  // CABELO conforme estilo (3D real, não cap chato)
  if (prefs.hairStyle !== "bald") {
    if (prefs.hairStyle === "short") {
      // Cap esférica fina cobrindo topo + atrás
      const capGeom = new THREE.SphereGeometry(headR + 0.012, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.9);
      const cap = new THREE.Mesh(capGeom, hairMat);
      cap.position.y = 0.005;
      head.add(cap);
      // Pequena franja na frente
      const fringe = new THREE.Mesh(
        new THREE.BoxGeometry(headR * 1.6, 0.04, 0.06),
        hairMat
      );
      fringe.position.set(0, headR * 0.55, headR * 0.85);
      head.add(fringe);
    } else if (prefs.hairStyle === "long") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headR + 0.014, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.7),
        hairMat
      );
      cap.position.y = 0;
      head.add(cap);
      // Cabelo longo nas costas (capsula achatada)
      const back = new THREE.Mesh(
        new THREE.CapsuleGeometry(headR * 0.85, 0.4, 6, 12),
        hairMat
      );
      back.scale.set(1, 1, 0.4);
      back.position.set(0, -0.15, -headR * 0.45);
      head.add(back);
    } else if (prefs.hairStyle === "ponytail") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headR + 0.012, 24, 18, 0, Math.PI * 2, 0, Math.PI / 1.9),
        hairMat
      );
      head.add(cap);
      const tieBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 12, 10),
        hairMat
      );
      tieBall.position.set(0, 0.02, -headR * 0.95);
      head.add(tieBall);
      const tail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.025, 0.32, 10),
        hairMat
      );
      tail.position.set(0, -0.12, -headR * 1.0);
      tail.rotation.x = -0.45;
      head.add(tail);
    }
  }

  // Cabeça posicionada em y=1.88 absoluto (centro do crânio)
  head.position.y = 1.95; // ajustado pra cabeça maior (headR=0.21)
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
  const shirt = new THREE.Mesh(
    new THREE.PlaneGeometry(torsoTopR * 1.6, torsoH * 0.7),
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

  // === BARRIGA EXTRA pra chubby/obese ===========================
  // Mesh esférico achatado sobreposto ao torso na altura abaixo do peito.
  // Só renderiza pra bodies com bellyWidth alto.
  if (props.bellyWidth >= 1.30) {
    const bellyR = baseTorsoBotR * props.bellyWidth * 0.95;
    const bellyDepth = baseTorsoBotR * props.bellyDepth;
    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(bellyR, 22, 18),
      topMat
    );
    // Achata vertical pra dar formato de barriga (não esfera total)
    belly.scale.set(1.0, 0.7, bellyDepth / bellyR);
    belly.position.set(0, torsoY - torsoH * 0.18, torsoTopR * 0.15);
    belly.castShadow = true;
    root.add(belly);
  }

  // === LEGS — pés tocam o chão ==================================
  // legGroup origin = quadril (y=0.985). Parts vão pra baixo até a sola
  // do tênis encostar no chão (sole bottom y ≈ 0).
  // Espaçamento entre pernas escala com bellyWidth (corpos maiores = pernas mais afastadas).
  const legSpread = 0.10 * Math.max(1, props.bellyWidth * 0.85);
  const leftLeg = buildLeg(skinMat, shortsMat, shoeMat, props.legWidth);
  leftLeg.position.set(-legSpread, 0.985, 0);
  root.add(leftLeg);

  const rightLeg = buildLeg(skinMat, shortsMat, shoeMat, props.legWidth);
  rightLeg.position.set(legSpread, 0.985, 0);
  root.add(rightLeg);

  // === ARMS — pendurados ao lado do torso =======================
  // armGroup origin = ombro (y=1.62). Parts vão pra baixo.
  // Para corpos com peito largo/ombro forte, braços ficam mais afastados.
  const armOffset = shoulderHalfW + 0.02 + (props.armWidth - 1) * 0.04;
  const leftArm = buildArm(skinMat, topMat, props.armWidth);
  leftArm.position.set(-armOffset, 1.62, 0);
  root.add(leftArm);

  const rightArm = buildArm(skinMat, topMat, props.armWidth);
  rightArm.position.set(armOffset, 1.62, 0);
  root.add(rightArm);

  return { root, leftLeg, rightLeg, leftArm, rightArm, head };
}

/**
 * Perna: shorts curto no topo (visível abaixo do hip), depois coxa,
 * panturrilha, tênis. Origin = quadril (top of thigh).
 *
 * `legScale` afeta largura (raio dos cilindros). Default 1.0 = perna normal.
 * Strong/giant = >1, skinny = <1, obese = bem maior.
 */
function buildLeg(
  skinMat: THREE.Material,
  shortsMat: THREE.Material,
  shoeMat: THREE.Material,
  legScale: number = 1.0
): THREE.Group {
  const g = new THREE.Group();
  const s = legScale;
  // Shorts cobrindo topo da coxa (até ~10cm abaixo do hip)
  const shortsCover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11 * s, 0.105 * s, 0.18, 10),
    shortsMat
  );
  shortsCover.position.y = -0.09;
  shortsCover.castShadow = true;
  g.add(shortsCover);

  // Coxa (skin)
  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085 * s, 0.07 * s, 0.28, 10),
    skinMat
  );
  thigh.position.y = -0.32;
  thigh.castShadow = true;
  g.add(thigh);

  // Joelho (esfera pra suavizar a junção)
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 10, 8), skinMat);
  knee.position.y = -0.46;
  g.add(knee);

  // Panturrilha
  const calf = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065 * s, 0.055 * s, 0.36, 10),
    skinMat
  );
  calf.position.y = -0.65;
  calf.castShadow = true;
  g.add(calf);

  // Tornozelo
  const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.052 * s, 8, 6), skinMat);
  ankle.position.y = -0.84;
  g.add(ankle);

  // Tênis (caixa de couro preto + sola lime)
  const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.09, 0.24), shoeMat);
  shoe.position.set(0, -0.91, 0.05);
  shoe.castShadow = true;
  g.add(shoe);
  // Sola lime (assinatura visual da marca)
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.135 * s, 0.025, 0.25),
    new THREE.MeshStandardMaterial({ color: 0xd8ff2c, roughness: 0.5 })
  );
  sole.position.set(0, -0.97, 0.05);
  g.add(sole);

  return g;
}

/**
 * Braço: regata (mangueta curta) cobrindo topo, depois pele.
 * Origin = ombro (top of upper arm).
 *
 * `armScale` afeta largura. Strong = >1 (bíceps marombeiro),
 * skinny = <1 (braço fininho), giant = bem maior.
 */
function buildArm(
  skinMat: THREE.Material,
  topMat: THREE.Material,
  armScale: number = 1.0
): THREE.Group {
  const g = new THREE.Group();
  const s = armScale;
  // Mangueta curta da regata cobrindo o ombro (3cm da regata desce pelo braço)
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075 * s, 0.07 * s, 0.06, 10),
    topMat
  );
  sleeve.position.y = -0.03;
  g.add(sleeve);
  // Bíceps — pra strong/giant fica visivelmente cheio
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.28, 10),
    skinMat
  );
  upper.position.y = -0.2;
  upper.castShadow = true;
  g.add(upper);
  // Cotovelo
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.058 * s, 10, 8), skinMat);
  elbow.position.y = -0.36;
  g.add(elbow);
  // Antebraço
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058 * s, 0.052 * s, 0.26, 10),
    skinMat
  );
  lower.position.y = -0.5;
  lower.castShadow = true;
  g.add(lower);
  // Mão (esfera) — sempre tamanho fixo (mãos não escalam tanto com músculo)
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06 * Math.min(s, 1.15), 10, 8), skinMat);
  hand.position.y = -0.66;
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
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.4,
        metalness: 0.2,
        emissive: colorHex,
        emissiveIntensity: 0.12,
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

      // Anilhas no peg
      const data = pegPlates[idx];
      if (!data) continue;
      const radius = 0.08 + (data.kg / 25) * 0.07;
      const thickness = 0.025;
      const plateMat = new THREE.MeshStandardMaterial({
        color: data.color,
        roughness: 0.45,
        metalness: 0.15,
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
// WALL PLATES — anilhas decorativas penduradas em parede
// =================================================================

export function buildWallPlates(rows: number = 2, perRow: number = 6): THREE.Group {
  const g = new THREE.Group();
  const colors = [0xda291c, 0x0057b8, 0xffc72c, 0x43b02a];
  const ROW_GAP = 0.55;
  const COL_GAP = 0.5;

  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const colorHex = colors[(i + r) % colors.length] ?? 0x9ca3af;
      const radius = 0.18;
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.04, 24),
        new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.4,
          metalness: 0.2,
        })
      );
      plate.rotation.z = Math.PI / 2;
      plate.position.set(
        -((perRow - 1) / 2) * COL_GAP + i * COL_GAP,
        r * ROW_GAP,
        0
      );
      plate.castShadow = true;
      g.add(plate);

      // Pino de aço suportando cada anilha
      const peg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8),
        STEEL_MAT
      );
      peg.rotation.z = Math.PI / 2;
      peg.position.set(
        -((perRow - 1) / 2) * COL_GAP + i * COL_GAP - 0.02,
        r * ROW_GAP,
        0
      );
      g.add(peg);
    }
  }
  return g;
}

// =================================================================
// CEILING BEAMS — vigas de aço industriais visíveis
// =================================================================

export function buildCeilingBeams(roomW: number, roomD: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x14141a,
    roughness: 0.7,
    metalness: 0.3,
  });

  // 4 vigas longitudinais
  for (let i = 0; i < 5; i++) {
    const z = -roomD / 2 + (i / 4) * roomD;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(roomW, 0.18, 0.12),
      beamMat
    );
    beam.position.set(0, height - 0.1, z);
    g.add(beam);
  }
  // Travessas perpendiculares
  for (let i = 0; i < 5; i++) {
    const x = -roomW / 2 + (i / 4) * roomW;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, roomD),
      beamMat
    );
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
// LIFTING PLATFORM (com rack opcional acoplado)
// =================================================================

export function buildPlatformWithRack(accentHex: string): THREE.Group {
  const g = new THREE.Group();
  // Plataforma menor (3m × 2m) pra caber 2 lado a lado
  const accentRubber = new THREE.MeshStandardMaterial({
    color: new THREE.Color(accentHex),
    roughness: 0.85,
    metalness: 0.05,
  });
  const center = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 2.4), WOOD_MAT);
  center.position.y = 0.03;
  center.receiveShadow = true;
  g.add(center);
  for (const x of [-1.1, 1.1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 2.4), accentRubber);
    side.position.set(x, 0.03, 0);
    side.receiveShadow = true;
    g.add(side);
  }
  return g;
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
  if (hasUnlocked && weightKg != null) {
    // Topo "show stand" — pequena placa metálica onde a barbell descansa
    const showStand = new THREE.Mesh(
      new THREE.BoxGeometry(baseW * 0.92, 0.04, baseD * 0.92),
      new THREE.MeshStandardMaterial({
        color: 0x2a2540,
        roughness: 0.4,
        metalness: 0.6,
      })
    );
    showStand.position.y = baseH + 0.045;
    group.add(showStand);

    const barbell = buildMiniBarbell(weightKg);
    barbell.position.set(0, baseH + 0.18, 0);
    group.add(barbell);
  }

  // === ETIQUETA do exercício na parte da frente do pedestal ====
  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = 768;
  tagCanvas.height = 96;
  const tctx = tagCanvas.getContext("2d")!;
  tctx.clearRect(0, 0, 768, 96);
  tctx.fillStyle = hasUnlocked ? tierColorHex : "#5a5a64";
  tctx.fillRect(0, 0, 768, 96);
  tctx.fillStyle = hasUnlocked ? "#01002A" : "#9a9aa4";
  tctx.font = "900 56px Archivo Black, Inter, sans-serif";
  tctx.textAlign = "center";
  tctx.textBaseline = "middle";
  tctx.fillText(exerciseLabel.toUpperCase(), 384, 48);
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

    // Disco da badge — cor do tier
    const badge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24),
      new THREE.MeshStandardMaterial({
        color: meta.color,
        roughness: 0.35,
        metalness: 0.55,
        emissive: meta.color,
        emissiveIntensity: isUnlocked ? 0.4 : 0,
      })
    );
    badge.rotation.x = Math.PI / 2;
    badge.position.set(x, y, 0.05);
    g.add(badge);

    // Anel externo lime (highlight pra quem tem tier > unlocked)
    if (isUnlocked && tier !== "unlocked") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.012, 12, 36),
        new THREE.MeshBasicMaterial({ color: accentHex })
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

  // Título — GIGANTE + neon glow
  const titleCanvas = document.createElement("canvas");
  titleCanvas.width = 2048;
  titleCanvas.height = 384;
  const tctx = titleCanvas.getContext("2d")!;
  tctx.clearRect(0, 0, 2048, 384);
  for (let glow = 0; glow < 3; glow++) {
    tctx.shadowColor = accentHex;
    tctx.shadowBlur = 30 - glow * 10;
    tctx.fillStyle = accentHex;
    tctx.font = "900 220px Archivo Black, Inter, sans-serif";
    tctx.textAlign = "center";
    tctx.textBaseline = "middle";
    tctx.fillText("CORRIDA", 1024, 130);
  }
  tctx.shadowBlur = 0;
  tctx.fillStyle = "#9ca3af";
  tctx.font = "500 56px Inter, sans-serif";
  tctx.fillText("Toque pra registrar seu tempo", 1024, 280);
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
}

export function buildNPC(props: NPCProps): NPCParts {
  const root = new THREE.Group();
  const { skinHex, hairHex, topHex, shortsHex, gender, initial } = props;

  const skinMat = new THREE.MeshStandardMaterial({
    color: skinHex,
    roughness: 0.7,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairHex,
    roughness: 0.85,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: topHex,
    roughness: 0.7,
  });
  const shortsMat = new THREE.MeshStandardMaterial({
    color: shortsHex,
    roughness: 0.85,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.6,
  });

  const isF = gender === "female";
  const isM = gender === "male";
  const torsoR = isF ? 0.18 : isM ? 0.22 : 0.20;
  const headR = 0.21;

  // === HEAD esférico simples ===
  const head = new THREE.Group();
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 28, 22),
    skinMat
  );
  skull.scale.set(1.0, 1.06, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // 2 olhos pretos pequenos
  for (const sx of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    eye.position.set(sx, 0.025, headR * 0.92);
    head.add(eye);
  }

  // Sorriso simples (torus segment)
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.01, 6, 14, Math.PI * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x4a1f1f, roughness: 0.6 })
  );
  smile.rotation.x = Math.PI;
  smile.rotation.z = Math.PI / 2;
  smile.position.set(0, -0.06, headR * 0.9);
  head.add(smile);

  // Cabelo cap (hemisferio cobrindo top + nuca)
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR + 0.022, 28, 22, 0, Math.PI * 2, 0, Math.PI / 1.65),
    hairMat
  );
  cap.scale.set(1.0, 1.06, 1.0);
  cap.position.y = -0.02;
  cap.castShadow = true;
  head.add(cap);

  // Pescoço
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.085, 0.09, 12),
    skinMat
  );
  neck.position.y = -headR - 0.02;
  head.add(neck);

  head.position.y = 1.95;
  root.add(head);

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

  // === Braços ===
  const shoulderHalfW = isF ? 0.22 : isM ? 0.26 : 0.24;
  for (const sx of [-shoulderHalfW - 0.02, shoulderHalfW + 0.02]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 1.62, 0);
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.06, 0.28, 10),
      skinMat
    );
    upper.position.y = -0.2;
    arm.add(upper);
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.052, 0.26, 10),
      skinMat
    );
    lower.position.y = -0.5;
    arm.add(lower);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 8),
      skinMat
    );
    hand.position.y = -0.66;
    arm.add(hand);
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

  // === CHAMA 3D em cima ===
  const flame = new THREE.Group();
  flame.position.set(0, 1.65, 0);

  // Layer 1: chama externa (laranja transparente)
  const f1 = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.7, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.7,
    })
  );
  f1.position.y = 0.35;
  flame.add(f1);

  // Layer 2: chama média (amarela)
  const f2 = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.55, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffaa30,
      transparent: true,
      opacity: 0.85,
    })
  );
  f2.position.y = 0.35;
  flame.add(f2);

  // Layer 3: núcleo (amarelo claro brilhante)
  const f3 = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.4, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffe080,
    })
  );
  f3.position.y = 0.32;
  flame.add(f3);

  g.add(flame);

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

export function buildSponsorBooth(props: SponsorBoothProps): SponsorBoothParts {
  const g = new THREE.Group();
  const { title, professional, accentHex, slotId } = props;
  const isEmpty = professional == null;

  // === BASE / counter ===
  const baseW = 1.8;
  const baseH = 1.0;
  const baseD = 0.6;
  const baseColor = isEmpty ? 0x1a1a26 : 0x14111e;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, baseH, baseD),
    new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.55,
      metalness: 0.3,
    })
  );
  base.position.y = baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // Faixa de acento na frente da base
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(baseW, 0.04, 0.05),
    new THREE.MeshBasicMaterial({ color: accentHex })
  );
  stripe.position.set(0, baseH - 0.04, baseD / 2);
  g.add(stripe);

  // === BANNER no topo (header com título + foto + nome) ===
  const bannerW = 1.7;
  const bannerH = 1.6;
  const bannerY = baseH + bannerH / 2 + 0.1;

  // Posts (2 verticais segurando o banner)
  for (const sx of [-bannerW / 2 - 0.05, bannerW / 2 + 0.05]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, baseH + bannerH + 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x14111e, roughness: 0.55 })
    );
    post.position.set(sx, (baseH + bannerH + 0.2) / 2, 0);
    g.add(post);
  }

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

  // Header bar (color)
  bctx.fillStyle = accentHex;
  bctx.fillRect(20, 20, 984, 130);
  bctx.fillStyle = "#01002A";
  bctx.font = "900 70px Archivo Black, Inter, sans-serif";
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
// NPC ESPECIALIZADOS — Personal (marombeiro forte) e Nutri (galega + óculos)
// =================================================================
//
// Espelham a interface NPCParts de buildNPC, mas com proporções e
// acessórios distintivos pra ficarem reconhecíveis no gym (Felipe pediu
// que ambos sejam visualmente marcantes — Personal forte, Nutri galega
// loira de óculos).

/**
 * Personal Trainer NPC — marombeiro forte. Cabelo bem curto (cap
 * pequena), peito largo, bíceps grandes, top sem manga (regata) lime.
 * Acessório: prancheta segurada na mão direita (cilindro escuro
 * + plano branco).
 */
export function buildPersonalNPC(): NPCParts {
  const root = new THREE.Group();

  const skinHex = "#c08a5e"; // bronzeado
  const hairHex = "#1a1410";
  const topHex = "#D8FF2C"; // lime
  const shortsHex = "#111111";

  const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.85 });
  const topMat = new THREE.MeshStandardMaterial({ color: topHex, roughness: 0.7 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shortsHex, roughness: 0.85 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

  // === Proporções marombeiro: torso largo (chest 1.35x) + bíceps grandes (1.6x) ===
  const chestMul = 1.35;
  const armMul = 1.6;
  const legMul = 1.25;
  const torsoR = 0.22 * chestMul;
  const headR = 0.21;

  // === HEAD esférico — face simples + cap curtíssimo (quase careca) ===
  const head = new THREE.Group();
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 28, 22),
    skinMat
  );
  skull.scale.set(1.0, 1.06, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // 2 olhos pretos
  for (const sx of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    eye.position.set(sx, 0.025, headR * 0.92);
    head.add(eye);
  }

  // Sorriso confiante (mais largo)
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.05, 0.011, 6, 14, Math.PI * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x4a1f1f, roughness: 0.6 })
  );
  smile.rotation.x = Math.PI;
  smile.rotation.z = Math.PI / 2;
  smile.position.set(0, -0.06, headR * 0.9);
  head.add(smile);

  // Cap MINI — cabelo bem rapado (2mm). Hemisfério bem fino e baixo.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR + 0.008, 28, 22, 0, Math.PI * 2, 0, Math.PI / 2.2),
    hairMat
  );
  cap.scale.set(1.0, 1.06, 1.0);
  cap.position.y = 0.005;
  head.add(cap);

  // Pescoço grosso (marombeiro)
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.10, 0.09, 12),
    skinMat
  );
  neck.position.y = -headR - 0.02;
  head.add(neck);

  head.position.y = 1.95;
  root.add(head);

  // === TORSO LARGO ===
  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoR, torsoR * 0.9, 0.55, 22),
    topMat
  );
  torso.position.y = 1.375;
  torso.castShadow = true;
  body.add(torso);

  // Peitoral definido (2 esferas no peito superior)
  for (const sx of [-torsoR * 0.4, torsoR * 0.4]) {
    const pec = new THREE.Mesh(
      new THREE.SphereGeometry(torsoR * 0.45, 16, 12),
      topMat
    );
    pec.scale.set(1.0, 0.6, 0.5);
    pec.position.set(sx, 1.55, torsoR * 0.55);
    body.add(pec);
  }

  // Ombros grandes (delts)
  const shoulderHalfW = 0.26 * chestMul;
  for (const sx of [-shoulderHalfW, shoulderHalfW]) {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.11 * chestMul, 16, 12),
      topMat
    );
    shoulder.position.set(sx, 1.62, 0);
    shoulder.castShadow = true;
    body.add(shoulder);
  }

  // Logo "PT" no peito
  const ptCanvas = document.createElement("canvas");
  ptCanvas.width = 256;
  ptCanvas.height = 256;
  const pctx = ptCanvas.getContext("2d")!;
  pctx.clearRect(0, 0, 256, 256);
  pctx.fillStyle = "#01002A";
  pctx.beginPath();
  pctx.arc(128, 128, 76, 0, Math.PI * 2);
  pctx.fill();
  pctx.fillStyle = topHex;
  pctx.font = "900 92px Archivo Black, Inter, sans-serif";
  pctx.textAlign = "center";
  pctx.textBaseline = "middle";
  pctx.fillText("PT", 128, 138);
  const ptTex = new THREE.CanvasTexture(ptCanvas);
  ptTex.colorSpace = THREE.SRGBColorSpace;
  const ptBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: ptTex, transparent: true })
  );
  ptBadge.position.set(0, 1.40, torsoR + 0.005);
  body.add(ptBadge);

  // Hip
  const hip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.20, 0.18, 16),
    shortsMat
  );
  hip.position.y = 1.0;
  body.add(hip);

  root.add(body);

  // === Pernas grandes ===
  const legSpread = 0.13;
  for (const sx of [-legSpread, legSpread]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.985, 0);
    const shorts = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11 * legMul, 0.105 * legMul, 0.18, 10),
      shortsMat
    );
    shorts.position.y = -0.09;
    leg.add(shorts);
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085 * legMul, 0.07 * legMul, 0.28, 10),
      skinMat
    );
    thigh.position.y = -0.32;
    leg.add(thigh);
    const calf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075 * legMul, 0.06 * legMul, 0.36, 10),
      skinMat
    );
    calf.position.y = -0.65;
    leg.add(calf);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.09, 0.25),
      shoeMat
    );
    shoe.position.set(0, -0.91, 0.05);
    leg.add(shoe);
    // Sola lime
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.025, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xd8ff2c })
    );
    sole.position.set(0, -0.97, 0.05);
    leg.add(sole);
    root.add(leg);
  }

  // === Braços com BÍCEPS GRANDES ===
  for (const sx of [-shoulderHalfW - 0.02, shoulderHalfW + 0.02]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 1.62, 0);
    // Bíceps GRANDE (cilindro maior + esfera no meio simulando músculo)
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07 * armMul, 0.06 * armMul, 0.28, 10),
      skinMat
    );
    upper.position.y = -0.2;
    upper.castShadow = true;
    arm.add(upper);
    // "Pico" do bíceps (esfera achatada destacando músculo)
    const bicepsPeak = new THREE.Mesh(
      new THREE.SphereGeometry(0.08 * armMul, 14, 10),
      skinMat
    );
    bicepsPeak.scale.set(1.0, 0.7, 0.85);
    bicepsPeak.position.set(0, -0.13, 0.02);
    arm.add(bicepsPeak);
    // Cotovelo
    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * armMul, 10, 8),
      skinMat
    );
    elbow.position.y = -0.36;
    arm.add(elbow);
    // Antebraço
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058 * armMul, 0.052 * armMul, 0.26, 10),
      skinMat
    );
    lower.position.y = -0.5;
    arm.add(lower);
    // Mão
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 10, 8),
      skinMat
    );
    hand.position.y = -0.66;
    arm.add(hand);

    // PRANCHETA na mão direita (sx > 0)
    if (sx > 0) {
      const clipboard = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.22, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6 })
      );
      board.position.y = -0.78;
      clipboard.add(board);
      // Folha branca
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.18),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sheet.position.set(0, -0.78, 0.008);
      clipboard.add(sheet);
      // Clip metálico no topo
      const clip = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.025, 0.018),
        new THREE.MeshStandardMaterial({ color: 0x888a96, metalness: 0.7, roughness: 0.3 })
      );
      clip.position.set(0, -0.69, 0.012);
      clipboard.add(clip);
      // 3 linhas de "treino" no papel (simulando texto)
      for (let i = 0; i < 3; i++) {
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(0.10, 0.005),
          new THREE.MeshBasicMaterial({ color: 0x444444 })
        );
        line.position.set(0, -0.74 - i * 0.025, 0.009);
        clipboard.add(line);
      }
      arm.add(clipboard);
    }

    root.add(arm);
  }

  return { group: root, head, body };
}

/**
 * Nutricionista NPC — galega bonita com óculos. Loira (cabelo longo
 * loiro), pele clara, top branco (lab coat), óculos elegantes.
 */
export function buildNutriNPC(): NPCParts {
  const root = new THREE.Group();

  const skinHex = "#f5d7be"; // pele clara
  const hairHex = "#d4a04a"; // loiro
  const topHex = "#ffffff"; // branco (lab coat)
  const shortsHex = "#1e1b50"; // navy

  const skinMat = new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairHex, roughness: 0.85 });
  const topMat = new THREE.MeshStandardMaterial({ color: topHex, roughness: 0.7 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shortsHex, roughness: 0.85 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

  const torsoR = 0.18; // proporção feminina
  const headR = 0.21;

  // === HEAD ===
  const head = new THREE.Group();
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(headR, 32, 24),
    skinMat
  );
  skull.scale.set(1.0, 1.08, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // Olhos azuis (galega)
  for (const sx of [-0.075, 0.075]) {
    // Sclera (branco do olho)
    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.030, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    sclera.position.set(sx, 0.025, headR * 0.91);
    head.add(sclera);
    // Íris azul
    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x4a8acc })
    );
    iris.position.set(sx, 0.025, headR * 0.94);
    head.add(iris);
    // Pupila preta
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.010, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    pupil.position.set(sx, 0.025, headR * 0.96);
    head.add(pupil);
  }

  // ÓCULOS — armação retangular preta + lentes transparentes
  const glassesGroup = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x14111e,
    roughness: 0.4,
    metalness: 0.3,
  });
  // Aro esquerdo
  const leftRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.006, 6, 18),
    frameMat
  );
  leftRim.position.set(-0.075, 0.025, headR * 0.97);
  glassesGroup.add(leftRim);
  // Aro direito
  const rightRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.045, 0.006, 6, 18),
    frameMat
  );
  rightRim.position.set(0.075, 0.025, headR * 0.97);
  glassesGroup.add(rightRim);
  // Ponte (entre os 2 aros)
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6),
    frameMat
  );
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.025, headR * 0.98);
  glassesGroup.add(bridge);
  // Lentes (planos transparentes-azulados)
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0xa0c8ff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.1,
  });
  for (const sx of [-0.075, 0.075]) {
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.042, 18),
      lensMat
    );
    lens.position.set(sx, 0.025, headR * 0.975);
    glassesGroup.add(lens);
  }
  // Hastes laterais (esticando até atrás da orelha)
  for (const sx of [-1, 1]) {
    const temple = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6),
      frameMat
    );
    temple.rotation.x = Math.PI / 2;
    temple.position.set(sx * 0.115, 0.025, headR * 0.55);
    glassesGroup.add(temple);
  }
  head.add(glassesGroup);

  // Sorriso doce (curva pequena)
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.038, 0.009, 6, 14, Math.PI * 0.7),
    new THREE.MeshStandardMaterial({ color: 0xc44a5a, roughness: 0.5 })
  );
  smile.rotation.x = Math.PI;
  smile.rotation.z = Math.PI / 2;
  smile.position.set(0, -0.07, headR * 0.9);
  head.add(smile);

  // Bochechas levemente rosadas (2 manchas suaves)
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 14),
      new THREE.MeshBasicMaterial({ color: 0xf6b8b0, transparent: true, opacity: 0.4 })
    );
    cheek.position.set(sx * 0.10, -0.02, headR * 0.94);
    head.add(cheek);
  }

  // CABELO LONGO LOIRO — cap envolvente + tail nas costas
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(headR + 0.025, 32, 24, 0, Math.PI * 2, 0, Math.PI / 1.55),
    hairMat
  );
  cap.scale.set(1.05, 1.10, 1.05);
  cap.position.y = 0.005;
  cap.castShadow = true;
  head.add(cap);
  // Cabelo descendo nas costas (capsula achatada)
  const longBack = new THREE.Mesh(
    new THREE.CapsuleGeometry(headR * 0.95, 0.55, 8, 16),
    hairMat
  );
  longBack.scale.set(1.1, 1, 0.42);
  longBack.position.set(0, -headR * 0.6, -headR * 0.55);
  longBack.castShadow = true;
  head.add(longBack);
  // Mecha caindo na frente (lateral direita do rosto)
  const frontStrand = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.04, 0.18, 6, 10),
    hairMat
  );
  frontStrand.scale.set(0.7, 1, 0.5);
  frontStrand.position.set(headR * 0.55, -headR * 0.25, headR * 0.6);
  frontStrand.rotation.z = -0.15;
  head.add(frontStrand);

  // Pescoço fino
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 0.09, 12),
    skinMat
  );
  neck.position.y = -headR - 0.02;
  head.add(neck);

  head.position.y = 1.95;
  root.add(head);

  // === TORSO + LAB COAT ===
  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(torsoR, torsoR * 0.92, 0.55, 22),
    topMat
  );
  torso.position.y = 1.375;
  torso.castShadow = true;
  body.add(torso);

  // Detalhe lab coat: lapelas verticais (2 retângulos verdes pra contraste)
  for (const sx of [-1, 1]) {
    const lapel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x43B02A })
    );
    lapel.position.set(sx * torsoR * 0.5, 1.42, torsoR + 0.001);
    body.add(lapel);
  }

  // Logo "N" verde no peito
  const nCanvas = document.createElement("canvas");
  nCanvas.width = 256;
  nCanvas.height = 256;
  const nctx = nCanvas.getContext("2d")!;
  nctx.clearRect(0, 0, 256, 256);
  nctx.fillStyle = "#43B02A";
  nctx.beginPath();
  nctx.arc(128, 128, 70, 0, Math.PI * 2);
  nctx.fill();
  nctx.fillStyle = "#ffffff";
  nctx.font = "900 110px Archivo Black, Inter, sans-serif";
  nctx.textAlign = "center";
  nctx.textBaseline = "middle";
  nctx.fillText("N", 128, 138);
  const nTex = new THREE.CanvasTexture(nCanvas);
  nTex.colorSpace = THREE.SRGBColorSpace;
  const nBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ map: nTex, transparent: true })
  );
  nBadge.position.set(0, 1.32, torsoR + 0.005);
  body.add(nBadge);

  // Hip
  const hip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.18, 0.18, 16),
    shortsMat
  );
  hip.position.y = 1.0;
  body.add(hip);

  root.add(body);

  // === Pernas (femininas, sem músculo exagerado) ===
  for (const sx of [-0.10, 0.10]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0.985, 0);
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.095, 0.18, 10),
      shortsMat
    );
    skirt.position.y = -0.09;
    leg.add(skirt);
    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.062, 0.28, 10),
      skinMat
    );
    thigh.position.y = -0.32;
    leg.add(thigh);
    const calf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.05, 0.36, 10),
      skinMat
    );
    calf.position.y = -0.65;
    leg.add(calf);
    // Sapato fechado (não tênis — Nutri usa sapato profissional)
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.06, 0.20),
      shoeMat
    );
    shoe.position.set(0, -0.93, 0.04);
    leg.add(shoe);
    root.add(leg);
  }

  // === Braços (femininos, finos) ===
  const shoulderHalfW = 0.21;
  for (const sx of [-shoulderHalfW - 0.02, shoulderHalfW + 0.02]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 1.62, 0);
    // Manga curta lab coat
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.10, 10),
      topMat
    );
    sleeve.position.y = -0.05;
    arm.add(sleeve);
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.052, 0.24, 10),
      skinMat
    );
    upper.position.y = -0.22;
    arm.add(upper);
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.045, 0.26, 10),
      skinMat
    );
    lower.position.y = -0.5;
    arm.add(lower);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 10, 8),
      skinMat
    );
    hand.position.y = -0.66;
    arm.add(hand);
    root.add(arm);
  }

  return { group: root, head, body };
}
