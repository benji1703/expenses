import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
export const requireMember = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub || typeof data.claims.email !== "string") redirect("/login");
  const user = { id: data.claims.sub, email: data.claims.email };
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("email, role")
    .eq("email", user.email.toLowerCase())
    .eq("active", true)
    .single();
  if (memberError && memberError.code !== "PGRST116") throw new Error("Membership service unavailable");
  if (!member) redirect("/login?error=access");
  return {
    supabase,
    user,
    member: member as {
      email: string;
      role: "admin" | "member" | "read_only";
    },
  };
});
