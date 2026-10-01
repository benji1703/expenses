import { BrandMark } from "@/components/brand-mark";
import { categoryColor } from "@/lib/design";
import { RenovationGuide } from "@/components/guide";
import { stages, paymentStatuses } from "@/lib/renovation-guide";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Sprout,
  LayoutDashboard,
  ReceiptText,
  Users,
  LogOut,
  ArrowUpRight,
  Search,
  Paperclip,
  Wallet,
  Tags,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { requireMember } from "@/lib/auth";
import {
  ExpenseForm,
  DeleteExpense,
  InviteForm,
  MemberAccess,
} from "@/components/forms";
import { logout } from "./actions";
import { money, type Category, type Expense } from "@/lib/expenses";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
  section = "overview",
  category: routeCategory = "",
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  section?: "overview" | "expenses" | "guide" | "categories" | "category" | "household";
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
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (month) query = query.gte("spent_on", `${month}-01`).lt("spent_on", end);
  if (/^[0-9a-f-]{36}$/.test(categoryId))
    query = query.eq("category_id", categoryId);
  if (search)
    query = query.ilike("merchant", `%${search.replace(/[%_\\]/g, "\\$&")}%`);
  const [categoryResult, expensesResult, summaryResult, membersResult] =
    await Promise.all([
      supabase.from("categories").select("*").order("name"),
      query.range((page - 1) * 25, page * 25 - 1),
      supabase.rpc(
        "monthly_summary",
        month ? { month_start: `${month}-01` } : {},
      ),
      member.role === "admin"
        ? supabase.from("members").select("*").order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
  const categories: Category[] = (categoryResult.data ?? []).map(
    (category) => ({ ...category, color: categoryColor(category.name) }),
  );
  const expenses = (expensesResult.data ?? []) as Expense[];
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
  const pageLink = (p: number) =>
    `${section === "category" ? `/categories/${categoryId}` : "/expenses"}?${new URLSearchParams({ month, category: categoryId, q: search, page: String(p) })}`;
  const failed =
    categoryResult.error || expensesResult.error || summaryResult.error;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הפרויקט
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <BrandMark />
          </span>
          משק 48
        </Link>
        <p className="sidebar-label">פרויקט השיפוץ</p>
        <nav aria-label="ניווט ראשי">
          <Link className={`nav-link ${section === "overview" ? "active" : ""}`} href="/">
            <LayoutDashboard size={18} />
            סקירה
          </Link>
          <Link className={`nav-link ${section === "expenses" ? "active" : ""}`} href="/expenses">
            <ReceiptText size={18} />
            הוצאות
          </Link>
          <Link className={`nav-link ${section === "categories" || section === "category" ? "active" : ""}`} href="/categories">
            <Tags size={18} />
            קטגוריות
          </Link>
          <Link className={`nav-link ${section === "guide" ? "active" : ""}`} href="/guide">
            <BookOpen size={18} />
            מדריך
          </Link>
          {member.role === "admin" && (
            <Link className={`nav-link ${section === "household" ? "active" : ""}`} href="/household">
              <Users size={18} />
              גישה
            </Link>
          )}
          <a className="nav-link house-link" href="https://house.arbibe.dev" target="_blank" rel="noopener noreferrer">
            <ArrowUpRight size={18} />
            אתר הבית
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <span className="small-leaf">
              <Sprout size={20} />
            </span>
            <strong>מסמכי הפרויקט</strong>
            <p>
              הוצאות, קבלות ודרישות תשלום.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {member.email.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{member.email.split("@")[0]}</strong>
              <small>
                {member.role === "admin" ? "מנהל הפרויקט" : "חבר בפרויקט"}
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
        <header className="topbar">
          <Link href="https://house.arbibe.dev" target="_blank" rel="noopener noreferrer">אתר הבית <ArrowUpRight size={13} /></Link>
          <span className="household-tag">
            <span />
            נחלה · בית חנניה
          </span>
        </header>
        {(section === "overview" || section === "categories") && <section className="page-heading">
          <div>
            <p className="eyebrow">משק 48 · בית חנניה</p>
            <h1>{section === "categories" ? <>הוצאות לפי תחום</> : <>תקציב השיפוץ של משק 48</>}</h1>
            <p className="muted">
              מעקב אחר תשלומי רמ״י, תכנון, רישוי, קבלנים וחומרי בנייה.
            </p>
          </div>
          <ExpenseForm categories={categories} />
        </section>}
        {section === "categories" && <section className="category-directory" aria-label="קטגוריות הוצאות">
          {categories.map((c) => {
            const item = categoryTotals.find((entry) => entry.id === c.id);
            return <Link key={c.id} href={`/categories/${c.id}`} className="category-card">
              <span className="legend-dot" style={{ background: c.color }} />
              <span><strong>{c.name}</strong><small>{item ? money(item.total, totals.has("ILS") ? "ILS" : (totals.keys().next().value ?? "ILS")) : "עוד אין הוצאות"}</small></span>
              <ArrowUpRight size={17} />
            </Link>;
          })}
        </section>}
        {section !== "guide" && section !== "categories" && section !== "household" && <>
        {section !== "overview" && section !== "category" && <div className="route-heading"><p className="eyebrow">פרויקט השיפוץ · בית חנניה</p><h1>{section === "expenses" ? <>הוצאות ותשלומים<span>.</span></> : null}</h1><p className="muted">כל הדרישות, הקבלות והאומדנים במקום אחד.</p></div>}
        {section === "category" && <div className="route-heading"><p className="eyebrow"><Link href="/categories">קטגוריות</Link> · קטגוריה</p><h1>{categoryMap.get(categoryId)?.name ?? "הוצאות"}<span>.</span></h1><p className="muted">הוצאות, תשלומים ואסמכתאות בתחום זה.</p></div>}
        <div className="period-bar">
          <h2>
            {section === "overview" ? "סקירה" : section === "category" ? categoryMap.get(categoryId)?.name ?? "קטגוריה" : "הוצאות ותשלומים"} <span>/</span> <span className="muted">{monthLabel}</span>
          </h2>
          <form>
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
              <Link className="text-button" href="/">
                כל הפרויקט
              </Link>
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
            <h2>לאן הולך תקציב השיפוץ?</h2>
            <p className="muted">
              מהסדרת הזכויות ועד גמרים ותשתיות.
              <br />
              עלויות לפי קטגוריה, כולל אומדנים.
            </p>
            <span className="subtle-tag">
              {totals.has("ILS")
                ? "ILS"
                : (totals.keys().next().value ?? "ILS")}{" "}
              · {monthLabel}
            </span>
            <Link className="text-button breakdown-link" href="/categories">לכל הקטגוריות וההוצאות <ArrowUpRight size={15} /></Link>
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
                  <Link key={c.id} href={`/categories/${c.id}`}>
                    <span
                      className="legend-dot"
                      style={{ background: c.color }}
                    />
                    <span>{c.name}</span>
                    <strong>{Math.round((c.total / chartTotal) * 100)}%</strong>
                  </Link>
                ))
              ) : (
                <p className="muted">
                  ההוצאה הראשונה
                  <br />
                  תתחיל את התמונה.
                </p>
              )}
            </div>
          </div>
        </section>}
        {(section === "expenses" || section === "category") && <section className="ledger" id="ledger">
          <div className="section-heading">
            <div>
              <h2>יומן ההוצאות של הנחלה</h2>
              <p className="muted">
                דרישות תשלום, חשבוניות, קבלות ואומדנים — יחד.
              </p>
            </div>
            <span className="count-tag">
              {expensesResult.count ?? 0} הוצאות
            </span>
          </div>
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
            <label className="sr-only" htmlFor="category">
              סינון קטגוריות
            </label>
            <select id="category" name="category" defaultValue={categoryId}>
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="secondary">סינון</button>
            {(search || categoryId) && (
              <Link className="text-button" href={`/?month=${month}#ledger`}>
                ניקוי
              </Link>
            )}
          </form>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ספק / רשות</th>
                  <th>קטגוריה</th>
                  <th>תאריך</th>
                  <th>סטטוס</th>
                  <th>אסמכתה</th>
                  <th className="align-right">סכום</th>
                  <th>
                    <span className="sr-only">פעולות</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const category = categoryMap.get(e.category_id);
                  return (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.merchant}</strong>
                        <small className="expense-note">
                          {stages[e.stage]}
                          {e.reference ? ` · ${e.reference}` : ""}
                        </small>
                        {e.notes && (
                          <small className="expense-note" title={e.notes}>
                            {e.notes}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="category-badge">
                          <span style={{ background: category?.color }} />
                          {category?.name}
                        </span>
                      </td>
                      <td className="date-cell">
                        {new Date(`${e.spent_on}T12:00:00Z`).toLocaleDateString(
                          "he-IL",
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td>
                        <span className={`payment-badge ${e.payment_status}`}>
                          {paymentStatuses[e.payment_status]}
                        </span>
                        {e.due_on && (
                          <small className="expense-note">
                            לתשלום עד{" "}
                            {new Date(
                              `${e.due_on}T12:00:00Z`,
                            ).toLocaleDateString("he-IL")}
                          </small>
                        )}
                      </td>
                      <td>
                        {e.receipt_path ? (
                          <a
                            className="receipt-link"
                            href={`/receipts/${e.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Paperclip size={14} />
                            הצגה
                            <ArrowUpRight size={13} />
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="align-right amount-cell">
                        {money(Number(e.amount), e.currency)}
                      </td>
                      <td>
                        {(e.created_by === user.id ||
                          member.role === "admin") && (
                          <div className="row-actions">
                            <ExpenseForm categories={categories} expense={e} />
                            <DeleteExpense expense={e} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!expenses.length && !failed && (
            <div className="empty-state">
              <span className="empty-icon">
                <ReceiptText size={28} />
              </span>
              <h3>
                {search || categoryId
                  ? "לא נמצאו הוצאות מתאימות."
                  : "הפרויקט מתחיל כאן."}
              </h3>
              <p className="muted">
                {search || categoryId
                  ? "נסו חיפוש או קטגוריה אחרים."
                  : "הוסיפו דרישת תשלום, חשבונית או אומדן ראשון לנחלה."}
              </p>
              {!search && !categoryId && (
                <ExpenseForm categories={categories} />
              )}
            </div>
          )}
          <div className="table-footer">
            <span>
              מציג {expenses.length ? (page - 1) * 25 + 1 : 0}–
              {(page - 1) * 25 + expenses.length} מתוך{" "}
              {expensesResult.count ?? 0}
            </span>
            <div>
              {page > 1 && (
                <Link
                  className="icon-button"
                  href={pageLink(page - 1)}
                  aria-label="העמוד הקודם"
                >
                  <ChevronLeft size={17} />
                </Link>
              )}
              {page * 25 < (expensesResult.count ?? 0) && (
                <Link
                  className="icon-button"
                  href={pageLink(page + 1)}
                  aria-label="העמוד הבא"
                >
                  <ChevronRight size={17} />
                </Link>
              )}
            </div>
            <span>עודכנו לפי התאריך והסכום.</span>
          </div>
        </section>}
        </>}
        {member.role === "admin" && (section === "expenses" || section === "household") && (
          <section className="household-section" id="household">
            <div>
              <h2>הפרויקט שלנו, יחד.</h2>
              <p className="muted">
                רק כתובות שאושרו יכולות לצפות בהוצאות ובמסמכים.
              </p>
              <div className="members-list">
                {membersResult.data?.map((person) => (
                  <div key={person.email}>
                    <span className="avatar small">
                      {person.email[0].toUpperCase()}
                    </span>
                    <div>
                      <strong>{person.email}</strong>
                      <small>
                        {person.role === "admin" ? "מנהל" : "חבר"} ·{" "}
                        {person.active ? "גישה פעילה" : "הגישה בוטלה"}
                      </small>
                    </div>
                    {person.role !== "admin" && (
                      <MemberAccess
                        email={person.email}
                        active={person.active}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <InviteForm />
          </section>
        )}
        {section === "guide" && <RenovationGuide />}
        <footer className="dashboard-footer">
          <Sprout size={16} />
          משק 48 · בית חנניה
          <span>ניהול תקציב, הוצאות ומסמכי השיפוץ · גישה למוזמנים בלבד</span>
          <a href="https://house.arbibe.dev" target="_blank" rel="noopener noreferrer">לפרויקט הבית <ArrowUpRight size={14} /></a>
        </footer>
      </main>
    </div>
  );
}
