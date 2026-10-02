import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
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
          <h1>משק 48</h1>
          <p>ניהול הוצאות השיפוץ</p>
        </div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <h2>כניסה</h2>
          {error && (
            <p className="message error" role="alert">
              {error === "access"
                ? "לכתובת זו אין כרגע גישה לפרויקט. פנו למנהל הפרויקט."
                : "הקישור פג או אינו תקין. בקשו קישור כניסה חדש."}
            </p>
          )}
          <LoginForm />

        </div>
        <p className="login-footer">משק 48 · בית חנניה</p>
      </section>
    </main>
  );
}
