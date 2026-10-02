"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { AppLink } from "@/components/app-link";
import { ExpenseForm } from "@/components/expense-form";
import { ExpenseTable } from "@/components/expense-table";
import { CategoryManager } from "@/components/category-manager";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { RenovationGuide } from "@/components/guide";
import { activeProfile, listDrafts, loadSnapshot, offlineChanged } from "@/lib/offline-store";
import { markConnection } from "@/lib/connection-state";
import { localNavigation, workspaceRoute } from "@/lib/workspace-navigation";
import Loading from "@/app/loading";
import type { OfflineSnapshot, PendingExpense } from "@/lib/offline-types";
import { money } from "@/lib/expenses";
import { filterLocalLedger, localLedger } from "@/lib/local-ledger";
import { Search, Wallet } from "lucide-react";

export function OfflineWorkspace({ shell = false }: { shell?: boolean }) {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [drafts, setDrafts] = useState<PendingExpense[]>([]);
  const [path, setPath] = useState("/expenses");
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [month, setMonth] = useState("");
  useEffect(() => {
    let current = true;
    const readRoute = () => {
      const url = new URL(location.href);
      const requestedPath = workspaceRoute(url.pathname) ? url.pathname : "/expenses";
      setPath(requestedPath);
      setSearch(url.searchParams.get("q") ?? "");
      setCategory(requestedPath.startsWith("/categories/") ? requestedPath.split("/")[2] : url.searchParams.get("category") ?? "");
      setMonth(url.searchParams.get("month") ?? "");
    };
    const load = async (initial = false) => {
      try {
        const profile = await activeProfile();
        const data = profile ? await loadSnapshot(profile.id) : null;
        const pending = profile ? await listDrafts(profile.id) : [];
        if (current) {
          if (initial) {
            readRoute();
          }
          setSnapshot(data ?? null); setDrafts(pending);
        }
      } catch { if (current) setSnapshot(null); }
      finally { if (current) setLoaded(true); }
    };
    if (shell) markConnection(false);
    const changed = () => { void load(); };
    void load(true); window.addEventListener(offlineChanged, changed);
    window.addEventListener(localNavigation, readRoute); window.addEventListener("popstate", readRoute);
    return () => { current = false; window.removeEventListener(offlineChanged, changed); window.removeEventListener(localNavigation, readRoute); window.removeEventListener("popstate", readRoute); };
  }, [shell]);
  useEffect(() => {
    if (!shell) return;
    let busy = false, current = true;
    const reconnect = async () => {
      if (!navigator.onLine || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const response = await fetch("/api/offline/expenses", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (response.ok && current) {
          markConnection(true);
          // The shell's Next router describes /offline; reload the real URL to
          // restore authenticated rendering after the server is reachable.
          location.replace(workspaceRoute(location.pathname) ? location.href : "/expenses");
        } else if (response.status === 401 && current) location.replace("/login");
      } catch { /* Keep working locally until the server answers. */ }
      finally { busy = false; }
    };
    window.addEventListener("online", reconnect); window.addEventListener("focus", reconnect);
    const interval = window.setInterval(reconnect, 30_000);
    return () => { current = false; window.clearInterval(interval); window.removeEventListener("online", reconnect); window.removeEventListener("focus", reconnect); };
  }, [shell]);
  if (!loaded) return <Loading />;
  if (!snapshot) return <main className="offline-arrival"><h1>אין נתונים שמורים</h1><p>נדרש חיבור ראשון לחשבון.</p><a className="primary" href="/login">כניסה</a></main>;
  const route = workspaceRoute(path)!;
  const view = route.icon;
  const categoryPage = path.startsWith("/categories/");
  const writable = snapshot.profile.role !== "read_only";
  const expenses = filterLocalLedger(localLedger(snapshot.expenses, drafts), new URL(path + "?" + new URLSearchParams({ q: search, category, month }), "https://local.invalid"));
  const ledger = view === "expenses" || categoryPage;
  const title = categoryPage ? snapshot.categories.find((item) => item.id === category)?.name ?? "קטגוריה" : route.label;
  const merchants = [...new Set(snapshot.expenses.map((item) => item.merchant))];
  return <div className="app-shell" data-cached-workspace>
    <a className="skip-link" href="#main-content">דילוג לתוכן</a>
    <aside className="sidebar"><AppLink href="/" className="brand"><span className="brand-icon"><BrandMark /></span>משק 48</AppLink><p className="sidebar-label">פרויקט השיפוץ</p>
      <WorkspaceNavigation path={path} role={snapshot.profile.role} />
      <div className="sidebar-bottom"><div className="profile"><span className="avatar">{snapshot.profile.email.slice(0, 1).toUpperCase()}</span><div><strong>{snapshot.profile.email.split("@")[0]}</strong><small>{snapshot.profile.role === "admin" ? "מנהל הפרויקט" : writable ? "צפייה ועריכה" : "צפייה בלבד"}</small></div></div></div>
    </aside>
    <main className="dashboard" id="main-content" tabIndex={-1}>
      <section className="page-heading"><h1>{title}</h1>{(ledger || view === "overview") && writable && <ExpenseForm categories={snapshot.categories} merchants={merchants} />}</section>
      <p className="cached-data-note">נתונים שמורים · {new Date(snapshot.saved_at).toLocaleString("he-IL")} · רשימה חלקית</p>
      {(ledger || view === "overview") && <div className="period-bar"><h2>{month || "כל התאריכים"}</h2><form key={path + month} data-offline-safe="true"><label className="sr-only" htmlFor="offline-month">חודש</label><input id="offline-month" type="month" name="month" defaultValue={month} /><button className="secondary">הצגה</button></form></div>}
      {view === "overview" && <section className="stats-grid">{["ILS", "USD", "EUR", "GBP"].filter((currency) => expenses.some((item) => item.currency === currency)).map((currency) => <article className="stat-card spending-card" key={currency}><div className="stat-label">סך העלויות השמורות<Wallet size={18} /></div><div className="stat-value"><bdi>{money(expenses.filter((item) => item.currency === currency).reduce((sum, item) => sum + Number(item.amount), 0), currency)}</bdi></div></article>)}</section>}
      {view === "categories" && !categoryPage && <CategoryManager categories={snapshot.categories} canManage={snapshot.profile.role === "admin"} offline />}
      {ledger && <section className="ledger" id="ledger">
        <div className="section-heading"><h2>הוצאות</h2><span className="count-tag">{expenses.length} הוצאות</span></div>
        <form key={path + search + category + month} className="filters" data-offline-safe="true"><div className="search-input"><Search size={17} /><label className="sr-only" htmlFor="offline-search">חיפוש ספק</label><input id="offline-search" name="q" placeholder="חיפוש ספק…" defaultValue={search} /></div><input type="hidden" name="month" value={month} /><label className="sr-only" htmlFor="offline-category">קטגוריה</label><select id="offline-category" name="category" defaultValue={category}><option value="">כל הקטגוריות</option>{snapshot.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary">סינון</button></form>
        <ExpenseTable expenses={expenses} categories={snapshot.categories} role={snapshot.profile.role} owner={snapshot.profile.id} offline emptyState={<div className="empty-state"><h3>אין הוצאות להצגה</h3>{writable && <ExpenseForm categories={snapshot.categories} merchants={merchants} />}</div>} />
      </section>}
      {view === "guide" && <RenovationGuide />}
      {view === "account" && <section className="passkey-card"><h2>החשבון שלי</h2><p><bdi>{snapshot.profile.email}</bdi></p><p className="muted">ניהול אמצעי כניסה דורש חיבור.</p></section>}
      {view === "household" && <section className="household-section"><h2>גישה</h2><p className="muted">ניהול הרשאות דורש חיבור.</p></section>}
      <footer className="dashboard-footer">משק 48<a href="https://house.arbibe.dev" target="_blank" rel="noopener noreferrer">לפרויקט הבית</a></footer>
    </main>
  </div>;
}
