/* Service worker do Nossa Casa.
   v3: corrige o bug de "nunca atualiza". Duas causas encontradas na v2:
   1) Faltava o listener de mensagem "SKIP_WAITING" — o index.html mandava o pedido pro
      worker novo assumir, mas não tinha ninguém escutando do lado do worker. Corrigido abaixo.
   2) O fetch handler era cache-first pra TUDO, inclusive o próprio index.html — uma vez
      cacheado, nunca ia na rede buscar versão nova de novo, mesmo com o worker atualizado.
      Agora o HTML é sempre network-first (busca versão nova sempre que possível, só cai pro
      cache se estiver offline). O resto (bibliotecas externas, ícones, manifest) continua
      cache-first — muda raramente, e isso ajuda o app a funcionar offline.
   v4 (seção 33.3 do mapa): dois problemas a mais, achados depois de um erro de sintaxe
   persistir mesmo após reenviar o arquivo corrigido:
   3) mercado.js/financas.js agora carregam com "?v=VERSAO" na URL (quebra-cache — força
      qualquer camada de cache, navegador ou CDN do GitHub, a tratar como arquivo novo a cada
      versão). Isso quebrou a checagem antiga (`url.endsWith(".js")`), que não batia mais numa
      URL terminando em "?v=...". Corrigido pra usar `new URL(...).pathname`, que ignora a
      query string.
   4) "Network-first" no nível do service worker não impedia o `fetch()` por baixo de ainda
      respeitar o cache HTTP normal do navegador (uma camada abaixo do SW). Adicionado
      `cache: "no-store"` explícito pra código próprio do app, fechando essa brecha. */

const CACHE_NAME = "nossa-casa-v6";
const ARQUIVOS_DO_APP = [
  "./", "./index.html", "./mercado.js", "./financas.js", "./manifest.json", "./icon-192.png", "./icon-512.png",
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

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.url.includes("api.anthropic.com")) return;

  const url = new URL(event.request.url);

  const ehCodigoProprioDoApp =
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html") ||
    (url.pathname.endsWith(".js") && url.origin === self.location.origin);

  if (ehCodigoProprioDoApp) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
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
