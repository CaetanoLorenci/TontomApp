import type { Metadata, Viewport } from "next";
import { Montserrat, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { InstallPrompt } from "@/components/install-prompt";
import { PullToRefresh } from "@/components/pull-to-refresh";

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
  title: "Amplia Hub",
  description:
    "Rastreia cada conversa do WhatsApp até o anúncio de origem e devolve a venda pro Meta otimizar por qualidade.",
  applicationName: "Amplia Hub",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Amplia Hub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
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
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <PullToRefresh />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
