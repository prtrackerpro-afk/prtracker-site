// Exercise catalog (My PR Set + the three named-set lifts).
// Keep IDs in sync with the CHECK constraint in
// supabase/migrations/0005_pr_tracker.sql.

export const EXERCISES = [
  { id: "back_squat", label: "Back Squat", productSlug: "power-rack-set" },
  { id: "bench_press", label: "Bench Press", productSlug: "bench-press-set" },
  { id: "clean", label: "Clean", productSlug: "my-pr-set" },
  { id: "clean_and_jerk", label: "Clean & Jerk", productSlug: "my-pr-set" },
  { id: "deadlift", label: "Deadlift", productSlug: "deadlift-set" },
  { id: "front_squat", label: "Front Squat", productSlug: "power-rack-set" },
  { id: "hang_clean", label: "Hang Clean", productSlug: "my-pr-set" },
  { id: "hang_power_clean", label: "Hang Power Clean", productSlug: "my-pr-set" },
  { id: "overhead_squat", label: "Overhead Squat", productSlug: "power-rack-set" },
  { id: "power_clean", label: "Power Clean", productSlug: "my-pr-set" },
  { id: "power_snatch", label: "Power Snatch", productSlug: "my-pr-set" },
  { id: "push_jerk", label: "Push Jerk", productSlug: "my-pr-set" },
  { id: "push_press", label: "Push Press", productSlug: "my-pr-set" },
  { id: "shoulder_press", label: "Shoulder Press", productSlug: "my-pr-set" },
  { id: "snatch", label: "Snatch", productSlug: "my-pr-set" },
  { id: "split_jerk", label: "Split Jerk", productSlug: "my-pr-set" },
  { id: "squat_clean", label: "Squat Clean", productSlug: "my-pr-set" },
  { id: "squat_snatch", label: "Squat Snatch", productSlug: "my-pr-set" },
  { id: "sumo_deadlift", label: "Sumo Deadlift", productSlug: "deadlift-set" },
  { id: "thruster", label: "Thruster", productSlug: "my-pr-set" },
] as const;

export type ExerciseId = (typeof EXERCISES)[number]["id"];

export const EXERCISE_IDS: ExerciseId[] = EXERCISES.map((e) => e.id);

export function isExercise(value: unknown): value is ExerciseId {
  return typeof value === "string" && EXERCISE_IDS.includes(value as ExerciseId);
}

export function exerciseLabel(id: ExerciseId): string {
  return EXERCISES.find((e) => e.id === id)?.label ?? id;
}

export function productSlugForExercise(id: ExerciseId): string {
  return EXERCISES.find((e) => e.id === id)?.productSlug ?? "my-pr-set";
}
