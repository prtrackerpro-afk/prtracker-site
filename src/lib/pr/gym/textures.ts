import * as THREE from "three";

// Texturas geradas via Canvas2D pra evitar baixar PNGs externos.
// CanvasTexture é cheap (uma vez gerada cabe em memória da GPU).

/**
 * Floor de academia — azulejo de borracha quadriculado, escuro,
 * com leve pontilhado pra simular textura. Repete 8× pela sala.
 */
export function buildFloorTexture(repeat: number = 6): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  // Fundo escuro com leve gradiente
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#0d0a3a");
  grad.addColorStop(1, "#080725");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Linhas de "rejunte" entre azulejos (cross pattern)
  ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(256, 0);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 256);
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.stroke();

  // Pontilhado fino simulando textura de borracha
  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sutil reflexo lime nos cantos das tiles
  ctx.strokeStyle = "rgba(216, 255, 44, 0.04)";
  ctx.lineWidth = 1;
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 1);
    ctx.lineTo(x + 120, y + 1);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Parede de concreto pintado escuro com leve pontilhado.
 * Usado nas 3 paredes pra dar profundidade vs cor flat.
 */
export function buildWallTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  // Fundo
  ctx.fillStyle = "#1a1660";
  ctx.fillRect(0, 0, 256, 256);
  // Riscado vertical sutil simulando concreto pintado
  ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  // Pontilhado
  ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = Math.random() * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}
