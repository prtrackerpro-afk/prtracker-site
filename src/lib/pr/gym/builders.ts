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
 * Constrói o avatar customizado estilo retrô-stylized (referência Viverse).
 * Pés tocam o chão (root.y = 0). Camisa "PR TRACKER" sempre branded.
 * Pele NÃO recebe emissive (evita tingir de verde quando regata é lime).
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

  // Proporções por gênero. Total height ~1.85m. Layout absoluto:
  //   Pés:    y=0 a y=0.08
  //   Pernas: y=0.08 a y=0.95 (joelho ~0.5)
  //   Hip:    y=0.95 a y=1.10
  //   Torso:  y=1.10 a y=1.65
  //   Pescoço:y=1.65 a y=1.72
  //   Cabeça: y=1.72 a y=2.05 (radius 0.165, center 1.88)
  const isF = prefs.gender === "female";
  const isM = prefs.gender === "male";
  const torsoTopR = isF ? 0.18 : isM ? 0.22 : 0.20;
  const torsoBotR = isF ? 0.16 : isM ? 0.18 : 0.17;
  const hipR = isF ? 0.20 : isM ? 0.18 : 0.19;
  const shoulderHalfW = isF ? 0.20 : isM ? 0.24 : 0.22;
  const headR = 0.165;

  // === HEAD com FACE TEXTURE ====================================
  const head = new THREE.Group();
  // Skull: esfera levemente achatada nas laterais pra dar formato facial
  const skullGeom = new THREE.SphereGeometry(headR, 28, 22);
  const skull = new THREE.Mesh(skullGeom, skinMat);
  skull.scale.set(1.0, 1.08, 0.95);
  skull.castShadow = true;
  head.add(skull);

  // Face texture: olhos + boca + sobrancelhas via canvas, em um plane
  // arredondado na frente da cabeça. MUDA TUDO visualmente.
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 256;
  faceCanvas.height = 256;
  const fctx = faceCanvas.getContext("2d")!;
  // Fundo transparente pra não cobrir a esfera
  fctx.clearRect(0, 0, 256, 256);

  // Sobrancelhas
  fctx.fillStyle = prefs.hair;
  fctx.fillRect(70, 95, 38, 8);
  fctx.fillRect(148, 95, 38, 8);

  // Olhos brancos (esclera)
  fctx.fillStyle = "#ffffff";
  fctx.beginPath();
  fctx.ellipse(89, 122, 18, 14, 0, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.ellipse(167, 122, 18, 14, 0, 0, Math.PI * 2);
  fctx.fill();

  // Íris (azul-noturno)
  fctx.fillStyle = "#1a1660";
  fctx.beginPath();
  fctx.arc(89, 124, 9, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.arc(167, 124, 9, 0, Math.PI * 2);
  fctx.fill();

  // Pupilas
  fctx.fillStyle = "#000";
  fctx.beginPath();
  fctx.arc(89, 124, 4, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.arc(167, 124, 4, 0, Math.PI * 2);
  fctx.fill();

  // Highlight nos olhos
  fctx.fillStyle = "#ffffff";
  fctx.beginPath();
  fctx.arc(91, 121, 2, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.arc(169, 121, 2, 0, Math.PI * 2);
  fctx.fill();

  // Nariz (linha sutil)
  fctx.strokeStyle = "rgba(0,0,0,0.18)";
  fctx.lineWidth = 2;
  fctx.beginPath();
  fctx.moveTo(128, 140);
  fctx.lineTo(122, 158);
  fctx.lineTo(132, 162);
  fctx.stroke();

  // Boca (sorriso leve)
  fctx.strokeStyle = "#3a1f1f";
  fctx.lineWidth = 4;
  fctx.lineCap = "round";
  fctx.beginPath();
  fctx.arc(128, 178, 26, 0.15, Math.PI - 0.15);
  fctx.stroke();

  // Bochecha sutil
  fctx.fillStyle = "rgba(220, 100, 100, 0.18)";
  fctx.beginPath();
  fctx.arc(70, 165, 14, 0, Math.PI * 2);
  fctx.fill();
  fctx.beginPath();
  fctx.arc(186, 165, 14, 0, Math.PI * 2);
  fctx.fill();

  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(headR * 1.7, headR * 1.7),
    new THREE.MeshBasicMaterial({ map: faceTex, transparent: true })
  );
  // Posicionado um pouco à frente da esfera, à altura dos olhos
  face.position.set(0, 0, headR * 0.92);
  head.add(face);

  // Pescoço
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.07, 0.07, 12),
    skinMat
  );
  neck.position.y = -headR - 0.02;
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
  head.position.y = 1.88;
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

  // === LEGS — pés tocam o chão ==================================
  // legGroup origin = quadril (y=0.985). Parts vão pra baixo até a sola
  // do tênis encostar no chão (sole bottom y ≈ 0).
  const leftLeg = buildLeg(skinMat, shortsMat, shoeMat);
  leftLeg.position.set(-0.10, 0.985, 0);
  root.add(leftLeg);

  const rightLeg = buildLeg(skinMat, shortsMat, shoeMat);
  rightLeg.position.set(0.10, 0.985, 0);
  root.add(rightLeg);

  // === ARMS — pendurados ao lado do torso =======================
  // armGroup origin = ombro (y=1.62). Parts vão pra baixo.
  const leftArm = buildArm(skinMat, topMat);
  leftArm.position.set(-shoulderHalfW - 0.02, 1.62, 0);
  root.add(leftArm);

  const rightArm = buildArm(skinMat, topMat);
  rightArm.position.set(shoulderHalfW + 0.02, 1.62, 0);
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
 * Braço: regata (mangueta curta) cobrindo topo, depois pele.
 * Origin = ombro (top of upper arm).
 */
function buildArm(skinMat: THREE.Material, topMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Mangueta curta da regata cobrindo o ombro (3cm da regata desce pelo braço)
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.06, 10),
    topMat
  );
  sleeve.position.y = -0.03;
  g.add(sleeve);
  // Bíceps
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.06, 0.28, 10),
    skinMat
  );
  upper.position.y = -0.2;
  upper.castShadow = true;
  g.add(upper);
  // Cotovelo
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), skinMat);
  elbow.position.y = -0.36;
  g.add(elbow);
  // Antebraço
  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.052, 0.26, 10),
    skinMat
  );
  lower.position.y = -0.5;
  lower.castShadow = true;
  g.add(lower);
  // Mão (esfera)
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skinMat);
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
