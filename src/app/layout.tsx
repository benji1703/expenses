import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "המשק · תקציב השיפוץ",
  description: "ניהול הוצאות שיפוץ המשק בבית חנניה: רמ״י, תכנון, רישוי וביצוע.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
