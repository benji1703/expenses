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
          המשק<span className="brand-dot">.</span>
        </a>
        <div className="story-copy">
          <p className="eyebrow">בית חנניה · נחלה בחוף הכרמל</p>
          <h1>
            בית חדש.
            <br />
            שורשים עמוקים<span>.</span>
          </h1>
          <p>
            מרמ״י והיתרי הבנייה ועד המטבח והגינה. כל הוצאה, דרישת תשלום ומסמך של
            שיפוץ הנחלה — במקום אחד.
          </p>
        </div>
        <div className="story-footer">
          <span>פרויקט משותף, גישה למוזמנים בלבד.</span>
          <small>מתוך לוח ההשראה של פרויקט הבית</small>
        </div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <span className="pill">
            <LockKeyhole size={13} />
            למוזמנים בלבד
          </span>
          <h2>ברוכים הבאים הביתה.</h2>
          <p className="muted">
            היכנסו עם כתובת האימייל שאושרה לפרויקט. נשלח לכם קישור כניסה מאובטח
            — בלי סיסמה.
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
        <p className="login-footer">בונים בית, שומרים על התמונה.</p>
      </section>
    </main>
  );
}
