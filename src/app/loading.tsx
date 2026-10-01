import { BrandMark } from "@/components/brand-mark";
import { BookOpen, Fingerprint, LayoutDashboard, ReceiptText, Tags, Users } from "lucide-react";

const navigation = [
  { label: "סקירה", Icon: LayoutDashboard },
  { label: "הוצאות", Icon: ReceiptText },
  { label: "קטגוריות", Icon: Tags },
  { label: "מדריך", Icon: BookOpen },
  { label: "גישה", Icon: Users },
  { label: "החשבון שלי", Icon: Fingerprint },
];

export default function Loading() {
  return (
    <div className="app-shell app-loading" role="status" aria-live="polite" aria-label="טוען את נתוני הפרויקט">
      <span className="sr-only">טוען את נתוני הפרויקט…</span>
      <aside className="sidebar loading-sidebar" aria-hidden="true">
        <span className="brand">
          <span className="brand-icon"><BrandMark /></span>
          משק 48
        </span>
        <p className="sidebar-label">פרויקט השיפוץ</p>
        <nav>
          {navigation.map(({ label, Icon }) => (
            <span className="nav-link" key={label}><Icon size={18} />{label}</span>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="loading-profile" /></div>
      </aside>
      <main className="dashboard loading-dashboard" aria-hidden="true">
        <div className="topbar"><span className="loading-line loading-short" /></div>
        <div className="loading-title">
          <span className="loading-line loading-caption" />
          <span className="loading-line loading-heading" />
          <span className="loading-line loading-copy" />
        </div>
        <div className="loading-cards"><span /><span /><span /></div>
        <span className="loading-panel" />
      </main>
    </div>
  );
}
