import type { Metadata, Viewport } from "next";
import { Syne, Space_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export const viewport: Viewport = {
  themeColor: "#fc668f",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Vectopus — PNG to SVG Converter",
  description:
    "Convert PNG, JPG, and WEBP images into scalable, clean SVG vectors right in your browser. 100% secure, offline, and instant.",
  metadataBase: new URL("https://vectopus.vercel.app"),
  keywords: [
    "Vectopus",
    "PNG to SVG",
    "JPG to SVG",
    "WEBP to SVG",
    "image to vector",
    "vectorizer",
    "SVG converter",
    "browser converter",
    "client-side tracing",
    "vector studio",
    "SVG tracer",
    "image preprocessing",
  ],
  authors: [{ name: "Vectopus Team" }],
  creator: "Vectopus",
  publisher: "Vectopus",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Vectopus — PNG to SVG Converter",
    description:
      "Vectopus turns PNG images into scalable SVG vectors right in your browser. PNG goes in. SVG comes out. Client-side raster to vector studio.",
    url: "https://vectopus.vercel.app",
    siteName: "Vectopus",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/banner.png",
        width: 1200,
        height: 630,
        alt: "Vectopus — professional image to vector studio banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vectopus — PNG to SVG Converter",
    description:
      "Convert PNG, JPG, and WEBP images into scalable SVG vectors in your browser securely and instantly.",
    site: "@Vectopus",
    creator: "@Vectopus",
    images: ["/banner.png"],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
