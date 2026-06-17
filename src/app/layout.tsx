import type { Metadata } from "next";
import { Montserrat, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// Identidade Amplia: Montserrat (títulos) + Inter (corpo). Mono p/ números.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tontom — Amplia",
  description:
    "Rastreia cada conversa do WhatsApp até o anúncio de origem e devolve a venda pro Meta otimizar por qualidade.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
