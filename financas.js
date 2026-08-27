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
/* Redesenho do Extrato (seção 20 do mapa) — agrupa uma lista já ordenada (qualquer ordem) por
   dia, e devolve os grupos do mais recente pro mais antigo, do jeito que um extrato de banco de
   verdade mostra. Não mexe na ordenação que o resto do app usa (itensDoMes continua crescente
   pra quem mais usa isso), só reordena na hora de exibir. */
function agruparLancamentosPorDia(itens) {
  const grupos = {};
  itens.forEach((item) => {
    const diaChave = item.data.slice(0, 10);
    if (!grupos[diaChave]) grupos[diaChave] = [];
    grupos[diaChave].push(item);
  });
  return Object.entries(grupos)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([diaChave, itensDoDia]) => ({ diaChave, itens: itensDoDia }));
}
function formatarCabecalhoDia(diaChave) {
  const hojeChave = new Date().toISOString().slice(0, 10);
  const [ano, mes, dia] = diaChave.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  const dataFormatada = d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  return diaChave === hojeChave ? `Hoje, ${dataFormatada}` : dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1);
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
/* Pedido do usuário: meta com prazo opcional sugere quanto guardar por mês. Contagem de meses
   por calendário (não por média de dias) — mais intuitiva e previsível pro usuário do que uma
   aproximação por dias corridos. Nunca dá 0 ou negativo, mesmo com prazo já vencido. */
/* Atalhos de lançamento rápido, baseados no histórico — pedido do usuário: "ajusta só o valor
   e depois edita pra colocar as informações faltantes". Agrupa por tipo+descrição+categoria,
   pontua combinando frequência com uso recente (decaimento exponencial, meia-vida de 10 dias —
   depois de ~10 dias sem repetir, o peso cai pela metade), corta o que pontuar muito baixo
   (evita sugerir algo usado uma vez só, há muito tempo, só porque sobrou espaço na lista).
   Exclui lançamentos parcelados (parcela_total > 1) — achado testando com print real: as
   parcelas de uma compra financiada (ex: "Geladeira 1/12", "2/12"...) inflavam a "frequência"
   sem ser de fato um padrão de gasto repetido, é só o parcelamento aparecendo várias vezes. */
function sugestoesRapidas(lancamentos, quantidade) {
  const grupos = {};
  const agora = Date.now();
  lancamentos.filter((l) => !l.previsto && !(l.parcela_total > 1)).forEach((l) => {
    const chave = `${l.tipo}::${l.descricao.trim().toLowerCase()}::${l.categoria_id || ""}`;
    if (!grupos[chave]) grupos[chave] = { contagem: 0, ultimaData: null, ultimoRegistro: null };
    grupos[chave].contagem++;
    if (!grupos[chave].ultimaData || new Date(l.data) > new Date(grupos[chave].ultimaData)) {
      grupos[chave].ultimaData = l.data;
      grupos[chave].ultimoRegistro = l;
    }
  });
  const MEIA_VIDA_DIAS = 10;
  const lista = Object.values(grupos).map((g) => {
    const dias = (agora - new Date(g.ultimaData).getTime()) / 86400000;
    return { ...g, pontuacao: g.contagem * Math.pow(0.5, dias / MEIA_VIDA_DIAS) };
  });
  lista.sort((a, b) => b.pontuacao - a.pontuacao);
  return lista.filter((g) => g.pontuacao >= 0.3).slice(0, quantidade).map((g) => g.ultimoRegistro);
}
function depositoRecomendadoMeta(meta, hoje) {
  if (!meta.prazo) return null;
  const faltam = meta.valor_alvo - meta.valor_guardado;
  if (faltam <= 0) return null;
  const prazo = new Date(meta.prazo);
  let mesesRestantes = (prazo.getFullYear() - hoje.getFullYear()) * 12 + (prazo.getMonth() - hoje.getMonth());
  if (prazo.getDate() < hoje.getDate()) mesesRestantes -= 1;
  mesesRestantes = Math.max(1, mesesRestantes);
  return { valorMensal: faltam / mesesRestantes, mesesRestantes };
}
/* Histórico de aportes por meta (pedido do usuário: gráfico de aportes de cada mês). Antes só
   existia a soma acumulada (valor_guardado) — sem saber QUANDO cada parte foi guardada. Cada
   aporte/retirada vira um registro aqui, com data, permitindo reconstruir a evolução mês a mês. */
function aportesPorMes(historicoAportes, metaId, quantidadeMeses) {
  const doMeta = historicoAportes.filter((a) => a.meta_id === metaId);
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => ({ chave, total: doMeta.filter((a) => chaveMesDe(a.data) === chave).reduce((acc, a) => acc + a.valor, 0) }));
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
/* Pedido do usuário: relatório em texto simples (só números e nomes) pra colar numa IA externa
   e pedir análise. De propósito sem formatação chique — quanto mais limpo, menos a IA precisa
   "descartar" ruído visual pra entender os números. */
/* Gera as chaves de mês (AAAA-MM) entre dois limites, inclusive — trava em 60 pra nunca gerar
   um relatório absurdamente grande por engano num intervalo digitado errado. */
function gerarChavesMesesEntre(mesInicio, mesFim) {
  const chaves = [];
  let chave = mesInicio;
  let seguranca = 0;
  while (chave <= mesFim && seguranca < 60) {
    chaves.push(chave);
    chave = mesSeguinte(chave);
    seguranca++;
  }
  return chaves;
}
/* Pedido do usuário: relatório em texto simples (só números e nomes) pra colar numa IA externa
   e pedir análise. De propósito sem formatação chique — quanto mais limpo, menos a IA precisa
   "descartar" ruído visual pra entender os números. Período do extrato é escolhido pelo usuário
   (mesInicio/mesFim), não mais fixo em 3 meses. */
function gerarRelatorioTexto({ contas, lancamentos, lancamentosFixos, metas, cartoes, categorias, gruposOrcamento, rendaManual, mesInicio, mesFim }) {
  const linhas = [];
  linhas.push("RELATORIO FINANCEIRO — " + new Date().toLocaleDateString("pt-BR"));
  linhas.push("");

  linhas.push("CONTAS");
  let totalContas = 0;
  contas.forEach((c) => {
    const saldo = calcularSaldoConta(c, lancamentos, null);
    totalContas += saldo;
    linhas.push(`${c.nome}: ${brl(saldo)}`);
  });
  linhas.push(`Total: ${brl(totalContas)}`);
  linhas.push("");

  const renda = rendaMensalCalculada(lancamentosFixos, rendaManual);
  linhas.push("RENDA MENSAL: " + brl(renda));
  linhas.push("");

  if (gruposOrcamento.length) {
    linhas.push("ORCAMENTO (mes atual)");
    const despesasDoMesAtual = lancamentosDoMes(lancamentos, chaveMesAtual()).filter((l) => l.tipo === "despesa");
    progressoGruposOrcamento(gruposOrcamento, categorias, despesasDoMesAtual, renda).forEach((g) => {
      linhas.push(`${g.nome} (${g.percentual}%): ${brl(g.gasto)} de ${brl(g.alvo)}`);
    });
    linhas.push("");
  }

  linhas.push("METAS");
  if (!metas.length) linhas.push("(nenhuma)");
  metas.forEach((m) => {
    linhas.push(`${m.nome}: ${brl(m.valor_guardado)}${m.valor_alvo != null ? " de " + brl(m.valor_alvo) : " (sem teto)"}${m.prazo ? " — prazo " + new Date(m.prazo).toLocaleDateString("pt-BR") : ""}`);
  });
  linhas.push("");

  linhas.push("CARTOES");
  if (!cartoes.length) linhas.push("(nenhum)");
  cartoes.forEach((c) => {
    linhas.push(`${c.nome} (fecha dia ${c.dia_fechamento}, vence dia ${c.dia_vencimento}${c.limite != null ? ", limite " + brl(c.limite) : ""}):`);
    proximasFaturas(lancamentos, c.id, 3).forEach((f) => linhas.push(`  ${nomeDaChaveMes(f.chave)}: ${brl(f.total)}`));
  });
  linhas.push("");

  const chaves = gerarChavesMesesEntre(mesInicio, mesFim);
  linhas.push(`EXTRATO — ${nomeDaChaveMes(mesInicio)} a ${nomeDaChaveMes(mesFim)}`);
  chaves.forEach((ch) => {
    const doMes = lancamentosDoMes(lancamentos, ch).filter((l) => !l.previsto).sort((a, b) => new Date(a.data) - new Date(b.data));
    linhas.push(`--- ${nomeDaChaveMes(ch)} ---`);
    if (!doMes.length) linhas.push("(nenhum lançamento)");
    doMes.forEach((l) => {
      const cat = by(categorias, l.categoria_id);
      const conta = by(contas, l.conta_id);
      linhas.push(`${dataCurta(l.data)} | ${l.tipo === "receita" ? "+" : "-"}${brl(l.valor)} | ${cat?.nome || "sem categoria"} | ${conta?.nome || "?"} | ${l.descricao}`);
    });
  });

  return linhas.join("\n");
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
/* Entrada de valor no Finanças: sem vírgula = número inteiro de reais direto (2 = R$2,00;
   2000 = R$2.000,00). Com vírgula = parte decimal literal (2,50 = R$2,50). Ponto sem vírgula
   é tratado como separador de milhar, ignorado. Pedido explícito do usuário, DIFERENTE do
   padrão "calculadora" (parsePrecoInteligente) que o Mercado usa — lá os últimos 2 dígitos
   viram centavos por padrão; aqui não, e essa diferença é intencional (Mercado não teve
   reclamação sobre o padrão dele, então ficou como estava). */
function parseValorFinanceiro(txt) {
  if (txt == null) return null;
  const t = String(txt).trim();
  if (t === "") return null;
  if (t.includes(",")) {
    const v = parseFloat(t.replace(/\./g, "").replace(",", "."));
    return isNaN(v) ? null : v;
  }
  const digitos = t.replace(/\D/g, "");
  if (!digitos) return null;
  return parseInt(digitos, 10);
}

function tamanhoAproximadoKB(strBase64) {
  return Math.round((strBase64 || "").length / 1024);
}
/* Compartilhada entre TelaDocumentos e ModalDetalheLancamento — abrir um documento anexado
   numa aba nova, tratando os 3 tipos possíveis (pdf, imagem, resumo em texto da integração
   com Mercado). */
function abrirArquivoDocumento(doc) {
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

/* ---------- Seção 14 do mapa: importação de extrato bancário ---------- */
/* Reescrito depois de um bug sério: a primeira versão dependia de linha em branco pra separar
   transações (funcionava com pdftotext -layout do Python, usado no teste inicial, mas o pdf.js
   real do navegador NÃO produz linha em branco entre linhas de tabela — o resultado foi várias
   transações se fundindo numa só, com valores errados). Reescrito do zero testando contra o
   pdf.js de verdade (não mais o Python), com duas mudanças estruturais:
   1) Não depende mais de blocos separados por linha em branco — trabalha linha a linha, usando
      um padrão de âncora (data + ID + valor + saldo) pra marcar onde cada transação termina.
   2) Linha de descrição solta (sem âncora) é atribuída à âncora de índice mais próximo — cobre
      o caso comum de descrição vindo antes E depois da própria linha de âncora.
   Testado contra extrato real (89 transações, 8 páginas): 89/89 extraídas, soma batendo exata
   com o banco (R$14.743,05 entradas / R$14.741,60 saídas). Descrição fica aproximada em alguns
   casos (uma palavra ocasional vazando pra transação vizinha) — aceitável, porque data/valor/tipo
   (o que realmente importa pra não bagunçar o histórico) ficam sempre corretos; por isso a tela
   de conferência sempre mostra a lista antes de importar, nunca aplica direto. */
/* Contracheque — testado contra um contracheque real do usuário antes de implementar (mesma
   disciplina do extrato bancário: nunca prometer parsing sem validar contra dado de verdade).
   Extrai só os dois valores que interessam (seção 3/5 do pedido do usuário: "Desconto
   Adiantamento Quinzenal" quando existir, e "Total líquido a receber") — não tenta separar
   cada linha do contracheque (salário base, INSS, IRRF, etc.), só as duas entradas finais que
   realmente caem na conta. */
async function extrairContrachequePdf(pdf) {
  const linhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const porY = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      (porY[y] = porY[y] || []).push({ x: item.transform[4], texto: item.str });
    }
    const ys = Object.keys(porY).map(Number).sort((a, b) => b - a);
    for (const y of ys) {
      const texto = porY[y].sort((a, b) => a.x - b.x).map((it) => it.texto).join(" ").trim();
      if (texto) linhas.push(texto);
    }
  }

  let valorAdiantamento = null;
  for (const l of linhas) {
    const m = l.match(/Adiantamento\s+Quinzenal\s+([\d.,]+)/i);
    if (m) { valorAdiantamento = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); break; }
  }

  let valorPagamento = null;
  const idxRotulo = linhas.findIndex((l) => /total\s+l[ií]quido\s+a\s+receber/i.test(l));
  if (idxRotulo >= 0 && linhas[idxRotulo + 1]) {
    const numeros = linhas[idxRotulo + 1].match(/[\d.]+,\d{2}/g);
    if (numeros && numeros.length) valorPagamento = parseFloat(numeros[numeros.length - 1].replace(/\./g, "").replace(",", "."));
  }

  return { valorAdiantamento, valorPagamento };
}

async function extrairTransacoesMercadoPagoPdf(pdf) {
  const linhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const marcador = content.items.find((it) => it.str.includes("DETALHE DOS MOVIMENTOS"));
    const yCorte = marcador ? marcador.transform[5] : Infinity;
    const porY = {};
    for (const item of content.items) {
      if (item.transform[5] >= yCorte) continue; // ainda no cabeçalho da página (CPF, resumo), ignora
      const y = Math.round(item.transform[5]);
      (porY[y] = porY[y] || []).push({ x: item.transform[4], texto: item.str });
    }
    const ysOrdenados = Object.keys(porY).map(Number).sort((a, b) => b - a);
    for (const y of ysOrdenados) {
      const texto = porY[y].sort((a, b) => a.x - b.x).map((it) => it.texto).join(" ").replace(/\s+/g, " ").trim();
      if (texto) linhas.push({ texto, pagina: p });
    }
  }
  /* "Data de geração:" marca o início do rodapé legal (SAC, ouvidoria, CNPJ) — corta tudo a
     partir dali, não só essa linha, senão o texto do rodapé vaza pra descrição da última transação. */
  const idxRodape = linhas.findIndex((l) => /^Data de geração:/.test(l.texto));
  const linhasUteis = idxRodape >= 0 ? linhas.slice(0, idxRodape) : linhas;
  linhasUteis.forEach((l, i) => (l.indice = i));

  /* Aceita descrição embutida na própria linha da âncora (grupo 2, não-guloso) — cobre os casos
     em que o pdf.js funde células da tabela numa linha só, em vez de separá-las. */
  const padraoAncora = /^(\d{2}-\d{2}-\d{4})\s*(.*?)\s*(\d{9,15})\s+R\$\s*(-?[\d.,]+)\s+R\$\s*([\d.,]+)$/;
  const padraoRodapePagina = /^\d+\/\d+$/;

  const ancoras = [];
  for (const l of linhasUteis) {
    if (padraoRodapePagina.test(l.texto)) continue;
    const m = l.texto.match(padraoAncora);
    if (m) ancoras.push({ linha: l, match: m });
  }

  const transacoes = ancoras.map(({ linha, match }) => {
    const [, data, descInline, , valorStr] = match;
    const [dia, mes, ano] = data.split("-");
    const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
    return {
      data: new Date(`${ano}-${mes}-${dia}T12:00:00`).toISOString(),
      valor: Math.abs(valor), tipo: valor >= 0 ? "receita" : "despesa",
      indiceAncora: linha.indice, pagina: linha.pagina, partesDesc: descInline ? [descInline] : [],
    };
  });

  const indicesAncora = new Set(ancoras.map((a) => a.linha.indice));
  for (const l of linhasUteis) {
    if (indicesAncora.has(l.indice)) continue;
    if (padraoRodapePagina.test(l.texto)) continue;
    if (/^Data\s+Descrição/.test(l.texto)) continue;
    let melhorT = null, melhorDist = Infinity;
    for (const t of transacoes) {
      if (t.pagina !== l.pagina) continue;
      const dist = Math.abs(t.indiceAncora - l.indice);
      if (dist < melhorDist) { melhorDist = dist; melhorT = t; }
    }
    if (melhorT) melhorT.partesDesc.push(l.texto);
  }

  for (const t of transacoes) {
    t.descricao = t.partesDesc.join(" ").replace(/\s+/g, " ").trim() || "Transação";
    delete t.partesDesc; delete t.indiceAncora; delete t.pagina;
  }
  return transacoes;
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

