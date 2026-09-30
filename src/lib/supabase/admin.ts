import type { Database } from "@/lib/database.types";
import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
