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

export const metadata = {
  title: "vetopus — png to svg converter",
  description:
    "Vetopus turns PNG images into scalable SVG vectors right in your browser. PNG goes in. SVG comes out.",
  metadataBase: new URL("https://vectopus.vercel.app"), // Fallback domain
  openGraph: {
    title: "vetopus — png to svg converter",
    description: "PNG goes in. SVG comes out. Client-side raster → vector.",
    type: "website",
  },
  twitter: {
    card: "summary",
    site: "@Vectopus",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
