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

/* ---------- Seção 15 do mapa: sub-aba Resumo — funções de cálculo dos 6 blocos ---------- */
function totaisUltimosMeses(lancamentos, contaId, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => {
    const doMes = lancamentosDoMes(lancamentos, chave, contaId);
    const { entradas, saidas } = totaisDoMes(doMes);
    return { chave, entradas, saidas };
  });
}
function saldoProjetadoDoMes(lancamentos, lancamentosFixos, chaveMes, contaId) {
  const reais = lancamentosDoMes(lancamentos, chaveMes, contaId);
  const previstos = previstosDoMes(lancamentosFixos, lancamentos, chaveMes, contaId);
  const { saldoDoMes } = totaisDoMes(reais);
  const previsaoEntradas = previstos.filter((p) => p.tipo === "receita").reduce((a, p) => a + p.valor, 0);
  const previsaoSaidas = previstos.filter((p) => p.tipo === "despesa").reduce((a, p) => a + p.valor, 0);
  return saldoDoMes + previsaoEntradas - previsaoSaidas;
}
function fixoVsVariavelDoMes(despesasDoMes) {
  const fixo = despesasDoMes.filter((d) => d.fixa).reduce((a, d) => a + d.valor, 0);
  const variavel = despesasDoMes.filter((d) => !d.fixa).reduce((a, d) => a + d.valor, 0);
  return { fixo, variavel };
}
function topGastosDoMes(despesasDoMes, quantidade) {
  return [...despesasDoMes].sort((a, b) => b.valor - a.valor).slice(0, quantidade);
}
const CORES_RESUMO_FINANCAS = ["#065f46", "#0891b2", "#7c3aed", "#c2410c", "#be123c", "#4d7c0f", "#a16207", "#0e7490"];
function corParaNome(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return CORES_RESUMO_FINANCAS[Math.abs(hash) % CORES_RESUMO_FINANCAS.length];
}

/* ---------- Fase 8 do mapa: regra de orçamento com grupos e barras de meta ---------- */
const SEED_GRUPOS_ORCAMENTO = [
  { id: "orc_necessidades", nome: "Necessidades", percentual: 50 },
  { id: "orc_desejos", nome: "Desejos", percentual: 30 },
  { id: "orc_poupanca", nome: "Poupança", percentual: 20 },
];
/* Renda mensal: usa o valor manual se o usuário definiu um; senão, soma as receitas FIXAS
   recorrentes (não soma tudo que entrou no mês — isso incluiria bônus/extra pontual e faria o
   alvo balançar mês a mês, o que não é o espírito de uma regra de orçamento estável). */
function rendaMensalCalculada(lancamentosFixos, rendaManual) {
  if (rendaManual != null) return rendaManual;
  return lancamentosFixos.filter((f) => f.tipo === "receita").reduce((a, f) => a + f.valor, 0);
}
function progressoGruposOrcamento(gruposOrcamento, categorias, despesasDoMes, renda) {
  return gruposOrcamento.map((g) => {
    const idsCategoriaDoGrupo = new Set(categorias.filter((c) => c.grupo_orcamento_id === g.id).map((c) => c.id));
    const gasto = despesasDoMes.filter((d) => idsCategoriaDoGrupo.has(d.categoria_id)).reduce((a, d) => a + d.valor, 0);
    const alvo = renda * (g.percentual / 100);
    return { ...g, gasto, alvo, pct: alvo > 0 ? Math.min(100, Math.round((gasto / alvo) * 100)) : 0, estourou: gasto > alvo };
  });
}

