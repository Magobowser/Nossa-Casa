/* =========================================================
   NOSSA CASA — FINANÇAS (financas.js)
   Fase 1 do mapa (especificacao-nossa-casa-financas.md, seção 12): base pra existir e
   funcionar — categorias, conta com saldo inicial, lançamentos, extrato com navegação por
   mês (incluindo previsão de recorrentes em meses futuros), dashboard mensal simples.
   Compartilha utilitários e estado (apiKey) com index.html, roda na mesma página que o
   Mercado (mercado.js) — nunca recarrega ao trocar de módulo.
========================================================= */

/* ---------- Utilitários de mês (chave "AAAA-MM", só usados aqui) ---------- */
function chaveMesDe(dataStr) {
  const d = new Date(dataStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function chaveMesAtual() {
  return chaveMesDe(new Date().toISOString());
}
function nomeDaChaveMes(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  const d = new Date(ano, mes - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function mesSeguinte(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  const d = new Date(ano, mes, 1); // mes (0-indexado + 1) já pula pro próximo
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function mesAnteriorDe(chave) {
  const [ano, mes] = chave.split("-").map(Number);
  const d = new Date(ano, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dataDoDiaNoMes(chave, dia) {
  const [ano, mes] = chave.split("-").map(Number);
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  const diaSeguro = Math.min(dia || 1, ultimoDiaDoMes); // fev não tem dia 30/31, por ex.
  return new Date(ano, mes - 1, diaSeguro).toISOString();
}
function chaveMesEhFutura(chave) {
  return chave > chaveMesAtual();
}

/* ---------- Cálculo de saldo — seção 6 do mapa: sempre calculado, nunca digitado ---------- */
function calcularSaldoConta(conta, lancamentos, ateChaveMes) {
  if (!conta) return 0;
  const inicio = new Date(conta.data_saldo_inicial);
  const limite = ateChaveMes ? new Date(dataDoDiaNoMes(mesSeguinte(ateChaveMes), 1)) : new Date();
  const movimentacoes = lancamentos.filter((l) => {
    if (l.conta_id !== conta.id) return false;
    const d = new Date(l.data);
    return d >= inicio && d < limite;
  });
  const soma = movimentacoes.reduce((acc, l) => acc + (l.tipo === "receita" ? l.valor : -l.valor), 0);
  return conta.saldo_inicial + soma;
}

function lancamentosDoMes(lancamentos, chave, contaId) {
  return lancamentos.filter((l) => chaveMesDe(l.data) === chave && (!contaId || l.conta_id === contaId));
}

/* Recorrentes sem lançamento real ainda nesse mês viram "previsto" — mesmo padrão previsto x
   real já validado no Mercado (seção 8.1 do mapa). Nunca mostra previsto pra mês passado sem
   confirmação — se passou e não foi confirmado, é omissão real do usuário, não é escondido. */
function previstosDoMes(lancamentosFixos, lancamentos, chave, contaId) {
  return lancamentosFixos
    .filter((fixo) => !contaId || fixo.conta_id === contaId)
    .filter((fixo) => !lancamentos.some((l) => l.origem_fixo_id === fixo.id && chaveMesDe(l.data) === chave))
    .map((fixo) => ({ ...fixo, id: "previsto_" + fixo.id + "_" + chave, fixo_id: fixo.id, previsto: true, data: dataDoDiaNoMes(chave, fixo.dia_recorrencia) }));
}

function totaisDoMes(itensDoMes) {
  const entradas = itensDoMes.filter((l) => l.tipo === "receita" && !l.previsto).reduce((a, l) => a + l.valor, 0);
  const saidas = itensDoMes.filter((l) => l.tipo === "despesa" && !l.previsto).reduce((a, l) => a + l.valor, 0);
  return { entradas, saidas, saldoDoMes: entradas - saidas };
}

/* ---------- Seed — categorias padrão, pequeno conjunto pra começar (seção 12, Fase 1) ---------- */
const SEED_CATEGORIAS_FINANCEIRAS = [
  { id: "catfn_salario", nome: "Salário", icone: "💼", tipo: "receita", padrao_fixa: true },
  { id: "catfn_extra", nome: "Extra / Freelance", icone: "💵", tipo: "receita", padrao_fixa: false },
  { id: "catfn_outros_receita", nome: "Outros", icone: "➕", tipo: "receita", padrao_fixa: false },
  { id: "catfn_moradia", nome: "Moradia", icone: "🏠", tipo: "despesa", padrao_fixa: true },
  { id: "catfn_mercado", nome: "Mercado", icone: "🛒", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_contas_casa", nome: "Água / Luz / Internet", icone: "💡", tipo: "despesa", padrao_fixa: true },
  { id: "catfn_transporte", nome: "Transporte", icone: "🚗", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_saude", nome: "Saúde", icone: "💊", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_educacao", nome: "Educação", icone: "📚", tipo: "despesa", padrao_fixa: true },
  { id: "catfn_lazer", nome: "Lazer", icone: "🎉", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_assinaturas", nome: "Assinaturas", icone: "📱", tipo: "despesa", padrao_fixa: true },
  { id: "catfn_outros_despesa", nome: "Outros", icone: "➖", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_ajuste_receita", nome: "Ajuste de saldo", icone: "⚖️", tipo: "receita", padrao_fixa: false },
  { id: "catfn_ajuste_despesa", nome: "Ajuste de saldo", icone: "⚖️", tipo: "despesa", padrao_fixa: false },
  { id: "catfn_aporte_meta", nome: "Guardado em reserva/meta", icone: "🎯", tipo: "despesa", padrao_fixa: false },
];
/* Nota: "catfn_mercado" tem id fixo de propósito — é o alvo da integração automática
   Mercado → Finanças (Fase 6 do mapa), pra ter uma categoria estável de referência desde já. */

/* ---------- Persistência ---------- */
/* ---------- Fase 5: arquivo de documentos — PDF nativo primeiro, OCR como reserva ---------- */
let promessaPdfJsCarregado = null;
function carregarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (promessaPdfJsCarregado) return promessaPdfJsCarregado;
  promessaPdfJsCarregado = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Não consegui carregar o leitor de PDF — verifique sua internet."));
    document.head.appendChild(script);
  });
  return promessaPdfJsCarregado;
}
/* Maioria dos PDFs de contracheque/boleto digital já vem com texto de verdade embutido — extrai
   direto, sem OCR, muito mais confiável. Se vier vazio/curto demais, é sinal de PDF escaneado
   (imagem), aí quem chama essa função decide cair pro aviso de "preenche manualmente". */
async function extrairTextoDoPdf(arrayBuffer) {
  const pdfjsLib = await carregarPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    textoCompleto += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return textoCompleto;
}
/* Estimativa de espaço ocupado — base64 é ~37% maior que o binário original, mas o que importa
   aqui é o tamanho da STRING guardada no localStorage, não o arquivo original. */
function tamanhoAproximadoKB(strBase64) {
  return Math.round((strBase64 || "").length / 1024);
}

/* ---------- Fase 6: integração Mercado → Finanças ---------- */
/* Definida aqui (não em mercado.js) porque Finanças é dona do formato de dado sendo escrito —
   Mercado só avisa que uma compra terminou, não precisa saber a estrutura interna de lançamento
   ou documento daqui. Funciona por escrita direta no localStorage (não por estado React
   compartilhado) porque os dois módulos são telas irmãs, montadas uma de cada vez — nunca os
   dois ao mesmo tempo — então não dá pra passar isso por prop/estado React entre eles.
   upsert por origem_mercado_sessao_id: se a mesma sessão for finalizada de novo (ex: reaberta
   pra correção e finalizada outra vez), ATUALIZA o valor em vez de duplicar o lançamento. */
function integrarCompraMercado(sessaoMercado, nomeMercado) {
  try {
    const contasRaw = localStorage.getItem("fn_contas");
    const contas = contasRaw ? JSON.parse(contasRaw) : [];
    if (!contas.length) return; // Finanças ainda sem conta cadastrada — não dá pra lançar em lugar nenhum

    const lancamentosRaw = localStorage.getItem("fn_lancamentos");
    const lancamentos = lancamentosRaw ? JSON.parse(lancamentosRaw) : [];

    const total = sessaoMercado.valor_nota_fiscal != null
      ? sessaoMercado.valor_nota_fiscal
      : sessaoMercado.itens.filter((i) => i.comprado).reduce((a, i) => a + (i.subtotal || 0), 0);
    if (!total) return;

    const existente = lancamentos.find((l) => l.origem_mercado_sessao_id === sessaoMercado.id);
    if (existente) {
      const atualizados = lancamentos.map((l) => (l.id === existente.id ? { ...l, valor: total } : l));
      persist("fn_lancamentos", atualizados);
      return;
    }

    const documentoId = sessaoMercado.nfe?.conferida ? uid() : null;
    const novaDespesa = {
      id: uid(), tipo: "despesa", descricao: "Compra no " + (nomeMercado || "mercado"),
      categoria_id: "catfn_mercado", valor: total,
      data: sessaoMercado.fechada_em || new Date().toISOString(),
      fixa: false, recorrente: false, dia_recorrencia: null,
      forma_pagamento: null, conta_id: contas[0].id, origem_fixo_id: null,
      documento_id: documentoId, origem_mercado_sessao_id: sessaoMercado.id,
    };
    persist("fn_lancamentos", [...lancamentos, novaDespesa]);

    /* Se teve NFe conferida, entra direto no arquivo de documentos de saída — mas como o
       Mercado guarda só o resumo já interpretado da nota (não o arquivo XML original depois de
       lido), o "documento" aqui é um resumo em texto, não o binário original. Recorte de escopo
       consciente: preservar o XML bruto pediria mexer num fluxo do Mercado já testado, por um
       ganho pequeno (o resumo já cobre a necessidade de "não subir de novo"). */
    if (documentoId) {
      const documentosRaw = localStorage.getItem("fn_documentos");
      const documentos = documentosRaw ? JSON.parse(documentosRaw) : [];
      const resumo = `Nota fiscal — ${sessaoMercado.nfe.nome_emit || nomeMercado || ""}\nChave de acesso: ${sessaoMercado.nfe.chave_acesso || "—"}\nTotal: ${brl(total)}\nItens conferidos: ${(sessaoMercado.nfe.itens || []).filter((i) => !i.ignorado).length}`;
      const novoDocumento = {
        id: documentoId, tipo: "saida", nome_arquivo: "NFe — " + (nomeMercado || "compra"),
        arquivo_base64: "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(resumo))),
        mime_type: "text/plain", data_upload: new Date().toISOString(), lancamento_id: novaDespesa.id,
      };
      persist("fn_documentos", [...documentos, novoDocumento]);
    }
  } catch (e) { console.error("Falha ao integrar compra do Mercado com Finanças:", e); }
}

function loadAllFinancas() {
  let categorias = null, contas = [], lancamentos = [], lancamentosFixos = [], lembretes5Dias = [], reflexoesMensais = {}, limiar5Dias = 100, metas = [], documentos = [];
  let houveErroCarregamento = false;
  try { const v = localStorage.getItem("fn_categorias"); categorias = v ? JSON.parse(v) : null; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_contas"); contas = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_lancamentos"); lancamentos = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_lancamentosFixos"); lancamentosFixos = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_lembretes5Dias"); lembretes5Dias = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_reflexoesMensais"); reflexoesMensais = v ? JSON.parse(v) : {}; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_limiar5Dias"); limiar5Dias = v ? Number(v) : 100; } catch (e) {}
  try { const v = localStorage.getItem("fn_metas"); metas = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_documentos"); documentos = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  if (!categorias) categorias = SEED_CATEGORIAS_FINANCEIRAS;
  return { categorias, contas, lancamentos, lancamentosFixos, lembretes5Dias, reflexoesMensais, limiar5Dias, metas, documentos, houveErroCarregamento };
}

/* ---------- ModalConta — criar/editar conta financeira ---------- */
function ModalConta({ conta, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(conta?.nome || "");
  const [saldoTexto, setSaldoTexto] = useState(conta?.saldo_inicial != null ? formatarValorCampo(conta.saldo_inicial) : "");
  const [data, setData] = useState(conta?.data_saldo_inicial ? conta.data_saldo_inicial.slice(0, 10) : new Date().toISOString().slice(0, 10));

  function salvar() {
    const saldo = parsePrecoInteligente(saldoTexto);
    if (!nome.trim()) { alert("Dá um nome pra essa conta."); return; }
    if (saldo == null) { alert("Preenche o saldo inicial — pode ser 0 se a conta está zerada."); return; }
    onSalvar({ id: conta?.id || uid(), nome: nome.trim(), saldo_inicial: saldo, data_saldo_inicial: new Date(data).toISOString() });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{conta ? "Editar conta" : "Nova conta"}</h3>
        <label className="text-xs font-semibold text-stone-500 uppercase">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Conta principal, Nubank..." className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Nome da conta" />

        <label className="text-xs font-semibold text-stone-500 uppercase">Saldo inicial</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-1">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={saldoTexto} onChange={(e) => setSaldoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 150000 = R$1.500,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Saldo inicial" />
        </div>
        <p className="text-xs text-stone-400 mb-3">Esse é o "ponto zero" — dali em diante o saldo é sempre calculado sozinho, nunca digitado de novo.</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Data desse saldo</label>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-4" aria-label="Data do saldo inicial" />

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalCategoriaFinanceira — criar/editar categoria ---------- */
function ModalCategoriaFinanceira({ categoria, tipoInicial, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(categoria?.nome || "");
  const [icone, setIcone] = useState(categoria?.icone || "🏷️");
  const [tipo, setTipo] = useState(categoria?.tipo || tipoInicial || "despesa");
  const [padraoFixa, setPadraoFixa] = useState(categoria?.padrao_fixa || false);

  function salvar() {
    if (!nome.trim()) { alert("Dá um nome pra essa categoria."); return; }
    onSalvar({ id: categoria?.id || uid(), nome: nome.trim(), icone: icone.trim() || "🏷️", tipo, padrao_fixa: padraoFixa });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{categoria ? "Editar categoria" : "Nova categoria"}</h3>
        <div className="flex gap-2 mb-3">
          <Chip selected={tipo === "receita"} onClick={() => setTipo("receita")}>Receita</Chip>
          <Chip selected={tipo === "despesa"} onClick={() => setTipo("despesa")}>Despesa</Chip>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={icone} onChange={(e) => setIcone(e.target.value)} className="w-16 text-center text-xl border border-stone-300 rounded-xl p-2.5" aria-label="Ícone" maxLength={2} />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da categoria" className="flex-1 border border-stone-300 rounded-xl p-2.5" aria-label="Nome da categoria" />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600 mb-4 tap-target">
          <input type="checkbox" checked={padraoFixa} onChange={(e) => setPadraoFixa(e.target.checked)} className="w-5 h-5" />
          Costuma ser um gasto/receita fixo
        </label>
        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalLancamento — criar/editar receita ou despesa ---------- */
function ModalLancamento({ lancamento, tipoInicial, categorias, contas, contaPadraoId, limiar5Dias, valorInicial, documentoId, onSalvar, onAdiar5Dias, onRemover, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [tipo, setTipo] = useState(lancamento?.tipo || tipoInicial || "despesa");
  const [descricao, setDescricao] = useState(lancamento?.descricao || "");
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoria_id || null);
  const [valorTexto, setValorTexto] = useState(lancamento?.valor != null ? formatarValorCampo(lancamento.valor) : (valorInicial != null ? formatarValorCampo(valorInicial) : ""));
  const [data, setData] = useState(lancamento?.data ? lancamento.data.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [fixa, setFixa] = useState(lancamento?.fixa || false);
  const [recorrente, setRecorrente] = useState(lancamento?.recorrente || false);
  const [diaRecorrencia, setDiaRecorrencia] = useState(lancamento?.dia_recorrencia ? String(lancamento.dia_recorrencia) : String(new Date().getDate()));
  const [formaPagamento, setFormaPagamento] = useState(lancamento?.forma_pagamento || "debito");
  const [contaId, setContaId] = useState(lancamento?.conta_id || contaPadraoId || contas[0]?.id || null);
  const [dadosPendentesTeste5Dias, setDadosPendentesTeste5Dias] = useState(null);

  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo);

  function tentarSalvar() {
    const valor = parsePrecoInteligente(valorTexto);
    if (!descricao.trim()) { alert("Descreve esse lançamento (ex: Aluguel, Supermercado)."); return; }
    if (valor == null || valor <= 0) { alert("Preenche o valor."); return; }
    if (!categoriaId) { alert("Escolhe uma categoria."); return; }
    if (!contaId) { alert("Escolhe (ou cadastra) uma conta primeiro."); return; }
    const dados = {
      id: lancamento?.id || uid(),
      tipo, descricao: descricao.trim(), categoria_id: categoriaId, valor,
      data: new Date(data).toISOString(),
      fixa: fixa || recorrente,
      recorrente,
      dia_recorrencia: recorrente ? (numDe(diaRecorrencia) || 1) : null,
      forma_pagamento: tipo === "despesa" ? formaPagamento : null,
      conta_id: contaId,
      origem_fixo_id: lancamento?.origem_fixo_id || null,
      documento_id: lancamento?.documento_id || documentoId || null,
    };
    /* Teste dos 5 dias (Fase 3, seção 12 do mapa): só pra despesa variável nova, acima do limiar
       configurado — nunca em edição de algo que já existia, nunca em receita ou gasto fixo. */
    const elegivel = !lancamento && tipo === "despesa" && !fixa && valor >= limiar5Dias;
    if (elegivel) { setDadosPendentesTeste5Dias(dados); return; }
    onSalvar(dados);
  }

  if (dadosPendentesTeste5Dias) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
        <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold mb-2">🕐 Vale esperar 5 dias?</h3>
          <p className="text-sm text-stone-600 mb-4">
            <b>{dadosPendentesTeste5Dias.descricao}</b> — {brl(dadosPendentesTeste5Dias.valor)}. Gasto variável acima de {brl(limiar5Dias)} costuma valer a pena repensar com um tempinho antes de confirmar.
          </p>
          <div className="flex flex-col gap-2">
            <button onClick={() => onAdiar5Dias(dadosPendentesTeste5Dias)} className="w-full py-3 rounded-xl bg-amber-100 text-amber-800 font-semibold tap-target">⏳ Esperar 5 dias (te lembro depois)</button>
            <button onClick={() => onSalvar(dadosPendentesTeste5Dias)} className="w-full py-3 rounded-xl bg-emerald-700 text-white font-semibold tap-target">Confirmar agora mesmo</button>
            <button onClick={() => setDadosPendentesTeste5Dias(null)} className="text-sm text-stone-400 tap-target py-1">← Voltar e editar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{lancamento ? "Editar lançamento" : "Novo lançamento"}</h3>

        <div className="flex gap-2 mb-3">
          <Chip selected={tipo === "receita"} onClick={() => { setTipo("receita"); setCategoriaId(null); }}>💰 Receita</Chip>
          <Chip selected={tipo === "despesa"} onClick={() => { setTipo("despesa"); setCategoriaId(null); }}>💸 Despesa</Chip>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Descrição</label>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "receita" ? "Salário, freelance..." : "Aluguel, mercado..."} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Descrição" />

        <label className="text-xs font-semibold text-stone-500 uppercase">Categoria</label>
        <div className="flex gap-2 flex-wrap mt-1 mb-3">
          {categoriasDoTipo.map((c) => (
            <Chip key={c.id} selected={categoriaId === c.id} onClick={() => setCategoriaId(c.id)}>{c.icone} {c.nome}</Chip>
          ))}
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 15000 = R$150,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor" />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Data</label>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Data" />

        {contas.length > 1 && (
          <>
            <label className="text-xs font-semibold text-stone-500 uppercase">Conta</label>
            <div className="flex gap-2 flex-wrap mt-1 mb-3">
              {contas.map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
            </div>
          </>
        )}

        {tipo === "despesa" && (
          <>
            <label className="text-xs font-semibold text-stone-500 uppercase">Forma de pagamento</label>
            <div className="flex gap-2 flex-wrap mt-1 mb-3">
              <Chip selected={formaPagamento === "dinheiro"} onClick={() => setFormaPagamento("dinheiro")}>💵 Dinheiro</Chip>
              <Chip selected={formaPagamento === "debito"} onClick={() => setFormaPagamento("debito")}>💳 Débito</Chip>
              <Chip selected={formaPagamento === "cartao"} onClick={() => setFormaPagamento("cartao")}>🏦 Cartão</Chip>
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-stone-600 mb-2 tap-target">
          <input type="checkbox" checked={fixa} onChange={(e) => setFixa(e.target.checked)} className="w-5 h-5" disabled={recorrente} />
          É um {tipo === "receita" ? "ganho" : "gasto"} fixo (entra no cálculo de orçamento como fixo)
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-600 mb-2 tap-target">
          <input type="checkbox" checked={recorrente} onChange={(e) => { setRecorrente(e.target.checked); if (e.target.checked) setFixa(true); }} className="w-5 h-5" />
          Se repete todo mês
        </label>
        {recorrente && (
          <div className="mb-3">
            <label className="text-xs font-semibold text-stone-500 uppercase">Todo dia</label>
            <input value={diaRecorrencia} onChange={(e) => setDiaRecorrencia(e.target.value.replace(/\D/g, ""))} className="w-20 border border-stone-300 rounded-xl p-2.5 mt-1 font-mono2" aria-label="Dia do mês da recorrência" />
          </div>
        )}

        <div className="flex gap-2 mt-2">
          {lancamento && !lancamento.previsto && (
            <button onClick={() => onRemover(lancamento)} className="py-2.5 px-4 rounded-lg border border-red-300 text-red-500 font-semibold tap-target">Excluir</button>
          )}
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={tentarSalvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- LinhaLancamento — item da lista do extrato ---------- */
function LinhaLancamento({ item, categoria, onAbrir }) {
  const cor = item.tipo === "receita" ? "text-emerald-700" : "text-red-500";
  const sinal = item.tipo === "receita" ? "+" : "−";
  return (
    <button onClick={() => onAbrir(item)} className="w-full flex items-center justify-between bg-white border border-stone-200 rounded-xl p-3 gap-2 tap-target text-left">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-xl shrink-0">{categoria?.icone || "🏷️"}</span>
        <div className="min-w-0">
          <div className="font-semibold text-stone-800 truncate flex items-center gap-1.5">
            {item.descricao}
            {item.previsto && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">previsto</span>}
          </div>
          <div className="text-xs text-stone-400">{dataCurta(item.data)}{categoria ? " · " + categoria.nome : ""}</div>
        </div>
      </div>
      <div className={`font-mono2 font-bold shrink-0 ${item.previsto ? "text-stone-400" : cor}`}>{sinal} {brl(item.valor)}</div>
    </button>
  );
}

/* Monta o lançamento de ajuste — usado pelos dois fluxos da Fase 2 (manual e conciliação).
   Sempre visível no histórico, nunca corrige o saldo escondido (seção 6 do mapa). */
function montarLancamentoAjuste({ valor, motivo, contaId, dataIso }) {
  const positivo = valor > 0;
  return {
    id: uid(),
    tipo: positivo ? "receita" : "despesa",
    descricao: "Ajuste: " + motivo.trim(),
    categoria_id: positivo ? "catfn_ajuste_receita" : "catfn_ajuste_despesa",
    valor: Math.abs(valor),
    data: dataIso || new Date().toISOString(),
    fixa: false, recorrente: false, dia_recorrencia: null,
    forma_pagamento: null, conta_id: contaId, origem_fixo_id: null,
    eh_ajuste: true,
  };
}

/* ---------- ModalAjusteManual — Fase 2: sempre disponível, corrige na hora sem comparar nada ---------- */
function ModalAjusteManual({ conta, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [direcao, setDirecao] = useState("aumentar");
  const [valorTexto, setValorTexto] = useState("");
  const [motivo, setMotivo] = useState("");

  function salvar() {
    const valor = parsePrecoInteligente(valorTexto);
    if (valor == null || valor <= 0) { alert("Preenche o valor do ajuste."); return; }
    if (!motivo.trim()) { alert("Descreve o motivo — esse ajuste fica visível no histórico com esse texto."); return; }
    onSalvar(montarLancamentoAjuste({ valor: direcao === "aumentar" ? valor : -valor, motivo, contaId: conta.id }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">⚖️ Ajuste manual</h3>
        <p className="text-xs text-stone-500 mb-3">Pra quando você já sabe que o saldo está errado — erro de digitação, esqueceu de lançar algo, ou o app calculou diferente do esperado. Fica sempre visível no histórico, nunca corrige escondido.</p>

        <div className="flex gap-2 mb-3">
          <Chip selected={direcao === "aumentar"} onClick={() => setDirecao("aumentar")}>▲ Aumentar saldo</Chip>
          <Chip selected={direcao === "diminuir"} onClick={() => setDirecao("diminuir")}>▼ Diminuir saldo</Chip>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor do ajuste</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 5000 = R$50,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor do ajuste" />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Motivo</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex: esqueci de lançar o Uber de terça" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-4" aria-label="Motivo do ajuste" />

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar ajuste</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalConciliacao — Fase 2: compara saldo real do banco com o calculado ---------- */
function ModalConciliacao({ conta, saldoCalculado, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [saldoRealTexto, setSaldoRealTexto] = useState(formatarValorCampo(saldoCalculado));
  const [motivo, setMotivo] = useState("Conciliação com o banco");
  const saldoReal = parsePrecoInteligente(saldoRealTexto);
  const diferenca = saldoReal != null ? Math.round((saldoReal - saldoCalculado) * 100) / 100 : null;
  const bateu = diferenca != null && Math.abs(diferenca) < 0.01;

  function confirmar() {
    if (bateu || diferenca == null) { onFechar(); return; }
    if (!motivo.trim()) { alert("Descreve o motivo do ajuste."); return; }
    onSalvar(montarLancamentoAjuste({ valor: diferenca, motivo, contaId: conta.id }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">🔄 Conciliar com o banco</h3>
        <p className="text-xs text-stone-500 mb-3">Abre o extrato do banco de verdade e digita o saldo de agora. Se bater, só confirma. Se não bater, a diferença vira um ajuste visível.</p>

        <div className="bg-stone-50 rounded-lg p-2.5 mb-3 text-sm flex items-center justify-between">
          <span className="text-stone-500">Saldo calculado no app</span>
          <span className="font-mono2 font-bold text-stone-800">{brl(saldoCalculado)}</span>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Saldo real (do banco, agora)</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={saldoRealTexto} onChange={(e) => setSaldoRealTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Saldo real do banco" />
        </div>

        {saldoReal != null && (
          bateu ? (
            <div className="bg-emerald-50 text-emerald-700 rounded-lg p-3 text-sm font-semibold mb-3">✓ Bateu certinho — nada pra ajustar.</div>
          ) : (
            <div className="bg-amber-50 text-amber-800 rounded-lg p-3 text-sm mb-3">
              <div className="font-semibold mb-2">Diferença de {brl(Math.abs(diferenca))} ({diferenca > 0 ? "a mais" : "a menos"} do que o calculado)</div>
              <label className="text-xs font-semibold uppercase">Motivo do ajuste</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full border border-amber-300 rounded-lg p-2 mt-1 text-sm" aria-label="Motivo do ajuste de conciliação" />
            </div>
          )
        )}

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">{bateu ? "Confirmar" : "Criar ajuste"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- TelaExtrato — dashboard + navegação por mês + lista (tela principal) ---------- */
/* ---------- ModalReflexaoMensal — Fase 3: reflexão estilo Kakebo ao fechar um mês ---------- */
function ModalReflexaoMensal({ chaveMes, reflexaoExistente, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [corte, setCorte] = useState(reflexaoExistente?.corte || "");
  const [manter, setManter] = useState(reflexaoExistente?.manter || "");
  const [sentimento, setSentimento] = useState(reflexaoExistente?.sentimento || "ok");

  function salvar() {
    onSalvar({ corte: corte.trim(), manter: manter.trim(), sentimento, data: new Date().toISOString() });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📝 Como foi {nomeDaChaveMes(chaveMes)}?</h3>
        <p className="text-xs text-stone-500 mb-4">Reflexão rápida, estilo Kakebo — não é sobre os números, é sobre o que você aprendeu. Tudo opcional.</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Como você se sente sobre esse mês?</label>
        <div className="flex gap-2 mt-1 mb-3 flex-wrap">
          <Chip selected={sentimento === "tranquilo"} onClick={() => setSentimento("tranquilo")}>😊 Tranquilo</Chip>
          <Chip selected={sentimento === "ok"} onClick={() => setSentimento("ok")}>😐 Na média</Chip>
          <Chip selected={sentimento === "apertado"} onClick={() => setSentimento("apertado")}>😟 Apertado</Chip>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">O que você cortaria, se pudesse voltar?</label>
        <textarea value={corte} onChange={(e) => setCorte(e.target.value)} rows={2} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" placeholder="opcional" />

        <label className="text-xs font-semibold text-stone-500 uppercase">O que valeu a pena manter?</label>
        <textarea value={manter} onChange={(e) => setManter(e.target.value)} rows={2} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-4" placeholder="opcional" />

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar reflexão</button>
        </div>
      </div>
    </div>
  );
}

function TelaExtrato({ categorias, contas, lancamentos, onSalvarLancamento, onRemoverLancamento, lancamentosFixos, setLancamentosFixos, lembretes5Dias, limiar5Dias, onAdiar5Dias, onConfirmarLembrete, onDescartarLembrete, reflexoesMensais, onSalvarReflexao, onAbrirConfig }) {
  const [chaveMes, setChaveMes] = useState(chaveMesAtual());
  const [modalLancamento, setModalLancamento] = useState(null); // null | {} (novo) | item (editar)
  const [tipoNovo, setTipoNovo] = useState("despesa");
  const [confirmar, setConfirmar] = useState(null);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [modalConciliacao, setModalConciliacao] = useState(false);
  const [modalReflexao, setModalReflexao] = useState(false);

  const conta = contas[0] || null; // Fase 1: uma conta principal implícita quando só existe uma

  if (!contas.length) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="text-center py-12">
          <div className="text-5xl mb-3">💰</div>
          <p className="text-stone-500 mb-4">Cadastra sua primeira conta pra começar a acompanhar entradas e saídas.</p>
          <button onClick={onAbrirConfig} className="bg-emerald-700 text-white font-semibold px-5 py-3 rounded-xl tap-target">Cadastrar conta</button>
        </div>
      </div>
    );
  }

  const reaisDoMes = lancamentosDoMes(lancamentos, chaveMes, conta?.id);
  const previstos = previstosDoMes(lancamentosFixos, lancamentos, chaveMes, conta?.id);
  const itensDoMes = [...reaisDoMes, ...previstos].sort((a, b) => new Date(a.data) - new Date(b.data));
  const { entradas, saidas, saldoDoMes } = totaisDoMes(itensDoMes);
  const saldoConta = calcularSaldoConta(conta, lancamentos, chaveMesEhFutura(chaveMes) ? null : chaveMes);
  const lembretesVencidos = lembretes5Dias.filter((l) => new Date(l.data_lembrete) <= new Date());
  const mesPassado = chaveMes < chaveMesAtual();
  const reflexaoDesseMes = reflexoesMensais[chaveMes];

  function salvarLancamento(dados) {
    if (dados.previsto) return; // segurança, nunca deveria salvar um item previsto direto
    onSalvarLancamento(dados);
    setModalLancamento(null);
  }
  function confirmarPrevisto(previsto) {
    // vira lançamento real, vinculado ao fixo de origem — abre editável antes de confirmar de fato
    const { id, previsto: _p, fixo_id, ...resto } = previsto;
    setModalLancamento({ ...resto, id: uid(), origem_fixo_id: fixo_id });
  }
  function removerLancamento(item) {
    setConfirmar({
      titulo: "Excluir lançamento", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${item.descricao}" (${brl(item.valor)})? Não dá pra desfazer.`,
      acao: () => {
        onRemoverLancamento(item.id);
        if (item.recorrente) {
          setConfirmar({
            titulo: "Também é recorrente", severo: false, textoConfirmar: "Parar de repetir",
            mensagem: `Esse lançamento também se repete todo mês. Quer parar a recorrência, ou só excluir esse mês?`,
            acao: () => { setLancamentosFixos((fs) => fs.filter((f) => f.id !== item.origem_fixo_id)); setConfirmar(null); setModalLancamento(null); },
          });
        } else { setConfirmar(null); setModalLancamento(null); }
      },
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        <div className="flex items-center justify-between bg-white border border-stone-200 rounded-xl p-2 mb-2">
          <button onClick={() => setChaveMes(mesAnteriorDe(chaveMes))} aria-label="Mês anterior" className="tap-target text-emerald-700 font-bold text-lg px-2">◀</button>
          <div className="font-bold text-stone-800">{nomeDaChaveMes(chaveMes)}</div>
          <button onClick={() => setChaveMes(mesSeguinte(chaveMes))} aria-label="Próximo mês" className="tap-target text-emerald-700 font-bold text-lg px-2">▶</button>
        </div>

        {lembretesVencidos.map((l) => (
          <div key={l.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
            <div className="text-xs text-amber-700 font-semibold mb-1">🕐 Você tinha adiado esse gasto — decidir agora?</div>
            <div className="text-sm text-stone-700 mb-2">{l.descricao} — <b className="font-mono2">{brl(l.valor)}</b></div>
            <div className="flex gap-2">
              <button onClick={() => onDescartarLembrete(l.id)} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-sm font-semibold tap-target">Descartar</button>
              <button onClick={() => onConfirmarLembrete(l)} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold tap-target">Confirmar gasto</button>
            </div>
          </div>
        ))}

        {mesPassado && (
          <button onClick={() => setModalReflexao(true)} className="w-full text-left bg-white border border-stone-200 rounded-xl p-3 mb-2 flex items-center justify-between tap-target">
            <span className="text-sm text-stone-600">{reflexaoDesseMes ? "✓ Refletido sobre esse mês" : "📝 Fazer reflexão desse mês"}</span>
            <span className="text-stone-400 text-xs">{reflexaoDesseMes ? "editar" : "→"}</span>
          </button>
        )}

        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-2">
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            <div><div className="text-[10px] text-stone-400 uppercase">Entradas</div><div className="font-mono2 font-bold text-emerald-700 text-sm">{brl(entradas)}</div></div>
            <div><div className="text-[10px] text-stone-400 uppercase">Saídas</div><div className="font-mono2 font-bold text-red-500 text-sm">{brl(saidas)}</div></div>
            <div><div className="text-[10px] text-stone-400 uppercase">Saldo do mês</div><div className={`font-mono2 font-bold text-sm ${saldoDoMes >= 0 ? "text-emerald-700" : "text-red-500"}`}>{brl(saldoDoMes)}</div></div>
          </div>
          <div className="border-t border-stone-100 pt-2 flex items-center justify-between">
            <span className="text-xs text-stone-500">Saldo da conta{contas.length > 1 ? ` (${conta.nome})` : ""}{chaveMesEhFutura(chaveMes) ? " · projetado" : ""}</span>
            <span className="font-mono2 font-bold text-stone-800">{brl(saldoConta)}</span>
          </div>
          {!chaveMesEhFutura(chaveMes) && (
            <div className="flex gap-3 mt-2 pt-2 border-t border-stone-100">
              <button onClick={() => setModalAjuste(true)} className="text-xs text-stone-500 font-semibold tap-target">⚖️ Ajuste manual</button>
              <button onClick={() => setModalConciliacao(true)} className="text-xs text-stone-500 font-semibold tap-target">🔄 Conciliar</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-2">
        {!itensDoMes.length && (
          <div className="text-center py-10 text-stone-400 text-sm">Nenhum lançamento nesse mês ainda.</div>
        )}
        {itensDoMes.map((item) => (
          <LinhaLancamento key={item.id} item={item} categoria={by(categorias, item.categoria_id)} onAbrir={item.previsto ? confirmarPrevisto : setModalLancamento} />
        ))}
      </div>

      <div className="p-4 pt-0 shrink-0">
        <button onClick={() => { setTipoNovo("despesa"); setModalLancamento({}); }} className="w-full bg-emerald-700 text-white font-semibold py-3 rounded-xl tap-target">+ Novo lançamento</button>
      </div>

      {modalLancamento !== null && (
        <ModalLancamento
          lancamento={modalLancamento.id ? modalLancamento : null}
          tipoInicial={tipoNovo}
          categorias={categorias}
          contas={contas}
          contaPadraoId={conta?.id}
          limiar5Dias={limiar5Dias}
          onSalvar={salvarLancamento}
          onAdiar5Dias={(dados) => { onAdiar5Dias(dados); setModalLancamento(null); }}
          onRemover={removerLancamento}
          onFechar={() => setModalLancamento(null)}
        />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalAjuste && conta && (
        <ModalAjusteManual conta={conta} onSalvar={(dados) => { onSalvarLancamento(dados); setModalAjuste(false); }} onFechar={() => setModalAjuste(false)} />
      )}
      {modalConciliacao && conta && (
        <ModalConciliacao conta={conta} saldoCalculado={saldoConta} onSalvar={(dados) => { onSalvarLancamento(dados); setModalConciliacao(false); }} onFechar={() => setModalConciliacao(false)} />
      )}
      {modalReflexao && (
        <ModalReflexaoMensal chaveMes={chaveMes} reflexaoExistente={reflexaoDesseMes} onSalvar={(dados) => { onSalvarReflexao(chaveMes, dados); setModalReflexao(false); }} onFechar={() => setModalReflexao(false)} />
      )}
    </div>
  );
}

/* ---------- TelaConfigFinancas — categorias + contas (Fase 1: bem simples) ---------- */
function TelaConfigFinancas({ categorias, setCategorias, contas, setContas, lancamentos, limiar5Dias, setLimiar5Dias }) {
  const [subaba, setSubaba] = useState("contas");
  const [formConta, setFormConta] = useState(null);
  const [formCategoria, setFormCategoria] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [limiarTexto, setLimiarTexto] = useState(formatarValorCampo(limiar5Dias));

  function salvarConta(dados) { setContas((cs) => upsertBy(cs, dados)); setFormConta(null); }
  function removerConta(conta) {
    const temLancamento = lancamentos.some((l) => l.conta_id === conta.id);
    setConfirmar({
      titulo: "Excluir conta", severo: true, textoConfirmar: "Excluir",
      mensagem: temLancamento ? `Essa conta tem lançamentos vinculados. Excluir "${conta.nome}" mesmo assim? Os lançamentos continuam existindo, mas ficam sem conta.` : `Excluir "${conta.nome}"?`,
      acao: () => { setContas((cs) => cs.filter((c) => c.id !== conta.id)); setConfirmar(null); },
    });
  }
  function salvarCategoria(dados) { setCategorias((cs) => upsertBy(cs, dados)); setFormCategoria(null); }
  function removerCategoria(cat) {
    setConfirmar({
      titulo: "Excluir categoria", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${cat.nome}"? Lançamentos que já usam essa categoria continuam existindo.`,
      acao: () => { setCategorias((cs) => cs.filter((c) => c.id !== cat.id)); setConfirmar(null); },
    });
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex gap-2 mb-4">
        <Chip selected={subaba === "contas"} onClick={() => setSubaba("contas")}>Contas</Chip>
        <Chip selected={subaba === "categorias"} onClick={() => setSubaba("categorias")}>Categorias</Chip>
        <Chip selected={subaba === "preferencias"} onClick={() => setSubaba("preferencias")}>Preferências</Chip>
      </div>

      {subaba === "contas" && (
        <>
          <button onClick={() => setFormConta({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Conta</button>
          <div className="space-y-2">
            {contas.map((c) => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                <div><div className="font-semibold text-stone-800">{c.nome}</div><div className="text-xs text-stone-400 font-mono2">Saldo atual: {brl(calcularSaldoConta(c, lancamentos, null))}</div></div>
                <div className="flex gap-3"><button onClick={() => setFormConta(c)} aria-label={`Editar ${c.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerConta(c)} aria-label={`Excluir ${c.nome}`} className="text-red-400 tap-target">🗑️</button></div>
              </div>
            ))}
            {!contas.length && <p className="text-sm text-stone-400 text-center py-6">Nenhuma conta ainda.</p>}
          </div>
        </>
      )}

      {subaba === "categorias" && (
        <>
          <button onClick={() => setFormCategoria({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Categoria</button>
          {["receita", "despesa"].map((tipo) => (
            <div key={tipo} className="mb-4">
              <div className="text-xs font-semibold text-stone-400 uppercase mb-2">{tipo === "receita" ? "Receitas" : "Despesas"}</div>
              <div className="space-y-2">
                {categorias.filter((c) => c.tipo === tipo).map((c) => (
                  <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                    <div className="text-stone-800">{c.icone} {c.nome}{c.padrao_fixa && <span className="text-xs text-stone-400 ml-1">(fixo)</span>}</div>
                    <div className="flex gap-3"><button onClick={() => setFormCategoria(c)} aria-label={`Editar ${c.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerCategoria(c)} aria-label={`Excluir ${c.nome}`} className="text-red-400 tap-target">🗑️</button></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {subaba === "preferencias" && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 mb-1">🕐 Teste dos 5 dias</div>
          <p className="text-xs text-stone-500 mb-3">Toda despesa variável a partir desse valor oferece a opção de esperar 5 dias antes de confirmar.</p>
          <label className="text-xs font-semibold text-stone-500 uppercase">A partir de</label>
          <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1">
            <span className="text-stone-400 font-mono2">R$</span>
            <input value={limiarTexto} onChange={(e) => setLimiarTexto(sanitizarEntradaPreco(e.target.value))} onBlur={() => { const v = parsePrecoInteligente(limiarTexto); if (v != null && v > 0) setLimiar5Dias(v); else setLimiarTexto(formatarValorCampo(limiar5Dias)); }} className="font-mono2 font-bold flex-1 outline-none" aria-label="Limiar do teste dos 5 dias" />
          </div>
        </div>
      )}

      {formConta !== null && <ModalConta conta={formConta.id ? formConta : null} onSalvar={salvarConta} onFechar={() => setFormConta(null)} />}
      {formCategoria !== null && <ModalCategoriaFinanceira categoria={formCategoria.id ? formCategoria : null} onSalvar={salvarCategoria} onFechar={() => setFormCategoria(null)} />}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* ---------- ModalMeta — Fase 4: criar/editar reserva ou meta ---------- */
function ModalMeta({ meta, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(meta?.nome || "");
  const [icone, setIcone] = useState(meta?.icone || "🎯");
  const [valorAlvoTexto, setValorAlvoTexto] = useState(meta?.valor_alvo != null ? formatarValorCampo(meta.valor_alvo) : "");
  const [tipo, setTipo] = useState(meta?.tipo || "unica");

  function salvar() {
    const valorAlvo = parsePrecoInteligente(valorAlvoTexto);
    if (!nome.trim()) { alert("Dá um nome pra essa meta (ex: Reserva de emergência, IPVA 2027)."); return; }
    if (valorAlvo == null || valorAlvo <= 0) { alert("Preenche o valor alvo."); return; }
    onSalvar({ id: meta?.id || uid(), nome: nome.trim(), icone: icone.trim() || "🎯", valor_alvo: valorAlvo, valor_guardado: meta?.valor_guardado || 0, tipo });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{meta ? "Editar meta" : "Nova meta"}</h3>

        <div className="flex gap-2 mb-3">
          <input value={icone} onChange={(e) => setIcone(e.target.value)} className="w-16 text-center text-xl border border-stone-300 rounded-xl p-2.5" aria-label="Ícone" maxLength={2} />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Reserva de emergência, IPVA..." className="flex-1 border border-stone-300 rounded-xl p-2.5" aria-label="Nome da meta" />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor alvo</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorAlvoTexto} onChange={(e) => setValorAlvoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 500000 = R$5.000,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor alvo" />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Tipo</label>
        <div className="flex gap-2 mt-1 mb-4">
          <Chip selected={tipo === "unica"} onClick={() => setTipo("unica")}>Meta única</Chip>
          <Chip selected={tipo === "sazonal"} onClick={() => setTipo("sazonal")}>Sazonal recorrente</Chip>
        </div>
        {tipo === "sazonal" && <p className="text-xs text-stone-400 -mt-3 mb-3">Depois de bater a meta, você pode reiniciar pro próximo ciclo (ex: "IPVA 2027" → "IPVA 2028") sem perder o histórico de aportes.</p>}

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalAporteMeta — Fase 4: guardar dinheiro numa meta ---------- */
function ModalAporteMeta({ meta, contas, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [valorTexto, setValorTexto] = useState("");
  const [registrarComoDespesa, setRegistrarComoDespesa] = useState(true);
  const [contaId, setContaId] = useState(contas[0]?.id || null);

  function salvar() {
    const valor = parsePrecoInteligente(valorTexto);
    if (valor == null || valor <= 0) { alert("Preenche quanto você vai guardar."); return; }
    onSalvar({ valor, registrarComoDespesa: registrarComoDespesa && !!contaId, contaId });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">{meta.icone} Guardar em "{meta.nome}"</h3>
        <p className="text-xs text-stone-500 mb-3">Já guardado: {brl(meta.valor_guardado)} de {brl(meta.valor_alvo)}</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Quanto vai guardar agora</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 10000 = R$100,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor a guardar" autoFocus />
        </div>

        {contas.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-stone-600 mb-3 tap-target">
            <input type="checkbox" checked={registrarComoDespesa} onChange={(e) => setRegistrarComoDespesa(e.target.checked)} className="w-5 h-5" />
            Também registrar como despesa (esse dinheiro sai da conta)
          </label>
        )}
        {registrarComoDespesa && contas.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {contas.map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- TelaMetas — Fase 4: reservas e metas com progresso ---------- */
function TelaMetas({ metas, setMetas, contas, onAporteComoDespesa }) {
  const [formMeta, setFormMeta] = useState(null);
  const [modalAporte, setModalAporte] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  function salvarMeta(dados) { setMetas((ms) => upsertBy(ms, dados)); setFormMeta(null); }
  function removerMeta(meta) {
    setConfirmar({
      titulo: "Excluir meta", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${meta.nome}"? O valor já guardado não é devolvido a lugar nenhum — só o registro da meta some.`,
      acao: () => { setMetas((ms) => ms.filter((m) => m.id !== meta.id)); setConfirmar(null); },
    });
  }
  function aplicarAporte(meta, { valor, registrarComoDespesa, contaId }) {
    setMetas((ms) => ms.map((m) => (m.id === meta.id ? { ...m, valor_guardado: m.valor_guardado + valor } : m)));
    if (registrarComoDespesa && contaId) {
      onAporteComoDespesa({
        id: uid(), tipo: "despesa", descricao: "Guardado para: " + meta.nome, categoria_id: "catfn_aporte_meta",
        valor, data: new Date().toISOString(), fixa: false, recorrente: false, dia_recorrencia: null,
        forma_pagamento: null, conta_id: contaId, origem_fixo_id: null,
      });
    }
    setModalAporte(null);
  }
  function reiniciarCiclo(meta) {
    setConfirmar({
      titulo: "Reiniciar pro próximo ciclo", severo: false, textoConfirmar: "Reiniciar",
      mensagem: `Zera o valor guardado de "${meta.nome}" pra recomeçar. Não esquece de editar o nome também (ex: trocar "2027" por "2028").`,
      acao: () => { setMetas((ms) => ms.map((m) => (m.id === meta.id ? { ...m, valor_guardado: 0 } : m))); setConfirmar(null); },
    });
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <button onClick={() => setFormMeta({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Nova meta</button>

      {!metas.length && <p className="text-sm text-stone-400 text-center py-10">Nenhuma meta ainda. Reserva de emergência, IPVA, uma viagem — qualquer coisa que você queira guardar aos poucos entra aqui.</p>}

      <div className="space-y-3">
        {metas.map((m) => {
          const pct = Math.min(100, (m.valor_guardado / m.valor_alvo) * 100);
          const batida = m.valor_guardado >= m.valor_alvo;
          return (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl shrink-0">{m.icone}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-stone-800 truncate">{m.nome}</div>
                    <div className="text-xs text-stone-400">{m.tipo === "sazonal" ? "Sazonal recorrente" : "Meta única"}</div>
                  </div>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => setFormMeta(m)} aria-label={`Editar ${m.nome}`} className="text-stone-400 tap-target">✏️</button>
                  <button onClick={() => removerMeta(m)} aria-label={`Excluir ${m.nome}`} className="text-red-400 tap-target">🗑️</button>
                </div>
              </div>

              {batida ? (
                <div className="bg-emerald-50 text-emerald-700 font-semibold text-sm rounded-lg p-2.5 text-center mb-3">✓ Meta batida! {brl(m.valor_guardado)} de {brl(m.valor_alvo)}</div>
              ) : (
                <>
                  <div className="w-full bg-stone-100 rounded-full h-2.5 mb-1.5">
                    <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: pct + "%" }} />
                  </div>
                  <div className="text-xs text-stone-500 font-mono2 mb-3">{brl(m.valor_guardado)} de {brl(m.valor_alvo)} ({Math.round(pct)}%)</div>
                </>
              )}

              <div className="flex gap-2">
                <button onClick={() => setModalAporte(m)} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold tap-target">+ Guardar</button>
                {batida && m.tipo === "sazonal" && (
                  <button onClick={() => reiniciarCiclo(m)} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-sm font-semibold tap-target">↻ Reiniciar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {formMeta !== null && <ModalMeta meta={formMeta.id ? formMeta : null} onSalvar={salvarMeta} onFechar={() => setFormMeta(null)} />}
      {modalAporte && <ModalAporteMeta meta={modalAporte} contas={contas} onSalvar={(dados) => aplicarAporte(modalAporte, dados)} onFechar={() => setModalAporte(null)} />}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* ---------- ModalUploadDocumento — Fase 5: anexa PDF/foto, extrai texto, confere e vincula ---------- */
function ModalUploadDocumento({ tipoDocumento, lancamentos, categorias, contas, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [arquivo, setArquivo] = useState(null); // { base64, mimeType, nomeArquivo }
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [avisoEscaneado, setAvisoEscaneado] = useState(false);
  const [valorEncontrado, setValorEncontrado] = useState(null);
  const [lancamentoEscolhidoId, setLancamentoEscolhidoId] = useState(null);
  const [criandoNovo, setCriandoNovo] = useState(false);

  const tipoLancamento = tipoDocumento === "entrada" ? "receita" : "despesa";
  const candidatos = lancamentos
    .filter((l) => l.tipo === tipoLancamento && !l.documento_id)
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 15);

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setAvisoEscaneado(false);
    setProcessando(true);
    try {
      const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (ehPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        setArquivo({ base64, mimeType: "application/pdf", nomeArquivo: file.name });
        const texto = await extrairTextoDoPdf(arrayBuffer);
        if (texto.trim().length > 50) {
          setValorEncontrado(extrairTotalDoTextoOcr(texto));
        } else {
          setAvisoEscaneado(true);
        }
      } else {
        const base64Comprimido = await resizeImage(file, 1000, 0.75);
        setArquivo({ base64: base64Comprimido, mimeType: "image/jpeg", nomeArquivo: file.name });
        const Tesseract = await carregarTesseract();
        const resultado = await Tesseract.recognize(file, "por");
        setValorEncontrado(extrairTotalDoTextoOcr(resultado.data.text));
      }
    } catch (err) {
      setErro("Não consegui ler esse arquivo: " + err.message);
    } finally {
      setProcessando(false);
    }
  }

  function vincular() {
    if (!lancamentoEscolhidoId) { alert("Escolhe um lançamento pra vincular."); return; }
    onSalvar({ arquivo, lancamentoId: lancamentoEscolhidoId, criarNovo: false });
  }

  if (criandoNovo && arquivo) {
    return (
      <ModalLancamento
        tipoInicial={tipoLancamento}
        categorias={categorias}
        contas={contas}
        valorInicial={valorEncontrado}
        onSalvar={(dadosLancamento) => onSalvar({ arquivo, lancamentoId: null, criarNovo: true, dadosLancamento })}
        onFechar={() => setCriandoNovo(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">{tipoDocumento === "entrada" ? "📥 Anexar documento de entrada" : "📤 Anexar documento de saída"}</h3>
        <p className="text-xs text-stone-500 mb-3">{tipoDocumento === "entrada" ? "Contracheque, comprovante de recebimento..." : "Boleto, nota fiscal, comprovante de pagamento..."}</p>

        {!arquivo && !processando && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
            📎 Escolher PDF ou foto
            <input type="file" accept=".pdf,image/*" onChange={aoEscolherArquivo} className="hidden" />
          </label>
        )}
        {processando && (
          <div className="text-center py-8">
            <div className="text-sm text-stone-500">Lendo o documento...</div>
            <div className="text-xs text-stone-400 mt-1">Pode levar alguns segundos</div>
          </div>
        )}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

        {arquivo && !processando && (
          <>
            <div className="bg-stone-50 rounded-lg p-2.5 mb-3 text-xs text-stone-600 flex items-center gap-2">
              <span>{arquivo.mimeType === "application/pdf" ? "📄" : "🖼️"}</span>
              <span className="truncate">{arquivo.nomeArquivo}</span>
            </div>

            {avisoEscaneado && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-3">Esse PDF parece ser uma imagem escaneada — não consegui ler o texto de dentro dele. Escolhe um lançamento abaixo ou cria um novo preenchendo o valor na mão.</p>
            )}
            {valorEncontrado != null && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2.5 mb-3 font-semibold">Valor identificado: {brl(valorEncontrado)} — confira antes de confirmar.</p>
            )}

            {candidatos.length > 0 && (
              <>
                <label className="text-xs font-semibold text-stone-500 uppercase">Vincular a um lançamento já existente</label>
                <div className="space-y-1.5 mt-1 mb-3 max-h-48 overflow-y-auto">
                  {candidatos.map((l) => (
                    <button key={l.id} onClick={() => setLancamentoEscolhidoId(l.id)} className={`w-full text-left p-2.5 rounded-lg border text-sm flex items-center justify-between tap-target ${lancamentoEscolhidoId === l.id ? "border-emerald-600 bg-emerald-50" : "border-stone-200"}`}>
                      <span className="truncate">{l.descricao} · {dataCurta(l.data)}</span>
                      <span className="font-mono2 font-semibold shrink-0 ml-2">{brl(l.valor)}</span>
                    </button>
                  ))}
                </div>
                <button onClick={vincular} disabled={!lancamentoEscolhidoId} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target disabled:opacity-40 mb-2">Vincular a esse lançamento</button>
                <div className="text-center text-xs text-stone-400 mb-2">— ou —</div>
              </>
            )}

            <button onClick={() => setCriandoNovo(true)} className="w-full py-2.5 rounded-lg border border-emerald-700 text-emerald-700 font-semibold tap-target">+ Criar lançamento novo com esse documento</button>
          </>
        )}

        <button onClick={onFechar} className="w-full py-2.5 mt-3 text-stone-500 font-semibold tap-target">Cancelar</button>
      </div>
    </div>
  );
}

/* ---------- TelaDocumentos — Fase 5: arquivo de documentos, entrada e saída ---------- */
function TelaDocumentos({ documentos, setDocumentos, lancamentos, onSalvarLancamento, categorias, contas }) {
  const [tipoDocumento, setTipoDocumento] = useState("saida");
  const [modalUpload, setModalUpload] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const documentosDoTipo = documentos.filter((d) => d.tipo === tipoDocumento).sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
  const tamanhoTotalKB = documentos.reduce((acc, d) => acc + tamanhoAproximadoKB(d.arquivo_base64), 0);
  const espacoApertado = tamanhoTotalKB > 3000; // aviso a partir de ~3MB guardado em documentos

  function aoSalvarUpload({ arquivo, lancamentoId, criarNovo, dadosLancamento }) {
    const documentoId = uid();
    let idFinal = lancamentoId;
    if (criarNovo) {
      idFinal = dadosLancamento.id;
      onSalvarLancamento({ ...dadosLancamento, documento_id: documentoId });
    } else {
      // marca o lançamento existente como tendo documento vinculado
      const lancamentoAlvo = lancamentos.find((l) => l.id === lancamentoId);
      if (lancamentoAlvo) onSalvarLancamento({ ...lancamentoAlvo, documento_id: documentoId });
    }
    setDocumentos((ds) => [...ds, {
      id: documentoId, tipo: tipoDocumento, nome_arquivo: arquivo.nomeArquivo, arquivo_base64: arquivo.base64,
      mime_type: arquivo.mimeType, data_upload: new Date().toISOString(), lancamento_id: idFinal,
    }]);
    setModalUpload(false);
  }
  function removerDocumento(doc) {
    setConfirmar({
      titulo: "Excluir documento", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${doc.nome_arquivo}"? O lançamento vinculado continua existindo, só o documento anexado some.`,
      acao: () => { setDocumentos((ds) => ds.filter((d) => d.id !== doc.id)); setConfirmar(null); },
    });
  }
  function abrirArquivo(doc) {
    const w = window.open();
    if (!w) return;
    if (doc.mime_type === "application/pdf") { w.document.write(`<iframe src="${doc.arquivo_base64}" style="width:100%;height:100%;border:none;"></iframe>`); return; }
    if (doc.mime_type === "text/plain") {
      const texto = decodeURIComponent(escape(atob(doc.arquivo_base64.split(",")[1])));
      w.document.write(`<pre style="font-family:monospace;font-size:16px;padding:20px;white-space:pre-wrap;">${texto.replace(/</g, "&lt;")}</pre>`);
      return;
    }
    w.document.write(`<img src="${doc.arquivo_base64}" style="max-width:100%;" />`);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        <div className="flex gap-2 mb-3">
          <Chip selected={tipoDocumento === "entrada"} onClick={() => setTipoDocumento("entrada")}>📥 Entrada</Chip>
          <Chip selected={tipoDocumento === "saida"} onClick={() => setTipoDocumento("saida")}>📤 Saída</Chip>
        </div>
        {espacoApertado && (
          <div className="bg-amber-50 text-amber-800 text-xs rounded-lg p-2.5 mb-2">⚠️ Documentos já ocupam ~{(tamanhoTotalKB / 1024).toFixed(1)}MB do armazenamento do navegador (limite costuma ser 5-10MB no total, dividido com o resto do app). Se começar a dar erro de salvar, exclua documentos antigos.</div>
        )}
        <button onClick={() => setModalUpload(true)} className="w-full bg-emerald-700 text-white font-semibold py-3 rounded-xl tap-target">+ Anexar documento</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {!documentosDoTipo.length && <p className="text-sm text-stone-400 text-center py-10">Nenhum documento de {tipoDocumento === "entrada" ? "entrada" : "saída"} ainda.</p>}
        {documentosDoTipo.map((doc) => {
          const lancamentoVinculado = by(lancamentos, doc.lancamento_id);
          return (
            <div key={doc.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between gap-2">
              <button onClick={() => abrirArquivo(doc)} className="flex items-center gap-2.5 min-w-0 text-left tap-target">
                <span className="text-xl shrink-0">{doc.mime_type === "application/pdf" ? "📄" : doc.mime_type === "text/plain" ? "🧾" : "🖼️"}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-stone-800 truncate">{lancamentoVinculado?.descricao || doc.nome_arquivo}</div>
                  <div className="text-xs text-stone-400">{dataCurta(doc.data_upload)}{lancamentoVinculado ? " · " + brl(lancamentoVinculado.valor) : ""}</div>
                </div>
              </button>
              <button onClick={() => removerDocumento(doc)} aria-label="Excluir documento" className="text-red-400 tap-target shrink-0">🗑️</button>
            </div>
          );
        })}
      </div>

      {modalUpload && (
        <ModalUploadDocumento tipoDocumento={tipoDocumento} lancamentos={lancamentos} categorias={categorias} contas={contas} onSalvar={aoSalvarUpload} onFechar={() => setModalUpload(false)} />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

function TabBarFinancas({ aba, setAba }) {
  const itens = [{ id: "extrato", label: "Extrato", icon: "📋" }, { id: "metas", label: "Metas", icon: "🎯" }, { id: "documentos", label: "Docs", icon: "📄" }, { id: "config", label: "Config", icon: "⚙️" }];
  return (
    <div className="flex border-t border-stone-200 bg-white shrink-0">
      {itens.map((it) => (
        <button key={it.id} onClick={() => setAba(it.id)} aria-label={it.label} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium tap-target ${aba === it.id ? "text-emerald-700" : "text-stone-400"}`}>
          <span className="text-lg leading-none">{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- AppFinancas — app-shell do módulo (análogo ao AppMercado) ---------- */
function AppFinancas({ apiKey, setApiKey, onVoltarHub }) {
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState(null);
  const [contas, setContas] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [lancamentosFixos, setLancamentosFixos] = useState([]);
  const [lembretes5Dias, setLembretes5Dias] = useState([]);
  const [reflexoesMensais, setReflexoesMensais] = useState({});
  const [limiar5Dias, setLimiar5Dias] = useState(100);
  const [metas, setMetas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [aba, setAba] = useState("extrato");
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [erroSalvamento, setErroSalvamento] = useState(false);

  useEffect(() => {
    const d = loadAllFinancas();
    setCategorias(d.categorias); setContas(d.contas); setLancamentos(d.lancamentos); setLancamentosFixos(d.lancamentosFixos);
    setLembretes5Dias(d.lembretes5Dias); setReflexoesMensais(d.reflexoesMensais); setLimiar5Dias(d.limiar5Dias); setMetas(d.metas); setDocumentos(d.documentos);
    setErroCarregamento(!!d.houveErroCarregamento);
    setLoading(false);
  }, []);

  useEffect(() => { if (!loading && categorias) { const ok = persist("fn_categorias", categorias); if (!ok) setErroSalvamento(true); } }, [categorias, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_contas", contas); if (!ok) setErroSalvamento(true); } }, [contas, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_lancamentos", lancamentos); if (!ok) setErroSalvamento(true); } }, [lancamentos, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_lancamentosFixos", lancamentosFixos); if (!ok) setErroSalvamento(true); } }, [lancamentosFixos, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_lembretes5Dias", lembretes5Dias); if (!ok) setErroSalvamento(true); } }, [lembretes5Dias, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_reflexoesMensais", reflexoesMensais); if (!ok) setErroSalvamento(true); } }, [reflexoesMensais, loading]);
  useEffect(() => { if (!loading) localStorage.setItem("fn_limiar5Dias", String(limiar5Dias)); }, [limiar5Dias, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_metas", metas); if (!ok) setErroSalvamento(true); } }, [metas, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_documentos", documentos); if (!ok) setErroSalvamento(true); } }, [documentos, loading]);

  /* Ao salvar um lançamento marcado como recorrente, garante um id de fixo estável — usa o que já
     veio (confirmando um previsto, ou editando um recorrente existente) ou cria um novo na primeira
     vez — e grava o LANÇAMENTO REAL já vinculado a esse id (senão o mesmo mês voltaria a aparecer
     como "previsto" de novo, por não achar nenhum lançamento real ligado ao fixo). */
  const salvarLancamentosComFixo = (dadosOriginais) => {
    let dados = dadosOriginais;
    if (dados.recorrente) {
      const fixoId = dados.origem_fixo_id || uid();
      dados = { ...dados, origem_fixo_id: fixoId };
      setLancamentosFixos((fs) => upsertBy(fs, { ...dados, id: fixoId }));
    }
    setLancamentos((ls) => upsertBy(ls, dados));
  };
  function removerLancamentoReal(id) {
    setLancamentos((ls) => ls.filter((l) => l.id !== id));
  }
  /* Fase 3 — teste dos 5 dias: guarda como lembrete, NÃO cria lançamento real ainda. */
  function adiarLancamento5Dias(dados) {
    const dataLembrete = new Date();
    dataLembrete.setDate(dataLembrete.getDate() + 5);
    setLembretes5Dias((ls) => [...ls, { ...dados, id: uid(), data_lembrete: dataLembrete.toISOString() }]);
  }
  function confirmarLembrete(lembrete) {
    const { id, data_lembrete, ...dadosLancamento } = lembrete;
    salvarLancamentosComFixo({ ...dadosLancamento, id: uid(), data: new Date().toISOString() });
    setLembretes5Dias((ls) => ls.filter((l) => l.id !== lembrete.id));
  }
  function descartarLembrete(id) {
    setLembretes5Dias((ls) => ls.filter((l) => l.id !== id));
  }
  function salvarReflexao(chaveMes, dados) {
    setReflexoesMensais((r) => ({ ...r, [chaveMes]: dados }));
  }

  if (loading || !categorias) return (
    <div className="h-screen flex flex-col items-center justify-center bg-stone-100 text-stone-400 gap-2 max-w-md mx-auto">
      <div>Carregando…</div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-stone-100 max-w-md mx-auto">
      <div className="bg-emerald-800 text-white px-4 pt-4 pb-3 shrink-0 flex items-center gap-3">
        <button onClick={onVoltarHub} aria-label="Voltar ao início" className="tap-target text-emerald-200 text-xl">←</button>
        <div className="font-bold text-xl">💰 Finanças</div>
      </div>

      {erroCarregamento && (
        <div className="bg-red-600 text-white text-xs p-2 shrink-0">⚠️ Alguns dados salvos não puderam ser lidos (parecem corrompidos).</div>
      )}
      {erroSalvamento && (
        <div className="bg-red-600 text-white text-xs p-2 flex items-center justify-between gap-2 shrink-0">
          <span>⚠️ Sua última alteração não foi salva (armazenamento cheio).</span>
          <button onClick={() => setErroSalvamento(false)} className="underline font-semibold shrink-0 tap-target">Ok</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {aba === "extrato" && (
          <TelaExtrato
            categorias={categorias} contas={contas}
            lancamentos={lancamentos} onSalvarLancamento={salvarLancamentosComFixo} onRemoverLancamento={removerLancamentoReal}
            lancamentosFixos={lancamentosFixos} setLancamentosFixos={setLancamentosFixos}
            lembretes5Dias={lembretes5Dias} limiar5Dias={limiar5Dias} onAdiar5Dias={adiarLancamento5Dias}
            onConfirmarLembrete={confirmarLembrete} onDescartarLembrete={descartarLembrete}
            reflexoesMensais={reflexoesMensais} onSalvarReflexao={salvarReflexao}
            onAbrirConfig={() => setAba("config")}
          />
        )}
        {aba === "metas" && (
          <TelaMetas metas={metas} setMetas={setMetas} contas={contas} onAporteComoDespesa={salvarLancamentosComFixo} />
        )}
        {aba === "documentos" && (
          <TelaDocumentos documentos={documentos} setDocumentos={setDocumentos} lancamentos={lancamentos} onSalvarLancamento={salvarLancamentosComFixo} categorias={categorias} contas={contas} />
        )}
        {aba === "config" && (
          <TelaConfigFinancas categorias={categorias} setCategorias={setCategorias} contas={contas} setContas={setContas} lancamentos={lancamentos} limiar5Dias={limiar5Dias} setLimiar5Dias={setLimiar5Dias} />
        )}
      </div>
      <TabBarFinancas aba={aba} setAba={setAba} />
    </div>
  );
}
