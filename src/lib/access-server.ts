import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { AccessMember, AccessRole } from "@/lib/access";

type AuthStatus = { invited_at?: string; last_sign_in_at?: string; email_confirmed_at?: string };
export async function authStatusFor(emails: string[]) {
  const remaining = new Set(emails.map((email) => email.toLowerCase()));
  const found = new Map<string, AuthStatus>();
  const admin = adminClient();
  for (let page = 1; remaining.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && remaining.delete(email)) found.set(email, {
        invited_at: user.invited_at, last_sign_in_at: user.last_sign_in_at,
        email_confirmed_at: user.email_confirmed_at,
      });
    }
    if (data.users.length < 200) break;
  }
  return found;
}

export async function enrichAccessMembers(rows: { email: string; role: string; active: boolean; created_at: string }[]) {
  let directory: Map<string, AuthStatus> | undefined;
  try { directory = await authStatusFor(rows.map((row) => row.email)); } catch { /* Show roles without inventing invitation status. */ }
  const members: AccessMember[] = rows.map((row) => {
    const auth = directory?.get(row.email.toLowerCase());
    return { ...row, role: row.role as AccessRole, invited_at: auth?.invited_at ?? null,
      last_sign_in_at: auth?.last_sign_in_at ?? null,
      status: !row.active ? "revoked" : !directory ? "unknown" : auth?.last_sign_in_at ? "active" : "pending",
    };
  });
  return { members, statusAvailable: !!directory };
}