/* ---------- Seed — categorias padrão, pequeno conjunto pra começar (seção 12, Fase 1) ---------- */
const SEED_CATEGORIAS_FINANCEIRAS = [
  { id: "catfn_salario", nome: "Salário", icone: "💼", tipo: "receita", padrao_fixa: true, grupo_orcamento_id: null },
  { id: "catfn_extra", nome: "Extra / Freelance", icone: "💵", tipo: "receita", padrao_fixa: false, grupo_orcamento_id: null },
  { id: "catfn_outros_receita", nome: "Outros", icone: "➕", tipo: "receita", padrao_fixa: false, grupo_orcamento_id: null },
  { id: "catfn_moradia", nome: "Moradia", icone: "🏠", tipo: "despesa", padrao_fixa: true, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_mercado", nome: "Mercado", icone: "🛒", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_contas_casa", nome: "Água / Luz / Internet", icone: "💡", tipo: "despesa", padrao_fixa: true, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_transporte", nome: "Transporte", icone: "🚗", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_saude", nome: "Saúde", icone: "💊", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_educacao", nome: "Educação", icone: "📚", tipo: "despesa", padrao_fixa: true, grupo_orcamento_id: "orc_necessidades" },
  { id: "catfn_lazer", nome: "Lazer", icone: "🎉", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_desejos" },
  { id: "catfn_assinaturas", nome: "Assinaturas", icone: "📱", tipo: "despesa", padrao_fixa: true, grupo_orcamento_id: "orc_desejos" },
  { id: "catfn_outros_despesa", nome: "Outros", icone: "➖", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_desejos" },
  { id: "catfn_ajuste_receita", nome: "Ajuste de saldo", icone: "⚖️", tipo: "receita", padrao_fixa: false, grupo_orcamento_id: null },
  { id: "catfn_ajuste_despesa", nome: "Ajuste de saldo", icone: "⚖️", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: null },
  { id: "catfn_aporte_meta", nome: "Guardado em reserva/meta", icone: "🎯", tipo: "despesa", padrao_fixa: false, grupo_orcamento_id: "orc_poupanca" },
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

/* ---------- Seção 14 do mapa: importação de extrato bancário ---------- */
/* pdf.js dá a posição (x,y) de cada trecho de texto, mas não reconstrói a ordem visual das
   linhas sozinho — isso precisa ser feito manualmente a partir das coordenadas, agrupando texto
   que está na mesma altura (linha) e ordenando da esquerda pra direita dentro dela. Testado com
   extrato real do usuário: 89/89 transações extraídas certas, soma batendo com o banco. */
async function reconstruirTextoComLayout(pdf) {
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linhas = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!linhas[y]) linhas[y] = [];
      linhas[y].push({ x: item.transform[4], texto: item.str });
    }
    const ysOrdenados = Object.keys(linhas).map(Number).sort((a, b) => b - a);
    for (const y of ysOrdenados) {
      const itensDaLinha = linhas[y].sort((a, b) => a.x - b.x);
      textoCompleto += itensDaLinha.map((it) => it.texto).join(" ") + "\n";
    }
    textoCompleto += "\n";
  }
  return textoCompleto;
}

/* OFX — formato estruturado (Itaú e outros bancos tradicionais), via de alta confiança. */
function parsearOfx(texto) {
  const transacoes = [];
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) || [];
  for (const bloco of blocos) {
    const dtposted = bloco.match(/<DTPOSTED>(\d{8})/);
    const trnamt = bloco.match(/<TRNAMT>(-?[\d.]+)/);
    const nameMatch = bloco.match(/<NAME>([^\n\r<]*)/) || bloco.match(/<MEMO>([^\n\r<]*)/);
    if (!dtposted || !trnamt) continue;
    const ano = dtposted[1].slice(0, 4), mes = dtposted[1].slice(4, 6), dia = dtposted[1].slice(6, 8);
    const valor = parseFloat(trnamt[1]);
    transacoes.push({
      data: new Date(`${ano}-${mes}-${dia}T12:00:00`).toISOString(),
      descricao: (nameMatch ? nameMatch[1] : "Transação").trim(),
      valor: Math.abs(valor),
      tipo: valor >= 0 ? "receita" : "despesa",
    });
  }
  return transacoes;
}

/* PDF do Mercado Pago — melhor esforço, cada transação tem uma "linha âncora" com data + ID
   numérico + valor + saldo; a descrição (1-4 linhas) fica em volta dela no mesmo bloco separado
   por linha em branco. Parser baseado nesse padrão de âncora, não em posição fixa de coluna. */
function parsearExtratoMercadoPago(texto) {
  const inicioIdx = texto.indexOf("DETALHE DOS MOVIMENTOS");
  let corpo = inicioIdx >= 0 ? texto.slice(inicioIdx) : texto;
  corpo = corpo.replace(/Data\s+Descrição\s+ID da operação\s+Valor\s+Saldo/g, "");
  corpo = corpo.replace(/\d+\/\d+/g, "");
  corpo = corpo.split("Data de geração:")[0];

  const blocos = corpo.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const padraoAncora = /(\d{2}-\d{2}-\d{4})\s*(.*?)\s*(\d{9,15})\s+R\$\s*(-?[\d.,]+)\s+R\$\s*([\d.,]+)\s*$/;

  const transacoes = [];
  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    let match = null, idxAncora = -1;
    for (let i = 0; i < linhas.length; i++) {
      const m = linhas[i].match(padraoAncora);
      if (m) { match = m; idxAncora = i; break; }
    }
    if (!match) continue;
    const [, data, descNaLinha, , valorStr] = match;
    const outrasLinhas = linhas.filter((_, j) => j !== idxAncora);
    const descricao = [descNaLinha, ...outrasLinhas].filter(Boolean).join(" ").trim();
    const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
    const [dia, mes, ano] = data.split("-");
    transacoes.push({
      data: new Date(`${ano}-${mes}-${dia}T12:00:00`).toISOString(),
      descricao,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? "receita" : "despesa",
    });
  }
  return transacoes;
}

/* Fingerprint pra deduplicação — evita reimportar a mesma transação se o extrato importado
   se sobrepuser com um período já importado antes. */
function fingerprintTransacao(t) {
  return `${t.data.slice(0, 10)}_${t.valor.toFixed(2)}_${t.tipo}_${t.descricao.slice(0, 40)}`;
}

/* Achado testando com dado real (seção 14.6 do mapa): o Mercado Pago tem sua própria "caixinha"
   — "Dinheiro reservado X" / "Dinheiro retirado X" / "Reserva por gastos X" é dinheiro se movendo
   pra dentro/fora de uma reserva nomeada, não gasto real. Detecção só sugere, nunca força. */
