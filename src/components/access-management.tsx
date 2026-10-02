"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LoaderCircle, Mail, Pencil, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { inviteMember, resendMemberInvitation, updateMemberAccess, type ActionState } from "@/app/actions";
import { accessGroup, accessGroups, accessRoles, type AccessGroup, type AccessMember } from "@/lib/access";
import { isDisconnected, subscribeConnection } from "@/lib/connection-state";
import { FormStatus } from "@/components/form-status";
import { outsideDialog } from "@/lib/dialog-dismiss";

const initial: ActionState = {};
const date = (value: string) => new Date(value).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });

function InvitePanel({ offline }: { offline: boolean }) {
  const [state, action, pending] = useActionState(inviteMember, initial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) form.current?.reset(); }, [state.success]);
  return <aside className="access-invite-card" id="invite-user">
    <div className="access-card-heading"><span className="section-icon"><UserPlus size={20} /></span><h2>הזמנת משתמש</h2></div>
    <form ref={form} action={action} className="stack" data-online-only>
      <label>כתובת אימייל<input name="email" type="email" dir="ltr" placeholder="name@example.com" autoComplete="email" required maxLength={254} disabled={pending || offline} /></label>
      <label>הרשאה<select name="role" defaultValue="member" disabled={pending || offline}>
        <option value="member">עריכת הוצאות</option><option value="read_only">צפייה בלבד</option><option value="admin">מנהל</option>
      </select></label>
      <p className="access-permissions-note">מנהלים יכולים גם להזמין משתמשים ולנהל הרשאות.</p>
      <button className="primary" disabled={pending || offline}>{pending ? <LoaderCircle size={17} className="spin" /> : <Mail size={17} />}{pending ? "שולחים…" : "שליחת הזמנה"}</button>
      {offline && <p className="muted">נדרש חיבור לשליחת הזמנה.</p>}
      <FormStatus state={state} />
    </form>
  </aside>;
}

function EditMember({ person, onClose, offline }: { person: AccessMember; onClose: () => void; offline: boolean }) {
  const [state, action, pending] = useActionState(updateMemberAccess, initial);
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (state.success) { dialog.current?.close(); onClose(); router.refresh(); } }, [state.success, onClose, router]);
  return <dialog ref={dialog} className="expense-dialog access-dialog" aria-labelledby="access-edit-title" onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault(); }} onClick={(event) => { if (event.target === dialog.current && !pending && outsideDialog(dialog.current.getBoundingClientRect(), event.clientX, event.clientY)) dialog.current.close(); }}>
    <div className="dialog-header"><div><h2 id="access-edit-title">עריכת הרשאות</h2><p className="muted"><bdi>{person.email}</bdi></p></div><button type="button" className="icon-button" aria-label="סגירה" onClick={() => dialog.current?.close()} disabled={pending}><X size={20} /></button></div>
    <form action={action} className="stack" data-online-only onSubmit={(event) => {
      const fields = new FormData(event.currentTarget);
      const removingAdmin = person.role === "admin" && person.active && (fields.get("role") !== "admin" || fields.get("active") === "false");
      if (removingAdmin && !confirm("להסיר מהמשתמש את הרשאת הניהול?")) event.preventDefault();
    }}>
      <input type="hidden" name="email" value={person.email} />
      <label>הרשאה<select name="role" defaultValue={person.role} disabled={pending || offline}><option value="admin">מנהל</option><option value="member">עריכת הוצאות</option><option value="read_only">צפייה בלבד</option></select></label>
      <label>גישה לפרויקט<select name="active" defaultValue={String(person.active)} disabled={pending || offline}><option value="true">פעילה</option><option value="false">מבוטלת</option></select></label>
      <FormStatus state={state} />
      <div className="access-dialog-actions"><button className="primary" disabled={pending || offline}>{pending && <LoaderCircle size={17} className="spin" />}{pending ? "שומרים…" : "שמירת שינויים"}</button><button type="button" className="secondary" disabled={pending} onClick={() => dialog.current?.close()}>ביטול</button></div>
    </form>
  </dialog>;
}

