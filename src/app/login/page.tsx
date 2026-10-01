import { BrandMark } from "@/components/brand-mark";
import { LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/forms";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-story">
        <a href="/login" className="brand">
          <span className="brand-icon">
            <BrandMark />
          </span>
          משק 48
        </a>
        <div className="story-copy">
          <p className="eyebrow">בית חנניה · חוף הכרמל</p>
          <h1>
            פרויקט השיפוץ
            <br />
            משק 48
          </h1>
          <p>
            מעקב אחר תשלומי רמ״י, תכנון, רישוי, קבלנים וחומרי בנייה. הוצאות,
            אסמכתאות ומסמכי הפרויקט במקום אחד.
          </p>
        </div>
        <div className="story-footer">
          <span>פרויקט משותף, גישה למוזמנים בלבד.</span>
          <small>ניהול פרטי למוזמנים בלבד</small>
        </div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <span className="pill">
            <LockKeyhole size={13} />
            למוזמנים בלבד
          </span>
          <h2>כניסה לפרויקט משק 48</h2>
          <p className="muted">
            היכנסו עם Passkey ומכשיר Apple, או בקשו קישור מאובטח לכתובת האימייל שאושרה לפרויקט.
          </p>
          {error && (
            <p className="message error" role="alert">
              {error === "access"
                ? "לכתובת זו אין כרגע גישה לפרויקט. פנו למנהל הפרויקט."
                : "הקישור פג או אינו תקין. בקשו קישור כניסה חדש."}
            </p>
          )}
          <LoginForm />
          <div className="login-note">
            <LockKeyhole size={15} />
            <span>
              ההוצאות והמסמכים נשארים פרטיים.
              <br />
              רק חברי הפרויקט שאושרו יכולים לצפות בהם.
            </span>
          </div>
        </div>
        <p className="login-footer">משק 48 · בית חנניה</p>
      </section>
    </main>
  );
}
