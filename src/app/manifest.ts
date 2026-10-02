import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Meshek 48", short_name: "Meshek 48", description: "Renovation expenses and receipts", start_url: "/", display: "standalone", background_color: "#f3f0e7", theme_color: "#1a1714", lang: "he", dir: "rtl", icons: [192, 512].map((size) => ({ src: `/icons/meshek48-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) };
}