function MemberRow({ person, currentEmail, offline }: { person: AccessMember; currentEmail: string; offline: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, resend, sending] = useActionState(resendMemberInvitation, initial);
  const self = person.email.toLowerCase() === currentEmail.toLowerCase();
  return <li className="access-member-row">
    <span className={`avatar access-avatar ${person.role === "admin" ? "is-admin" : ""}`}>{person.email.slice(0, 1).toUpperCase()}</span>
    <div className="access-member-identity"><strong><bdi>{person.email}</bdi></strong><small>{self ? "החשבון שלך" : person.status === "unknown" ? "סטטוס כניסה לא זמין" : person.last_sign_in_at ? `כניסה אחרונה: ${date(person.last_sign_in_at)}` : person.invited_at ? `הוזמן ב־${date(person.invited_at)}` : "טרם התחבר"}</small></div>
    <span className={`access-role-badge ${person.role}`}>{accessRoles[person.role]}</span>
    <div className="access-member-actions">
      <button type="button" className="secondary" disabled={self || offline || sending} title={self ? "לא ניתן לערוך את ההרשאות של עצמך" : offline ? "נדרש חיבור" : undefined} onClick={() => setEditing(true)}><Pencil size={15} />עריכה</button>
      {person.active && !self && <form action={resend} data-online-only><input type="hidden" name="email" value={person.email} /><button className="icon-button access-resend" disabled={sending || offline} aria-label={`שליחת קישור מחדש אל ${person.email}`} title="שליחת קישור מחדש">{sending ? <LoaderCircle size={17} className="spin" /> : <Mail size={17} />}</button></form>}
    </div>
    {(state.error || state.success) && <div className="access-row-feedback"><FormStatus state={state} /></div>}
    {editing && <EditMember person={person} offline={offline} onClose={() => setEditing(false)} />}
  </li>;
}

export function AccessManagement({ members, currentEmail, statusAvailable, loadError }: { members: AccessMember[]; currentEmail: string; statusAvailable: boolean; loadError?: boolean }) {
  const [filter, setFilter] = useState<AccessGroup | "all">("all");
  const [search, setSearch] = useState("");
  const offline = useSyncExternalStore(subscribeConnection, isDisconnected, () => false);
  const matching = members.filter((person) => person.email.toLowerCase().includes(search.trim().toLowerCase()));
  const counts = Object.fromEntries(accessGroups.map((group) => [group.id, members.filter((person) => accessGroup(person) === group.id).length]));
  return <section className="access-page" aria-labelledby="access-title">
    <header className="page-heading access-page-heading"><h1 id="access-title">משתמשים והרשאות</h1><span className="count-tag">{members.length} משתמשים</span></header>
    {loadError && <p className="message error" role="alert">טעינת המשתמשים נכשלה. רעננו את העמוד.</p>}
    {!loadError && !statusAvailable && <p className="message error" role="status">סטטוס ההזמנות אינו זמין כרגע.</p>}
    <div className="access-summary" aria-label="סיכום הרשאות">{[
      { id: "admins", label: "מנהלים", Icon: ShieldCheck }, { id: "members", label: "חברי פרויקט", Icon: Users }, { id: "invited", label: "הזמנות ממתינות", Icon: Clock3 },
    ].map(({ id, label, Icon }) => <button type="button" className={`access-summary-card ${filter === id ? "selected" : ""}`} key={id} aria-pressed={filter === id} onClick={() => setFilter(filter === id ? "all" : id as AccessGroup)}><Icon size={20} /><span>{label}</span><strong>{id === "invited" && !statusAvailable ? "—" : counts[id]}</strong></button>)}</div>
    <div className="access-layout">
      <div className="access-directory">
        <div className="access-toolbar"><div className="search-input"><Search size={17} /><label className="sr-only" htmlFor="member-search">חיפוש משתמשים</label><input id="member-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי אימייל…" type="search" /></div></div>
        <div className="access-tabs" role="group" aria-label="סינון משתמשים"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>הכול <span>{members.length}</span></button>{accessGroups.map((group) => <button type="button" key={group.id} aria-pressed={filter === group.id} onClick={() => setFilter(group.id)}>{group.label}<span>{group.id === "invited" && !statusAvailable ? "—" : counts[group.id]}</span></button>)}</div>
        <div className="access-groups">{accessGroups.filter((group) => filter === "all" ? matching.some((person) => accessGroup(person) === group.id) : filter === group.id).map((group) => {
          const people = matching.filter((person) => accessGroup(person) === group.id);
          return <section className="access-group" key={group.id} aria-labelledby={`group-${group.id}`}><header><h2 id={`group-${group.id}`}>{group.label}</h2><span className="count-tag">{people.length}</span></header>
            {people.length ? <ul>{people.map((person) => <MemberRow person={person} key={person.email} offline={offline} currentEmail={currentEmail} />)}</ul> : <p className="access-empty">{search ? "אין משתמשים התואמים לחיפוש" : group.empty}</p>}
          </section>;
        })}{filter === "all" && !matching.length && !loadError && <p className="access-empty">אין משתמשים התואמים לחיפוש</p>}</div>
      </div>
      <InvitePanel offline={offline} />
    </div>
  </section>;
}
