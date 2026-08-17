/* Service worker do Nossa Casa.
   v2: agora também guarda em cache as bibliotecas externas (React, Tailwind, Babel, XLSX,
   fontes) — sem isso, o app carregava a casca mas travava sem internet, porque essas
   peças vinham de fora toda vez. A busca de preço por IA continua SEMPRE precisando de
   internet de verdade (isso é esperado, é uma busca ao vivo). */

const CACHE_NAME = "nossa-casa-v2";
const ARQUIVOS_DO_APP = [
  "./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7/babel.min.js",
  "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      /* adiciona um por um — se algum falhar (ex: sem sinal nesse instante),
         os outros continuam sendo guardados, em vez de tudo falhar junto */
      await Promise.allSettled(ARQUIVOS_DO_APP.map((url) => cache.add(url).catch(() => {})));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  /* preço por IA nunca passa pelo cache — precisa ser sempre uma busca ao vivo */
  if (event.request.url.includes("api.anthropic.com")) return;

  event.respondWith(
    caches.match(event.request).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(event.request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return resposta;
        })
        .catch(() => cacheada);
    })
  );
});
