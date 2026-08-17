/* Service worker do Nossa Casa — bem simples de propósito.
   Objetivo único: deixar o "app shell" (o HTML/JS do próprio app) disponível
   de forma confiável, com uma origem https:// estável — resolve a fragilidade
   de abrir via file:// e destrava o acesso à câmera (scanner de código de barras, futuro).
   Não mexe em chamadas de API (preço por IA) nem tenta cachear CDN externo. */

const CACHE_NAME = "nossa-casa-v1";
const ARQUIVOS_DO_APP = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_DO_APP)).catch(() => {})
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
  /* Só intercepta requisições do próprio app (GET, mesma origem).
     Chamada de API de preço (Anthropic) e CDN passam direto pela rede, sem cache. */
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then((resposta) => resposta || fetch(event.request))
  );
});
