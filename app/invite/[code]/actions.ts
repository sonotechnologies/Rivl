"use server";

import { createClient } from "@/lib/supabase/server";

export type JoinResult = "joined" | "joined_bonus" | "self" | "blocked" | "invalid" | "signed_out" | "error";

export async function joinViaInvite(code: string): Promise<JoinResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "signed_out";
  const { data: result, error } = await supabase.rpc("redeem_invite", { p_code: code });
  if (error) return "error";
  return result as JoinResult;
}
