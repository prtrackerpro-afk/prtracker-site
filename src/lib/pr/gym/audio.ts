// Audio system minimalista pro gym virtual.
// Web Audio API synthesized sounds — zero deps, zero arquivos.
// "Áudio é 50% do feel do jogo" — sem ele a sensação some.
//
// Política de auto-play: AudioContext só pode iniciar após interação
// do user (pointerdown). Lazy init em ensureCtx().

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientNode: AudioNode | null = null;
let muted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }
  // Resume se suspenso
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setMuted(value: boolean) {
  muted = value;
  if (masterGain) masterGain.gain.value = value ? 0 : 0.35;
}

export function isMuted(): boolean {
  return muted;
}

// === Sintetizadores específicos ====================================

/** Click curto (pointer click em botão / UI). */
export function playClick() {
  const c = ensureCtx();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.06);
  g.gain.setValueAtTime(0.18, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.1);
}

/** Chime — quando troféu é clicado / unlock simples. */
export function playChime() {
  const c = ensureCtx();
  const dest = masterGain;
  if (!c || !dest || muted) return;
  const t0 = c.currentTime;
  const freqs = [880, 1320]; // perfect fifth
  freqs.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0 + i * 0.04);
    g.gain.linearRampToValueAtTime(0.22, t0 + i * 0.04 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.04 + 0.5);
    osc.connect(g).connect(dest);
    osc.start(t0 + i * 0.04);
    osc.stop(t0 + i * 0.04 + 0.55);
  });
}

/** Unlock fanfare — arpejo ascendente pra desbloqueios grandes. */
export function playUnlock() {
  const c = ensureCtx();
  const dest = masterGain;
  if (!c || !dest || muted) return;
  const t0 = c.currentTime;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6 (major arpeggio)
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const start = t0 + i * 0.09;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.28, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
    osc.connect(g).connect(dest);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}

/** Mystery low wobble — pra ghost click ("pedestal vazio"). */
export function playMystery() {
  const c = ensureCtx();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 220;
  lfo.type = "sine";
  lfo.frequency.value = 5;
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain).connect(osc.frequency);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.18, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  lfo.start(t0);
  osc.stop(t0 + 0.65);
  lfo.stop(t0 + 0.65);
}

/** Bell pra NPC click. */
export function playBell() {
  const c = ensureCtx();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, t0);
  osc.frequency.exponentialRampToValueAtTime(800, t0 + 0.6);
  g.gain.setValueAtTime(0.25, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.75);
}

/** Whoosh curto — fire crackle pro streak. */
export function playWhoosh() {
  const c = ensureCtx();
  if (!c || !masterGain || muted) return;
  const t0 = c.currentTime;
  // Filtered noise via buffer
  const bufferSize = c.sampleRate * 0.4;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2000, t0);
  filter.frequency.exponentialRampToValueAtTime(400, t0 + 0.4);
  filter.Q.value = 8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.45, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
  src.connect(filter).connect(g).connect(masterGain);
  src.start(t0);
}

/** Ambient hum loop — som de fundo sutil pra dar profundidade. */
export function startAmbient() {
  const c = ensureCtx();
  if (!c || !masterGain || ambientNode) return;
  const osc = c.createOscillator();
  const osc2 = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.value = 55; // A1
  osc2.type = "sine";
  osc2.frequency.value = 110; // A2
  lfo.type = "sine";
  lfo.frequency.value = 0.13;
  lfoGain.gain.value = 0.02;
  lfo.connect(lfoGain).connect(g.gain);
  g.gain.value = 0.06;
  osc.connect(g);
  osc2.connect(g);
  g.connect(masterGain);
  osc.start();
  osc2.start();
  lfo.start();
  ambientNode = g;
}

export function stopAmbient() {
  if (ambientNode && masterGain) {
    try {
      ambientNode.disconnect();
    } catch {
      // ignore
    }
    ambientNode = null;
  }
}
