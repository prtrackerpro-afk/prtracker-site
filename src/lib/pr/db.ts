import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExerciseId } from "./exercises";

export interface PRRecord {
  id: string;
  user_id: string;
  exercise: ExerciseId;
  weight_kg: number;
  performed_at: string;
  photo_url: string | null;
  notes: string | null;
  is_personal_record: boolean;
  box_id: string | null;
  trophy_purchase_id: string | null;
  created_at: string;
}

export interface InsertPRInput {
  userId: string;
  exercise: ExerciseId;
  weightKg: number;
  performedAt?: string; // YYYY-MM-DD; defaults to today
  photoUrl?: string | null;
  notes?: string | null;
  boxId?: string | null;
}

/**
 * Inserts a new PR record. Sets `is_personal_record = true` iff the weight
 * exceeds the athlete's best previous weight on this exercise.
 *
 * Returns both the inserted record and the previous best (so the celebrate
 * screen can show the delta).
 */
export async function insertPR(
  supabase: SupabaseClient,
  input: InsertPRInput
): Promise<{ record: PRRecord; previousBestKg: number | null; isPR: boolean }> {
  const { data: prev } = await supabase
    .from("pr_records")
    .select("weight_kg")
    .eq("user_id", input.userId)
    .eq("exercise", input.exercise)
    .order("weight_kg", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousBestKg = prev?.weight_kg ?? null;
  const isPR = previousBestKg === null || input.weightKg > Number(previousBestKg);

  const { data: inserted, error } = await supabase
    .from("pr_records")
    .insert({
      user_id: input.userId,
      exercise: input.exercise,
      weight_kg: input.weightKg,
      performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
      photo_url: input.photoUrl ?? null,
      notes: input.notes ?? null,
      box_id: input.boxId ?? null,
      is_personal_record: isPR,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    throw error ?? new Error("Failed to insert PR record");
  }

  return { record: inserted as PRRecord, previousBestKg, isPR };
}

export async function listOwnRecords(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<PRRecord[]> {
  const { data } = await supabase
    .from("pr_records")
    .select("*")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PRRecord[];
}

export async function getRecord(
  supabase: SupabaseClient,
  recordId: string
): Promise<PRRecord | null> {
  const { data } = await supabase
    .from("pr_records")
    .select("*")
    .eq("id", recordId)
    .maybeSingle();
  return (data as PRRecord) ?? null;
}