function pareceReservaDeMeta(descricao) {
  return /^(Dinheiro reservado|Dinheiro retirado|Reserva por gastos)\b/i.test(descricao.trim());
}
function extrairNomeReserva(descricao) {
  return descricao.replace(/^(Dinheiro reservado|Dinheiro retirado|Reserva por gastos)\s*/i, "").trim();
}

/* ---------- Fase 7 do mapa: cartão de crédito — fatura, parcelas, competência × caixa ---------- */
/* O cálculo mais delicado do módulo inteiro — testado isoladamente em todos os casos limite
   (compra no dia exato do fechamento, vencimento virando o mês) antes de usar em qualquer lugar.
   Dado o dia de fechamento e vencimento do cartão: se a compra foi ANTES ou NO dia do fechamento,
   cai na fatura que fecha nesse mês; se foi DEPOIS, cai na fatura seguinte. O vencimento é sempre
   a PRÓXIMA ocorrência do dia de vencimento depois do fechamento — funciona tanto pra cartão que
   vence no mesmo mês (fecha dia 20, vence dia 27) quanto pro que vira o mês (fecha dia 28, vence
   dia 5 do mês seguinte), sem precisar assumir qual dos dois é o caso. */
function calcularCicloFatura(cartao, dataCompraIso) {
  const d = new Date(dataCompraIso);
  const dia = d.getDate();
  let anoFech = d.getFullYear(), mesFech = d.getMonth();
  if (dia > cartao.dia_fechamento) mesFech += 1;
  const dataFechamento = new Date(anoFech, mesFech, cartao.dia_fechamento);
  let dataVencimento = new Date(dataFechamento.getFullYear(), dataFechamento.getMonth(), cartao.dia_vencimento);
  if (dataVencimento <= dataFechamento) dataVencimento = new Date(dataFechamento.getFullYear(), dataFechamento.getMonth() + 1, cartao.dia_vencimento);
  return { dataFechamento, dataVencimento };
}
/* Gera N lançamentos de uma vez (um por parcela) — cada um já datado pro dia de vencimento da
   fatura em que cai, não pro dia da compra. Isso é o que dá a "projeção de faturas futuras" de
   graça: navegar pra um mês futuro já mostra a parcela, sem precisar de mecanismo separado.
   Arredondamento: a última parcela absorve a diferença de centavos, pra soma bater exata com o
   valor total da compra sempre, mesmo quando não divide exato (testado com vários casos). */
function gerarLancamentosParcelados(compraBase, cartao, numParcelas) {
  const compraParceladaId = uid();
  const valorPorParcela = Math.round((compraBase.valorTotal / numParcelas) * 100) / 100;
  const diferenca = Math.round((compraBase.valorTotal - valorPorParcela * numParcelas) * 100) / 100;
  const dataBase = new Date(compraBase.data);
  const lista = [];
  for (let k = 1; k <= numParcelas; k++) {
    const dataEquivalente = new Date(dataBase.getFullYear(), dataBase.getMonth() + (k - 1), dataBase.getDate());
    const { dataVencimento } = calcularCicloFatura(cartao, dataEquivalente.toISOString());
    const valorDessaParcela = k === numParcelas ? Math.round((valorPorParcela + diferenca) * 100) / 100 : valorPorParcela;
    lista.push({
      id: uid(), tipo: "despesa",
      descricao: numParcelas > 1 ? `${compraBase.descricao} (${k}/${numParcelas})` : compraBase.descricao,
      categoria_id: compraBase.categoria_id, valor: valorDessaParcela, data: dataVencimento.toISOString(),
      fixa: false, recorrente: false, dia_recorrencia: null, forma_pagamento: "cartao",
      conta_id: compraBase.conta_id, origem_fixo_id: null, documento_id: null,
      cartao_id: cartao.id, parcela_atual: k, parcela_total: numParcelas, compra_parcelada_id: compraParceladaId,
    });
  }
  return lista;
}
/* Aba de faturas por item (seção 7 do mapa): agrupa por compra_parcelada_id, mostra quanto falta
   de cada uma — não é uma estrutura de dado nova, é outra forma de olhar pro mesmo lançamento. */
function itensDeFaturaAgrupados(lancamentos, cartaoId) {
  const doCartao = lancamentos.filter((l) => l.forma_pagamento === "cartao" && l.cartao_id === cartaoId);
  const porCompra = {};
  for (const l of doCartao) {
    const chave = l.compra_parcelada_id || l.id;
    (porCompra[chave] = porCompra[chave] || []).push(l);
  }
  const hoje = new Date();
  return Object.values(porCompra).map((grupo) => {
    grupo.sort((a, b) => a.parcela_atual - b.parcela_atual);
    const primeira = grupo[0];
    const restantes = grupo.filter((l) => new Date(l.data) >= hoje);
    return {
      id: primeira.compra_parcelada_id || primeira.id,
      descricao: (primeira.descricao || "").replace(/\s*\(\d+\/\d+\)$/, ""),
      categoriaId: primeira.categoria_id,
      parcelaTotal: primeira.parcela_total || 1,
      parcelasRestantes: restantes.length,
      valorTotal: grupo.reduce((a, l) => a + l.valor, 0),
      valorRestante: restantes.reduce((a, l) => a + l.valor, 0),
      unica: (primeira.parcela_total || 1) <= 1,
    };
  }).sort((a, b) => b.parcelasRestantes - a.parcelasRestantes);
}
/* Projeção das próximas faturas — cai de graça, já que toda parcela futura já é um lançamento
   real (não "previsto"), só soma o que já está datado pra cada mês. */
