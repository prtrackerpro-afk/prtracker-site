// Web Audio API helpers — sons sintetizados sem assets externos.
// Fase 13 do roadmap (cycles 1152-1176).

let _ctx: AudioContext | null = null;
let _muted = false;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _ctx;
}

export function setMuted(m: boolean) {
  _muted = m;
  if (typeof window !== "undefined") {
    localStorage.setItem("pr_audio_muted", m ? "1" : "0");
  }
}

export function getMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("pr_audio_muted") === "1";
}

// Init (chamar uma vez ao primeiro pointerdown)
export function ensureAudioReady() {
  const c = ctx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
  }
  _muted = getMuted();
}

// Beep simples
function beep(freq: number, duration: number, volume = 0.15, type: OscillatorType = "sine") {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

// SFX library
export function sfxClick() {
  beep(800, 0.05, 0.1, "square");
}

export function sfxSuccess() {
  beep(523, 0.08, 0.15, "sine"); // C
  setTimeout(() => beep(659, 0.08, 0.15, "sine"), 80); // E
  setTimeout(() => beep(784, 0.12, 0.15, "sine"), 160); // G
}

export function sfxError() {
  beep(220, 0.15, 0.18, "sawtooth");
}

export function sfxRep() {
  beep(440 + Math.random() * 30, 0.04, 0.08, "triangle");
}

export function sfxBarbellDrop() {
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  // Noise burst (simula impacto da barra com plates)
  const buffer = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.04));
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  gain.gain.value = 0.4;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}

export function sfxPRCelebrate() {
  // Trumpet-like fanfare
  if (_muted) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.18, 0.18, "sawtooth"), i * 100);
  });
}

export function sfxCheer() {
  // Crowd cheer = noise + filter sweep
  if (_muted) return;
  const c = ctx();
  if (!c) return;
  const buffer = c.createBuffer(1, c.sampleRate * 0.8, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(2500, c.currentTime + 0.4);
  filter.Q.value = 1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.18, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  src.start();
}