/* ---------- Fase 6/7: integração Mercado → Finanças ---------- */
/* Definida aqui (não em mercado.js) porque Finanças é dona do formato de dado sendo escrito —
   Mercado só avisa que uma compra terminou, não precisa saber a estrutura interna de lançamento
   ou documento daqui. Funciona por escrita direta no localStorage (não por estado React
   compartilhado) porque os dois módulos são telas irmãs, montadas uma de cada vez — nunca os
   dois ao mesmo tempo — então não dá pra passar isso por prop/estado React entre eles.
   upsert por origem_mercado_sessao_id: se a mesma sessão for finalizada de novo (ex: reaberta
   pra correção e finalizada outra vez), ATUALIZA o valor E o documento em vez de duplicar.
   Pedido do usuário: "a base de dados das nfs tem que ser o mesmo, não tem diferença" — o
   arquivo mora só aqui (fn_documentos), o Mercado guarda só um ponteiro (documento_id) depois
   de finalizado, nunca uma cópia própria. Retorna o documentoId usado, pra quem chamou (Mercado)
   poder trocar o arquivo bruto por esse ponteiro. */
function integrarCompraMercado(sessaoMercado, nomeMercado) {
  try {
    const contasRaw = localStorage.getItem("fn_contas");
    const contas = contasRaw ? JSON.parse(contasRaw) : [];
    if (!contas.length) return null; // Finanças ainda sem conta cadastrada — não dá pra lançar em lugar nenhum

    const lancamentosRaw = localStorage.getItem("fn_lancamentos");
    const lancamentos = lancamentosRaw ? JSON.parse(lancamentosRaw) : [];

    const total = sessaoMercado.valor_nota_fiscal != null
      ? sessaoMercado.valor_nota_fiscal
      : sessaoMercado.itens.filter((i) => i.comprado).reduce((a, i) => a + (i.subtotal || 0), 0);
    if (!total) return null;

    const temArquivoNovo = sessaoMercado.nfe?.conferida && sessaoMercado.nfe.arquivo_base64;

    const existente = lancamentos.find((l) => l.origem_mercado_sessao_id === sessaoMercado.id);
    if (existente) {
      let documentoIdFinal = existente.documento_id;
      if (temArquivoNovo) {
        const documentosRaw = localStorage.getItem("fn_documentos");
        const documentos = documentosRaw ? JSON.parse(documentosRaw) : [];
        if (documentoIdFinal && documentos.some((d) => d.id === documentoIdFinal)) {
          // já tinha nota anexada nessa compra -- corrige o arquivo, não duplica
          const atualizadosDocs = documentos.map((d) => (d.id === documentoIdFinal ? { ...d, nome_arquivo: sessaoMercado.nfe.nome_arquivo || d.nome_arquivo, arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type } : d));
          persist("fn_documentos", atualizadosDocs);
        } else {
          // não tinha nota antes (ou tinha um resumo de versão antiga) -- cria de novo
          documentoIdFinal = uid();
          const novoDocumento = { id: documentoIdFinal, tipo: "saida", nome_arquivo: sessaoMercado.nfe.nome_arquivo || ("NFe — " + (nomeMercado || "compra")), arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type, data_upload: new Date().toISOString(), lancamento_id: existente.id };
          persist("fn_documentos", [...documentos, novoDocumento]);
        }
      }
      const atualizados = lancamentos.map((l) => (l.id === existente.id ? { ...l, valor: total, documento_id: documentoIdFinal } : l));
      persist("fn_lancamentos", atualizados);
      return documentoIdFinal;
    }

    const documentoId = temArquivoNovo ? uid() : null;
    const novaDespesa = {
      id: uid(), tipo: "despesa", descricao: "Compra no " + (nomeMercado || "mercado"),
      categoria_id: "catfn_mercado", valor: total,
      data: sessaoMercado.fechada_em || new Date().toISOString(),
      fixa: false, recorrente: false, dia_recorrencia: null,
      forma_pagamento: null, conta_id: contas[0].id, origem_fixo_id: null,
      documento_id: documentoId, origem_mercado_sessao_id: sessaoMercado.id,
    };
    persist("fn_lancamentos", [...lancamentos, novaDespesa]);

    if (documentoId) {
      const documentosRaw = localStorage.getItem("fn_documentos");
      const documentos = documentosRaw ? JSON.parse(documentosRaw) : [];
      const novoDocumento = {
        id: documentoId, tipo: "saida", nome_arquivo: sessaoMercado.nfe.nome_arquivo || ("NFe — " + (nomeMercado || "compra")),
        arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type,
        data_upload: new Date().toISOString(), lancamento_id: novaDespesa.id,
      };
      persist("fn_documentos", [...documentos, novoDocumento]);
    }
    return documentoId;
  } catch (e) { console.error("Falha ao integrar compra do Mercado com Finanças:", e); return null; }
}

