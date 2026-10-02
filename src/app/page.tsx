import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { OfflineSnapshot } from "@/components/offline-snapshot";
import { BrandMark } from "@/components/brand-mark";
import { CategoryManager } from "@/components/category-manager";
import { ExportPanel } from "@/components/export-panel";
import { ExpenseForm } from "@/components/expense-form";
import { categoryColor } from "@/lib/design";
import { RenovationGuide } from "@/components/guide";
import { ExpenseTable } from "@/components/expense-table";
import { AppLink } from "@/components/app-link";
import { redirect } from "next/navigation";
import {
  ReceiptText,
  LogOut,
  ArrowUpRight,
  Search,
  Paperclip,
  Wallet,
  Tags,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { requireMember } from "@/lib/auth";
import { AccessManagement } from "@/components/access-management";
import { enrichAccessMembers } from "@/lib/access-server";
import { logout } from "./actions";
import { money, type Category, type Expense, type ExpenseReceipt } from "@/lib/expenses";
import { AccountPasskeys } from "@/components/account-passkeys";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
  section = "overview",
  category: routeCategory = "",
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  section?: "overview" | "expenses" | "guide" | "categories" | "category" | "household" | "account";
  category?: string;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/login");
  const { supabase, user, member } = await requireMember();
  if (section === "household" && member.role !== "admin") redirect("/");
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const requestedMonth = value("month");
  const month =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) &&
    Number(requestedMonth.slice(0, 4)) >= 2000 &&
    Number(requestedMonth.slice(0, 4)) <= 2100
      ? requestedMonth
      : "";
  const [year, m] = month.split("-").map(Number);
  const end = month
    ? new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10)
    : "";
  const categoryId = routeCategory || value("category");
  const search = value("q").trim().slice(0, 100);
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(value("page"))) || 1),
  );
  const monthLabel = month
    ? new Date(`${month}-02T12:00:00Z`).toLocaleDateString("he-IL", {
        month: "long",
        year: "numeric",
      })
    : "הפרויקט כולו";
  const needsExpenses = section === "expenses" || section === "category";
  const needsCategories = needsExpenses || section === "overview" || section === "categories";
  let query = supabase
    .from("expenses")
    .select("*,expense_receipts(id,expense_id)", { count: "exact" })
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (month) query = query.gte("spent_on", `${month}-01`).lt("spent_on", end);
  if (/^[0-9a-f-]{36}$/.test(categoryId))
    query = query.eq("category_id", categoryId);
  if (search)
    query = query.ilike("merchant", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const [categoryResult, expensesResult, summaryResult, membersResult] =
    await Promise.all([
      needsCategories
        ? supabase.from("categories").select("*").order("name")
        : Promise.resolve({ data: [], error: null }),
      needsExpenses
        ? query.range((page - 1) * 25, page * 25 - 1)
        : Promise.resolve({ data: [], count: 0, error: null }),
      section === "overview" ? supabase.rpc(
        "monthly_summary",
        month ? { month_start: `${month}-01` } : {},
      ) : Promise.resolve({ data: [], error: null }),
      section === "household" && member.role === "admin"
        ? supabase.from("members").select("*").order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
  const access = section === "household" && member.role === "admin"
    ? await enrichAccessMembers(membersResult.data ?? []) : null;
  const categories: Category[] = (categoryResult.data ?? []).map(
    (category) => ({
      ...category,
      color: /^#[\da-f]{6}$/i.test(category.color)
        ? category.color
        : categoryColor(category.name),
    }),
  );
  const receiptsByExpense = new Map<string, Pick<ExpenseReceipt, "id" | "expense_id">[]>();
  const expenses = (expensesResult.data ?? []).map(({ expense_receipts, ...expense }) => {
    receiptsByExpense.set(expense.id, expense_receipts ?? []);
    return expense as Expense;
  });
  const merchants = [...new Set(expenses.map((expense) => expense.merchant))];
  const summary = (summaryResult.data ?? []) as {
    currency: string;
    category_id: string;
    total: number;
    paid_total: number;
    outstanding_total: number;
    planned_total: number;
    expense_count: number;
    receipt_count: number;
  }[];
  const totals = new Map<string, number>();
  summary.forEach((r) =>
    totals.set(r.currency, (totals.get(r.currency) ?? 0) + Number(r.total)),
  );
  const paid = summary
    .filter((r) => r.currency === "ILS")
    .reduce((a, r) => a + Number(r.paid_total), 0);
  const outstanding = summary
    .filter((r) => r.currency === "ILS")
    .reduce((a, r) => a + Number(r.outstanding_total), 0);
  const planned = summary
    .filter((r) => r.currency === "ILS")
    .reduce((a, r) => a + Number(r.planned_total), 0);
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const categoryTotals = categories
    .map((c) => ({
      ...c,
      total: summary
        .filter(
          (r) =>
            r.category_id === c.id &&
            r.currency ===
              (totals.has("ILS") ? "ILS" : totals.keys().next().value),
        )
        .reduce((a, r) => a + Number(r.total), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const chartTotal = categoryTotals.reduce((a, c) => a + c.total, 0);
  const gradient = categoryTotals
    .map((c, i) => {
      const start =
        (categoryTotals.slice(0, i).reduce((a, item) => a + item.total, 0) /
          chartTotal) *
        100;
      return `${c.color} ${start}% ${start + (c.total / chartTotal) * 100}%`;
    })
    .join(",");
  const ledgerPath = section === "category" ? `/categories/${categoryId}` : "/expenses";
  const pageLink = (p: number) =>
    `${ledgerPath}?${new URLSearchParams({ month, category: categoryId, q: search, page: String(p) })}`;
  const resetMonthLink = section === "overview" ? "/" : `${ledgerPath}?${new URLSearchParams({ category: categoryId, q: search })}`;
  const failed =
    categoryResult.error || expensesResult.error || summaryResult.error;
  const canWrite = member.role !== "read_only";
  return (
    <div className="app-shell">
      <OfflineSnapshot snapshot={{ profile: { id: user.id, email: user.email, role: member.role }, categories, expenses, ledger: needsExpenses && !expensesResult.error, saved_at: new Date().toISOString() }} />
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הפרויקט
      </a>
      <aside className="sidebar">
        <AppLink href="/" className="brand">
          <span className="brand-icon">
            <BrandMark />
          </span>
          משק 48
        </AppLink>
        <p className="sidebar-label">פרויקט השיפוץ</p>
        <WorkspaceNavigation role={member.role} />
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">
              {member.email.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{member.email.split("@")[0]}</strong>
              <small>
                {member.role === "admin"
                  ? "מנהל הפרויקט"
                  : member.role === "read_only"
                    ? "צפייה בלבד"
                    : "צפייה ועריכה"}
              </small>
            </div>
            <form action={logout}>
              <button className="icon-button" aria-label="יציאה">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="dashboard" id="main-content" tabIndex={-1}>
        {(section === "overview" || section === "categories") && <section className="page-heading">
          <h1>{section === "categories" ? "קטגוריות" : "סקירה"}</h1>
          {section === "overview" && canWrite && <ExpenseForm categories={categories} merchants={merchants} />}
        </section>}
        {section === "categories" && <CategoryManager categories={categories} canManage={member.role === "admin"} />}
        {section !== "guide" && section !== "categories" && section !== "household" && section !== "account" && <>
        {section !== "overview" && section !== "category" && <div className="route-heading"><h1>הוצאות</h1></div>}
        {section === "category" && <div className="route-heading"><p className="eyebrow"><AppLink href="/categories">קטגוריות</AppLink> · קטגוריה</p><h1>{categoryMap.get(categoryId)?.name ?? "הוצאות"}</h1></div>}
        <div className="period-bar">
          <h2>
            {section === "overview" ? "סקירה" : section === "category" ? categoryMap.get(categoryId)?.name ?? "קטגוריה" : "הוצאות ותשלומים"} <span>/</span> <span className="muted">{monthLabel}</span>
          </h2>
          <form>
            {needsExpenses && <><input type="hidden" name="q" value={search} />{section === "expenses" && <input type="hidden" name="category" value={categoryId} />}</>}
            <label className="sr-only" htmlFor="overview-month">
              סינון לפי חודש
            </label>
            <input
              id="overview-month"
              name="month"
              type="month"
              defaultValue={month}
              min="2000-01"
              max="2100-12"
            />
            <button className="secondary">הצגה</button>
            {month && (
              <AppLink className="text-button" href={resetMonthLink}>
                כל התאריכים
              </AppLink>
            )}
          </form>
        </div>
        {failed && (
          <p className="message error" role="alert">
            לא ניתן לטעון את ההוצאות כרגע. נסו לרענן.
          </p>
        )}
        {section === "overview" && <section className="stats-grid">
          <article className="stat-card spending-card">
            <div className="stat-label">
              סך העלויות הרשומות
              <Wallet size={18} />
            </div>
            <div className="stat-value">
              {totals.size
                ? [...totals].map(([currency, total]) => (
                    <div key={currency}>{money(total, currency)}</div>
                  ))
                : money(0, "ILS")}
            </div>
            <span className="stat-caption">
              שולם + לתשלום + אומדנים · בלי המרות מטבע
            </span>
          </article>
          <article className="stat-card">
            <div className="stat-label">
              שולם בפועל
              <ReceiptText size={18} />
            </div>
            <div className="stat-value">{money(paid, "ILS")}</div>
            <span className="stat-caption">תשלומים שכבר בוצעו בש״ח</span>
          </article>
          <article className="stat-card">
            <div className="stat-label">
              ממתין לתשלום
              <Paperclip size={18} />
            </div>
            <div className="stat-value">{money(outstanding, "ILS")}</div>
            <span className="stat-caption">
              בש״ח · אומדנים נוספים: {money(planned, "ILS")}
            </span>
          </article>
        </section>}
        {section === "overview" && <section className="breakdown">
          <div className="breakdown-copy">
            <span className="section-icon">
              <Tags size={18} />
            </span>
            <h2>עלויות לפי קטגוריה</h2>
            <span className="subtle-tag">
              {totals.has("ILS")
                ? "ILS"
                : (totals.keys().next().value ?? "ILS")}{" "}
              · {monthLabel}
            </span>
            <AppLink className="text-button breakdown-link" href="/categories">לכל הקטגוריות וההוצאות <ArrowUpRight size={15} /></AppLink>
          </div>
          <div className="chart-area">
            <div
              className="donut"
              style={{
                background: gradient
                  ? `conic-gradient(${gradient})`
                  : "#e5dccd",
              }}
            >
              <div>
                <strong>{categoryTotals.length}</strong>
                <span>קטגוריות</span>
              </div>
            </div>
            <div className="legend">
              {categoryTotals.length ? (
                categoryTotals.map((c) => (
                  <AppLink key={c.id} href={`/categories/${c.id}`}>
                    <span
                      className="legend-dot"
                      style={{ background: c.color }}
                    />
                    <span>{c.name}</span>
                    <strong>{Math.round((c.total / chartTotal) * 100)}%</strong>
                  </AppLink>
                ))
              ) : (
                <p className="muted">
                  אין הוצאות להצגה
                </p>
              )}
            </div>
          </div>
        </section>}
        {(section === "expenses" || section === "category") && <section className="ledger" id="ledger">
          <div className="section-heading">
            <div>
              <h2>רשימת הוצאות</h2>
            </div>
            <div className="section-heading-actions"><span className="count-tag">
              {expensesResult.count ?? 0} הוצאות
            </span>{canWrite && <ExpenseForm categories={categories} merchants={merchants} />}</div>
          </div>
          <ExportPanel key={`${month}:${categoryId}:${search}`} categories={categories} filters={{ from: month ? `${month}-01` : "", to: month ? new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10) : "", category: categoryId, q: search }} />
          <form className="filters">
            <div className="search-input">
              <Search size={17} />
              <label className="sr-only" htmlFor="search">
                חיפוש ספקים ורשויות
              </label>
              <input
                id="search"
                name="q"
                placeholder="חיפוש ספק, קבלן או רשות…"
                defaultValue={search}
              />
            </div>
            <input type="hidden" name="month" value={month} />
            {section === "expenses" && <><label className="sr-only" htmlFor="category">
              סינון קטגוריות
            </label>
            <select id="category" name="category" defaultValue={categoryId}>
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select></>}
            <button className="secondary">סינון</button>
            {(search || (section === "expenses" && categoryId)) && (
              <AppLink className="text-button" href={`${ledgerPath}?${new URLSearchParams({ month })}`}>
                ניקוי
              </AppLink>
            )}
          </form>
          <ExpenseTable expenses={expenses} categories={categories} receiptsByExpense={receiptsByExpense} role={member.role} owner={user.id} emptyState={!failed && (
            <div className="empty-state">
              <span className="empty-icon">
                <ReceiptText size={28} />
              </span>
              <h3>
                {search || categoryId
                  ? "לא נמצאו הוצאות מתאימות."
                  : "אין הוצאות להצגה"}
              </h3>
              {(search || categoryId) && <p className="muted">נסו חיפוש או קטגוריה אחרים.</p>}
            </div>
          )} />
          <div className="table-footer">
            <span>
              מציג {expenses.length ? (page - 1) * 25 + 1 : 0}–
              {(page - 1) * 25 + expenses.length} מתוך{" "}
              {expensesResult.count ?? 0}
            </span>
            <div>
              {page > 1 && (
                <AppLink
                  className="icon-button"
                  href={pageLink(page - 1)}
                  ariaLabel="העמוד הקודם"
                >
                  <ChevronLeft size={17} />
                </AppLink>
              )}
              {page * 25 < (expensesResult.count ?? 0) && (
                <AppLink
                  className="icon-button"
                  href={pageLink(page + 1)}
                  ariaLabel="העמוד הבא"
                >
                  <ChevronRight size={17} />
                </AppLink>
              )}
            </div>
          </div>
        </section>}
        </>}
        {access && <AccessManagement members={access.members} currentEmail={member.email} statusAvailable={access.statusAvailable} loadError={"error" in membersResult && !!membersResult.error} />}
        {section === "guide" && <RenovationGuide />}
        {section === "account" && <div className="account-content">
          <div className="route-heading account-heading">
            <h1>החשבון שלי</h1>
          </div>
          <AccountPasskeys />
        </div>}
        <footer className="dashboard-footer">
          משק 48
          <a href="https://house.arbibe.dev" target="_blank" rel="noopener noreferrer">לפרויקט הבית <ArrowUpRight size={14} /></a>
        </footer>
      </main>
    </div>
  );
}
