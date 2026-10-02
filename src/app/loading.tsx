import { BrandMark } from "@/components/brand-mark";
import { WorkspaceNavigation } from "@/components/workspace-navigation";

export default function Loading() {
  return (
    <div className="app-shell app-loading" role="status" aria-live="polite" aria-label="טוען את נתוני הפרויקט">
      <span className="sr-only">טוען את נתוני הפרויקט…</span>
      <aside className="sidebar loading-sidebar">
        <span className="brand">
          <span className="brand-icon"><BrandMark /></span>
          משק 48
        </span>
        <p className="sidebar-label">פרויקט השיפוץ</p>
        <WorkspaceNavigation />
        <div className="sidebar-bottom"><div className="loading-profile" /></div>
      </aside>
      <main className="dashboard loading-dashboard" aria-hidden="true">
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
