import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineRuntime } from "@/components/offline-runtime";
export const metadata: Metadata = {
  title: "משק 48 · ניהול תקציב השיפוץ",
  description: "מעקב אחר תשלומי רמ״י, תכנון, רישוי, קבלנים ומסמכי השיפוץ בבית חנניה.",
  icons: { apple: "/icons/meshek48-180.png" },
  appleWebApp: { capable: true, title: "Meshek 48", statusBarStyle: "black-translucent" },
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
      <head>
        <link rel="preload" href="/fonts/heebo-hebrew.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/heebo-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}<OfflineRuntime /></body>
    </html>
  );
}
