/* Service worker do Nossa Casa.
   v3: corrige o bug de "nunca atualiza". Duas causas encontradas na v2:
   1) Faltava o listener de mensagem "SKIP_WAITING" — o index.html mandava o pedido pro
      worker novo assumir, mas não tinha ninguém escutando do lado do worker. Corrigido abaixo.
   2) O fetch handler era cache-first pra TUDO, inclusive o próprio index.html — uma vez
      cacheado, nunca ia na rede buscar versão nova de novo, mesmo com o worker atualizado.
      Agora o HTML é sempre network-first (busca versão nova sempre que possível, só cai pro
      cache se estiver offline). O resto (bibliotecas externas, ícones, manifest) continua
      cache-first — muda raramente, e isso ajuda o app a funcionar offline. */

const CACHE_NAME = "nossa-casa-v3";
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

/* BUG 1 corrigido: sem isso, o "SKIP_WAITING" que o index.html manda nunca era recebido,
   e o worker novo ficava esperando pra sempre em vez de assumir. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  /* preço por IA nunca passa pelo cache — precisa ser sempre uma busca ao vivo */
  if (event.request.url.includes("api.anthropic.com")) return;

  const ehDocumentoHtml =
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    event.request.url.endsWith("/") ||
    event.request.url.endsWith("index.html");

  if (ehDocumentoHtml) {
    /* BUG 2 corrigido: network-first pro HTML — sempre tenta buscar a versão mais nova
       primeiro, e só usa o cache como reserva se estiver offline. */
    event.respondWith(
      fetch(event.request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return resposta;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  /* Resto do app (bibliotecas externas, ícones, manifest): cache-first, com atualização
     em segundo plano — raramente muda, e cache-first ajuda no offline e na velocidade. */
  event.respondWith(
    caches.match(event.request).then((cacheada) => {
      const buscaNaRede = fetch(event.request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return resposta;
        })
        .catch(() => cacheada);
      return cacheada || buscaNaRede;
    })
  );
});
