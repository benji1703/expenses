export type AccessRole = "admin" | "member" | "read_only";
export type AccessMember = {
  email: string;
  role: AccessRole;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
  status: "active" | "pending" | "revoked" | "unknown";
};
export const accessRoles: Record<AccessRole, string> = {
  admin: "מנהל", member: "עריכת הוצאות", read_only: "צפייה בלבד",
};
export const accessGroups = [
  { id: "admins", label: "מנהלים", empty: "אין מנהלים נוספים" },
  { id: "members", label: "חברי הפרויקט", empty: "אין חברי פרויקט נוספים" },
  { id: "invited", label: "הזמנות ממתינות", empty: "אין הזמנות ממתינות" },
  { id: "revoked", label: "גישה מבוטלת", empty: "אין משתמשים עם גישה מבוטלת" },
] as const;
export type AccessGroup = typeof accessGroups[number]["id"];
export function accessGroup(member: AccessMember): AccessGroup {
  if (!member.active) return "revoked";
  if (member.status === "pending") return "invited";
  return member.role === "admin" ? "admins" : "members";
}
