import { ArrowUpRight, LockKeyhole, Sprout } from "lucide-react";
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
            <Sprout size={22} />
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
          <div className="sample-receipt">
            <div>
              <span className="sample-symbol">₪</span>
              <span>
                בונים בית. עושים סדר.
                <small>זכויות · תכנון · רישוי · ביצוע</small>
              </span>
              <ArrowUpRight size={22} />
            </div>
            <div className="sample-lines">
              <span />
              <span />
              <span />
            </div>
            <div className="sample-foot">
              כל שלב. כל תשלום. תמונה אחת.
              <Sprout size={18} />
            </div>
          </div>
        </div>
        <span className="story-footer">פרויקט משותף, גישה למוזמנים בלבד.</span>
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