function proximasFaturas(lancamentos, cartaoId, quantidadeMeses) {
  const doCartao = lancamentos.filter((l) => l.forma_pagamento === "cartao" && l.cartao_id === cartaoId);
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.push(mesSeguinte(chaves[chaves.length - 1]));
  return chaves.map((chave) => ({ chave, total: doCartao.filter((l) => chaveMesDe(l.data) === chave).reduce((a, l) => a + l.valor, 0) }));
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
  let categorias = null, contas = [], lancamentos = [], lancamentosFixos = [], lembretes5Dias = [], reflexoesMensais = {}, limiar5Dias = 100, metas = [], documentos = [], cartoes = [], gruposOrcamento = null, rendaManual = null;
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
  try { const v = localStorage.getItem("fn_cartoes"); cartoes = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_gruposOrcamento"); gruposOrcamento = v ? JSON.parse(v) : null; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_rendaManual"); rendaManual = v ? Number(v) : null; } catch (e) {}
  if (!categorias) categorias = SEED_CATEGORIAS_FINANCEIRAS;
  if (!gruposOrcamento) gruposOrcamento = SEED_GRUPOS_ORCAMENTO;
  return { categorias, contas, lancamentos, lancamentosFixos, lembretes5Dias, reflexoesMensais, limiar5Dias, metas, documentos, cartoes, gruposOrcamento, rendaManual, houveErroCarregamento };
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
function ModalCategoriaFinanceira({ categoria, tipoInicial, gruposOrcamento, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(categoria?.nome || "");
  const [icone, setIcone] = useState(categoria?.icone || "🏷️");
  const [tipo, setTipo] = useState(categoria?.tipo || tipoInicial || "despesa");
  const [padraoFixa, setPadraoFixa] = useState(categoria?.padrao_fixa || false);
  const [grupoOrcamentoId, setGrupoOrcamentoId] = useState(categoria?.grupo_orcamento_id || null);

  function salvar() {
    if (!nome.trim()) { alert("Dá um nome pra essa categoria."); return; }
    onSalvar({ id: categoria?.id || uid(), nome: nome.trim(), icone: icone.trim() || "🏷️", tipo, padrao_fixa: padraoFixa, grupo_orcamento_id: tipo === "despesa" ? grupoOrcamentoId : null });
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
        {tipo === "despesa" && gruposOrcamento && gruposOrcamento.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-stone-500 uppercase">Grupo do orçamento (opcional)</label>
            <div className="flex gap-2 flex-wrap mt-1">
              <Chip selected={grupoOrcamentoId === null} onClick={() => setGrupoOrcamentoId(null)}>Nenhum</Chip>
              {gruposOrcamento.map((g) => <Chip key={g.id} selected={grupoOrcamentoId === g.id} onClick={() => setGrupoOrcamentoId(g.id)}>{g.nome}</Chip>)}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalLancamento — criar/editar receita ou despesa ---------- */
function ModalLancamento({ lancamento, tipoInicial, categorias, contas, contaPadraoId, cartoes, limiar5Dias, valorInicial, documentoId, onSalvar, onAdiar5Dias, onRemover, onFechar }) {
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
  const [cartaoId, setCartaoId] = useState(lancamento?.cartao_id || cartoes?.[0]?.id || null);
  const [numParcelasTexto, setNumParcelasTexto] = useState(lancamento?.parcela_total ? String(lancamento.parcela_total) : "1");
  const [dadosPendentesTeste5Dias, setDadosPendentesTeste5Dias] = useState(null);

  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo);
  const cartaoEscolhido = (cartoes || []).find((c) => c.id === cartaoId);

  function tentarSalvar() {
    const valor = parsePrecoInteligente(valorTexto);
    if (!descricao.trim()) { alert("Descreve esse lançamento (ex: Aluguel, Supermercado)."); return; }
    if (valor == null || valor <= 0) { alert("Preenche o valor."); return; }
    if (!categoriaId) { alert("Escolhe uma categoria."); return; }
    if (!contaId) { alert("Escolhe (ou cadastra) uma conta primeiro."); return; }

    /* Fase 7: compra no cartão sempre passa pela geração de parcelas (mesmo 1x — assim a data já
       fica certa pro dia de vencimento da fatura, "caixa", não o dia da compra em si). Parcelado
       (2+) pula o teste dos 5 dias — já é uma decisão mais deliberada que uma compra à vista. */
    if (tipo === "despesa" && formaPagamento === "cartao" && cartaoEscolhido) {
      const numParcelas = Math.max(1, numDe(numParcelasTexto) || 1);
      const serie = gerarLancamentosParcelados({ descricao: descricao.trim(), categoria_id: categoriaId, valorTotal: valor, data, conta_id: contaId }, cartaoEscolhido, numParcelas);
      if (numParcelas > 1) { onSalvar(serie); return; }
      const dadosUnico = serie[0];
      const elegivel = !lancamento && !fixa && valor >= limiar5Dias;
      if (elegivel) { setDadosPendentesTeste5Dias(dadosUnico); return; }
      onSalvar(dadosUnico);
      return;
    }

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

            {formaPagamento === "cartao" && (
              (cartoes && cartoes.length > 0) ? (
                <>
                  <label className="text-xs font-semibold text-stone-500 uppercase">Qual cartão</label>
                  <div className="flex gap-2 flex-wrap mt-1 mb-3">
                    {cartoes.map((c) => <Chip key={c.id} selected={cartaoId === c.id} onClick={() => setCartaoId(c.id)}>{c.nome}</Chip>)}
                  </div>
                  <label className="text-xs font-semibold text-stone-500 uppercase">Em quantas vezes</label>
                  <input value={numParcelasTexto} onChange={(e) => setNumParcelasTexto(e.target.value.replace(/\D/g, ""))} className="w-20 border border-stone-300 rounded-xl p-2.5 mt-1 mb-1 font-mono2" aria-label="Número de parcelas" />
                  <p className="text-xs text-stone-400 mb-3">1 = à vista. Cada parcela já cai na fatura certa, calculado pelo fechamento/vencimento do cartão.</p>
                </>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-3">Nenhum cartão cadastrado ainda — cadastra um na aba 💳 Cartões pra acompanhar fatura e parcelas.</p>
              )
            )}
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

/* ---------- GraficoEntradasSaidasPorMes — barra dupla por mês (seção 15.1) ---------- */
function GraficoEntradasSaidasPorMes({ dados }) {
  const maiorValor = Math.max(...dados.flatMap((d) => [d.entradas, d.saidas]), 1);
  return (
    <div>
      <div className="flex items-end justify-between gap-2 h-24 px-1 mb-1">
        {dados.map((d) => (
          <div key={d.chave} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
            <div className="w-full flex gap-1 items-end h-full">
              <div className="flex-1 bg-emerald-500 rounded-t min-h-[2px]" style={{ height: `${Math.max(2, (d.entradas / maiorValor) * 100)}%` }} />
              <div className="flex-1 bg-red-300 rounded-t min-h-[2px]" style={{ height: `${Math.max(2, (d.saidas / maiorValor) * 100)}%` }} />
            </div>
            <span className="text-[10px] text-stone-400 whitespace-nowrap">{nomeDaChaveMes(d.chave).slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-xs text-stone-500 justify-center">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Entradas</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-300" /> Saídas</span>
      </div>
    </div>
  );
}

/* ---------- TelaResumoFinancas — sub-aba dentro do Extrato, os 6 blocos (seção 15) ---------- */
function TelaResumoFinancas({ chaveMes, categorias, contas, lancamentos, lancamentosFixos, metas, gruposOrcamento, rendaManual }) {
  const conta = contas[0] || null;
  const trendMeses = totaisUltimosMeses(lancamentos, conta?.id, 4);
  const despesasDoMes = lancamentosDoMes(lancamentos, chaveMes, conta?.id).filter((l) => l.tipo === "despesa");
  const receitasDoMes = lancamentosDoMes(lancamentos, chaveMes, conta?.id).filter((l) => l.tipo === "receita");

  const renda = rendaMensalCalculada(lancamentosFixos, rendaManual);
  const progressoOrcamento = gruposOrcamento.length > 0 && renda > 0 ? progressoGruposOrcamento(gruposOrcamento, categorias, despesasDoMes, renda) : [];

  const entradasSaidasPorCategoria = {};
  for (const d of despesasDoMes) {
    const cat = by(categorias, d.categoria_id);
    const nome = cat?.nome || "Sem categoria";
    entradasSaidasPorCategoria[nome] = (entradasSaidasPorCategoria[nome] || 0) + d.valor;
  }
  const entradasCategoria = Object.entries(entradasSaidasPorCategoria).map(([nome, valor]) => ({ nome, valor, cor: corParaNome(nome) }));

  const { fixo, variavel } = fixoVsVariavelDoMes(despesasDoMes);
  const entradasFixoVariavel = [
    { nome: "Fixo", valor: fixo, cor: "#065f46" },
    { nome: "Variável", valor: variavel, cor: "#a7f3d0" },
  ];

  const saldoProjetado = saldoProjetadoDoMes(lancamentos, lancamentosFixos, chaveMes, conta?.id);
  const top5 = topGastosDoMes(despesasDoMes, 5);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      {progressoOrcamento.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 text-sm mb-1">Orçamento — {nomeDaChaveMes(chaveMes)}</div>
          <div className="text-xs text-stone-400 mb-2">Renda considerada: <span className="font-mono2">{brl(renda)}</span></div>
          <div className="space-y-2.5">
            {progressoOrcamento.map((g) => (
              <div key={g.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-stone-600 font-medium">{g.nome}</span>
                  <span className={`font-mono2 ${g.estourou ? "text-red-600 font-bold" : "text-stone-500"}`}>{brl(g.gasto)} de {brl(g.alvo)}{g.estourou ? " · estourou" : ""}</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${g.estourou ? "bg-red-500" : "bg-emerald-600"}`} style={{ width: Math.min(100, g.pct) + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Entradas x Saídas por mês</div>
        <GraficoEntradasSaidasPorMes dados={trendMeses} />
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Saídas por categoria — {nomeDaChaveMes(chaveMes)}</div>
        <GraficoCategorias entradas={entradasCategoria} tituloVazio="Nenhuma despesa nesse mês ainda." />
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Fixo x Variável</div>
        <GraficoCategorias entradas={entradasFixoVariavel} tituloVazio="Nenhuma despesa nesse mês ainda." tipoInicial="pizza" />
      </div>

      {metas.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 text-sm mb-2">Metas</div>
          <div className="space-y-2">
            {metas.map((m) => {
              const pct = Math.min(100, (m.valor_guardado / m.valor_alvo) * 100);
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-stone-600">{m.icone} {m.nome}</span>
                    <span className="font-mono2 text-stone-500">{Math.round(pct)}%</span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5">
                    <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: pct + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">Saldo projetado do mês</div>
        <p className="text-xs text-stone-400 mb-2">Considerando o que já entrou/saiu, mais o que ainda falta (recorrentes previstos).</p>
        <div className={`font-mono2 font-bold text-2xl ${saldoProjetado >= 0 ? "text-emerald-700" : "text-red-600"}`}>{brl(saldoProjetado)}</div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Top 5 maiores gastos — {nomeDaChaveMes(chaveMes)}</div>
        {!top5.length && <p className="text-xs text-stone-400 text-center py-3">Nenhuma despesa nesse mês ainda.</p>}
        <div className="space-y-1.5">
          {top5.map((d) => {
            const cat = by(categorias, d.categoria_id);
            return (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-600 truncate flex items-center gap-1.5">{cat?.icone || "🏷️"} {d.descricao}</span>
                <span className="font-mono2 font-semibold text-stone-700 shrink-0 ml-2">{brl(d.valor)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TelaExtrato({ categorias, contas, lancamentos, onSalvarLancamento, onRemoverLancamento, lancamentosFixos, setLancamentosFixos, lembretes5Dias, limiar5Dias, onAdiar5Dias, onConfirmarLembrete, onDescartarLembrete, reflexoesMensais, onSalvarReflexao, metas, cartoes, gruposOrcamento, rendaManual, onResolverPendente, onAbrirConfig }) {
  const [chaveMes, setChaveMes] = useState(chaveMesAtual());
  const [subVisao, setSubVisao] = useState("lista");
  const [modalLancamento, setModalLancamento] = useState(null); // null | {} (novo) | item (editar)
  const [tipoNovo, setTipoNovo] = useState("despesa");
  const [confirmar, setConfirmar] = useState(null);
  const [modalConciliacao, setModalConciliacao] = useState(false);
  const [pendenteEmCategorizacao, setPendenteEmCategorizacao] = useState(null);
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
  const pendentesCategorizacao = lancamentos.filter((l) => l.categoria_id == null && !l.previsto);
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

        {pendentesCategorizacao.length > 0 && (
          <button onClick={() => setPendenteEmCategorizacao(pendentesCategorizacao[0])} className="w-full text-left bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2 flex items-center justify-between tap-target">
            <span className="text-sm text-blue-700 font-semibold">📥 {pendentesCategorizacao.length} lançamento(s) importado(s) aguardando categoria</span>
            <span className="text-blue-700 text-xs">resolver →</span>
          </button>
        )}

        {mesPassado && (
          <button onClick={() => setModalReflexao(true)} className="w-full text-left bg-white border border-stone-200 rounded-xl p-3 mb-2 flex items-center justify-between tap-target">
            <span className="text-sm text-stone-600">{reflexaoDesseMes ? "✓ Refletido sobre esse mês" : "📝 Fazer reflexão desse mês"}</span>
            <span className="text-stone-400 text-xs">{reflexaoDesseMes ? "editar" : "→"}</span>
          </button>
        )}

        <div className="flex gap-2 mb-2">
          <Chip selected={subVisao === "lista"} onClick={() => setSubVisao("lista")}>📋 Lista</Chip>
          <Chip selected={subVisao === "resumo"} onClick={() => setSubVisao("resumo")}>📊 Resumo</Chip>
        </div>

        {subVisao === "lista" && (
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
                <button onClick={() => setModalConciliacao(true)} className="text-xs text-stone-500 font-semibold tap-target">🔄 Conciliar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {subVisao === "resumo" ? (
        <TelaResumoFinancas chaveMes={chaveMes} categorias={categorias} contas={contas} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} metas={metas} gruposOrcamento={gruposOrcamento} rendaManual={rendaManual} />
      ) : (
        <>
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
        </>
      )}

      {modalLancamento !== null && (
        <ModalLancamento
          lancamento={modalLancamento.id ? modalLancamento : null}
          tipoInicial={tipoNovo}
          categorias={categorias}
          contas={contas}
          contaPadraoId={conta?.id}
          cartoes={cartoes}
          limiar5Dias={limiar5Dias}
          onSalvar={salvarLancamento}
          onAdiar5Dias={(dados) => { onAdiar5Dias(dados); setModalLancamento(null); }}
          onRemover={removerLancamento}
          onFechar={() => setModalLancamento(null)}
        />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalConciliacao && conta && (
        <ModalConciliacao conta={conta} saldoCalculado={saldoConta} onSalvar={(dados) => { onSalvarLancamento(dados); setModalConciliacao(false); }} onFechar={() => setModalConciliacao(false)} />
      )}
      {modalReflexao && (
        <ModalReflexaoMensal chaveMes={chaveMes} reflexaoExistente={reflexaoDesseMes} onSalvar={(dados) => { onSalvarReflexao(chaveMes, dados); setModalReflexao(false); }} onFechar={() => setModalReflexao(false)} />
      )}
      {pendenteEmCategorizacao && (
        <ModalCategorizarPendente lancamento={pendenteEmCategorizacao} categorias={categorias} metas={metas}
          onResolver={(dados) => { onResolverPendente(dados); setPendenteEmCategorizacao(null); }} onFechar={() => setPendenteEmCategorizacao(null)} />
      )}
    </div>
  );
}

/* ---------- TelaConfigFinancas — categorias + contas (Fase 1: bem simples) ---------- */
/* ---------- ModalGrupoOrcamento — Fase 8: criar/editar grupo com percentual ---------- */
function ModalGrupoOrcamento({ grupo, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(grupo?.nome || "");
  const [percentualTexto, setPercentualTexto] = useState(grupo?.percentual != null ? String(grupo.percentual) : "");

  function salvar() {
    const percentual = numDe(percentualTexto);
    if (!nome.trim()) { alert("Dá um nome pro grupo (ex: Necessidades, Desejos)."); return; }
    if (!percentual || percentual <= 0 || percentual > 100) { alert("Percentual precisa ser entre 1 e 100."); return; }
    onSalvar({ id: grupo?.id || uid(), nome: nome.trim(), percentual });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{grupo ? "Editar grupo" : "Novo grupo"}</h3>
        <label className="text-xs font-semibold text-stone-500 uppercase">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Necessidades, Desejos, Poupança..." className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Nome do grupo" />
        <label className="text-xs font-semibold text-stone-500 uppercase">Percentual da renda</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-4">
          <input value={percentualTexto} onChange={(e) => setPercentualTexto(e.target.value.replace(/\D/g, ""))} placeholder="ex: 50" className="font-mono2 font-bold flex-1 outline-none" aria-label="Percentual" />
          <span className="text-stone-400 font-mono2">%</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalRendaMensal — Fase 8: definir renda manual, ou voltar a usar a automática ---------- */
function ModalRendaMensal({ rendaManual, rendaAutomatica, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [texto, setTexto] = useState(rendaManual != null ? formatarValorCampo(rendaManual) : "");

  function salvar() {
    const valor = parsePrecoInteligente(texto);
    if (valor == null || valor <= 0) { alert("Preenche um valor de renda."); return; }
    onSalvar(valor);
    onFechar();
  }
  function usarAutomatica() { onSalvar(null); onFechar(); }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">Renda mensal</h3>
        <p className="text-xs text-stone-500 mb-3">Por padrão, soma automática das suas receitas fixas recorrentes: <b className="font-mono2">{brl(rendaAutomatica)}</b>. Só define um valor manual se quiser sobrepor isso.</p>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mb-4">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={texto} onChange={(e) => setTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 500000 = R$5.000,00" className="font-mono2 font-bold flex-1 outline-none" aria-label="Renda mensal manual" />
        </div>
        <div className="flex gap-2">
          {rendaManual != null && <button onClick={usarAutomatica} className="py-2.5 px-3 rounded-lg border border-stone-300 text-stone-600 font-semibold text-sm tap-target">Usar automática</button>}
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function TelaConfigFinancas({ categorias, setCategorias, contas, setContas, lancamentos, lancamentosFixos, limiar5Dias, setLimiar5Dias, onImportarExtrato, gruposOrcamento, setGruposOrcamento, rendaManual, setRendaManual }) {
  const [subaba, setSubaba] = useState("contas");
  const [formConta, setFormConta] = useState(null);
  const [formCategoria, setFormCategoria] = useState(null);
  const [formGrupo, setFormGrupo] = useState(null);
  const [modalRenda, setModalRenda] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [limiarTexto, setLimiarTexto] = useState(formatarValorCampo(limiar5Dias));
  const [modalImportar, setModalImportar] = useState(null); // conta escolhida pra importar

  function salvarConta(dados) { setContas((cs) => upsertBy(cs, [dados])); setFormConta(null); }
  function removerConta(conta) {
    const temLancamento = lancamentos.some((l) => l.conta_id === conta.id);
    setConfirmar({
      titulo: "Excluir conta", severo: true, textoConfirmar: "Excluir",
      mensagem: temLancamento ? `Essa conta tem lançamentos vinculados. Excluir "${conta.nome}" mesmo assim? Os lançamentos continuam existindo, mas ficam sem conta.` : `Excluir "${conta.nome}"?`,
      acao: () => { setContas((cs) => cs.filter((c) => c.id !== conta.id)); setConfirmar(null); },
    });
  }
  function salvarCategoria(dados) { setCategorias((cs) => upsertBy(cs, [dados])); setFormCategoria(null); }
  function removerCategoria(cat) {
    setConfirmar({
      titulo: "Excluir categoria", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${cat.nome}"? Lançamentos que já usam essa categoria continuam existindo.`,
      acao: () => { setCategorias((cs) => cs.filter((c) => c.id !== cat.id)); setConfirmar(null); },
    });
  }
  function salvarGrupo(dados) { setGruposOrcamento((gs) => upsertBy(gs, [dados])); setFormGrupo(null); }
  function removerGrupo(grupo) {
    setConfirmar({
      titulo: "Excluir grupo", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${grupo.nome}"? Categorias vinculadas a ele ficam sem grupo.`,
      acao: () => {
        setGruposOrcamento((gs) => gs.filter((g) => g.id !== grupo.id));
        setCategorias((cs) => cs.map((c) => (c.grupo_orcamento_id === grupo.id ? { ...c, grupo_orcamento_id: null } : c)));
        setConfirmar(null);
      },
    });
  }
  const rendaAutomatica = rendaMensalCalculada(lancamentosFixos, null);
  const somaPercentuais = gruposOrcamento.reduce((a, g) => a + g.percentual, 0);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex gap-2 mb-4">
        <Chip selected={subaba === "contas"} onClick={() => setSubaba("contas")}>Contas</Chip>
        <Chip selected={subaba === "categorias"} onClick={() => setSubaba("categorias")}>Categorias</Chip>
        <Chip selected={subaba === "orcamento"} onClick={() => setSubaba("orcamento")}>Orçamento</Chip>
        <Chip selected={subaba === "preferencias"} onClick={() => setSubaba("preferencias")}>Preferências</Chip>
      </div>

      {subaba === "contas" && (
        <>
          <button onClick={() => setFormConta({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Conta</button>
          <div className="space-y-2">
            {contas.map((c) => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div><div className="font-semibold text-stone-800">{c.nome}</div><div className="text-xs text-stone-400 font-mono2">Saldo atual: {brl(calcularSaldoConta(c, lancamentos, null))}</div></div>
                  <div className="flex gap-3"><button onClick={() => setFormConta(c)} aria-label={`Editar ${c.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerConta(c)} aria-label={`Excluir ${c.nome}`} className="text-red-400 tap-target">🗑️</button></div>
                </div>
                <button onClick={() => setModalImportar(c)} className="text-xs text-emerald-700 font-semibold tap-target">📥 Importar extrato</button>
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

      {subaba === "orcamento" && (
        <>
          <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
            <div className="font-semibold text-stone-700 mb-1">Renda mensal</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono2 font-bold text-xl text-stone-800">{brl(rendaManual != null ? rendaManual : rendaAutomatica)}</div>
                <div className="text-xs text-stone-400">{rendaManual != null ? "definida manualmente" : "automática (soma das receitas fixas)"}</div>
              </div>
              <button onClick={() => setModalRenda(true)} className="text-emerald-700 font-semibold text-sm tap-target">editar</button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-stone-700 text-sm">Grupos ({somaPercentuais}% do total{somaPercentuais !== 100 ? " — não soma 100%" : ""})</div>
            <button onClick={() => setFormGrupo({})} className="text-emerald-700 font-semibold text-sm tap-target">+ Grupo</button>
          </div>
          {somaPercentuais !== 100 && gruposOrcamento.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mb-2">⚠️ Os percentuais somam {somaPercentuais}%, não 100% — os alvos de cada grupo vão ficar um pouco fora do esperado até ajustar.</p>
          )}
          <div className="space-y-2">
            {gruposOrcamento.map((g) => (
              <div key={g.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-stone-800">{g.nome}</div>
                  <div className="text-xs text-stone-400 font-mono2">{g.percentual}% · alvo {brl((rendaManual != null ? rendaManual : rendaAutomatica) * (g.percentual / 100))}</div>
                </div>
                <div className="flex gap-3"><button onClick={() => setFormGrupo(g)} aria-label={`Editar ${g.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerGrupo(g)} aria-label={`Excluir ${g.nome}`} className="text-red-400 tap-target">🗑️</button></div>
              </div>
            ))}
            {!gruposOrcamento.length && <p className="text-sm text-stone-400 text-center py-6">Nenhum grupo ainda.</p>}
          </div>
          <p className="text-xs text-stone-400 mt-3">Qual categoria pertence a qual grupo se edita em Categorias, ao editar cada uma.</p>
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
      {formCategoria !== null && <ModalCategoriaFinanceira categoria={formCategoria.id ? formCategoria : null} gruposOrcamento={gruposOrcamento} onSalvar={salvarCategoria} onFechar={() => setFormCategoria(null)} />}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalImportar && (
        <ModalImportarExtrato conta={modalImportar} lancamentosExistentes={lancamentos} onImportar={onImportarExtrato} onFechar={() => setModalImportar(null)} />
      )}
      {formGrupo !== null && <ModalGrupoOrcamento grupo={formGrupo.id ? formGrupo : null} onSalvar={salvarGrupo} onFechar={() => setFormGrupo(null)} />}
      {modalRenda && <ModalRendaMensal rendaManual={rendaManual} rendaAutomatica={rendaAutomatica} onSalvar={setRendaManual} onFechar={() => setModalRenda(false)} />}
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

  function salvarMeta(dados) { setMetas((ms) => upsertBy(ms, [dados])); setFormMeta(null); }
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
              <span>{arquivo.mimeType === "application/pdf" ? "📄" : "🖼
