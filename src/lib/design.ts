// Presentation-only palette from House Remodel; recorded category data stays intact.
const categoryColors: Record<string, string> = {
  "רמ״י — דמי היתר": "#a37b52",
  "רמ״י — רכישת זכויות והיוון": "#7d654c",
  "רמ״י — חכירה והסדרת שימושים": "#b49a78",
  "היטל השבחה": "#a17c6e",
  "אגרות היתר ורישוי": "#8b8273",
  "היטלי פיתוח וחיבורי תשתית": "#7e8c7d",
  "אדריכלות ותכנון": "#859276",
  "מדידה ושמאות": "#9c9b85",
  "ייעוץ משפטי": "#877f75",
  "שלד והריסה": "#a78a70",
  "חשמל ואינסטלציה": "#8c9483",
  "גמרים ומטבח": "#b6a184",
  "עבודות חוץ ופיתוח המשק": "#8b906c",
  "מבנים ותשתיות חקלאיות": "#66745a",
  "פיקוח וניהול": "#9b8c7c",
  "אחר ובלתי צפוי": "#b5ab9a",
};

export function categoryColor(name: string) {
  return categoryColors[name] ?? "#9b8c7c";
}
