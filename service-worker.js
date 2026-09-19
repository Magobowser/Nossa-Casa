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
      `cache: "no-store"` explícito pra código próprio do app, fechando essa brecha.
   v8: achado real relatado pelo usuário — app abre sem internet com a tela toda sem estilo
   (Tailwind não carregou) e um erro visível, mesmo usando o app com internet quase todo dia.
   Causa: uma tag <script src="..."> comum, o jeito que o Tailwind e as outras bibliotecas são
   carregadas, faz o pedido no modo "no-cors" — mas cache.add(url) guarda no modo "cors" por
   padrão. cdn.tailwindcss.com não manda os cabeçalhos de CORS que o modo "cors" exige, então
   GUARDAR falhava toda vez — silenciosamente, escondido atrás de um .catch(() => {}) que existia
   pra não travar a instalação por causa de UM arquivo problemático, mas que também escondeu esse
   bug. Corrigido: arquivos de CDN agora são guardados explicitamente no modo "no-cors", igual o
   pedido de verdade que a tag <script> faz — sem isso, nunca ficava nada usável salvo. */

const CACHE_NAME = "nossa-casa-v8";
const ARQUIVOS_LOCAIS = ["./", "./index.html", "./mercado.js", "./financas.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const ARQUIVOS_CDN = [
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7/babel.min.js",
  "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
  /* Pedido do usuário: TODAS as funcionalidades devem baixar no primeiro momento que o app abre,
     não só quando usadas pela primeira vez. Essas 3 são as bibliotecas carregadas sob demanda
     (leitor de código de barras/QR, leitor de PDF, OCR de foto) — sem isso no pré-carregamento,
     quem nunca usou uma dessas funções ficava sem internet no dia em que precisasse dela pela
     primeira vez. Tesseract e pdf.js também buscam arquivos PRÓPRIOS por baixo (worker, núcleo
     WASM, dados de idioma) que não dá pra listar aqui com certeza — a URL exata do worker do
     pdf.js eu sei (está fixada no código, abaixo); o resto fica coberto de um jeito mais
     confiável: o próprio app roda cada função escondida uma vez ao abrir (ver "aquecimento" no
     index.html), deixando a MESMA lógica de guardar-o-que-buscar do fetch handler abaixo capturar
     o que cada biblioteca realmente pede em tempo real — mais confiável que eu adivinhar URL
     interna de biblioteca de terceiro sem testar contra o app de verdade. */
  "https://unpkg.com/@zxing/library@latest",
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(ARQUIVOS_LOCAIS.map((url) => cache.add(url).catch(() => {})));
      /* Cada arquivo de CDN é guardado nos dois modos possíveis (no-cors, igual uma tag <script>
         pede; e cors, igual um fetch() comum pede) — bibliotecas diferentes (ou a mesma
         biblioteca, dependendo de como busca seus próprios arquivos internos) podem pedir de um
         jeito ou de outro, e não dá pra saber com certeza qual sem testar contra o app de verdade
         rodando num celular. Guardar nos dois é redundante às vezes, mas o custo é pequeno
         (é só espaço em disco) e garante que bata o pedido de verdade de qualquer jeito. */
      await Promise.allSettled(ARQUIVOS_CDN.map((url) => cache.add(new Request(url, { mode: "no-cors" })).catch(() => {})));
      await Promise.allSettled(ARQUIVOS_CDN.map((url) => cache.add(url).catch(() => {})));
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

/* Compartilhamento nativo do Android ("Compartilhar" -> Nossa Casa), pedido do usuário pra
   agilizar o fluxo de anexar o PDF do DANFE baixado da SEFAZ. O Android manda o arquivo por
   POST — o service worker intercepta antes de virar uma navegação normal, guarda o arquivo no
   IndexedDB (só dá pra persistir Blob ali, não em localStorage) e redireciona pro app, que
   confere se tem algo pendente ao abrir. Só funciona em Android/Chrome — iOS Safari não
   implementa Web Share Target (não dá pra instalar essa parte só nele). */
function abrirDbCompartilhamento() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nossa-casa-compartilhamento", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("compartilhados", { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname.endsWith("/index.html")) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const arquivo = formData.get("arquivo_compartilhado");
          if (arquivo && arquivo.size > 0) {
            const db = await abrirDbCompartilhamento();
            await new Promise((resolve, reject) => {
              const tx = db.transaction("compartilhados", "readwrite");
              tx.objectStore("compartilhados").put({ id: "pendente", arquivo, nome: arquivo.name, tipo: arquivo.type, data: Date.now() });
              tx.oncomplete = resolve;
              tx.onerror = reject;
            });
          }
        } catch (e) { /* se falhar, simplesmente não vai ter nada pendente -- sem travar a navegação */ }
        return Response.redirect("./index.html?compartilhado=1", 303);
      })()
    );
    return;
  }

  if (event.request.method !== "GET") return;
  if (event.request.url.includes("api.anthropic.com")) return;

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
