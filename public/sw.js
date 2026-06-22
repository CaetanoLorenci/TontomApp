// Service Worker do Amplia Hub.
// Objetivos: (1) tornar o app instalável (PWA), (2) cache leve do app-shell p/ abrir rápido
// e dar um respiro offline, (3) já deixar pronto o canal de push (passo de notificações).
// Estratégia de navegação: network-first com fallback pro cache (dados sempre frescos online).

const CACHE = "amplia-hub-v1";
// Só a tela offline é pré-cacheada (/painel exige auth → redireciona).
// As demais páginas entram no cache em runtime, conforme visitadas.
const APP_SHELL = ["/offline"];

self.addEventListener("install", (event) => {
  // Pré-aquece o shell; não falha a instalação se algum recurso não cachear.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Limpa caches de versões antigas e assume o controle das abas abertas.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não mexe em chamadas externas (Meta/Supabase)

  // Navegações (HTML): rede primeiro, cache de socorro, e por último a tela offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline")) || Response.error()),
    );
    return;
  }

  // Estáticos do Next (/_next/static, ícones): cache-first (são versionados/imutáveis).
  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icon")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});

// --- Push (preparado p/ o passo de notificações; inerte enquanto não há inscrição) ---
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  const title = data.title || "Amplia Hub";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/painel" },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/painel";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(target) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
