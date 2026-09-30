import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
export const requireMember = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) redirect("/login");
  const { data: member } = await supabase
    .from("members")
    .select("email, role")
    .eq("email", data.user.email.toLowerCase())
    .eq("active", true)
    .single();
  if (!member) redirect("/login?error=access");
  return {
    supabase,
    user: data.user,
    member: member as { email: string; role: "admin" | "member" },
  };
});
