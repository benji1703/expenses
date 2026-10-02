"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ExpenseForm } from "@/components/expense-form";
import { RenovationGuide } from "@/components/guide";
import { activeProfile, loadSnapshot, offlineChanged } from "@/lib/offline-store";
import type { OfflineSnapshot } from "@/lib/offline-types";
import { money } from "@/lib/expenses";
import { paymentStatuses } from "@/lib/renovation-guide";
import { BookOpen, Fingerprint, LayoutDashboard, ReceiptText, Tags } from "lucide-react";

const views = [
  { id: "overview", label: "סקירה", Icon: LayoutDashboard }, { id: "expenses", label: "הוצאות", Icon: ReceiptText },
  { id: "categories", label: "קטגוריות", Icon: Tags }, { id: "guide", label: "מדריך", Icon: BookOpen },
  { id: "account", label: "החשבון שלי", Icon: Fingerprint },
];
export function OfflineWorkspace() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [view, setView] = useState("expenses");
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  useEffect(() => {
    const load = async (initial = false) => {
      try { const profile = await activeProfile(); if (initial) {
          const requested = new URLSearchParams(location.search).get("view");
          setView(views.some((item) => item.id === requested) ? requested! : requested === "household" ? "account" : "expenses");
        } setSnapshot(profile ? await loadSnapshot(profile.id) ?? null : null); }
      catch { setSnapshot(null); }
      finally { setLoaded(true); }
    };
    const changed = () => { void load(); };
    void load(true); window.addEventListener(offlineChanged, changed);
    return () => window.removeEventListener(offlineChanged, changed);
  }, []);
  if (!loaded) return <main className="offline-arrival"><p role="status">טוענים את הנתונים השמורים במכשיר…</p></main>;
  if (!snapshot) return <main className="offline-arrival"><h1>נדרש חיבור ראשון</h1><p>התחברו לאפליקציה עם חיבור זמין כדי לשמור נתונים לעבודה ללא חיבור.</p><a className="primary" href="/login">כניסה</a></main>;
  const expenses = snapshot.expenses.filter((item) => item.merchant.includes(search) && (!category || item.category_id === category));
  const categories = new Map(snapshot.categories.map((item) => [item.id, item.name]));
  function navigate(id: string) {
    setView(id); setCategory(""); setSearch(""); history.replaceState(null, "", "/offline?view=" + id);
    window.scrollTo({ top: 0 });
  }
  return <div className="app-shell offline-shell">
    <aside className="sidebar"><a href="/offline?view=overview" className="brand"><span className="brand-icon"><BrandMark /></span>משק 48</a><p className="sidebar-label">נתונים שמורים במכשיר</p>
      <nav aria-label="ניווט ללא חיבור">{views.map(({ id, label, Icon }) => <button type="button" key={id} className={`nav-link ${view === id ? "active" : ""}`} onClick={() => navigate(id)}><Icon size={18} />{label}</button>)}</nav>
    </aside>
    <main className="dashboard">
      <header className="topbar"><a href="/expenses" data-reconnect className="text-button">חזרה לנתונים העדכניים</a><span>משק 48</span></header>
      <section className="page-heading"><div><p className="eyebrow">עבודה ללא חיבור</p><h1>{views.find((item) => item.id === view)?.label ?? "הוצאות"}</h1><p className="muted">הנתונים שנשמרו במכשיר · {new Date(snapshot.saved_at).toLocaleString("he-IL")} · ייתכן שהרשימה חלקית.</p></div>
      {(view === "overview" || view === "expenses") && snapshot.profile.role !== "read_only" && <ExpenseForm categories={snapshot.categories} merchants={snapshot.expenses.map((item) => item.merchant)} />}</section>
      {view === "overview" && <section className="offline-cards">{["ILS", "USD", "EUR", "GBP"].filter((currency) => expenses.some((item) => item.currency === currency)).map((currency) => <article className="offline-expense" key={currency}><p>סה״כ בהוצאות השמורות במכשיר</p><h2><bdi>{money(expenses.filter((item) => item.currency === currency).reduce((sum, item) => sum + Number(item.amount), 0), currency)}</bdi></h2></article>)}</section>}
      {view === "categories" && <section className="offline-cards">{snapshot.categories.map((item) => <button type="button" className="offline-expense" key={item.id} onClick={() => { setView("expenses"); setCategory(item.id); }}><strong>{item.name}</strong><p>{snapshot.expenses.filter((expense) => expense.category_id === item.id).length} הוצאות שמורות</p></button>)}</section>}
      {(view === "expenses" || view === "overview") && <section className="offline-ledger">
        <div className="form-grid"><label>חיפוש ספק<input value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>קטגוריה<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">כל הקטגוריות</option>{snapshot.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <div className="offline-cards">{expenses.map((expense) => <article key={expense.id} className="offline-expense"><header><h2>{expense.merchant}</h2>{snapshot.profile.role !== "read_only" && (snapshot.profile.role === "admin" || expense.created_by === snapshot.profile.id) && <ExpenseForm expense={expense} categories={snapshot.categories} />}</header><strong><bdi>{money(Number(expense.amount), expense.currency)}</bdi></strong><p>{expense.spent_on} · {categories.get(expense.category_id)} · {paymentStatuses[expense.payment_status]}</p>{expense.notes && <details><summary>הערות</summary><p>{expense.notes}</p></details>}</article>)}</div>
        {!expenses.length && <p className="muted">אין הוצאות שמורות שמתאימות לסינון. אפשר להוסיף טיוטה חדשה.</p>}
      </section>}
      {view === "guide" && <RenovationGuide />}
      {view === "account" && <article className="offline-expense"><h2>החשבון שלי</h2><p><bdi>{snapshot.profile.email}</bdi></p><p>{snapshot.profile.role === "read_only" ? "הרשאת צפייה בלבד" : "הרשאת עריכת הוצאות"}</p><p className="muted">כניסה, שינוי הרשאות ומפתחות גישה דורשים חיבור. הטיוטות מוצגות בתחתית המסך.</p></article>}
      <footer className="dashboard-footer"><span>משק 48 · נתונים שמורים במכשיר</span></footer>
    </main>
  </div>;
}
