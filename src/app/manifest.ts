import type { MetadataRoute } from "next";

// Web App Manifest do Amplia Hub — torna o app instalável no celular/desktop.
// start_url aponta pro painel (entrada do time); sem sessão, o proxy manda pro /login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Amplia Hub",
    short_name: "Amplia Hub",
    description:
      "CRM de tráfego pago da Amplia: rastreia cada conversa do WhatsApp até o anúncio de origem e mede a venda.",
    id: "/",
    start_url: "/painel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
