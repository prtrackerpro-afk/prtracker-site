import * as THREE from "three";

// =================================================================
// PARTICLES — burst de partículas pra eventos (trophy unlock, ghost
// click, streak pulse). THREE.Points com positions/velocities/lifetimes
// alocados em arrays compartilhados. Pool simples, GC-friendly.
// =================================================================

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number; // 0..1, decrementa
  size: number;
  alive: boolean;
}

export class ParticleBurst {
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  public points: THREE.Points;
  private maxParticles: number;

  constructor(maxParticles: number = 300) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3)
    );
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3)
    );
    this.geometry.setAttribute(
      "size",
      new THREE.BufferAttribute(this.sizes, 1)
    );
    this.material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // Inicializa todas as partículas em estado morto
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        size: 0,
        alive: false,
      });
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = -1000; // off-screen
      this.positions[i * 3 + 2] = 0;
    }
    this.geometry.attributes.position!.needsUpdate = true;
  }

  /** Spawn um burst de N partículas a partir de origin. */
  burst(origin: THREE.Vector3, count: number, color: THREE.Color, intensity: number = 1) {
    // Itera por índice direto pra evitar indexOf O(n) em loop (era O(n²) acumulado).
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i]!;
      if (p.alive) continue;
      p.alive = true;
      p.life = 1.0;
      p.position.copy(origin);
      // Velocidade aleatória esférica
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = (1 + Math.random() * 2) * intensity;
      p.velocity.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 1.0, // bias pra cima
        Math.sin(phi) * Math.sin(theta) * speed
      );
      p.size = 0.05 + Math.random() * 0.08;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
      spawned++;
    }
    this.geometry.attributes.color!.needsUpdate = true;
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      if (!p.alive) {
        // Mantém off-screen
        this.positions[i * 3 + 1] = -1000;
        continue;
      }
      any = true;
      p.life -= dt * 1.2; // ~0.83s lifetime
      if (p.life <= 0) {
        p.alive = false;
        this.positions[i * 3 + 1] = -1000;
        continue;
      }
      // Gravidade leve
      p.velocity.y -= dt * 3.5;
      // Drag
      p.velocity.multiplyScalar(1 - dt * 0.8);
      p.position.addScaledVector(p.velocity, dt);
      this.positions[i * 3] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
      // Tamanho some com vida
      this.sizes[i] = p.size * p.life;
    }
    if (any) {
      this.geometry.attributes.position!.needsUpdate = true;
      this.geometry.attributes.size!.needsUpdate = true;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// =================================================================
// CAMERA SHAKE — perturbação curta na posição da câmera
// =================================================================

export class CameraShake {
  private intensity: number = 0;
  private duration: number = 0;
  private elapsed: number = 0;
  private offset = new THREE.Vector3();

  /** Triggera shake. Intensidade ~0.1 sutil, ~0.4 forte. */
  trigger(intensity: number, duration: number = 0.25) {
    this.intensity = intensity;
    this.duration = duration;
    this.elapsed = 0;
  }

  /** Update e retorna offset pra adicionar à camera position. */
  update(dt: number): THREE.Vector3 {
    if (this.elapsed >= this.duration || this.intensity <= 0) {
      this.offset.set(0, 0, 0);
      return this.offset;
    }
    this.elapsed += dt;
    const decay = 1 - this.elapsed / this.duration;
    const shake = this.intensity * decay;
    this.offset.set(
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake,
      (Math.random() - 0.5) * shake * 0.5
    );
    return this.offset;
  }
}

// =================================================================
// FLOATING TEXT — "+1", "+XP", "DESBLOQUEADO" texto que sobe e fade
// (para HUD overlay, retorna React-friendly state via callback)
// =================================================================

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  startedAt: number;
}

export class FloatingTextManager {
  private items: FloatingText[] = [];
  private nextId = 1;
  private listeners: Array<(items: FloatingText[]) => void> = [];

  spawn(text: string, x: number, y: number, color: string = "#D8FF2C") {
    this.items.push({
      id: this.nextId++,
      text,
      x,
      y,
      color,
      startedAt: performance.now(),
    });
    this.notify();
  }

  tick(now: number) {
    const before = this.items.length;
    this.items = this.items.filter((it) => now - it.startedAt < 1500);
    if (this.items.length !== before) this.notify();
  }

  subscribe(fn: (items: FloatingText[]) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    for (const l of this.listeners) l(this.items);
  }
}
