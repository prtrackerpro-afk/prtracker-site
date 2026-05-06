import type { ExerciseId } from "../exercises";

// Lista canônica dos 11 exercícios exibidos no Hall of Fame V7.
// Ordem definida pelo Felipe — não reordenar sem alinhar.
export const HALL_EXERCISES: ExerciseId[] = [
  "deadlift",
  "back_squat",
  "front_squat",
  "clean_and_jerk",
  "squat_clean",
  "power_clean",
  "push_press",
  "shoulder_press",
  "clean",
  "snatch",
  "bench_press",
];

/** Quantos troféus desbloqueados ativam cada efeito de gamificação. */
export const UNLOCK_THRESHOLDS = {
  ledPulse: 3,
  laserCross: 6,
  avatarAura: 10,
} as const;
