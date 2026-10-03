"use client";

import { BrandMark } from "@/components/brand-mark";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { AppLink } from "@/components/app-link";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div className="app-shell">
    <aside className="sidebar"><AppLink href="/" className="brand"><span className="brand-icon"><BrandMark /></span>משק 48</AppLink><WorkspaceNavigation /></aside>
    <main className="dashboard">
      <section className="page-heading"><h1>טעינת העמוד נכשלה</h1></section>
      <p className="message error" role="alert">בדקו את החיבור ונסו שוב.</p>
      <div className="section-heading-actions"><button type="button" className="primary" onClick={reset}>ניסיון נוסף</button><AppLink className="secondary" href="/expenses">הוצאות</AppLink></div>
    </main>
  </div>;
}
