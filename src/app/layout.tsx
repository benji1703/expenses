import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "המשק · תקציב השיפוץ",
  description: "ניהול הוצאות שיפוץ המשק בבית חנניה: רמ״י, תכנון, רישוי וביצוע.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: "#1a1714",
  colorScheme: "light",
  viewportFit: "cover",
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