function loadAllFinancas() {
  let categorias = null, contas = [], lancamentos = [], lancamentosFixos = [], lembretes5Dias = [], reflexoesMensais = {}, limiar5Dias = 100, metas = [], documentos = [], cartoes = [], gruposOrcamento = null, rendaManual = null, historicoAportes = [];
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
  try { const v = localStorage.getItem("fn_historicoAportes"); historicoAportes = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  if (!categorias) categorias = SEED_CATEGORIAS_FINANCEIRAS;
  if (!gruposOrcamento) gruposOrcamento = SEED_GRUPOS_ORCAMENTO;
  return { categorias, contas, lancamentos, lancamentosFixos, lembretes5Dias, reflexoesMensais, limiar5Dias, metas, documentos, cartoes, gruposOrcamento, rendaManual, historicoAportes, houveErroCarregamento };
}

/* ---------- ModalConta — criar/editar conta financeira ---------- */
function ModalConta({ conta, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(conta?.nome || "");
  const [saldoTexto, setSaldoTexto] = useState(conta?.saldo_inicial != null ? formatarValorCampo(conta.saldo_inicial) : "");
  const [data, setData] = useState(conta?.data_saldo_inicial ? conta.data_saldo_inicial.slice(0, 10) : new Date().toISOString().slice(0, 10));

  function salvar() {
    const saldo = parseValorFinanceiro(saldoTexto);
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
          <input value={saldoTexto} onChange={(e) => setSaldoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 1500 = R$1.500,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Saldo inicial" />
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
function ModalLancamento({ lancamento, tipoInicial, categorias, contas, contaPadraoId, cartoes, limiar5Dias, valorInicial, documentoId, lancamentos, documentos, onSalvar, onAdiar5Dias, onRemover, onAnexarDocumento, onVincularDocumentoExistente, onEditarNoMercado, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const ehNovo = !lancamento;
  const valorInputRef = useRef(null);

  /* Última categoria usada por tipo — pra não abrir sempre em branco. Só entra em jogo quando
     criando do zero (edição sempre respeita a categoria que já estava salva). */
  function ultimaCategoriaPara(tipoAlvo) {
    if (!lancamentos?.length) return null;
    const doTipo = [...lancamentos].filter((l) => l.tipo === tipoAlvo && !l.previsto).sort((a, b) => new Date(b.data) - new Date(a.data));
    return doTipo[0]?.categoria_id || null;
  }

  const [tipo, setTipo] = useState(lancamento?.tipo || tipoInicial || "despesa");
  const [descricao, setDescricao] = useState(lancamento?.descricao || "");
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoria_id || (ehNovo ? ultimaCategoriaPara(lancamento?.tipo || tipoInicial || "despesa") : null));
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
  const [documentoAnexadoId, setDocumentoAnexadoId] = useState(lancamento?.documento_id || documentoId || null);
  const [anexando, setAnexando] = useState(false);
  /* Pedido do usuário: ao anexar um documento (foto/PDF) num lançamento já existente, se o valor
     lido do documento divergir do valor já salvo, não anexa direto — pergunta se é a mesma
     compra, e se sim, se quer ajustar pro valor do documento. Fica marcado (⚠️) até resolver. */
  const [marcadoDivergente, setMarcadoDivergente] = useState(lancamento?.valor_divergente || false);
  const [pendenteAnexo, setPendenteAnexo] = useState(null); // { file, tipoDocumento, valorDocumento, valorAtual, etapa }

  /* Pedido do usuário: lançamento vindo de uma compra do Mercado não pode ter valor nem
     nota/comprovante mexidos direto aqui — só descrição, forma de pagamento, conta e categoria
     continuam livres. Tentar mexer no que é travado pergunta se quer ir editar no Mercado. */
  const origemMercadoSessaoId = lancamento?.origem_mercado_sessao_id || null;
  const [confirmarEditarMercado, setConfirmarEditarMercado] = useState(false);
  function pedirEdicaoNoMercado() { setConfirmarEditarMercado(true); }
  function irEditarNoMercado() {
    setConfirmarEditarMercado(false);
    if (onEditarNoMercado) onEditarNoMercado(origemMercadoSessaoId);
    onFechar();
  }

  const categoriasDoTipo = categorias.filter((c) => c.tipo === tipo);
  const cartaoEscolhido = (cartoes || []).find((c) => c.id === cartaoId);
  const sugestoes = ehNovo && lancamentos ? sugestoesRapidas(lancamentos, 4) : [];
  const ultimoLancamento = ehNovo && lancamentos?.length ? [...lancamentos].filter((l) => !l.previsto && !(l.parcela_total > 1)).sort((a, b) => new Date(b.data) - new Date(a.data))[0] : null;
  const temAtalhos = sugestoes.length > 0 || !!ultimoLancamento;

  /* Três telas dentro do mesmo modal, pedido do usuário depois de ver que o formulário inteiro
     continuava visível embaixo dos atalhos (achava "burocrático" mesmo com atalho): "atalhos" (só
     os cards, tela limpa) → "confirmacao" (descrição + valor, um botão, depois de tocar um atalho)
     → "completo" (o formulário de sempre, só quando pede "mais detalhes" ou "lançar do zero"). */
  const [tela, setTela] = useState(ehNovo && temAtalhos ? "atalhos" : "completo");

  /* Teclado abre direto no valor (pedido do usuário: "quanto gastei" costuma ser o primeiro
     pensamento) — só em lançamento novo, sem atalho aplicado ainda. */
  useEffect(() => {
    if (ehNovo && tela === "completo") setTimeout(() => valorInputRef.current?.focus(), 150);
  }, [tela]);

  /* Atalho: preenche tudo a partir de um lançamento passado, foca e seleciona o valor pra só
     precisar ajustar o número (pedido do usuário: "ajusta só o valor e depois edita"). Transiciona
     pra tela de confirmação mínima — não fica no formulário completo por baixo. */
  function aplicarSugestao(s) {
    setTipo(s.tipo);
    setDescricao(s.descricao);
    setCategoriaId(s.categoria_id);
    setValorTexto(formatarValorCampo(s.valor));
    if (s.forma_pagamento) setFormaPagamento(s.forma_pagamento);
    if (s.conta_id) setContaId(s.conta_id);
    setTela("confirmacao");
    setTimeout(() => { valorInputRef.current?.focus(); valorInputRef.current?.select(); }, 50);
  }

  /* Lê o valor de dentro do arquivo — PDF usa texto embutido (mais confiável), foto usa OCR.
     Tenta primeiro o padrão de "cluster" de totais (achado testando DANFE real do Mercado: em
     nota com desconto, o pdf.js separa rótulo e valor longe um do outro, e "Valor Total dos
     Produtos" ≠ "Valor a Pagar" — sem isso, pegava o valor bruto errado). Cai pra busca genérica
     por palavra-chave se não achar esse padrão (documentos que não são DANFE). Se não conseguir
     achar nada, retorna null (o chamador trata como "sem base pra comparar"). */
  async function extrairValorDoArquivo(file) {
    try {
      let texto;
      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        texto = await extrairTextoDoPdf(arrayBuffer);
      } else {
        const Tesseract = await carregarTesseract();
        const resultado = await Tesseract.recognize(file, "por");
        texto = resultado.data.text;
      }
      const cluster = texto.match(/Consulta:.*?(\d+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+Valor pago/);
      if (cluster) return numDe(cluster[4]);
      return extrairTotalDoTextoOcr(texto);
    } catch (e) { return null; }
  }
  /* Mesma coisa, mas pra um documento JÁ SALVO (repositório) — não tem mais o File original,
     só o base64. PDF: reconstrói o ArrayBuffer a partir do data-URL. Imagem: Tesseract aceita o
     data-URL direto, não precisa reconstruir nada. */
  async function extrairValorDoDocumentoSalvo(documento) {
    try {
      let texto;
      if (documento.mime_type === "application/pdf") {
        const resposta = await fetch(documento.arquivo_base64);
        const arrayBuffer = await resposta.arrayBuffer();
        texto = await extrairTextoDoPdf(arrayBuffer);
      } else if (documento.mime_type?.startsWith("image/")) {
        const Tesseract = await carregarTesseract();
        const resultado = await Tesseract.recognize(documento.arquivo_base64, "por");
        texto = resultado.data.text;
      } else {
        return null;
      }
      const cluster = texto.match(/Consulta:.*?(\d+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+Valor pago/);
      if (cluster) return numDe(cluster[4]);
      return extrairTotalDoTextoOcr(texto);
    } catch (e) { return null; }
  }

  /* Pedido do usuário: documento que já chegou (compartilhamento, repositório) e ainda não tem
     lançamento — escolher aqui em vez de subir de novo. Mesma checagem de divergência de valor. */
  const [mostrandoEscolherExistente, setMostrandoEscolherExistente] = useState(false);
  const [verificandoDocumentoExistente, setVerificandoDocumentoExistente] = useState(false);
  const documentosDisponiveis = (documentos || []).filter((d) => !d.lancamento_id && d.tipo === (tipo === "receita" ? "entrada" : "saida"));

  async function escolherDocumentoExistente(documento) {
    setMostrandoEscolherExistente(false);
    setVerificandoDocumentoExistente(true);
    const valorDocumento = await extrairValorDoDocumentoSalvo(documento);
    setVerificandoDocumentoExistente(false);
    const valorAtual = parseValorFinanceiro(valorTexto);
    const divergente = valorAtual != null && valorDocumento != null && Math.abs(valorAtual - valorDocumento) >= 0.01;
    if (divergente) {
      setPendenteAnexo({ documentoExistenteId: documento.id, valorDocumento, valorAtual, etapa: "confirmar_mesma_compra" });
      return;
    }
    setDocumentoAnexadoId(documento.id);
    setMarcadoDivergente(false);
  }

  async function aoEscolherComprovante(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !onAnexarDocumento) return;
    setAnexando(true);
    try {
      const tipoDocumento = tipo === "receita" ? "entrada" : "saida";
      const valorAtual = parseValorFinanceiro(valorTexto);
      const valorDocumento = await extrairValorDoArquivo(file);
      const divergente = valorAtual != null && valorDocumento != null && Math.abs(valorAtual - valorDocumento) >= 0.01;
      if (divergente) {
        setPendenteAnexo({ file, tipoDocumento, valorDocumento, valorAtual, etapa: "confirmar_mesma_compra" });
        setAnexando(false);
        return;
      }
      const novoId = await onAnexarDocumento(file, tipoDocumento);
      setDocumentoAnexadoId(novoId);
      setMarcadoDivergente(false);
    } catch (err) {
      alert("Não consegui anexar esse arquivo: " + err.message);
    } finally {
      setAnexando(false);
    }
  }

  async function concluirAnexoPendente(ajustarValor) {
    const p = pendenteAnexo;
    if (!p) return;
    setPendenteAnexo(null);
    if (p.documentoExistenteId) {
      setDocumentoAnexadoId(p.documentoExistenteId);
      if (ajustarValor) { setValorTexto(formatarValorCampo(p.valorDocumento)); setMarcadoDivergente(false); }
      else { setMarcadoDivergente(true); }
      return;
    }
    setAnexando(true);
    try {
      const novoId = await onAnexarDocumento(p.file, p.tipoDocumento);
      setDocumentoAnexadoId(novoId);
      if (ajustarValor) {
        setValorTexto(formatarValorCampo(p.valorDocumento));
        setMarcadoDivergente(false);
      } else {
        setMarcadoDivergente(true);
      }
    } catch (err) {
      alert("Não consegui anexar esse arquivo: " + err.message);
    } finally {
      setAnexando(false);
    }
  }

  function tentarSalvar() {
    const valor = parseValorFinanceiro(valorTexto);
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
      const dadosUnico = { ...serie[0], documento_id: documentoAnexadoId, valor_divergente: marcadoDivergente };
      if (documentoAnexadoId && onVincularDocumentoExistente) onVincularDocumentoExistente(documentoAnexadoId, dadosUnico.id);
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
      documento_id: documentoAnexadoId,
      valor_divergente: marcadoDivergente,
    };
    if (documentoAnexadoId && onVincularDocumentoExistente) onVincularDocumentoExistente(documentoAnexadoId, dados.id);
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

  if (tela === "atalhos") {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
        <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-bold mb-1">Novo lançamento</h3>
          <p className="text-xs text-stone-500 mb-4">Toca em algo parecido, ou lança do zero.</p>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {ultimoLancamento && (
              <button onClick={() => aplicarSugestao(ultimoLancamento)} className="flex flex-col items-start bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-3.5 text-left tap-target">
                <span className="text-xs text-emerald-600 font-semibold mb-1">🔁 Repetir último</span>
                <span className="text-sm text-stone-800 font-medium truncate w-full">{ultimoLancamento.descricao}</span>
                <span className="text-base font-mono2 font-bold text-stone-800 mt-0.5">{brl(ultimoLancamento.valor)}</span>
              </button>
            )}
            {sugestoes.filter((s) => s.id !== ultimoLancamento?.id).map((s) => {
              const cat = by(categorias, s.categoria_id);
              return (
                <button key={s.id} onClick={() => aplicarSugestao(s)} className="flex flex-col items-start bg-stone-50 border-2 border-stone-200 rounded-2xl p-3.5 text-left tap-target">
                  <span className="text-lg mb-1">{cat?.icone || "🏷️"}</span>
                  <span className="text-sm text-stone-800 font-medium truncate w-full">{s.descricao}</span>
                  <span className="text-base font-mono2 font-bold text-stone-800 mt-0.5">{brl(s.valor)}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setTela("completo")} className="w-full py-3 rounded-xl border border-stone-300 text-stone-600 font-semibold tap-target mb-2">✏️ Lançar do zero</button>
          <button onClick={onFechar} className="w-full py-2 text-stone-400 text-sm tap-target">Cancelar</button>
        </div>
      </div>
    );
  }

  if (tela === "confirmacao") {
    const cat = by(categorias, categoriaId);
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
        <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setTela("atalhos")} className="text-emerald-700 text-sm font-semibold mb-3 tap-target">← Voltar aos atalhos</button>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">{cat?.icone || "🏷️"}</span>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="flex-1 font-bold text-lg border-b-2 border-stone-200 focus:border-emerald-600 outline-none pb-1" aria-label="Descrição" />
          </div>
          <label className="text-xs font-semibold text-stone-500 uppercase">Valor</label>
          <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-3 mt-1 mb-4">
            <span className="text-stone-400 font-mono2 text-xl">R$</span>
            <input ref={valorInputRef} value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-2xl flex-1 outline-none" aria-label="Valor" />
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={onFechar} className="py-2.5 px-4 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
            <button onClick={tentarSalvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">✓ Salvar</button>
          </div>
          <button onClick={() => setTela("completo")} className="text-xs text-stone-400 underline block mx-auto tap-target">✏️ Mais detalhes (categoria, data, conta...)</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{lancamento ? "Editar lançamento" : "Novo lançamento"}</h3>

        <div className="flex gap-2 mb-3">
          <Chip selected={tipo === "receita"} onClick={() => { setTipo("receita"); setCategoriaId(ultimaCategoriaPara("receita")); }}>💰 Receita</Chip>
          <Chip selected={tipo === "despesa"} onClick={() => { setTipo("despesa"); setCategoriaId(ultimaCategoriaPara("despesa")); }}>💸 Despesa</Chip>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Descrição</label>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "receita" ? "Salário, freelance..." : "Aluguel, mercado..."} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Descrição" />

        <label className="text-xs font-semibold text-stone-500 uppercase">Categoria</label>
        <select value={categoriaId || ""} onChange={(e) => setCategoriaId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Categoria">
          <option value="">Escolha uma categoria</option>
          {categoriasDoTipo.map((c) => (
            <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
          ))}
        </select>

        <label className="text-xs font-semibold text-stone-500 uppercase flex items-center gap-1.5">
          Valor
          {origemMercadoSessaoId && <span className="text-[10px] normal-case font-normal text-stone-400">🔒 vem do Mercado</span>}
        </label>
        <div className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 mt-1 mb-3 ${origemMercadoSessaoId ? "border-stone-200 bg-stone-50" : "border-stone-300"}`}>
          <span className="text-stone-400 font-mono2">R$</span>
          <input
            ref={valorInputRef} value={valorTexto}
            onChange={(e) => { if (!origemMercadoSessaoId) setValorTexto(sanitizarEntradaPreco(e.target.value)); }}
            onClick={() => { if (origemMercadoSessaoId) pedirEdicaoNoMercado(); }}
            readOnly={!!origemMercadoSessaoId}
            placeholder="ex: 150 = R$150,00" className={`font-mono2 font-bold text-lg flex-1 outline-none ${origemMercadoSessaoId ? "text-stone-500" : ""}`} aria-label="Valor"
          />
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
                  <select value={cartaoId || ""} onChange={(e) => setCartaoId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Cartão">
                    {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
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

        {onAnexarDocumento && (
          <div className="mb-3">
            <label className="text-xs font-semibold text-stone-500 uppercase flex items-center gap-1.5">
              Comprovante / nota fiscal
              {origemMercadoSessaoId && <span className="text-[10px] normal-case font-normal text-stone-400">🔒 vem do Mercado</span>}
            </label>
            {marcadoDivergente && !origemMercadoSessaoId && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-1 mb-1.5 text-xs text-amber-800 flex items-center justify-between gap-2">
                <span>⚠️ O valor desse lançamento não bate com o documento anexado.</span>
                <button onClick={() => setMarcadoDivergente(false)} className="underline shrink-0 tap-target">já está certo</button>
              </div>
            )}
            {origemMercadoSessaoId ? (
              <button onClick={pedirEdicaoNoMercado} className="w-full flex items-center gap-2 mt-1 bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-sm text-stone-500 tap-target">
                <span>{documentoAnexadoId ? "✓ Documento anexado (pelo Mercado)" : "Sem documento"}</span>
              </button>
            ) : documentoAnexadoId ? (
              <div className="flex items-center gap-2 mt-1 bg-emerald-50 rounded-lg p-2.5 text-sm text-emerald-700">
                <span>✓ Documento anexado</span>
                <label className="text-emerald-800 underline text-xs ml-auto cursor-pointer tap-target">
                  trocar
                  <input type="file" accept=".pdf,image/*" onChange={aoEscolherComprovante} className="hidden" />
                </label>
              </div>
            ) : verificandoDocumentoExistente ? (
              <div className="w-full text-center py-3 text-sm text-stone-400 mt-1">Conferindo valor...</div>
            ) : (
              <>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-3 text-sm text-stone-500 cursor-pointer tap-target mt-1">
                  {anexando ? "Anexando..." : "📎 Anexar foto ou PDF"}
                  <input type="file" accept=".pdf,image/*" onChange={aoEscolherComprovante} className="hidden" disabled={anexando} />
                </label>
                {documentosDisponiveis.length > 0 && (
                  <button onClick={() => setMostrandoEscolherExistente(true)} className="w-full text-xs text-emerald-700 underline mt-1.5 tap-target">
                    📂 Escolher de documento já recebido ({documentosDisponiveis.length})
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {mostrandoEscolherExistente && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={() => setMostrandoEscolherExistente(false)}>
            <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3">Escolher documento</h3>
              <div className="space-y-2">
                {documentosDisponiveis.map((d) => (
                  <button key={d.id} onClick={() => escolherDocumentoExistente(d)} className="w-full flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg p-3 text-left tap-target">
                    <span className="text-lg">{d.mime_type === "application/pdf" ? "📄" : "🖼️"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-stone-800 truncate">{d.nome_arquivo}</div>
                      <div className="text-xs text-stone-400">{new Date(d.data_upload).toLocaleDateString("pt-BR")}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setMostrandoEscolherExistente(false)} className="w-full py-2.5 mt-3 text-stone-500 font-semibold tap-target">Cancelar</button>
            </div>
          </div>
        )}

        {confirmarEditarMercado && (
          <ModalConfirmar
            titulo="Editar no Mercado"
            mensagem="Valor e comprovante dessa despesa vêm de uma compra do Mercado — pra mudar, precisa editar por lá (garante que os dois lados continuam batendo). Quer ir pra lá agora?"
            textoConfirmar="Editar no Mercado"
            onConfirmar={irEditarNoMercado}
            onCancelar={() => setConfirmarEditarMercado(false)}
          />
        )}

        {pendenteAnexo?.etapa === "confirmar_mesma_compra" && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={() => setPendenteAnexo(null)}>
            <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3">⚠️ Valores diferentes</h3>
              <div className="bg-stone-50 rounded-xl p-3 mb-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-stone-500">Lançamento:</span><span className="font-mono2 font-semibold">{brl(pendenteAnexo.valorAtual)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Documento:</span><span className="font-mono2 font-semibold">{brl(pendenteAnexo.valorDocumento)}</span></div>
              </div>
              <p className="text-sm text-stone-600 mb-4">É a mesma compra?</p>
              <div className="flex gap-2">
                <button onClick={() => setPendenteAnexo(null)} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Não</button>
                <button onClick={() => setPendenteAnexo((p) => ({ ...p, etapa: "confirmar_ajustar" }))} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Sim</button>
              </div>
            </div>
          </div>
        )}

        {pendenteAnexo?.etapa === "confirmar_ajustar" && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={() => setPendenteAnexo(null)}>
            <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3">Ajustar o valor?</h3>
              <p className="text-sm text-stone-600 mb-4">Quer corrigir o lançamento pro valor do documento ({brl(pendenteAnexo.valorDocumento)})?</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => concluirAnexoPendente(true)} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Sim, ajustar pro valor do documento</button>
                <button onClick={() => concluirAnexoPendente(false)} className="w-full py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Não, manter como está</button>
              </div>
            </div>
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

/* ---------- ModalDetalheLancamento — ver antes de editar (pedido do usuário, igual o padrão
   do Mercado: toca no item, vê o detalhe, um botão específico leva pra edição) ---------- */
const LABEL_FORMA_PAGAMENTO = { dinheiro: "💵 Dinheiro", debito: "💳 Débito", cartao: "🏦 Cartão" };
/* ---------- ModalFotografarRecibo — pedido do usuário: fotografar e já criar o lançamento,
   com confirmação rápida (não silenciosa) porque OCR erra às vezes e criar um lançamento
   financeiro errado sem revisão é pior do que pedir um toque a mais. Reaproveita OCR/redimensiona
   já usados no fluxo de documento (extrairTotalDoTextoOcr, resizeImage, carregarTesseract). ---------- */
function ModalFotografarRecibo({ categorias, contas, lancamentos, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [valorTexto, setValorTexto] = useState("");
  const [descricao, setDescricao] = useState("Compra");

  function ultimaCategoriaDespesa() {
    if (!lancamentos?.length) return null;
    const doTipo = [...lancamentos].filter((l) => l.tipo === "despesa" && !l.previsto).sort((a, b) => new Date(b.data) - new Date(a.data));
    return doTipo[0]?.categoria_id || null;
  }
  const [categoriaId, setCategoriaId] = useState(ultimaCategoriaDespesa());
  const [contaId, setContaId] = useState(contas[0]?.id || null);
  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  async function aoTirarFoto(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      const base64 = await resizeImage(file, 1000, 0.75);
      setArquivo({ base64, nomeArquivo: file.name || "recibo.jpg" });
      const Tesseract = await carregarTesseract();
      const resultado = await Tesseract.recognize(file, "por");
      const total = extrairTotalDoTextoOcr(resultado.data.text);
      if (total != null) setValorTexto(formatarValorCampo(total));
      else setErro("Não consegui achar o valor total sozinho — preenche à mão, o resto já veio pronto.");
    } catch (err) {
      setErro("Não consegui ler essa foto: " + err.message);
    } finally {
      setProcessando(false);
    }
  }

  function confirmar() {
    const valor = parseValorFinanceiro(valorTexto);
    if (valor == null || valor <= 0) { alert("Preenche o valor."); return; }
    if (!categoriaId) { alert("Escolhe uma categoria."); return; }
    if (!contaId) { alert("Escolhe (ou cadastra) uma conta primeiro."); return; }
    const documentoId = uid();
    onSalvar({
      documento: { id: documentoId, tipo: "saida", nome_arquivo: arquivo.nomeArquivo, arquivo_base64: arquivo.base64, mime_type: "image/jpeg", data_upload: new Date().toISOString(), lancamento_id: null },
      lancamento: {
        id: uid(), tipo: "despesa", descricao: descricao.trim() || "Compra", categoria_id: categoriaId, valor,
        data: new Date().toISOString(), fixa: false, recorrente: false, dia_recorrencia: null,
        forma_pagamento: null, conta_id: contaId, origem_fixo_id: null, documento_id: documentoId,
      },
    });
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📸 Fotografar recibo</h3>

        {!arquivo && !processando && (
          <>
            <p className="text-xs text-stone-500 mb-3">Tira a foto do recibo — tento achar o valor sozinho, você só confirma.</p>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-8 text-sm text-stone-500 cursor-pointer tap-target">
              📷 Abrir câmera
              <input type="file" accept="image/*" capture="environment" onChange={aoTirarFoto} className="hidden" />
            </label>
          </>
        )}
        {processando && <div className="text-center py-8 text-sm text-stone-500">Lendo o recibo...</div>}
        {erro && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5 mt-2 mb-2">{erro}</p>}

        {arquivo && !processando && (
          <>
            <img src={arquivo.base64} className="w-full max-h-36 object-cover rounded-xl mb-3" alt="Recibo fotografado" />

            <label className="text-xs font-semibold text-stone-500 uppercase">Valor</label>
            <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
              <span className="text-stone-400 font-mono2">R$</span>
              <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor" autoFocus />
            </div>

            <label className="text-xs font-semibold text-stone-500 uppercase">Descrição</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Descrição" />

            <label className="text-xs font-semibold text-stone-500 uppercase">Categoria</label>
            <select value={categoriaId || ""} onChange={(e) => setCategoriaId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Categoria">
              <option value="">Escolha uma categoria</option>
              {categoriasDespesa.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
            </select>

            {contas.length > 1 && (
              <>
                <label className="text-xs font-semibold text-stone-500 uppercase">Conta</label>
                <div className="flex gap-2 flex-wrap mt-1 mb-3">
                  {contas.map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
                </div>
              </>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          {arquivo && !processando && <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">✓ Criar lançamento</button>}
        </div>
      </div>
    </div>
  );
}

function ModalDetalheLancamento({ item, categoria, conta, documento, onEditar, onExcluir, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const cor = item.tipo === "receita" ? "text-emerald-700" : "text-red-500";
  const sinal = item.tipo === "receita" ? "+" : "−";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl shrink-0">{categoria?.icone || "🏷️"}</span>
          <h3 className="text-lg font-bold text-stone-800">{item.descricao}</h3>
        </div>
        <div className={`font-mono2 font-bold text-2xl ${item.valor_divergente ? "mb-1" : "mb-4"} ${cor}`}>{sinal} {brl(item.valor)}</div>
        {item.valor_divergente && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 text-xs text-amber-800">⚠️ Esse valor não bate com o documento anexado — toca em "✏️ Editar" pra rever.</div>
        )}

        <div className="space-y-2 text-sm bg-stone-50 rounded-lg p-3 mb-4">
          <div className="flex justify-between"><span className="text-stone-400">Data</span><span className="text-stone-700">{dataCurta(item.data)}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Categoria</span><span className="text-stone-700">{categoria?.nome || "Sem categoria"}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Conta</span><span className="text-stone-700">{conta?.nome || "—"}</span></div>
          {item.forma_pagamento && <div className="flex justify-between"><span className="text-stone-400">Forma de pagamento</span><span className="text-stone-700">{LABEL_FORMA_PAGAMENTO[item.forma_pagamento] || item.forma_pagamento}</span></div>}
          {item.parcela_total > 1 && <div className="flex justify-between"><span className="text-stone-400">Parcela</span><span className="text-stone-700">{item.parcela_atual}/{item.parcela_total}</span></div>}
          {item.fixa && <div className="flex justify-between"><span className="text-stone-400">Tipo</span><span className="text-stone-700">{item.recorrente ? "Fixo recorrente" : "Fixo"}</span></div>}
        </div>

        {documento && (
          <button onClick={() => abrirArquivoDocumento(documento)} className="w-full text-left bg-blue-50 rounded-lg p-2.5 text-sm text-blue-700 mb-4 tap-target">📎 Ver documento anexado</button>
        )}

        <div className="flex gap-2">
          <button onClick={onExcluir} className="py-2.5 px-4 rounded-lg border border-red-300 text-red-500 font-semibold tap-target">Excluir</button>
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Fechar</button>
          <button onClick={onEditar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">✏️ Editar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- LinhaLancamento — item da lista do extrato ---------- */
/* Resumo de um dia — pedido do usuário, tocar no cabeçalho do dia no Extrato. "Saldo do dia"
   aqui é o líquido do próprio dia (entradas menos saídas daquele dia), não saldo acumulado da
   conta — isso exigiria caminhar toda a conta desde a abertura e fica ambíguo com o extrato
   unificado de várias contas (seção 20.3 do mapa). */
function ModalResumoDia({ grupo, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const reais = grupo.itens.filter((i) => !i.previsto);
  const entradas = reais.filter((i) => i.tipo === "receita").reduce((a, i) => a + i.valor, 0);
  const saidas = reais.filter((i) => i.tipo === "despesa").reduce((a, i) => a + i.valor, 0);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{formatarCabecalhoDia(grupo.diaChave)}</h3>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm"><span className="text-stone-500">Entradas</span><span className="font-mono2 font-semibold text-emerald-700">+ {brl(entradas)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-stone-500">Saídas</span><span className="font-mono2 font-semibold text-stone-800">− {brl(saidas)}</span></div>
          <div className="flex justify-between text-sm pt-2 border-t border-stone-100"><span className="text-stone-700 font-semibold">Saldo do dia</span><span className={`font-mono2 font-bold ${entradas - saidas >= 0 ? "text-emerald-700" : "text-red-500"}`}>{brl(entradas - saidas)}</span></div>
          <div className="text-xs text-stone-400 pt-1">{grupo.itens.length} lançamento{grupo.itens.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={onFechar} className="w-full py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Fechar</button>
      </div>
    </div>
  );
}

function LinhaLancamento({ item, categoria, nomeConta, onAbrir }) {
  const cor = item.tipo === "receita" ? "text-emerald-700" : "text-stone-800";
  const sinal = item.tipo === "receita" ? "+ " : "- ";
  return (
    <button onClick={() => onAbrir(item)} className="w-full flex items-start gap-3 py-3.5 text-left tap-target">
      <span className="text-xl shrink-0 mt-0.5">{categoria?.icone || "🏷️"}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-stone-400 truncate">{categoria ? categoria.nome : "Sem categoria"}{nomeConta ? " · " + nomeConta : ""}</div>
        <div className="font-mono2 font-medium text-stone-800 truncate flex items-center gap-1.5">
          {item.descricao}
          {item.previsto && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">previsto</span>}
          {item.valor_divergente && <span title="Valor diverge do documento anexado" className="shrink-0">⚠️</span>}
        </div>
        <div className={`font-mono2 font-semibold mt-0.5 ${item.previsto ? "text-stone-400" : cor}`}>{sinal}{brl(item.valor)}</div>
      </div>
      <span className="text-stone-300 shrink-0 mt-1 text-lg leading-none">›</span>
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
  const saldoReal = parseValorFinanceiro(saldoRealTexto);
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
/* Inspirado no card "Gastos do mês" de um app concorrente (Pierre) — curva de crescimento do
   gasto acumulado dia a dia dentro do mês, diferente do "Entradas x Saídas por mês" que já existe
   (esse compara MESES entre si; esse aqui mostra o ritmo DENTRO de um mês só). Se for o mês atual,
   vai só até hoje; se for mês passado, vai até o fim do mês. */
function pontosGastoAcumuladoMes(despesasDoMes, chaveMes) {
  const [ano, mes] = chaveMes.split("-").map(Number);
  const ehMesAtual = chaveMesAtual() === chaveMes;
  const ultimoDia = ehMesAtual ? new Date().getDate() : new Date(ano, mes, 0).getDate();
  const porDia = {};
  despesasDoMes.forEach((d) => {
    const dia = new Date(d.data).getDate();
    porDia[dia] = (porDia[dia] || 0) + d.valor;
  });
  let acumulado = 0;
  const pontos = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    acumulado += porDia[dia] || 0;
    pontos.push({ dia, valor: acumulado });
  }
  return pontos;
}
function GraficoGastoAcumuladoMes({ pontos }) {
  const largura = 280, altura = 90;
  if (pontos.length < 2 || pontos[pontos.length - 1].valor <= 0) {
    return <div className="text-xs text-stone-400 text-center py-3">Sem despesas suficientes ainda esse mês.</div>;
  }
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  const coords = pontos.map((p, i) => ({ x: (i / (pontos.length - 1)) * largura, y: altura - (p.valor / max) * (altura - 10) - 5 }));
  const linha = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const area = `0,${altura} ${linha} ${largura},${altura}`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="gradienteGastoAcumulado" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#065f46" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#065f46" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#gradienteGastoAcumulado)" />
        <polyline points={linha} fill="none" stroke="#065f46" strokeWidth="2.5" />
      </svg>
      <div className="text-xs text-stone-400 mt-1">Acumulado até {pontos[pontos.length - 1].dia === new Date().getDate() ? "hoje" : `dia ${pontos[pontos.length - 1].dia}`}: <b className="font-mono2 text-stone-700">{brl(pontos[pontos.length - 1].valor)}</b></div>
    </div>
  );
}
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
  const trendMeses = totaisUltimosMeses(lancamentos, null, 4);
  const despesasDoMes = lancamentosDoMes(lancamentos, chaveMes).filter((l) => l.tipo === "despesa");
  const receitasDoMes = lancamentosDoMes(lancamentos, chaveMes).filter((l) => l.tipo === "receita");

  const renda = rendaMensalCalculada(lancamentosFixos, rendaManual);
  const progressoOrcamento = gruposOrcamento.length > 0 && renda > 0 ? progressoGruposOrcamento(gruposOrcamento, categorias, despesasDoMes, renda) : [];

  const entradasSaidasPorCategoria = {};
  const iconePorCategoria = {};
  for (const d of despesasDoMes) {
    const cat = by(categorias, d.categoria_id);
    const nome = cat?.nome || "Sem categoria";
    entradasSaidasPorCategoria[nome] = (entradasSaidasPorCategoria[nome] || 0) + d.valor;
    if (cat?.icone) iconePorCategoria[nome] = cat.icone;
  }
  const entradasCategoria = Object.entries(entradasSaidasPorCategoria).map(([nome, valor]) => ({ nome, valor, cor: corParaNome(nome), icone: iconePorCategoria[nome] }));

  const { fixo, variavel } = fixoVsVariavelDoMes(despesasDoMes);
  const entradasFixoVariavel = [
    { nome: "Fixo", valor: fixo, cor: "#065f46" },
    { nome: "Variável", valor: variavel, cor: "#a7f3d0" },
  ];

  const saldoProjetado = saldoProjetadoDoMes(lancamentos, lancamentosFixos, chaveMes, null);
  const top5 = topGastosDoMes(despesasDoMes, 5);
  const pontosGastoAcumulado = pontosGastoAcumuladoMes(despesasDoMes, chaveMes);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">Gastos do mês</div>
        <div className="font-mono2 font-bold text-2xl text-stone-800 mb-1">{brl(despesasDoMes.reduce((a, d) => a + d.valor, 0))}</div>
        <GraficoGastoAcumuladoMes pontos={pontosGastoAcumulado} />
      </div>

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

/* Pedido do usuário: os avisos empilhados (lembretes vencidos, categorização pendente,
   reflexão do mês) ocupavam espaço grande demais sempre visíveis — viram um sino, isso aqui é
   o que abre ao tocar nele. */
function ModalAvisosExtrato({ lembretesVencidos, pendentesCategorizacao, mesPassado, reflexaoDesseMes, onConfirmarLembrete, onDescartarLembrete, onResolverCategorizacao, onAbrirReflexao, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const semAvisos = !lembretesVencidos.length && !pendentesCategorizacao.length && !mesPassado;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">🔔 Avisos</h3>
        {semAvisos && <p className="text-sm text-stone-400 text-center py-8">Nenhum aviso por agora.</p>}
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
          <button onClick={onResolverCategorizacao} className="w-full text-left bg-blue-50 border border-blue-200 rounded-xl p-3 mb-2 flex items-center justify-between tap-target">
            <span className="text-sm text-blue-700 font-semibold">📥 {pendentesCategorizacao.length} lançamento(s) importado(s) aguardando categoria</span>
            <span className="text-blue-700 text-xs">resolver →</span>
          </button>
        )}
        {mesPassado && (
          <button onClick={onAbrirReflexao} className="w-full text-left bg-white border border-stone-200 rounded-xl p-3 mb-2 flex items-center justify-between tap-target">
            <span className="text-sm text-stone-600">{reflexaoDesseMes ? "✓ Refletido sobre esse mês" : "📝 Fazer reflexão desse mês"}</span>
            <span className="text-stone-400 text-xs">{reflexaoDesseMes ? "editar" : "→"}</span>
          </button>
        )}
        <button onClick={onFechar} className="w-full py-2.5 mt-2 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Fechar</button>
      </div>
    </div>
  );
}

function TelaExtrato({ categorias, contas, lancamentos, documentos, onSalvarLancamento, onRemoverLancamento, lancamentosFixos, setLancamentosFixos, lembretes5Dias, limiar5Dias, onAdiar5Dias, onConfirmarLembrete, onDescartarLembrete, reflexoesMensais, onSalvarReflexao, metas, cartoes, gruposOrcamento, rendaManual, onResolverPendente, onAnexarDocumento, onVincularDocumentoExistente, onFotografarRecibo, onEditarNoMercado, onAbrirConfig }) {
  const [chaveMes, setChaveMes] = useState(chaveMesAtual());
  const [subVisao, setSubVisao] = useState("lista");
  const [modalLancamento, setModalLancamento] = useState(null); // null | {} (novo) | item (editar)
  const [tipoNovo, setTipoNovo] = useState("despesa");
  const [confirmar, setConfirmar] = useState(null);
  const [modalConciliacao, setModalConciliacao] = useState(null); // conta escolhida pra conciliar, ou null
  const [saldoExpandido, setSaldoExpandido] = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState(null); // item sendo visualizado (antes de editar)
  const [diaSelecionado, setDiaSelecionado] = useState(null); // grupo de dia tocado, pro resumo
  const [modalAvisos, setModalAvisos] = useState(false);
  const [mostrarMenuNovo, setMostrarMenuNovo] = useState(false);
  const [modalFoto, setModalFoto] = useState(false);
  const [pendenteEmCategorizacao, setPendenteEmCategorizacao] = useState(null);
  const [modalReflexao, setModalReflexao] = useState(false);

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

  /* Seção "extratos unificados" pedida pelo usuário: sem passar contaId nenhum, essas funções já
     retornam de TODAS as contas juntas (o filtro é opcional desde que foram escritas). */
  const reaisDoMes = lancamentosDoMes(lancamentos, chaveMes);
  const previstos = previstosDoMes(lancamentosFixos, lancamentos, chaveMes);
  const itensDoMes = [...reaisDoMes, ...previstos].sort((a, b) => new Date(a.data) - new Date(b.data));
  const gruposPorDia = agruparLancamentosPorDia(itensDoMes);
  const { entradas, saidas, saldoDoMes } = totaisDoMes(itensDoMes);
  const saldosPorConta = contas.map((c) => ({ conta: c, saldo: calcularSaldoConta(c, lancamentos, chaveMesEhFutura(chaveMes) ? null : chaveMes) }));
  const saldoTotal = saldosPorConta.reduce((a, s) => a + s.saldo, 0);
  const lembretesVencidos = lembretes5Dias.filter((l) => new Date(l.data_lembrete) <= new Date());
  const pendentesCategorizacao = lancamentos.filter((l) => l.categoria_id == null && !l.previsto);
  const mesPassado = chaveMes < chaveMesAtual();
  const reflexaoDesseMes = reflexoesMensais[chaveMes];
  const totalAvisos = lembretesVencidos.length + pendentesCategorizacao.length + (mesPassado && !reflexaoDesseMes ? 1 : 0);

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
    /* Pedido do usuário: compra vinda do Mercado não pode ser excluída direto no Finanças —
       mesma trava de espírito que já existe pra valor/documento (seção anterior do mapa). */
    if (item.origem_mercado_sessao_id) {
      setConfirmar({
        titulo: "Vem de uma compra do Mercado", severo: false, textoConfirmar: "Editar no Mercado",
        mensagem: `"${item.descricao}" foi criado a partir de uma compra do Mercado — não dá pra excluir por aqui. Editar ou excluir a compra por lá?`,
        acao: () => { setConfirmar(null); setModalLancamento(null); setModalDetalhe(null); if (onEditarNoMercado) onEditarNoMercado(item.origem_mercado_sessao_id); },
      });
      return;
    }
    setConfirmar({
      titulo: "Excluir lançamento", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${item.descricao}" (${brl(item.valor)})? Não dá pra desfazer.`,
      acao: () => {
        onRemoverLancamento(item.id);
        /* Pedido do usuário: se a compra é parcelada, pergunta se as parcelas futuras (ainda não
           vencidas) também devem sumir — usa compra_parcelada_id, que já agrupa as parcelas de
           uma mesma compra desde a Fase 7 (fatura por item). */
        const futuras = item.parcela_total > 1 && item.compra_parcelada_id
          ? lancamentos.filter((l) => l.compra_parcelada_id === item.compra_parcelada_id && l.id !== item.id && l.parcela_atual > item.parcela_atual)
          : [];
        if (futuras.length) {
          setConfirmar({
            titulo: "Tem parcelas futuras", severo: false, textoConfirmar: `Excluir as outras ${futuras.length}`,
            mensagem: `Essa compra tem mais ${futuras.length} parcela(s) futura(s) (${item.parcela_atual + 1}/${item.parcela_total} em diante). Excluir elas também?`,
            acao: () => { futuras.forEach((f) => onRemoverLancamento(f.id)); setConfirmar(null); setModalLancamento(null); setModalDetalhe(null); },
          });
          return;
        }
        if (item.recorrente) {
          setConfirmar({
            titulo: "Também é recorrente", severo: false, textoConfirmar: "Parar de repetir",
            mensagem: `Esse lançamento também se repete todo mês. Quer parar a recorrência, ou só excluir esse mês?`,
            acao: () => { setLancamentosFixos((fs) => fs.filter((f) => f.id !== item.origem_fixo_id)); setConfirmar(null); setModalLancamento(null); setModalDetalhe(null); },
          });
        } else { setConfirmar(null); setModalLancamento(null); setModalDetalhe(null); }
      },
    });
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "#faf8f2" }}>
      <div className="px-4 pt-3 pb-1 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setChaveMes(mesAnteriorDe(chaveMes))} aria-label="Mês anterior" className="tap-target text-emerald-700 font-bold px-1">◀</button>
          <div className="flex-1 text-center font-bold text-stone-800 text-sm">{nomeDaChaveMes(chaveMes)}</div>
          <button onClick={() => setChaveMes(mesSeguinte(chaveMes))} aria-label="Próximo mês" className="tap-target text-emerald-700 font-bold px-1">▶</button>
          {totalAvisos > 0 && (
            <button onClick={() => setModalAvisos(true)} aria-label={`${totalAvisos} avisos`} className="relative tap-target ml-1 shrink-0">
              <span className="text-xl">🔔</span>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center">{totalAvisos}</span>
            </button>
          )}
        </div>

        <div className="flex gap-4 mb-1 border-b border-stone-200">
          <button onClick={() => setSubVisao("lista")} className={`tap-target text-sm font-semibold pb-2 border-b-2 -mb-px ${subVisao === "lista" ? "text-emerald-700 border-emerald-700" : "text-stone-400 border-transparent"}`}>Lista</button>
          <button onClick={() => setSubVisao("resumo")} className={`tap-target text-sm font-semibold pb-2 border-b-2 -mb-px ${subVisao === "resumo" ? "text-emerald-700 border-emerald-700" : "text-stone-400 border-transparent"}`}>Resumo</button>
        </div>

        {subVisao === "lista" && (
          <div className="mt-1">
            <button onClick={() => setSaldoExpandido((v) => !v)} className="w-full flex items-center justify-between py-1.5 tap-target">
              <span className="flex gap-3 text-xs font-mono2">
                <span className="text-emerald-700">↑ {brl(entradas)}</span>
                <span className="text-red-500">↓ {brl(saidas)}</span>
              </span>
              <span className="flex items-center gap-1 font-mono2 font-semibold text-stone-700 text-sm">
                {brl(saldoTotal)}
                <span className="text-stone-400 text-[9px]">{saldoExpandido ? "▲" : "▼"}</span>
              </span>
            </button>
            {saldoExpandido && (
              <div className="pb-2 space-y-1.5 border-t border-stone-100 pt-2">
                {saldosPorConta.map(({ conta: c, saldo }) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-stone-500">{c.nome}{chaveMesEhFutura(chaveMes) ? " · projetado" : ""}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono2 font-semibold text-stone-700">{brl(saldo)}</span>
                      {!chaveMesEhFutura(chaveMes) && <button onClick={() => setModalConciliacao(c)} className="text-emerald-700 font-semibold tap-target">conciliar</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {subVisao === "resumo" ? (
        <TelaResumoFinancas chaveMes={chaveMes} categorias={categorias} contas={contas} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} metas={metas} gruposOrcamento={gruposOrcamento} rendaManual={rendaManual} />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 pb-24">
            {!itensDoMes.length && (
              <div className="text-center py-10 text-stone-400 text-sm">Nenhum lançamento nesse mês ainda.</div>
            )}
            {gruposPorDia.map((grupo) => (
              <div key={grupo.diaChave} className="mb-1">
                <button onClick={() => setDiaSelecionado(grupo)} className="w-full text-left pt-4 pb-1.5 tap-target">
                  <span className="text-xs font-semibold text-stone-500">{formatarCabecalhoDia(grupo.diaChave)}</span>
                </button>
                <div className="divide-y divide-stone-100">
                  {grupo.itens.map((item) => (
                    <LinhaLancamento key={item.id} item={item} categoria={by(categorias, item.categoria_id)} nomeConta={contas.length > 1 ? by(contas, item.conta_id)?.nome : null} onAbrir={item.previsto ? confirmarPrevisto : setModalDetalhe} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 pt-1 shrink-0 flex justify-end relative">
            {mostrarMenuNovo && (
              <div className="absolute bottom-16 right-4 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden z-10">
                <button onClick={() => { setTipoNovo("despesa"); setModalLancamento({}); setMostrarMenuNovo(false); }} className="flex items-center gap-2 px-4 py-3 text-sm text-stone-700 tap-target w-full text-left whitespace-nowrap">✏️ Novo lançamento</button>
                <button onClick={() => { setModalFoto(true); setMostrarMenuNovo(false); }} className="flex items-center gap-2 px-4 py-3 text-sm text-stone-700 tap-target w-full text-left border-t border-stone-100 whitespace-nowrap">📸 Fotografar recibo</button>
              </div>
            )}
            {mostrarMenuNovo && <div className="fixed inset-0 z-[5]" onClick={() => setMostrarMenuNovo(false)} />}
            <button onClick={() => setMostrarMenuNovo((v) => !v)} aria-label="Novo lançamento" className="w-14 h-14 rounded-full bg-emerald-700 text-white text-3xl shadow-lg flex items-center justify-center tap-target relative z-10">+</button>
          </div>
        </>
      )}

      {diaSelecionado && <ModalResumoDia grupo={diaSelecionado} onFechar={() => setDiaSelecionado(null)} />}

      {modalAvisos && (
        <ModalAvisosExtrato
          lembretesVencidos={lembretesVencidos} pendentesCategorizacao={pendentesCategorizacao} mesPassado={mesPassado} reflexaoDesseMes={reflexaoDesseMes}
          onConfirmarLembrete={(l) => { onConfirmarLembrete(l); setModalAvisos(false); }}
          onDescartarLembrete={onDescartarLembrete}
          onResolverCategorizacao={() => { setModalAvisos(false); setPendenteEmCategorizacao(pendentesCategorizacao[0]); }}
          onAbrirReflexao={() => { setModalAvisos(false); setModalReflexao(true); }}
          onFechar={() => setModalAvisos(false)}
        />
      )}

      {modalFoto && (
        <ModalFotografarRecibo categorias={categorias} contas={contas} lancamentos={lancamentos} onSalvar={onFotografarRecibo} onFechar={() => setModalFoto(false)} />
      )}
      {modalDetalhe && (
        <ModalDetalheLancamento
          item={modalDetalhe}
          categoria={by(categorias, modalDetalhe.categoria_id)}
          conta={by(contas, modalDetalhe.conta_id)}
          documento={modalDetalhe.documento_id ? by(documentos, modalDetalhe.documento_id) : null}
          onEditar={() => { setModalLancamento(modalDetalhe); setModalDetalhe(null); }}
          onExcluir={() => { removerLancamento(modalDetalhe); setModalDetalhe(null); }}
          onFechar={() => setModalDetalhe(null)}
        />
      )}
      {modalLancamento !== null && (
        <ModalLancamento
          lancamento={modalLancamento.id ? modalLancamento : null}
          tipoInicial={tipoNovo}
          categorias={categorias}
          contas={contas}
          contaPadraoId={contas[0]?.id}
          cartoes={cartoes}
          limiar5Dias={limiar5Dias}
          lancamentos={lancamentos}
          documentos={documentos}
          onSalvar={salvarLancamento}
          onAdiar5Dias={(dados) => { onAdiar5Dias(dados); setModalLancamento(null); }}
          onRemover={removerLancamento}
          onAnexarDocumento={onAnexarDocumento}
          onVincularDocumentoExistente={onVincularDocumentoExistente}
          onEditarNoMercado={onEditarNoMercado}
          onFechar={() => setModalLancamento(null)}
        />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalConciliacao && (
        <ModalConciliacao conta={modalConciliacao} saldoCalculado={calcularSaldoConta(modalConciliacao, lancamentos, null)} onSalvar={(dados) => { onSalvarLancamento(dados); setModalConciliacao(null); }} onFechar={() => setModalConciliacao(null)} />
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
    const valor = parseValorFinanceiro(texto);
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
          <input value={texto} onChange={(e) => setTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 5000 = R$5.000,00" className="font-mono2 font-bold flex-1 outline-none" aria-label="Renda mensal manual" />
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

/* ---------- ModalRelatorio — relatório em texto simples pra colar numa IA externa ---------- */
function ModalRelatorio({ contas, lancamentos, lancamentosFixos, metas, cartoes, categorias, gruposOrcamento, rendaManual, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const hoje = chaveMesAtual();
  const [mesInicio, setMesInicio] = useState(mesAnteriorDe(mesAnteriorDe(hoje))); // 3 meses por padrão, igual era antes
  const [mesFim, setMesFim] = useState(hoje);
  const [copiado, setCopiado] = useState(false);

  const periodoValido = mesInicio <= mesFim;
  const texto = periodoValido ? gerarRelatorioTexto({ contas, lancamentos, lancamentosFixos, metas, cartoes, categorias, gruposOrcamento, rendaManual, mesInicio, mesFim }) : "";

  function copiar() {
    navigator.clipboard?.writeText(texto).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); });
  }
  function baixar() {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${mesInicio}_a_${mesFim}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[80]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📊 Relatório financeiro</h3>
        <p className="text-xs text-stone-500 mb-3">Escolhe o período do extrato, copia ou baixa em texto simples pra colar numa IA (ChatGPT, Claude, etc.) e pedir uma análise.</p>

        <div className="grid grid-cols-2 gap-2 mb-1">
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase">De</label>
            <input type="month" value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2 mt-1" aria-label="Mês inicial do relatório" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase">Até</label>
            <input type="month" value={mesFim} onChange={(e) => setMesFim(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2 mt-1" aria-label="Mês final do relatório" />
          </div>
        </div>
        {!periodoValido && <p className="text-xs text-red-600 mb-2">O mês "De" precisa vir antes (ou igual) do mês "Até".</p>}
        <p className="text-xs text-stone-400 mb-3">O resto (contas, orçamento, metas, cartões) sempre mostra a situação atual, só o extrato segue o período escolhido.</p>

        <pre className="bg-stone-50 rounded-lg p-3 text-[11px] font-mono2 whitespace-pre-wrap overflow-y-auto flex-1 mb-3 border border-stone-200">{texto}</pre>

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Fechar</button>
          <button onClick={copiar} disabled={!periodoValido} className="flex-1 py-2.5 rounded-lg border border-emerald-700 text-emerald-700 font-semibold tap-target disabled:opacity-40">{copiado ? "✓ Copiado!" : "Copiar"}</button>
          <button onClick={baixar} disabled={!periodoValido} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target disabled:opacity-40">⬇️ Baixar</button>
        </div>
      </div>
    </div>
  );
}

function TelaConfigFinancas({ categorias, setCategorias, contas, setContas, lancamentos, lancamentosFixos, limiar5Dias, setLimiar5Dias, onImportarExtrato, gruposOrcamento, setGruposOrcamento, rendaManual, setRendaManual, metas, cartoes }) {
  const [subaba, setSubaba] = useState("contas");
  const [formConta, setFormConta] = useState(null);
  const [formCategoria, setFormCategoria] = useState(null);
  const [formGrupo, setFormGrupo] = useState(null);
  const [modalRenda, setModalRenda] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [limiarTexto, setLimiarTexto] = useState(formatarValorCampo(limiar5Dias));
  const [modalImportar, setModalImportar] = useState(null); // conta escolhida pra importar
  const [modalRelatorio, setModalRelatorio] = useState(false);

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
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
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
        <>
          <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
            <div className="font-semibold text-stone-700 mb-1">🕐 Teste dos 5 dias</div>
            <p className="text-xs text-stone-500 mb-3">Toda despesa variável a partir desse valor oferece a opção de esperar 5 dias antes de confirmar.</p>
            <label className="text-xs font-semibold text-stone-500 uppercase">A partir de</label>
            <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1">
              <span className="text-stone-400 font-mono2">R$</span>
              <input value={limiarTexto} onChange={(e) => setLimiarTexto(sanitizarEntradaPreco(e.target.value))} onBlur={() => { const v = parseValorFinanceiro(limiarTexto); if (v != null && v > 0) setLimiar5Dias(v); else setLimiarTexto(formatarValorCampo(limiar5Dias)); }} className="font-mono2 font-bold flex-1 outline-none" aria-label="Limiar do teste dos 5 dias" />
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-3">
            <div className="font-semibold text-stone-700 mb-1">📊 Relatório pra IA</div>
            <p className="text-xs text-stone-500 mb-3">Compila contas, extrato, metas, cartões e orçamento em texto simples pra você colar numa IA e pedir uma análise.</p>
            <button onClick={() => setModalRelatorio(true)} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-sm tap-target">Gerar relatório</button>
          </div>
        </>
      )}

      {formConta !== null && <ModalConta conta={formConta.id ? formConta : null} onSalvar={salvarConta} onFechar={() => setFormConta(null)} />}
      {formCategoria !== null && <ModalCategoriaFinanceira categoria={formCategoria.id ? formCategoria : null} gruposOrcamento={gruposOrcamento} onSalvar={salvarCategoria} onFechar={() => setFormCategoria(null)} />}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalRelatorio && (
        <ModalRelatorio contas={contas} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} metas={metas || []} cartoes={cartoes || []} categorias={categorias} gruposOrcamento={gruposOrcamento} rendaManual={rendaManual} onFechar={() => setModalRelatorio(false)} />
      )}
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
  const [temAlvo, setTemAlvo] = useState(meta ? meta.valor_alvo != null : true);
  const [valorAlvoTexto, setValorAlvoTexto] = useState(meta?.valor_alvo != null ? formatarValorCampo(meta.valor_alvo) : "");
  const [tipo, setTipo] = useState(meta?.tipo || "unica");
  const [prazo, setPrazo] = useState(meta?.prazo ? meta.prazo.slice(0, 10) : "");

  function salvar() {
    if (!nome.trim()) { alert("Dá um nome pra essa meta (ex: Reserva de emergência, Poupança geral)."); return; }
    let valorAlvo = null;
    if (temAlvo) {
      valorAlvo = parseValorFinanceiro(valorAlvoTexto);
      if (valorAlvo == null || valorAlvo <= 0) { alert("Preenche o valor alvo, ou desliga \"Definir um valor alvo\" pra virar uma poupança sem teto."); return; }
    }
    onSalvar({ id: meta?.id || uid(), nome: nome.trim(), icone: icone.trim() || "🎯", valor_alvo: valorAlvo, valor_guardado: meta?.valor_guardado || 0, tipo: temAlvo ? tipo : "unica", prazo: temAlvo && prazo ? new Date(prazo).toISOString() : null });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{meta ? "Editar meta" : "Nova meta ou poupança"}</h3>

        <div className="flex gap-2 mb-3">
          <input value={icone} onChange={(e) => setIcone(e.target.value)} className="w-16 text-center text-xl border border-stone-300 rounded-xl p-2.5" aria-label="Ícone" maxLength={2} />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Reserva de emergência, Poupança geral..." className="flex-1 border border-stone-300 rounded-xl p-2.5" aria-label="Nome da meta" />
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-600 mb-3 tap-target">
          <input type="checkbox" checked={temAlvo} onChange={(e) => setTemAlvo(e.target.checked)} className="w-5 h-5" />
          Definir um valor alvo
        </label>
        {!temAlvo && <p className="text-xs text-stone-400 -mt-2 mb-3">Sem alvo, isso vira uma poupança de acompanhamento — sem teto nem prazo, só mostra quanto já guardou e a evolução mês a mês.</p>}

        {temAlvo && (
          <>
            <label className="text-xs font-semibold text-stone-500 uppercase">Valor alvo</label>
            <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
              <span className="text-stone-400 font-mono2">R$</span>
              <input value={valorAlvoTexto} onChange={(e) => setValorAlvoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 5000 = R$5.000,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor alvo" />
            </div>

            <label className="text-xs font-semibold text-stone-500 uppercase">Prazo pra bater a meta (opcional)</label>
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-1" aria-label="Prazo da meta" />
            <p className="text-xs text-stone-400 mb-3">Com prazo, o app sugere quanto guardar por mês pra chegar lá a tempo.</p>

            <label className="text-xs font-semibold text-stone-500 uppercase">Tipo</label>
            <div className="flex gap-2 mt-1 mb-4">
              <Chip selected={tipo === "unica"} onClick={() => setTipo("unica")}>Meta única</Chip>
              <Chip selected={tipo === "sazonal"} onClick={() => setTipo("sazonal")}>Sazonal recorrente</Chip>
            </div>
            {tipo === "sazonal" && <p className="text-xs text-stone-400 -mt-3 mb-3">Depois de bater a meta, você pode reiniciar pro próximo ciclo (ex: "IPVA 2027" → "IPVA 2028") sem perder o histórico de aportes.</p>}
          </>
        )}

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
    const valor = parseValorFinanceiro(valorTexto);
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
          <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 100 = R$100,00" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor a guardar" autoFocus />
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
/* Mini gráfico de barra — usado no histórico de aportes por mês, tanto em Meta quanto Poupança. */
function GraficoBarraSimples({ dados, cor = "#065f46" }) {
  const maior = Math.max(...dados.map((d) => Math.abs(d.total)), 1);
  return (
    <div className="flex items-end justify-between gap-1.5 h-14">
      {dados.map((d) => (
        <div key={d.chave} className="flex flex-col items-center gap-1 flex-1 h-full justify-end">
          <div className="w-full rounded-t min-h-[2px]" style={{ height: `${Math.max(3, (Math.abs(d.total) / maior) * 100)}%`, backgroundColor: d.total < 0 ? "#f87171" : cor }} />
          <span className="text-[9px] text-stone-400">{nomeDaChaveMes(d.chave).slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

function TelaMetas({ metas, setMetas, contas, historicoAportes, onRegistrarAporte, onAporteComoDespesa }) {
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
    onRegistrarAporte({ id: uid(), meta_id: meta.id, valor, data: new Date().toISOString() });
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
      mensagem: `Zera o valor guardado de "${meta.nome}" pra recomeçar. Não esquece de editar o nome também (ex: trocar "2027" por "2028"). O histórico de aportes anteriores continua no gráfico.`,
      acao: () => { setMetas((ms) => ms.map((m) => (m.id === meta.id ? { ...m, valor_guardado: 0 } : m))); setConfirmar(null); },
    });
  }
  /* Depósito recomendado — um clique só, sem abrir modal (pedido do usuário). Registra como
     despesa automaticamente na primeira conta disponível, igual o aporte manual já faz. */
  function depositarRecomendado(meta, valor) {
    if (!contas.length) { alert("Cadastra uma conta primeiro, em Config."); return; }
    aplicarAporte(meta, { valor, registrarComoDespesa: true, contaId: contas[0].id });
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <button onClick={() => setFormMeta({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Nova meta ou poupança</button>

      {!metas.length && <p className="text-sm text-stone-400 text-center py-10">Nenhuma meta ainda. Reserva de emergência, IPVA, uma poupança sem teto pra só acompanhar — qualquer coisa que você queira guardar aos poucos entra aqui.</p>}

      <div className="space-y-3">
        {metas.map((m) => {
          const semTeto = m.valor_alvo == null;
          const pct = semTeto ? 0 : Math.min(100, (m.valor_guardado / m.valor_alvo) * 100);
          const batida = !semTeto && m.valor_guardado >= m.valor_alvo;
          return (
            <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl shrink-0">{m.icone}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-stone-800 truncate">{m.nome}</div>
                    <div className="text-xs text-stone-400">{semTeto ? "Poupança sem teto" : m.tipo === "sazonal" ? "Sazonal recorrente" : "Meta única"}</div>
                  </div>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => setFormMeta(m)} aria-label={`Editar ${m.nome}`} className="text-stone-400 tap-target">✏️</button>
                  <button onClick={() => removerMeta(m)} aria-label={`Excluir ${m.nome}`} className="text-red-400 tap-target">🗑️</button>
                </div>
              </div>

              {semTeto ? (
                <div className="mb-3">
                  <div className="text-[10px] text-stone-400 uppercase">Total guardado</div>
                  <div className="font-mono2 font-bold text-2xl text-emerald-700">{brl(m.valor_guardado)}</div>
                </div>
              ) : batida ? (
                <div className="bg-emerald-50 text-emerald-700 font-semibold text-sm rounded-lg p-2.5 text-center mb-3">✓ Meta batida! {brl(m.valor_guardado)} de {brl(m.valor_alvo)}</div>
              ) : (
                <>
                  <div className="w-full bg-stone-100 rounded-full h-2.5 mb-1.5">
                    <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: pct + "%" }} />
                  </div>
                  <div className="text-xs text-stone-500 font-mono2 mb-3">{brl(m.valor_guardado)} de {brl(m.valor_alvo)} ({Math.round(pct)}%)</div>
                </>
              )}

              {!semTeto && !batida && m.prazo && (() => {
                const sugestao = depositoRecomendadoMeta(m, new Date());
                if (!sugestao) return null;
                return (
                  <div className="bg-blue-50 rounded-lg p-2.5 mb-3 text-xs text-blue-700">
                    <div className="mb-1.5">Faltam {sugestao.mesesRestantes} {sugestao.mesesRestantes === 1 ? "mês" : "meses"} pro prazo — guardando <b className="font-mono2">{brl(sugestao.valorMensal)}</b>/mês você chega lá.</div>
                    <button onClick={() => depositarRecomendado(m, sugestao.valorMensal)} className="w-full py-2 rounded-lg bg-blue-600 text-white font-semibold tap-target">Depositar {brl(sugestao.valorMensal)} agora</button>
                  </div>
                );
              })()}

              <div className="mb-3">
                <div className="text-[10px] text-stone-400 uppercase mb-1">Aportes por mês</div>
                <GraficoBarraSimples dados={aportesPorMes(historicoAportes, m.id, 4)} />
              </div>

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
function ModalUploadDocumento({ tipoDocumento, lancamentos, categorias, contas, arquivoInicial, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [arquivo, setArquivo] = useState(null); // { base64, mimeType, nomeArquivo }
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [avisoEscaneado, setAvisoEscaneado] = useState(false);
  const [valorEncontrado, setValorEncontrado] = useState(null);
  const [lancamentoEscolhidoId, setLancamentoEscolhidoId] = useState(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  /* Pedido do usuário: vincular a um lançamento já existente passa pela mesma checagem de valor
     divergente da tela de edição — mesmo padrão, mesmas duas perguntas. */
  const [pendenteVinculo, setPendenteVinculo] = useState(null); // { lancamento, etapa }

  const tipoLancamento = tipoDocumento === "entrada" ? "receita" : "despesa";
  const candidatos = lancamentos
    .filter((l) => l.tipo === tipoLancamento && !l.documento_id)
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 15);

  async function processarArquivo(file) {
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

  /* Chegou via compartilhamento nativo (Android) — já processa direto, sem pedir pra escolher
     arquivo de novo (já foi escolhido no app de origem). */
  useEffect(() => {
    if (arquivoInicial) processarArquivo(arquivoInicial);
  }, []);

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    processarArquivo(file);
  }

  function vincular() {
    if (!lancamentoEscolhidoId) { alert("Escolhe um lançamento pra vincular."); return; }
    const lancamentoAlvo = lancamentos.find((l) => l.id === lancamentoEscolhidoId);
    const divergente = valorEncontrado != null && lancamentoAlvo && Math.abs(valorEncontrado - lancamentoAlvo.valor) >= 0.01;
    if (divergente) {
      setPendenteVinculo({ lancamento: lancamentoAlvo, etapa: "confirmar_mesma_compra" });
      return;
    }
    onSalvar({ arquivo, lancamentoId: lancamentoEscolhidoId, criarNovo: false });
  }
  function concluirVinculoPendente(ajustarValor) {
    const p = pendenteVinculo;
    if (!p) return;
    setPendenteVinculo(null);
    onSalvar({ arquivo, lancamentoId: p.lancamento.id, criarNovo: false, ajustarValorPara: ajustarValor ? valorEncontrado : null, marcarDivergente: !ajustarValor });
  }
  function guardarSemVincular() {
    onSalvar({ arquivo, lancamentoId: null, criarNovo: false, semVincular: true });
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
              <span>{arquivo.mimeType === "application/pdf" ? "📄" : "📷"}</span>
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
            <button onClick={guardarSemVincular} className="w-full py-2 mt-2 text-xs text-stone-400 underline tap-target">Só guardar por enquanto, decidir depois</button>
          </>
        )}

        <button onClick={onFechar} className="w-full py-2.5 mt-3 text-stone-500 font-semibold tap-target">Cancelar</button>

        {pendenteVinculo?.etapa === "confirmar_mesma_compra" && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={() => setPendenteVinculo(null)}>
            <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3">⚠️ Valores diferentes</h3>
              <div className="bg-stone-50 rounded-xl p-3 mb-4 text-sm space-y-1.5">
                <div className="flex justify-between"><span className="text-stone-500">Lançamento:</span><span className="font-mono2 font-semibold">{brl(pendenteVinculo.lancamento.valor)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Documento:</span><span className="font-mono2 font-semibold">{brl(valorEncontrado)}</span></div>
              </div>
              <p className="text-sm text-stone-600 mb-4">É a mesma compra?</p>
              <div className="flex gap-2">
                <button onClick={() => setPendenteVinculo(null)} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Não</button>
                <button onClick={() => setPendenteVinculo((p) => ({ ...p, etapa: "confirmar_ajustar" }))} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Sim</button>
              </div>
            </div>
          </div>
        )}
        {pendenteVinculo?.etapa === "confirmar_ajustar" && (
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={() => setPendenteVinculo(null)}>
            <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-3">Ajustar o valor?</h3>
              <p className="text-sm text-stone-600 mb-4">Quer corrigir o lançamento pro valor do documento ({brl(valorEncontrado)})?</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => concluirVinculoPendente(true)} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Sim, ajustar pro valor do documento</button>
                <button onClick={() => concluirVinculoPendente(false)} className="w-full py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Não, manter como está</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- TelaDocumentos — Fase 5: arquivo de documentos, entrada e saída ---------- */
/* ---------- ModalAnexarContracheque — anexa PDF, extrai valores, cria só 2 entradas ---------- */
/* Datas lembradas entre usos (pedido do usuário: "sugerido a última escolha sempre") — direto
   no localStorage, mais simples que subir isso pro estado do React já que é só uma preferência
   de UI, não dado financeiro em si. */
function ModalAnexarContracheque({ contas, onAnexar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null); // { valorAdiantamento, valorPagamento, documento }
  const [diaAdiantamento, setDiaAdiantamento] = useState(() => localStorage.getItem("fn_diaAdiantamento") || "15");
  const [diaPagamento, setDiaPagamento] = useState(() => localStorage.getItem("fn_diaPagamento") || "30");
  const [contaId, setContaId] = useState(contas[0]?.id || null);
  const hoje = new Date();
  const [mesReferencia, setMesReferencia] = useState(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const arquivoBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      const pdfjsLib = await carregarPdfJs();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const { valorAdiantamento, valorPagamento } = await extrairContrachequePdf(pdf);
      if (valorAdiantamento == null && valorPagamento == null) {
        throw new Error('Não consegui achar "Total líquido a receber" nesse PDF — confere se é mesmo um contracheque.');
      }
      setResultado({ valorAdiantamento, valorPagamento, documento: { nome_arquivo: file.name, arquivo_base64: arquivoBase64, mime_type: "application/pdf" } });
    } catch (err) {
      setErro(err.message);
    } finally {
      setProcessando(false);
    }
  }

  function confirmar() {
    localStorage.setItem("fn_diaAdiantamento", diaAdiantamento);
    localStorage.setItem("fn_diaPagamento", diaPagamento);
    const [ano, mes] = mesReferencia.split("-").map(Number);
    onAnexar({ ...resultado, diaAdiantamento: numDe(diaAdiantamento) || 15, diaPagamento: numDe(diaPagamento) || 30, ano, mes, contaId });
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📄 Anexar contracheque</h3>
        <p className="text-xs text-stone-500 mb-3">Extrai só o valor do adiantamento (se tiver) e o pagamento final — não separa linha por linha do contracheque.</p>

        {!resultado && !processando && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
            📎 Escolher PDF do contracheque
            <input type="file" accept=".pdf" onChange={aoEscolherArquivo} className="hidden" />
          </label>
        )}
        {processando && <div className="text-center py-8 text-sm text-stone-500">Lendo o contracheque...</div>}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

        {resultado && (
          <>
            <div className="bg-emerald-50 rounded-lg p-3 mb-3 text-sm space-y-1">
              {resultado.valorAdiantamento != null && <div>Adiantamento: <b className="font-mono2">{brl(resultado.valorAdiantamento)}</b></div>}
              <div>Pagamento: <b className="font-mono2">{brl(resultado.valorPagamento)}</b></div>
            </div>

            <label className="text-xs font-semibold text-stone-500 uppercase">Mês de referência</label>
            <input type="month" value={mesReferencia} onChange={(e) => setMesReferencia(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Mês de referência" />

            {resultado.valorAdiantamento != null && (
              <>
                <label className="text-xs font-semibold text-stone-500 uppercase">Dia do adiantamento</label>
                <input value={diaAdiantamento} onChange={(e) => setDiaAdiantamento(e.target.value.replace(/\D/g, ""))} className="w-20 border border-stone-300 rounded-xl p-2.5 mt-1 mb-3 font-mono2" aria-label="Dia do adiantamento" />
              </>
            )}
            <label className="text-xs font-semibold text-stone-500 uppercase">Dia do pagamento</label>
            <input value={diaPagamento} onChange={(e) => setDiaPagamento(e.target.value.replace(/\D/g, ""))} className="w-20 border border-stone-300 rounded-xl p-2.5 mt-1 mb-1 font-mono2" aria-label="Dia do pagamento" />
            <p className="text-xs text-stone-400 mb-3">Essas datas ficam salvas — da próxima vez já vêm assim.</p>

            {contas.length > 1 && (
              <>
                <label className="text-xs font-semibold text-stone-500 uppercase">Conta</label>
                <div className="flex gap-2 flex-wrap mt-1 mb-3">
                  {contas.map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
                </div>
              </>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          {resultado && <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Confirmar</button>}
        </div>
      </div>
    </div>
  );
}

function TelaDocumentos({ documentos, setDocumentos, lancamentos, onSalvarLancamento, categorias, contas, arquivoCompartilhado, onUsarArquivoCompartilhado }) {
  const [tipoDocumento, setTipoDocumento] = useState("todos");
  const [modalUpload, setModalUpload] = useState(false);
  const [arquivoParaModal, setArquivoParaModal] = useState(null); // File vindo do compartilhamento, pra pular a etapa de escolher arquivo
  const [modalContracheque, setModalContracheque] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const documentosDoTipo = (tipoDocumento === "todos" ? documentos : documentos.filter((d) => d.tipo === tipoDocumento)).sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
  const tamanhoTotalKB = documentos.reduce((acc, d) => acc + tamanhoAproximadoKB(d.arquivo_base64), 0);
  const espacoApertado = tamanhoTotalKB > 3000; // aviso a partir de ~3MB guardado em documentos
  const tipoParaNovoUpload = tipoDocumento === "todos" ? "saida" : tipoDocumento; // "todos" é só filtro de visualização, nunca o tipo real de um documento

  function aoSalvarUpload({ arquivo, lancamentoId, criarNovo, dadosLancamento, semVincular, ajustarValorPara, marcarDivergente }) {
    const documentoId = uid();
    let idFinal = lancamentoId;
    if (semVincular) {
      idFinal = null;
    } else if (criarNovo) {
      idFinal = dadosLancamento.id;
      onSalvarLancamento({ ...dadosLancamento, documento_id: documentoId });
    } else {
      // marca o lançamento existente como tendo documento vinculado
      const lancamentoAlvo = lancamentos.find((l) => l.id === lancamentoId);
      if (lancamentoAlvo) {
        const atualizado = { ...lancamentoAlvo, documento_id: documentoId };
        if (ajustarValorPara != null) atualizado.valor = ajustarValorPara;
        if (marcarDivergente) atualizado.valor_divergente = true;
        onSalvarLancamento(atualizado);
      }
    }
    setDocumentos((ds) => [...ds, {
      id: documentoId, tipo: tipoParaNovoUpload, nome_arquivo: arquivo.nomeArquivo, arquivo_base64: arquivo.base64,
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
  const abrirArquivo = abrirArquivoDocumento; // agora compartilhada com ModalDetalheLancamento

  /* Contracheque: cria só as 2 entradas (adiantamento se houver, pagamento) já com o documento
     vinculado a ambas — mesmo arquivo, duas entradas diferentes. */
  function aoAnexarContracheque({ valorAdiantamento, valorPagamento, documento, diaAdiantamento, diaPagamento, ano, mes, contaId }) {
    const documentoId = uid();
    const lancamentosNovos = [];
    if (valorAdiantamento != null) {
      lancamentosNovos.push({
        id: uid(), tipo: "receita", descricao: "Adiantamento quinzenal", categoria_id: "catfn_salario", valor: valorAdiantamento,
        data: new Date(ano, mes - 1, diaAdiantamento, 12).toISOString(),
        fixa: true, recorrente: false, dia_recorrencia: null, forma_pagamento: null,
        conta_id: contaId, origem_fixo_id: null, documento_id: documentoId,
      });
    }
    lancamentosNovos.push({
      id: uid(), tipo: "receita", descricao: "Pagamento (contracheque)", categoria_id: "catfn_salario", valor: valorPagamento,
      data: new Date(ano, mes - 1, diaPagamento, 12).toISOString(),
      fixa: true, recorrente: false, dia_recorrencia: null, forma_pagamento: null,
      conta_id: contaId, origem_fixo_id: null, documento_id: documentoId,
    });
    lancamentosNovos.forEach((l) => onSalvarLancamento(l));
    setDocumentos((ds) => [...ds, {
      id: documentoId, tipo: "entrada", nome_arquivo: documento.nome_arquivo, arquivo_base64: documento.arquivo_base64,
      mime_type: documento.mime_type, data_upload: new Date().toISOString(), lancamento_id: lancamentosNovos[0].id,
    }]);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        {arquivoCompartilhado && (
          <button
            onClick={() => { setArquivoParaModal(arquivoCompartilhado.arquivo); setModalUpload(true); }}
            className="w-full bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 mb-2 text-left tap-target flex items-center gap-2"
          >
            <span className="text-lg">📎</span>
            <span className="text-sm text-emerald-800 flex-1 min-w-0 truncate">Processar "{arquivoCompartilhado.nome}" recebido</span>
          </button>
        )}
        <div className="flex gap-2 mb-3">
          <Chip selected={tipoDocumento === "todos"} onClick={() => setTipoDocumento("todos")}>📁 Todos</Chip>
          <Chip selected={tipoDocumento === "entrada"} onClick={() => setTipoDocumento("entrada")}>📥 Entrada</Chip>
          <Chip selected={tipoDocumento === "saida"} onClick={() => setTipoDocumento("saida")}>📤 Saída</Chip>
        </div>
        {espacoApertado && (
          <div className="bg-amber-50 text-amber-800 text-xs rounded-lg p-2.5 mb-2">⚠️ Documentos já ocupam ~{(tamanhoTotalKB / 1024).toFixed(1)}MB do armazenamento do navegador (limite costuma ser 5-10MB no total, dividido com o resto do app). Se começar a dar erro de salvar, exclua documentos antigos.</div>
        )}
        <button onClick={() => setModalUpload(true)} className="w-full bg-emerald-700 text-white font-semibold py-3 rounded-xl tap-target mb-2">+ Anexar documento</button>
        <button onClick={() => setModalContracheque(true)} className="w-full border border-emerald-700 text-emerald-700 font-semibold py-2.5 rounded-xl tap-target">📄 Anexar contracheque</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {!documentosDoTipo.length && (
          <p className="text-sm text-stone-400 text-center py-10">
            Nenhum documento {tipoDocumento === "todos" ? "" : tipoDocumento === "entrada" ? "de entrada " : "de saída "}ainda.
          </p>
        )}
        {documentosDoTipo.map((doc) => {
          const lancamentoVinculado = by(lancamentos, doc.lancamento_id);
          return (
            <div key={doc.id} className="bg-white border border-stone-200 rounded-xl p-3">
              <button onClick={() => abrirArquivo(doc)} className="w-full flex items-center gap-2.5 min-w-0 text-left tap-target mb-2">
                <span className="text-xl shrink-0">{doc.mime_type === "application/pdf" ? "📄" : doc.mime_type === "text/plain" ? "🧾" : "📷"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-stone-800 truncate">{doc.nome_arquivo}</div>
                  <div className="text-xs text-stone-400 truncate">
                    {lancamentoVinculado
                      ? `Vinculado a: ${lancamentoVinculado.descricao} · ${brl(lancamentoVinculado.valor)}`
                      : "Sem lançamento vinculado"}
                  </div>
                  <div className="text-[10px] text-stone-300">Anexado em {dataCurta(doc.data_upload)}</div>
                </div>
                <span className="text-[10px] text-stone-400 shrink-0 uppercase">{doc.tipo === "entrada" ? "📥" : "📤"}</span>
              </button>
              <div className="flex gap-3 pt-2 border-t border-stone-100 text-xs">
                <button onClick={() => baixarOuCompartilharArquivo(doc.arquivo_base64, doc.nome_arquivo, doc.mime_type, false)} className="text-emerald-700 font-semibold tap-target">⬇️ Baixar</button>
                <button onClick={() => baixarOuCompartilharArquivo(doc.arquivo_base64, doc.nome_arquivo, doc.mime_type, true)} className="text-emerald-700 font-semibold tap-target">📤 Compartilhar</button>
                <button onClick={() => removerDocumento(doc)} className="text-red-400 font-semibold tap-target ml-auto">🗑️ Excluir</button>
              </div>
            </div>
          );
        })}
      </div>

      {modalUpload && (
        <ModalUploadDocumento
          tipoDocumento={tipoParaNovoUpload} lancamentos={lancamentos} categorias={categorias} contas={contas}
          arquivoInicial={arquivoParaModal}
          onSalvar={(dados) => { aoSalvarUpload(dados); setArquivoParaModal(null); if (arquivoCompartilhado && onUsarArquivoCompartilhado) onUsarArquivoCompartilhado(); }}
          onFechar={() => { setModalUpload(false); setArquivoParaModal(null); }}
        />
      )}
      {modalContracheque && (
        <ModalAnexarContracheque contas={contas} onAnexar={aoAnexarContracheque} onFechar={() => setModalContracheque(false)} />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* ---------- ModalImportarExtrato — Fase (seção 14): sobe OFX ou PDF, deduplica, mostra prévia ---------- */
function ModalImportarExtrato({ conta, lancamentosExistentes, onImportar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);

  const fingerprintsExistentes = new Set(lancamentosExistentes.map(fingerprintTransacao));

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      const ehOfx = /\.ofx$/i.test(file.name);
      const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let transacoes = [], formato = null;
      if (ehOfx) {
        const texto = await file.text();
        transacoes = parsearOfx(texto);
        formato = "ofx";
        if (!transacoes.length) throw new Error("Não consegui identificar nenhuma transação nesse arquivo OFX.");
      } else if (ehPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await carregarPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        transacoes = await extrairTransacoesMercadoPagoPdf(pdf);
        formato = "pdf";
        if (!transacoes.length) throw new Error("Não consegui reconhecer transações nesse PDF — o formato pode ter mudado.");
      } else {
        throw new Error("Formato não reconhecido — precisa ser .ofx ou .pdf.");
      }
      const novas = transacoes.filter((t) => !fingerprintsExistentes.has(fingerprintTransacao(t)));
      setResultado({ novas, duplicadas: transacoes.length - novas.length, formato });
    } catch (err) {
      setErro(err.message);
    } finally {
      setProcessando(false);
    }
  }

  function confirmar() {
    onImportar(resultado.novas, conta.id);
    onFechar();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📥 Importar extrato</h3>
        <p className="text-xs text-stone-500 mb-3">Pra "{conta.nome}". Aceita OFX (Itaú e outros bancos) ou PDF (Mercado Pago). Toda transação entra sem categoria, esperando você organizar.</p>

        {!resultado && !processando && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
            📎 Escolher arquivo (.ofx ou .pdf)
            <input type="file" accept=".ofx,.pdf,application/pdf" onChange={aoEscolherArquivo} className="hidden" />
          </label>
        )}
        {processando && (
          <div className="text-center py-8">
            <div className="text-sm text-stone-500">Lendo o extrato...</div>
            <div className="text-xs text-stone-400 mt-1">Pode levar alguns segundos, principalmente em PDF</div>
          </div>
        )}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

        {resultado && (
          <>
            <div className="bg-emerald-50 rounded-lg p-3 mb-3 text-sm">
              <div className="font-semibold text-emerald-800">{resultado.novas.length} transação(ões) nova(s) encontrada(s)</div>
              {resultado.duplicadas > 0 && <div className="text-xs text-stone-500 mt-1">{resultado.duplicadas} já tinha(m) sido importada(s) antes — ignoradas, sem duplicar.</div>}
              {resultado.formato === "pdf" && <div className="text-xs text-amber-700 mt-2">⚠️ Extração de PDF é melhor esforço — confira se os valores fazem sentido antes de confirmar.</div>}
            </div>
            {!resultado.novas.length ? (
              <p className="text-sm text-stone-500 text-center py-2">Nada novo pra importar.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 mb-3 border border-stone-100 rounded-lg p-2">
                {resultado.novas.slice(0, 20).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-stone-600 truncate">{dataCurta(t.data)} · {t.descricao.slice(0, 30)}</span>
                    <span className={`font-mono2 font-semibold shrink-0 ml-2 ${t.tipo === "receita" ? "text-emerald-700" : "text-red-500"}`}>{t.tipo === "receita" ? "+" : "−"} {brl(t.valor)}</span>
                  </div>
                ))}
                {resultado.novas.length > 20 && <div className="text-center text-stone-400 text-xs pt-1">e mais {resultado.novas.length - 20}...</div>}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">{resultado ? "Cancelar" : "Fechar"}</button>
          {resultado && resultado.novas.length > 0 && (
            <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Importar {resultado.novas.length}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalCategorizarPendente — resolve uma transação importada (categoria ou meta) ---------- */
function ModalCategorizarPendente({ lancamento, categorias, metas, onResolver, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const sugestaoReserva = pareceReservaDeMeta(lancamento.descricao);
  const [modo, setModo] = useState(sugestaoReserva ? "meta" : "categoria");
  const [categoriaId, setCategoriaId] = useState(null);
  const [metaId, setMetaId] = useState(null);
  const [criandoNovaMeta, setCriandoNovaMeta] = useState(sugestaoReserva && metas.length === 0);
  const [nomeMetaNova, setNomeMetaNova] = useState(sugestaoReserva ? extrairNomeReserva(lancamento.descricao) : "");

  const categoriasDoTipo = categorias.filter((c) => c.tipo === lancamento.tipo);

  function confirmar() {
    if (modo === "categoria") {
      if (!categoriaId) { alert("Escolhe uma categoria."); return; }
      onResolver({ ...lancamento, categoria_id: categoriaId });
      return;
    }
    if (criandoNovaMeta) {
      if (!nomeMetaNova.trim()) { alert("Dá um nome pra essa meta."); return; }
      onResolver({ ...lancamento, resolverComoMeta: true, metaNovaNome: nomeMetaNova.trim() });
      return;
    }
    if (!metaId) { alert("Escolhe uma meta."); return; }
    onResolver({ ...lancamento, resolverComoMeta: true, metaIdEscolhida: metaId });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">Categorizar lançamento</h3>
        <div className="bg-stone-50 rounded-lg p-2.5 mb-3 text-sm">
          <div className="font-semibold text-stone-800">{lancamento.descricao}</div>
          <div className="text-xs text-stone-500">{dataCurta(lancamento.data)} · <span className={lancamento.tipo === "receita" ? "text-emerald-700" : "text-red-500"}>{brl(lancamento.valor)}</span></div>
        </div>

        {sugestaoReserva && (
          <div className="bg-amber-50 text-amber-800 text-xs rounded-lg p-2.5 mb-3">💡 Isso parece uma reserva/retirada de "caixinha" — talvez faça mais sentido vincular a uma meta do que categorizar normal.</div>
        )}

        <div className="flex gap-2 mb-3">
          <Chip selected={modo === "categoria"} onClick={() => setModo("categoria")}>Categoria normal</Chip>
          <Chip selected={modo === "meta"} onClick={() => setModo("meta")}>🎯 Vincular a uma meta</Chip>
        </div>

        {modo === "categoria" && (
          <select value={categoriaId || ""} onChange={(e) => setCategoriaId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mb-4" aria-label="Categoria">
            <option value="">Escolha uma categoria</option>
            {categoriasDoTipo.map((c) => (
              <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>
            ))}
          </select>
        )}

        {modo === "meta" && (
          <div className="mb-4">
            {!criandoNovaMeta ? (
              <>
                {metas.length > 0 && (
                  <select value={metaId || ""} onChange={(e) => setMetaId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mb-2" aria-label="Meta">
                    <option value="">Escolha uma meta</option>
                    {metas.map((m) => <option key={m.id} value={m.id}>{m.icone} {m.nome}</option>)}
                  </select>
                )}
                <button onClick={() => setCriandoNovaMeta(true)} className="text-sm text-emerald-700 font-semibold underline tap-target">+ Criar meta nova</button>
              </>
            ) : (
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase">Nome da meta nova</label>
                <input value={nomeMetaNova} onChange={(e) => setNomeMetaNova(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1" aria-label="Nome da meta" />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Deixar pra depois</button>
          <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Confirmar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ModalCartao — Fase 7: criar/editar cartão ---------- */
function ModalCartao({ cartao, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(cartao?.nome || "");
  const [fechamentoTexto, setFechamentoTexto] = useState(cartao?.dia_fechamento ? String(cartao.dia_fechamento) : "");
  const [vencimentoTexto, setVencimentoTexto] = useState(cartao?.dia_vencimento ? String(cartao.dia_vencimento) : "");
  const [limiteTexto, setLimiteTexto] = useState(cartao?.limite != null ? formatarValorCampo(cartao.limite) : "");

  function salvar() {
    const fechamento = numDe(fechamentoTexto), vencimento = numDe(vencimentoTexto);
    if (!nome.trim()) { alert("Dá um nome pro cartão."); return; }
    if (!fechamento || fechamento < 1 || fechamento > 31) { alert("Dia de fechamento precisa ser entre 1 e 31."); return; }
    if (!vencimento || vencimento < 1 || vencimento > 31) { alert("Dia de vencimento precisa ser entre 1 e 31."); return; }
    onSalvar({ id: cartao?.id || uid(), nome: nome.trim(), dia_fechamento: fechamento, dia_vencimento: vencimento, limite: parseValorFinanceiro(limiteTexto) });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{cartao ? "Editar cartão" : "Novo cartão"}</h3>

        <label className="text-xs font-semibold text-stone-500 uppercase">Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nubank, Inter, Itaú..." className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Nome do cartão" />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase">Dia do fechamento</label>
            <input value={fechamentoTexto} onChange={(e) => setFechamentoTexto(e.target.value.replace(/\D/g, ""))} placeholder="ex: 20" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 font-mono2" aria-label="Dia de fechamento" />
          </div>
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase">Dia do vencimento</label>
            <input value={vencimentoTexto} onChange={(e) => setVencimentoTexto(e.target.value.replace(/\D/g, ""))} placeholder="ex: 27" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 font-mono2" aria-label="Dia de vencimento" />
          </div>
        </div>
        <p className="text-xs text-stone-400 mb-3">Compra depois do fechamento cai na fatura seguinte, não na atual — isso já é calculado sozinho a partir desses dois dias.</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Limite (opcional)</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-4">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={limiteTexto} onChange={(e) => setLimiteTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 5000 = R$5.000,00" className="font-mono2 font-bold flex-1 outline-none" aria-label="Limite do cartão" />
        </div>

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- DetalheCartao — fatura atual, projeção, itens (Fase 7) ---------- */
/* ---------- ModalAnexarFatura — Fase 7: anexa o PDF/foto da fatura como referência ---------- */
/* Recorte de escopo consciente: diferente do extrato do Mercado Pago (testado contra um arquivo
   real do usuário), não temos uma fatura de cartão de exemplo pra validar contra. Formato de
   fatura varia MUITO entre bancos — tentar "adivinhar" um parser sem testar seria repetir o
   mesmo erro que já aconteceu com o extrato bancário. Por isso: anexa o arquivo como referência,
   tenta achar o valor TOTAL (mesma extração já usada e testada pra NFe/OCR), mas não tenta
   separar os itens da fatura sozinho — isso continua manual, pelo "+ Novo lançamento" já
   existente escolhendo o cartão certo. */
function ModalAnexarFatura({ onAnexar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      let arquivoBase64, mimeType, textoExtraido = "";
      const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (ehPdf) {
        const arrayBuffer = await file.arrayBuffer();
        arquivoBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
        mimeType = "application/pdf";
        const pdfjsLib = await carregarPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          textoExtraido += content.items.map((it) => it.str).join(" ") + "\n";
        }
      } else {
        arquivoBase64 = await resizeImage(file, 1000, 0.75);
        mimeType = "image/jpeg";
        const Tesseract = await carregarTesseract();
        const r = await Tesseract.recognize(file, "por");
        textoExtraido = r.data.text;
      }
      const total = extrairTotalDoTextoOcr(textoExtraido);
      const documento = { id: uid(), tipo: "saida", nome_arquivo: file.name, arquivo_base64: arquivoBase64, mime_type: mimeType, data_upload: new Date().toISOString(), lancamento_id: null };
      onAnexar(documento);
      setResultado({ total });
    } catch (err) {
      setErro("Não consegui ler esse arquivo: " + err.message);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📎 Anexar fatura</h3>
        <p className="text-xs text-stone-500 mb-3">Guarda o PDF/foto como referência. Formato de fatura varia demais entre bancos pra separar os itens sozinho com confiança — pra lançar cada compra parcelada, usa "+ Novo lançamento" no Extrato escolhendo esse cartão.</p>

        {!resultado && !processando && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
            📎 Escolher PDF ou foto
            <input type="file" accept=".pdf,image/*" onChange={aoEscolherArquivo} className="hidden" />
          </label>
        )}
        {processando && <div className="text-center py-8 text-sm text-stone-500">Lendo o arquivo...</div>}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}
        {resultado && (
          <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
            ✓ Fatura anexada.
            {resultado.total != null && <div className="mt-1">Valor total identificado: <b className="font-mono2">{brl(resultado.total)}</b></div>}
          </div>
        )}

        <button onClick={onFechar} className="w-full py-2.5 mt-4 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">{resultado ? "Fechar" : "Cancelar"}</button>
      </div>
    </div>
  );
}

function DetalheCartao({ cartao, lancamentos, categorias, onAnexarFatura, onVoltar }) {
  const faturaAtualChave = chaveMesAtual();
  const proximas = proximasFaturas(lancamentos, cartao.id, 6);
  const itens = itensDeFaturaAgrupados(lancamentos, cartao.id);
  const maiorFatura = Math.max(...proximas.map((f) => f.total), 1);
  const [modalFatura, setModalFatura] = useState(false);
  const entradasGrafico = itens.map((it) => ({ nome: it.descricao, valor: it.valorTotal, cor: corParaNome(it.descricao) }));

  return (
    <div className="h-full overflow-y-auto p-4">
      <button onClick={onVoltar} className="text-emerald-700 font-semibold text-sm mb-3 tap-target">← Voltar</button>
      <h3 className="text-lg font-bold text-stone-800 mb-1">{cartao.nome}</h3>
      <p className="text-xs text-stone-400 mb-3">Fecha dia {cartao.dia_fechamento} · Vence dia {cartao.dia_vencimento}{cartao.limite != null ? ` · Limite ${brl(cartao.limite)}` : ""}</p>

      <button onClick={() => setModalFatura(true)} className="text-xs text-emerald-700 font-semibold tap-target mb-3 block">📎 Anexar fatura</button>

      <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Próximas faturas</div>
        <div className="space-y-1.5">
          {proximas.map((f) => (
            <div key={f.chave} className="flex items-center gap-2">
              <span className="text-xs text-stone-500 w-16 shrink-0">{nomeDaChaveMes(f.chave).slice(0, 3)}</span>
              <div className="flex-1 bg-stone-100 rounded-full h-4 overflow-hidden">
                <div className={`h-4 rounded-full ${f.chave === faturaAtualChave ? "bg-emerald-600" : "bg-stone-300"}`} style={{ width: `${Math.max(4, (f.total / maiorFatura) * 100)}%` }} />
              </div>
              <span className="font-mono2 text-xs text-stone-600 w-20 text-right shrink-0">{brl(f.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {itens.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
          <div className="font-semibold text-stone-700 text-sm mb-2">Itens por valor</div>
          <GraficoCategorias entradas={entradasGrafico} tituloVazio="Nenhuma compra ainda." />
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">Itens em andamento</div>
        {!itens.length && <p className="text-xs text-stone-400 text-center py-3">Nenhuma compra nesse cartão ainda.</p>}
        <div className="space-y-2">
          {itens.map((it) => {
            const cat = by(categorias, it.categoriaId);
            return (
              <div key={it.id} className="flex items-center justify-between text-sm border-b border-stone-50 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-stone-700 truncate flex items-center gap-1.5">{cat?.icone || "🏷️"} {it.descricao}</div>
                  <div className="text-xs text-stone-400">{it.unica ? "Compra única" : `Parcela ${it.parcelaTotal - it.parcelasRestantes + 1}/${it.parcelaTotal} · faltam ${it.parcelasRestantes}`}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="font-mono2 font-semibold text-stone-700">{brl(it.valorTotal)}</div>
                  {!it.unica && <div className="text-xs text-stone-400">faltam {brl(it.valorRestante)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {modalFatura && <ModalAnexarFatura onAnexar={(doc) => { onAnexarFatura(doc); }} onFechar={() => setModalFatura(false)} />}
    </div>
  );
}

/* ---------- TelaCartoes — Fase 7: lista de cartões + acesso ao detalhe ---------- */
function TelaCartoes({ cartoes, setCartoes, lancamentos, categorias, onAnexarFatura }) {
  const [formCartao, setFormCartao] = useState(null);
  const [cartaoAberto, setCartaoAberto] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  function salvarCartao(dados) { setCartoes((cs) => upsertBy(cs, [dados])); setFormCartao(null); }
  function removerCartao(cartao) {
    const temLancamento = lancamentos.some((l) => l.cartao_id === cartao.id);
    setConfirmar({
      titulo: "Excluir cartão", severo: true, textoConfirmar: "Excluir",
      mensagem: temLancamento ? `Esse cartão tem compras vinculadas. Excluir "${cartao.nome}" mesmo assim? As compras continuam existindo, só ficam sem o cartão.` : `Excluir "${cartao.nome}"?`,
      acao: () => { setCartoes((cs) => cs.filter((c) => c.id !== cartao.id)); setConfirmar(null); },
    });
  }

  if (cartaoAberto) {
    const cartaoAtual = cartoes.find((c) => c.id === cartaoAberto);
    if (!cartaoAtual) { setCartaoAberto(null); return null; }
    return <DetalheCartao cartao={cartaoAtual} lancamentos={lancamentos} categorias={categorias} onAnexarFatura={onAnexarFatura} onVoltar={() => setCartaoAberto(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <button onClick={() => setFormCartao({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Cartão</button>
      {!cartoes.length && <p className="text-sm text-stone-400 text-center py-10">Nenhum cartão cadastrado ainda.</p>}
      <div className="space-y-2">
        {cartoes.map((c) => {
          const faturaAtual = proximasFaturas(lancamentos, c.id, 1)[0]?.total || 0;
          return (
            <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-stone-800">{c.nome}</div>
                  <div className="text-xs text-stone-400">Fatura atual: <span className="font-mono2 font-semibold text-stone-600">{brl(faturaAtual)}</span></div>
                </div>
                <div className="flex gap-3"><button onClick={() => setFormCartao(c)} aria-label={`Editar ${c.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerCartao(c)} aria-label={`Excluir ${c.nome}`} className="text-red-400 tap-target">🗑️</button></div>
              </div>
              <button onClick={() => setCartaoAberto(c.id)} className="text-xs text-emerald-700 font-semibold tap-target">Ver detalhe →</button>
            </div>
          );
        })}
      </div>

      {formCartao !== null && <ModalCartao cartao={formCartao.id ? formCartao : null} onSalvar={salvarCartao} onFechar={() => setFormCartao(null)} />}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

function TabBarFinancas({ aba, setAba }) {
  const itens = [{ id: "extrato", label: "Extrato", icon: "📋" }, { id: "metas", label: "Metas", icon: "🎯" }, { id: "cartoes", label: "Cartões", icon: "💳" }, { id: "documentos", label: "Docs", icon: "📄" }, { id: "config", label: "Config", icon: "⚙️" }];
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
function AppFinancas({ apiKey, setApiKey, onVoltarHub, onEditarNoMercado, arquivoCompartilhado, onUsarArquivoCompartilhado }) {
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
  const [cartoes, setCartoes] = useState([]);
  const [gruposOrcamento, setGruposOrcamento] = useState([]);
  const [rendaManual, setRendaManual] = useState(null);
  const [historicoAportes, setHistoricoAportes] = useState([]);
  const [aba, setAba] = useState("extrato");
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [erroSalvamento, setErroSalvamento] = useState(false);

  /* Compartilhamento nativo: chegou um arquivo com o app aberto no Finanças — muda direto pra
     Documentos, que é onde o botão de processar vai aparecer. */
  useEffect(() => {
    if (arquivoCompartilhado) setAba("documentos");
  }, [arquivoCompartilhado]);

  /* Mesmo motivo do App (index.html): sem isso, voltar de dentro de uma aba interna do Finanças
     (Metas, Relatório etc.) fechava o app inteiro em vez de voltar pro Extrato. */
  useFecharComVoltar(aba !== "extrato", () => setAba("extrato"));

  useEffect(() => {
    const d = loadAllFinancas();
    setCategorias(d.categorias); setContas(d.contas); setLancamentos(d.lancamentos); setLancamentosFixos(d.lancamentosFixos);
    setLembretes5Dias(d.lembretes5Dias); setReflexoesMensais(d.reflexoesMensais); setLimiar5Dias(d.limiar5Dias); setMetas(d.metas); setDocumentos(d.documentos); setCartoes(d.cartoes);
    setGruposOrcamento(d.gruposOrcamento); setRendaManual(d.rendaManual);
    setHistoricoAportes(d.historicoAportes);
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
  useEffect(() => { if (!loading) { const ok = persist("fn_cartoes", cartoes); if (!ok) setErroSalvamento(true); } }, [cartoes, loading]);
  useEffect(() => { if (!loading && gruposOrcamento.length) { const ok = persist("fn_gruposOrcamento", gruposOrcamento); if (!ok) setErroSalvamento(true); } }, [gruposOrcamento, loading]);
  useEffect(() => { if (!loading) { if (rendaManual == null) localStorage.removeItem("fn_rendaManual"); else localStorage.setItem("fn_rendaManual", String(rendaManual)); } }, [rendaManual, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_historicoAportes", historicoAportes); if (!ok) setErroSalvamento(true); } }, [historicoAportes, loading]);

  /* Ao salvar um lançamento marcado como recorrente, garante um id de fixo estável — usa o que já
     veio (confirmando um previsto, ou editando um recorrente existente) ou cria um novo na primeira
     vez — e grava o LANÇAMENTO REAL já vinculado a esse id (senão o mesmo mês voltaria a aparecer
     como "previsto" de novo, por não achar nenhum lançamento real ligado ao fixo). */
  const salvarLancamentosComFixo = (dadosOriginais) => {
    if (Array.isArray(dadosOriginais)) {
      // série de parcelas (Fase 7) — não passa pela lógica de recorrente, que é outro conceito
      setLancamentos((ls) => upsertBy(ls, dadosOriginais));
      return;
    }
    let dados = dadosOriginais;
    if (dados.recorrente) {
      const fixoId = dados.origem_fixo_id || uid();
      dados = { ...dados, origem_fixo_id: fixoId };
      setLancamentosFixos((fs) => upsertBy(fs, [{ ...dados, id: fixoId }]));
    }
    setLancamentos((ls) => upsertBy(ls, [dados]));
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
  /* Seção 14 do mapa: importa em lote, cada transação entra sem categoria (pendente). */
  function importarTransacoes(transacoes, contaId) {
    const novos = transacoes.map((t) => ({
      id: uid(), tipo: t.tipo, descricao: t.descricao, categoria_id: null, valor: t.valor, data: t.data,
      fixa: false, recorrente: false, dia_recorrencia: null, forma_pagamento: null,
      conta_id: contaId, origem_fixo_id: null, documento_id: null,
    }));
    setLancamentos((ls) => [...ls, ...novos]);
  }
  /* Anexar comprovante/nota direto num lançamento (novo ou já existente) — pedido do usuário,
     complementa o fluxo que já existia (upload de documento cria/vincula lançamento) com o
     caminho inverso: já tenho o lançamento, quero só anexar o comprovante nele agora. */
  async function anexarDocumentoALancamento(file, tipoDocumento) {
    let arquivoBase64, mimeType;
    if (file.type === "application/pdf") {
      arquivoBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      mimeType = "application/pdf";
    } else {
      arquivoBase64 = await resizeImage(file, 1000, 0.75);
      mimeType = "image/jpeg";
    }
    const documentoId = uid();
    setDocumentos((ds) => [...ds, { id: documentoId, tipo: tipoDocumento, nome_arquivo: file.name, arquivo_base64: arquivoBase64, mime_type: mimeType, data_upload: new Date().toISOString(), lancamento_id: null }]);
    return documentoId;
  }
  /* Pedido do usuário: documentos que chegaram (compartilhamento, ou do repositório) e ainda não
     têm lançamento vinculado ficam disponíveis pra escolher na hora de editar um lançamento, em
     vez de subir o arquivo de novo. Chamada no momento de salvar o lançamento (não ao escolher),
     sincronizando o lado do documento — de quebra corrige uma lacuna que já existia: anexar pelo
     formulário de lançamento nunca atualizava o lancamento_id do documento em si (só o documento_id
     do lançamento), então "Vinculado a: X" na aba Documentos nunca aparecia certo por esse caminho. */
  function vincularDocumentoAoLancamento(documentoId, lancamentoId) {
    setDocumentos((ds) => ds.map((d) => (d.id === documentoId ? { ...d, lancamento_id: lancamentoId } : d)));
  }
  function anexarFatura(documento) {
    setDocumentos((ds) => [...ds, documento]);
  }
  /* Fotografar recibo (pedido do usuário: "só ao fotografar já cria uma entrada") — cria o
     documento e o lançamento juntos, num golpe só. */
  function fotografarRecibo({ documento, lancamento }) {
    setDocumentos((ds) => [...ds, documento]);
    setLancamentos((ls) => [...ls, lancamento]);
  }
  /* Resolve um lançamento pendente — categoria normal, ou vínculo com meta (achado da seção 14.6:
     "Dinheiro reservado/retirado" do Mercado Pago é aporte/retirada de caixinha, não gasto comum).
     Direção do ajuste na meta usa o sinal que a própria transação já trouxe do banco: despesa =
     dinheiro indo pra reserva (soma), receita = dinheiro voltando da reserva (subtrai). */
  function resolverPendente(dados) {
    if (dados.resolverComoMeta) {
      const criandoNova = !!dados.metaNovaNome;
      const metaId = criandoNova ? uid() : dados.metaIdEscolhida;
      const delta = dados.tipo === "despesa" ? dados.valor : -dados.valor;
      setMetas((ms) => {
        if (criandoNova) return [...ms, { id: metaId, nome: dados.metaNovaNome, icone: "🎯", valor_alvo: null, valor_guardado: Math.max(0, delta) }];
        return ms.map((m) => (m.id === metaId ? { ...m, valor_guardado: Math.max(0, m.valor_guardado + delta) } : m));
      });
      setHistoricoAportes((h) => [...h, { id: uid(), meta_id: metaId, valor: delta, data: dados.data }]);
      const { resolverComoMeta, metaIdEscolhida, metaNovaNome, ...resto } = dados;
      salvarLancamentosComFixo({ ...resto, categoria_id: "catfn_aporte_meta" });
      return;
    }
    salvarLancamentosComFixo(dados);
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
            lancamentos={lancamentos} documentos={documentos} onSalvarLancamento={salvarLancamentosComFixo} onRemoverLancamento={removerLancamentoReal}
            lancamentosFixos={lancamentosFixos} setLancamentosFixos={setLancamentosFixos}
            lembretes5Dias={lembretes5Dias} limiar5Dias={limiar5Dias} onAdiar5Dias={adiarLancamento5Dias}
            onConfirmarLembrete={confirmarLembrete} onDescartarLembrete={descartarLembrete}
            reflexoesMensais={reflexoesMensais} onSalvarReflexao={salvarReflexao}
            metas={metas} cartoes={cartoes} gruposOrcamento={gruposOrcamento} rendaManual={rendaManual} onResolverPendente={resolverPendente}
            onAnexarDocumento={anexarDocumentoALancamento}
            onVincularDocumentoExistente={vincularDocumentoAoLancamento}
            onFotografarRecibo={fotografarRecibo}
            onEditarNoMercado={onEditarNoMercado}
            onAbrirConfig={() => setAba("config")}
          />
        )}
        {aba === "metas" && (
          <TelaMetas metas={metas} setMetas={setMetas} contas={contas} historicoAportes={historicoAportes} onRegistrarAporte={(registro) => setHistoricoAportes((h) => [...h, registro])} onAporteComoDespesa={salvarLancamentosComFixo} />
        )}
        {aba === "cartoes" && (
          <TelaCartoes cartoes={cartoes} setCartoes={setCartoes} lancamentos={lancamentos} categorias={categorias} onAnexarFatura={anexarFatura} />
        )}
        {aba === "documentos" && (
          <TelaDocumentos documentos={documentos} setDocumentos={setDocumentos} lancamentos={lancamentos} onSalvarLancamento={salvarLancamentosComFixo} categorias={categorias} contas={contas} arquivoCompartilhado={arquivoCompartilhado} onUsarArquivoCompartilhado={onUsarArquivoCompartilhado} />
        )}
        {aba === "config" && (
          <TelaConfigFinancas categorias={categorias} setCategorias={setCategorias} contas={contas} setContas={setContas} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} limiar5Dias={limiar5Dias} setLimiar5Dias={setLimiar5Dias} onImportarExtrato={importarTransacoes} gruposOrcamento={gruposOrcamento} setGruposOrcamento={setGruposOrcamento} rendaManual={rendaManual} setRendaManual={setRendaManual} metas={metas} cartoes={cartoes} />
        )}
      </div>
      <TabBarFinancas aba={aba} setAba={setAba} />
    </div>
  );
}
