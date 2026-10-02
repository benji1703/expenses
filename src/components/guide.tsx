import { BookOpen, ArrowUpRight, FileCheck2 } from "lucide-react";
import { renovationGuide, verifiedOn } from "@/lib/renovation-guide";
export function RenovationGuide() {
  return (
    <section className="knowledge-section" id="guide">
      <div className="section-heading">
        <div>
          <h2>מדריך</h2>
        </div>
        <BookOpen size={23} />
      </div>
      <div className="guide-intro">
        <p>
          המידע הוא הסבר כללי וקישורים למקורות רשמיים, ואינו קביעת זכאות או חבות
          לנכס שלכם. הסכומים והאישורים נקבעים לפי החוזה, התוכנית, השומות ודרישות
          הרשויות.
        </p>
        <small>
          מקורות נבדקו: {verifiedOn} · לפני תשלום בדקו את הנוהל והדרישה
          העדכניים.
        </small>
      </div>
      <div className="local-project">
        <p className="eyebrow">בית חנניה · מועצה אזורית חוף הכרמל</p>
        <h3>הכתובות המקומיות של הנחלה</h3>
        <p>
          בית חנניה הוא מושב בתחומי מועצה אזורית חוף הכרמל. לרישוי, תוכניות,
          תיקי בניין ומידע תכנוני פונים לוועדה המקומית חוף הכרמל. לפי פרטי
          הגבייה של המועצה, בירורי מים נעשים מול גורם אספקת המים ביישוב — בנפרד
          ממחלקת הגבייה.
        </p>
        <p>
          לפני תכנון והערכת חיובים: אספו גוש וחלקה, חוזה הזכויות, היתרים קיימים
          ותיק מידע להיתר. בדקו במערכת ה־GIS ובוועדה אילו תוכניות חלות על החלקה;
          שם היישוב לבדו אינו מספיק לקביעת זכויות בנייה או חיוב. טבלת התעריפים
          המקומית כוללת אגרות ושירותים שונים, אך סכום התשלום לפרויקט נקבע בדרישה
          הרשמית.
        </p>
        <div className="local-links">
          <a
            href="https://www.hof-hacarmel.co.il/בית-חנניה/"
            target="_blank"
            rel="noopener noreferrer"
          >
            בית חנניה · אתר המועצה
          </a>
          <a
            href="https://hof.bartech-net.co.il/"
            target="_blank"
            rel="noopener noreferrer"
          >
            הוועדה המקומית חוף הכרמל
          </a>
          <a
            href="https://hof.bartech-net.co.il/service-rates/"
            target="_blank"
            rel="noopener noreferrer"
          >
            טבלת תעריפים מקומית
          </a>
          <a
            href="https://v5.gis-net.co.il/v5/hof_hacarmel"
            target="_blank"
            rel="noopener noreferrer"
          >
            GIS · איתור תוכניות וחלקות
          </a>
          <a
            href="https://hof.bartech-net.co.il/general_info/contact-list/"
            target="_blank"
            rel="noopener noreferrer"
          >
            אנשי קשר בוועדה
          </a>
          <a
            href="https://forms.hof-hacarmel.co.il/גבייה-חדש/"
            target="_blank"
            rel="noopener noreferrer"
          >
            גבייה · אגרות והיטלים
          </a>
        </div>
        <p className="source-date">
          מקורות רשמיים: מועצה אזורית חוף הכרמל והוועדה המקומית · נבדקו{" "}
          {verifiedOn}
        </p>
      </div>
      <div className="guide-grid">
        {renovationGuide.map((item) => (
          <article key={item.title}>
            <span className="subtle-tag">{item.tag}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <div className="guide-checklist">
              <FileCheck2 size={16} />
              <span>{item.checklist}</span>
            </div>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.source}
              <ArrowUpRight size={14} />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
