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
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
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
  const soma = somarValores(...movimentacoes.map((l) => (l.tipo === "receita" ? l.valor : -l.valor)));
  return somarValores(conta.saldo_inicial, soma);
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
  const entradas = somarValores(...itensDoMes.filter((l) => l.tipo === "receita" && !l.previsto).map((l) => l.valor));
  const saidas = somarValores(...itensDoMes.filter((l) => l.tipo === "despesa" && !l.previsto).map((l) => l.valor));
  return { entradas, saidas, saldoDoMes: somarValores(entradas, -saidas) };
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
/* Pedido do usuário: ao lançar uma receita nova, sugerir como dividi-la pelos grupos de
   orçamento configurados. Correção importante depois de conversar com o usuário — são TRÊS
   categorias de meta, não duas, e cada uma desenha de uma fatia diferente:
   - Poupança SEM TETO (sem valor_alvo — por definição também sem prazo, não tem "quanto por
     mês" pra calcular) = poupança de verdade → fatia de "Poupança", repartida igualmente entre
     as que existem (sem outro critério de peso possível, já que não têm prazo/valor mensal).
   - Meta ÚNICA com alvo (ex: Viagem) = um DESEJO, não poupança → fatia de "Desejos", repartida
     proporcional ao quanto cada uma precisa por mês (via depositoRecomendadoMeta).
   - Meta SAZONAL (ex: IPVA, IPTU) = uma OBRIGAÇÃO → fatia de "Necessidades", mas cada uma mostra
     só o próprio valor fixo mensal, sem repartir a fatia inteira (que também cobre aluguel,
     contas reais que não são "meta" nesse sistema). */
function distribuicaoRecomendadaReceita(valorReceita, gruposOrcamento, metas, hoje) {
  const porGrupo = (gruposOrcamento || []).map((g) => ({ grupo: g, valorSugerido: valorReceita * (g.percentual / 100) }));
  const grupoPoupanca = (gruposOrcamento || []).find((g) => g.id === "orc_poupanca" || /poupan/i.test(g.nome));
  const grupoDesejos = (gruposOrcamento || []).find((g) => g.id === "orc_desejos" || /desejo/i.test(g.nome));
  const grupoNecessidades = (gruposOrcamento || []).find((g) => g.id === "orc_necessidades" || /necessidade/i.test(g.nome));

  // Poupança sem teto — reparte igualmente a fatia de Poupança (sem valor_alvo/prazo, não tem
  // outro critério pra pesar uma mais que outra).
  const metasPoupancaSemTeto = (metas || []).filter((m) => m.valor_alvo == null);
  const valorParaPoupanca = grupoPoupanca ? valorReceita * (grupoPoupanca.percentual / 100) : 0;
  const porMetaPoupanca = metasPoupancaSemTeto.map((m) => ({
    meta: m,
    valorSugerido: metasPoupancaSemTeto.length ? valorParaPoupanca / metasPoupancaSemTeto.length : 0,
    percentualDaReceita: valorReceita > 0 && metasPoupancaSemTeto.length ? (valorParaPoupanca / metasPoupancaSemTeto.length / valorReceita) * 100 : 0,
  }));

  // Metas com alvo definido e prazo (sem prazo não dá pra saber "quanto por mês") — separadas em
  // desejo (única) e obrigação (sazonal).
  const metasComAlvo = (metas || [])
    .filter((m) => m.valor_alvo != null && m.prazo)
    .map((m) => ({ meta: m, sugestao: depositoRecomendadoMeta(m, hoje) }))
    .filter((x) => x.sugestao);

  const desejoMetas = metasComAlvo.filter((x) => x.meta.tipo !== "sazonal");
  const reservaMetas = metasComAlvo.filter((x) => x.meta.tipo === "sazonal");

  const valorParaDesejos = grupoDesejos ? valorReceita * (grupoDesejos.percentual / 100) : 0;
  const totalNecessarioDesejos = desejoMetas.reduce((a, x) => a + x.sugestao.valorMensal, 0);
  const porMetaDesejo = desejoMetas.map((x) => {
    const proporcao = totalNecessarioDesejos > 0 ? x.sugestao.valorMensal / totalNecessarioDesejos : 0;
    const valorSugerido = valorParaDesejos * proporcao;
    return { meta: x.meta, valorSugerido, percentualDaReceita: valorReceita > 0 ? (valorSugerido / valorReceita) * 100 : 0 };
  });

  const porMetaReserva = reservaMetas.map((x) => ({
    meta: x.meta, valorSugerido: x.sugestao.valorMensal,
    percentualDaReceita: valorReceita > 0 ? (x.sugestao.valorMensal / valorReceita) * 100 : 0,
  }));
  const totalReservas = porMetaReserva.reduce((a, x) => a + x.valorSugerido, 0);
  const valorNecessidades = grupoNecessidades ? valorReceita * (grupoNecessidades.percentual / 100) : 0;

  return {
    porGrupo,
    grupoPoupanca, valorParaPoupanca, porMetaPoupanca,
    grupoDesejos, valorParaDesejos, porMetaDesejo,
    grupoNecessidades, valorNecessidades, porMetaReserva, totalReservas,
  };
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
/* ---------- Financiamento — pedido do usuário: acompanhar uma dívida (ex: financiamento da
   casa) de um jeito parecido com meta, só que invertido: saldo devedor CAINDO rumo a zero, em
   vez de valor guardado CRESCENDO rumo a um alvo. Simplificação consciente: não tenta calcular
   juros/amortização com precisão (isso varia por contrato/banco, sistema SAC vs Price, correção
   monetária etc.) — o saldo devedor só muda quando o usuário registra um pagamento ou atualiza
   direto, batendo com o extrato do banco. A "previsão de quitação" usada aqui é a do CONTRATO
   original (data de início + quantidade de parcelas), não uma projeção otimista. */
/* Sugestão automática de juros/amortização (SAC ou Price) — pedido do usuário depois de
   perguntar se o app já calculava isso. Deixei claro que era simplificação consciente antes;
   isso aqui é OPCIONAL: só entra em ação se o financiamento tiver taxa_juros_mensal e
   sistema_amortizacao preenchidos (campos opcionais no cadastro). Sem esses dois, cai pro
   comportamento de sempre (parcela inteira sugerida como amortização, editável). Mesmo com a
   sugestão calculada, o campo continua editável — o boleto real do banco sempre pode divergir
   um pouco (taxas administrativas, seguro, arredondamento), então isso é ponto de partida, não
   verdade absoluta. */
function calcularJurosMesFinanciamento(saldoDevedor, taxaJurosMensalPct) {
  return saldoDevedor * (taxaJurosMensalPct / 100);
}
function sugestaoAmortizacaoSAC(f) {
  const amortizacao = f.valor_total / f.parcelas_totais;
  const juros = calcularJurosMesFinanciamento(f.saldo_devedor, f.taxa_juros_mensal);
  return { amortizacao, juros, parcela: amortizacao + juros };
}
function sugestaoAmortizacaoPrice(f) {
  const i = f.taxa_juros_mensal / 100;
  const parcelasRestantes = Math.max(1, f.parcelas_totais - f.parcelas_pagas);
  const pmt = i > 0
    ? f.saldo_devedor * (i * Math.pow(1 + i, parcelasRestantes)) / (Math.pow(1 + i, parcelasRestantes) - 1)
    : f.saldo_devedor / parcelasRestantes;
  const juros = calcularJurosMesFinanciamento(f.saldo_devedor, f.taxa_juros_mensal);
  return { amortizacao: pmt - juros, juros, parcela: pmt };
}
/* Taxa de juros implícita — pedido do usuário: dado o valor à vista (valor apresentado), a
   quantidade de parcelas e o valor de cada uma, descobrir a taxa de juros mensal embutida. Não
   tem fórmula fechada (é o inverso da fórmula de valor presente da Tabela Price) — resolve por
   bisseção, testando taxas até achar a que faz o valor presente das parcelas bater com o valor
   à vista. Testado e conferido de volta (valor presente com a taxa achada retorna o valor à
   vista original) com casos de juros normal, zero e alto. */
function taxaJurosImplicita(valorApresentado, numParcelas, valorParcela) {
  const totalParcelado = valorParcela * numParcelas;
  if (totalParcelado <= valorApresentado || numParcelas <= 0 || valorApresentado <= 0) return 0;

  function valorPresente(i) {
    if (i === 0) return totalParcelado;
    return valorParcela * (1 - Math.pow(1 + i, -numParcelas)) / i;
  }

  let baixo = 0, alto = 1, tentativas = 0;
  while (valorPresente(alto) > valorApresentado && alto < 10 && tentativas < 50) { alto *= 2; tentativas++; }
  for (let iter = 0; iter < 100; iter++) {
    const meio = (baixo + alto) / 2;
    if (valorPresente(meio) > valorApresentado) baixo = meio; else alto = meio;
  }
  return (baixo + alto) / 2;
}
function sugestaoPagamentoFinanciamento(f) {
  if (!f.taxa_juros_mensal || !f.sistema_amortizacao) return null;
  return f.sistema_amortizacao === "price" ? sugestaoAmortizacaoPrice(f) : sugestaoAmortizacaoSAC(f);
}
function progressoFinanciamento(f) {
  const pago = f.valor_total - f.saldo_devedor;
  const pct = f.valor_total > 0 ? Math.max(0, Math.min(100, (pago / f.valor_total) * 100)) : 0;
  return { pago, pct };
}
function previsaoQuitacaoFinanciamento(f) {
  const inicio = new Date(f.data_inicio);
  const dataContrato = new Date(inicio.getFullYear(), inicio.getMonth() + f.parcelas_totais, inicio.getDate());
  const parcelasRestantes = Math.max(0, f.parcelas_totais - f.parcelas_pagas);
  return { dataContrato, parcelasRestantes };
}
function pagamentosPorMes(historico, financiamentoId, quantidadeMeses) {
  const doFinanciamento = historico.filter((h) => h.financiamento_id === financiamentoId);
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => ({ chave, total: doFinanciamento.filter((h) => chaveMesDe(h.data) === chave).reduce((acc, h) => acc + h.valor_amortizado, 0) }));
}
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

/* Gráfico de linha genérico, sem legenda de "dia" (que só fazia sentido pro acumulado dentro de
   um mês) — usado pela evolução mensal/anual da poupança total. */
function GraficoLinhaSimples({ pontos, cor = "#065f46" }) {
  const largura = 280, altura = 80;
  if (pontos.length < 2) return <div className="text-xs text-stone-400 text-center py-3">Sem dados suficientes ainda.</div>;
  const valores = pontos.map((p) => p.valor);
  const min = Math.min(...valores, 0), max = Math.max(...valores, 1);
  const range = max - min || 1;
  const coords = pontos.map((p, i) => ({ x: (i / (pontos.length - 1)) * largura, y: altura - ((p.valor - min) / range) * (altura - 10) - 5 }));
  const linha = coords.map((c) => `${c.x},${c.y}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none">
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="2.5" />
      {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="2.5" fill={cor} />)}
    </svg>
  );
}
/* Seta + porcentagem de variação — subirCorRuim inverte as cores (pra gasto, subir é ruim/
   vermelho; pra ganho ou poupança, subir é bom/verde). */
function Variacao({ valor, subirCorRuim = true }) {
  if (valor == null) return <span className="text-stone-400 text-xs">sem comparação</span>;
  const subiu = valor > 0;
  const corBoa = subirCorRuim ? !subiu : subiu;
  return <span className={`text-xs font-semibold ${valor === 0 ? "text-stone-400" : corBoa ? "text-emerald-700" : "text-red-500"}`}>{subiu ? "▲" : valor < 0 ? "▼" : "—"} {Math.abs(valor).toFixed(0)}%</span>;
}

/* ---------- TelaEvolucaoFinancas — aba nova pedida pelo usuário: gastos/ganhos subindo ou
   descendo, evolução da poupança total, comparação mensal e anual. ---------- */
function TelaEvolucaoFinancas({ chaveMes, lancamentos: lancamentosBrutos, lancamentosFixos, categorias, contas, rendaManual, historicoAportes }) {
  const [visao, setVisao] = useState("caixa"); // "caixa" | "competencia"
  const lancamentos = lancamentosParaVisao(lancamentosBrutos, visao);

  const trend12 = totaisUltimosMeses(lancamentos, null, 12);
  const atual = trend12[trend12.length - 1];
  const anterior = trend12[trend12.length - 2];
  const varGasto = anterior?.saidas > 0 ? ((atual.saidas - anterior.saidas) / anterior.saidas) * 100 : null;
  const varGanho = anterior?.entradas > 0 ? ((atual.entradas - anterior.entradas) / anterior.entradas) * 100 : null;

  const acumuladoPoupanca = totalGuardadoAcumuladoPorMes(historicoAportes, 12);
  const totalGuardadoAtual = acumuladoPoupanca[acumuladoPoupanca.length - 1]?.total || 0;
  const totalGuardadoAnterior = acumuladoPoupanca[acumuladoPoupanca.length - 2]?.total || 0;
  const varPoupanca = totalGuardadoAnterior !== 0 ? ((totalGuardadoAtual - totalGuardadoAnterior) / Math.abs(totalGuardadoAnterior)) * 100 : null;

  const taxaPoupanca = taxaPoupancaPorMes(historicoAportes, lancamentosFixos, rendaManual, 6);
  const comparacaoAno = compararComAnoPassado(lancamentos, chaveMes);
  const categoriaTop = categoriaTopPorMes(lancamentos, categorias, 6);

  const saldoAtualTotal = contas.reduce((a, c) => a + calcularSaldoConta(c, lancamentosBrutos, null), 0);
  const projecao = projecaoSaldoFuturo(saldoAtualTotal, lancamentosFixos, 6);

  const streak = sequenciaPositiva(trend12);
  const projFimMes = projecaoFimDeMes(lancamentos, chaveMes);
  const mediaGastoAnteriores = trend12.slice(0, -1).length ? trend12.slice(0, -1).reduce((a, m) => a + m.saidas, 0) / trend12.slice(0, -1).length : null;
  const { melhor: melhorMes, pior: piorMes } = melhorPiorMes(trend12);
  const fixoVarPorMes = fixoVsVariavelPorMes(lancamentos, 6);
  const maiorGastoPorMesLista = maiorGastoPorMes(lancamentos, 6);

  // agrupa os últimos 12 meses em anos, pra "evolução anual"
  const porAno = {};
  trend12.forEach((m) => {
    const ano = m.chave.split("-")[0];
    if (!porAno[ano]) porAno[ano] = { entradas: 0, saidas: 0 };
    porAno[ano].entradas += m.entradas;
    porAno[ano].saidas += m.saidas;
  });

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="flex gap-2">
        <Chip selected={visao === "caixa"} onClick={() => setVisao("caixa")}>📅 Por fatura</Chip>
        <Chip selected={visao === "competencia"} onClick={() => setVisao("competencia")}>🛒 Por compra</Chip>
      </div>
      <p className="text-xs text-stone-400 -mt-2">{visao === "caixa" ? "Compra parcelada conta no mês em que cada fatura chega." : "Compra parcelada conta inteira no mês em que você comprou (não repete nas telas abaixo)."}</p>

      {streak > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
          <span className="text-xl">🔥</span>
          <span className="text-sm text-emerald-800"><b>{streak} mês{streak === 1 ? "" : "es"} seguido{streak === 1 ? "" : "s"}</b> gastando menos do que ganhou.</span>
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">🔮 Projeção de saldo — próximos 6 meses</div>
        <p className="text-xs text-stone-400 mb-2">Baseada só nos lançamentos fixos/recorrentes — não prevê gasto avulso futuro.</p>
        <GraficoLinhaSimples pontos={projecao.map((p) => ({ valor: p.saldo }))} cor="#0891b2" />
        <div className="flex justify-between text-xs mt-1">
          <span className="text-stone-500">Hoje: <b className="font-mono2 text-stone-700">{brl(projecao[0].saldo)}</b></span>
          <span className="text-stone-500">Em 6 meses: <b className={`font-mono2 ${projecao[6].saldo >= projecao[0].saldo ? "text-emerald-700" : "text-red-500"}`}>{brl(projecao[6].saldo)}</b></span>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">📉 Gastos — evolução mensal</div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-mono2 font-bold text-xl text-stone-800">{brl(atual.saidas)}</span>
          <Variacao valor={varGasto} subirCorRuim={true} />
          <span className="text-xs text-stone-400">vs mês anterior</span>
        </div>
        <GraficoEntradasSaidasPorMes dados={trend12} />
      </div>

      {projFimMes && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 text-sm mb-1">🎯 Ritmo do mês — se continuar assim</div>
          <p className="text-xs text-stone-400 mb-2">Dia {projFimMes.diaAtual} de {projFimMes.diasNoMes} · {brl(projFimMes.gastoAteAgora)} gastos até agora</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono2 font-bold text-xl text-stone-800">{brl(projFimMes.projetado)}</span>
            <span className="text-xs text-stone-400">projeção de fechamento</span>
          </div>
          {mediaGastoAnteriores != null && (
            <p className="text-xs text-stone-500 mt-1">
              {projFimMes.projetado > mediaGastoAnteriores ? "⚠️ Acima" : "✓ Abaixo"} da média dos meses anteriores ({brl(mediaGastoAnteriores)})
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">📈 Ganhos — evolução mensal</div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono2 font-bold text-xl text-emerald-700">{brl(atual.entradas)}</span>
          <Variacao valor={varGanho} subirCorRuim={false} />
          <span className="text-xs text-stone-400">vs mês anterior</span>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-1">🐷 Dinheiro guardado — evolução total</div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-mono2 font-bold text-xl text-stone-800">{brl(totalGuardadoAtual)}</span>
          <Variacao valor={varPoupanca} subirCorRuim={false} />
        </div>
        <GraficoLinhaSimples pontos={acumuladoPoupanca.map((p) => ({ valor: p.total }))} />
        <div className="text-[10px] text-stone-400 mt-1">Últimos 12 meses · soma de todas as metas e poupanças</div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">🧱 Fixo vs variável — últimos 6 meses</div>
        <p className="text-xs text-stone-400 mb-2">Se o fixo está comendo cada vez mais da renda, sobra menos pra decidir.</p>
        <div className="space-y-1.5">
          {fixoVarPorMes.map((f) => {
            const total = f.fixo + f.variavel;
            return (
              <div key={f.chave} className="text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-stone-500">{nomeDaChaveMes(f.chave)}</span>
                  <span className="font-mono2 text-stone-600">{brl(total)}</span>
                </div>
                {total > 0 && (
                  <div className="h-1.5 rounded-full overflow-hidden flex w-full bg-stone-100">
                    <div style={{ width: `${(f.fixo / total) * 100}%` }} className="bg-stone-500" />
                    <div style={{ width: `${(f.variavel / total) * 100}%` }} className="bg-amber-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-stone-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stone-500 inline-block" /> fixo</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> variável</span>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">💰 Taxa de poupança — últimos 6 meses</div>
        <p className="text-xs text-stone-400 mb-2">Quanto % da renda virou dinheiro guardado.</p>
        <div className="space-y-1.5">
          {taxaPoupanca.map((t) => (
            <div key={t.chave} className="flex items-center justify-between text-xs">
              <span className="text-stone-500">{nomeDaChaveMes(t.chave)}</span>
              <span className={`font-mono2 font-semibold ${t.taxa == null ? "text-stone-400" : t.taxa >= 0 ? "text-emerald-700" : "text-red-500"}`}>{t.taxa != null ? t.taxa.toFixed(1) + "%" : "sem renda definida"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">📅 {nomeDaChaveMes(chaveMes)} vs {nomeDaChaveMes(comparacaoAno.chaveAnoPassado)}</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Gastos</span>
            <span className="text-right"><span className="font-mono2 font-semibold text-stone-800">{brl(comparacaoAno.despesasAtual)}</span><span className="text-stone-400 text-xs ml-1">(era {brl(comparacaoAno.despesasAnoPassado)})</span></span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-500">Ganhos</span>
            <span className="text-right"><span className="font-mono2 font-semibold text-stone-800">{brl(comparacaoAno.receitasAtual)}</span><span className="text-stone-400 text-xs ml-1">(era {brl(comparacaoAno.receitasAnoPassado)})</span></span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">🏷️ Categoria que mais pesou — mês a mês</div>
        <div className="space-y-1.5">
          {categoriaTop.map((c) => (
            <div key={c.chave} className="flex items-center justify-between text-xs">
              <span className="text-stone-500">{nomeDaChaveMes(c.chave)}</span>
              <span className="text-stone-700 font-medium">{c.topNome ? `${c.topNome} · ${brl(c.topValor)}` : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3">
        <div className="font-semibold text-stone-700 text-sm mb-2">💥 Maior gasto único — mês a mês</div>
        <div className="space-y-1.5">
          {maiorGastoPorMesLista.map((m) => (
            <div key={m.chave} className="flex items-center justify-between text-xs">
              <span className="text-stone-500">{nomeDaChaveMes(m.chave)}</span>
              <span className="text-stone-700 font-medium truncate max-w-[60%] text-right">{m.descricao ? `${m.descricao} · ${brl(m.valor)}` : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {melhorMes && piorMes && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 text-sm mb-2">🏆 Melhor e pior mês — últimos 12 meses</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-stone-500">✓ Melhor</span>
              <span className="text-right"><span className="text-stone-700">{nomeDaChaveMes(melhorMes.chave)}</span> <span className="font-mono2 font-semibold text-emerald-700">{brl(melhorMes.saldo)}</span></span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500">✗ Pior</span>
              <span className="text-right"><span className="text-stone-700">{nomeDaChaveMes(piorMes.chave)}</span> <span className={`font-mono2 font-semibold ${piorMes.saldo >= 0 ? "text-emerald-700" : "text-red-500"}`}>{brl(piorMes.saldo)}</span></span>
            </div>
          </div>
        </div>
      )}

      {Object.keys(porAno).length > 1 && (
        <div className="bg-white border border-stone-200 rounded-xl p-3">
          <div className="font-semibold text-stone-700 text-sm mb-2">🗓️ Evolução anual</div>
          <div className="space-y-2">
            {Object.entries(porAno).map(([ano, t]) => (
              <div key={ano} className="flex items-center justify-between text-sm">
                <span className="text-stone-600 font-semibold">{ano}</span>
                <span className="font-mono2 text-xs"><span className="text-emerald-700">+{brl(t.entradas)}</span> <span className="text-red-500">-{brl(t.saidas)}</span></span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-stone-400 mt-2">Baseado nos últimos 12 meses — anos parciais (não é o ano-calendário completo se ainda não tiver 12 meses de histórico).</div>
        </div>
      )}
    </div>
  );
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
/* Achado pesquisando o Mobills: eles distinguem "competência" (quando a compra aconteceu) de
   "caixa" (quando o dinheiro efetivamente saiu, ex: data da fatura) — evita a falsa sensação de
   riqueza antes da fatura de uma compra parcelada chegar. Nosso dado padrão já é "caixa" (cada
   parcela tem a data de vencimento daquela fatura); pra ver por "competência", troca a data pela
   data_compra_original (só existe em parcelas de cartão — o resto do lançamento não muda, porque
   já é a mesma data nos dois sentidos). Pré-processa a lista inteira UMA vez, assim as funções de
   tendência (totaisUltimosMeses etc.) não precisam saber que esse toggle existe. */
function lancamentosParaVisao(lancamentos, modo) {
  if (modo !== "competencia") return lancamentos;
  return lancamentos.map((l) => (l.data_compra_original ? { ...l, data: l.data_compra_original } : l));
}
/* Projeção de saldo futuro, inspirada no "Saldo Previsto" do Mobills (Saldo Atual + Receitas
   Pendentes − Despesas Pendentes) — aqui estendida pra vários meses à frente, usando só os
   lançamentos FIXOS/recorrentes como base (não dá pra prever gasto avulso futuro, só o que já é
   compromisso certo). */
/* Quanto o mês atual deve fechar, no ritmo de gasto até agora — projeção linear simples
   (gasto até hoje / dias já passados × dias no mês). Só faz sentido pro mês corrente; mês
   passado já fechou de verdade, mês futuro não tem "ritmo" ainda. */
function projecaoFimDeMes(lancamentos, chaveMes) {
  if (chaveMesAtual() !== chaveMes) return null;
  const [ano, mes] = chaveMes.split("-").map(Number);
  const diaAtual = new Date().getDate();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const gastoAteAgora = lancamentosDoMes(lancamentos, chaveMes).filter((l) => l.tipo === "despesa" && !l.previsto).reduce((a, l) => a + l.valor, 0);
  const projetado = diaAtual > 0 ? (gastoAteAgora / diaAtual) * diasNoMes : 0;
  return { diaAtual, diasNoMes, gastoAteAgora, projetado };
}
/* Fixo vs variável, mês a mês — mesma conta de fixoVsVariavelDoMes (já usada no Resumo), só que
   repetida pra cada um dos últimos N meses, pra ver se a proporção está mudando. */
function fixoVsVariavelPorMes(lancamentos, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => {
    const despesas = lancamentosDoMes(lancamentos, chave).filter((l) => l.tipo === "despesa" && !l.previsto);
    const { fixo, variavel } = fixoVsVariavelDoMes(despesas);
    return { chave, fixo, variavel };
  });
}
/* Maior gasto único, mês a mês — reaproveita topGastosDoMes (já usado no Resumo) pedindo só 1. */
function maiorGastoPorMes(lancamentos, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => {
    const despesas = lancamentosDoMes(lancamentos, chave).filter((l) => l.tipo === "despesa" && !l.previsto);
    const [maior] = topGastosDoMes(despesas, 1);
    return { chave, descricao: maior?.descricao || null, valor: maior?.valor || 0 };
  });
}
/* Quantos meses seguidos (contando de trás pra frente, a partir do mais recente) fechou no azul
   (entradas > saídas). Para no primeiro mês negativo — trend já vem em ordem crescente. */
function sequenciaPositiva(trend) {
  let streak = 0;
  for (let i = trend.length - 1; i >= 0; i--) {
    if (trend[i].entradas > trend[i].saidas) streak++;
    else break;
  }
  return streak;
}
/* Melhor e pior mês (por saldo) dentro da janela de meses fornecida. */
function melhorPiorMes(trend) {
  if (!trend.length) return { melhor: null, pior: null };
  const comSaldo = trend.map((m) => ({ ...m, saldo: m.entradas - m.saidas }));
  const melhor = comSaldo.reduce((a, b) => (b.saldo > a.saldo ? b : a));
  const pior = comSaldo.reduce((a, b) => (b.saldo < a.saldo ? b : a));
  return { melhor, pior };
}
function projecaoSaldoFuturo(saldoAtual, lancamentosFixos, quantidadeMeses) {
  const receitasFixas = lancamentosFixos.filter((f) => f.tipo === "receita").reduce((a, f) => a + f.valor, 0);
  const despesasFixas = lancamentosFixos.filter((f) => f.tipo === "despesa").reduce((a, f) => a + f.valor, 0);
  const netMensal = receitasFixas - despesasFixas;
  let chave = chaveMesAtual();
  let acumulado = saldoAtual;
  const pontos = [{ chave, saldo: acumulado }];
  for (let i = 1; i <= quantidadeMeses; i++) {
    chave = mesSeguinte(chave);
    acumulado += netMensal;
    pontos.push({ chave, saldo: acumulado });
  }
  return pontos;
}
/* ---------- Aba Evolução — pedido do usuário: gastos/ganhos subindo ou descendo, poupança
   total crescendo, comparação mensal e anual. ---------- */
/* Total guardado em TODAS as metas/poupanças juntas, acumulado mês a mês (não o líquido do mês —
   a soma de tudo desde sempre até aquele mês, pra mostrar a curva de crescimento real). */
function totalGuardadoAcumuladoPorMes(historicoAportes, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  const primeiroChaveJanela = chaves[0];
  let acumulado = historicoAportes.filter((a) => chaveMesDe(a.data) < primeiroChaveJanela).reduce((acc, a) => acc + a.valor, 0);
  return chaves.map((chave) => {
    const doMes = historicoAportes.filter((a) => chaveMesDe(a.data) === chave).reduce((acc, a) => acc + a.valor, 0);
    acumulado += doMes;
    return { chave, total: acumulado };
  });
}
/* Quanto % da renda virou aporte líquido em metas/poupanças, mês a mês. */
function taxaPoupancaPorMes(historicoAportes, lancamentosFixos, rendaManual, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  const renda = rendaMensalCalculada(lancamentosFixos, rendaManual);
  return chaves.map((chave) => {
    const aportesLiquidos = historicoAportes.filter((a) => chaveMesDe(a.data) === chave).reduce((acc, a) => acc + a.valor, 0);
    return { chave, aportesLiquidos, taxa: renda > 0 ? (aportesLiquidos / renda) * 100 : null };
  });
}
/* Mesmo mês, um ano antes — comparação sem viés sazonal (dezembro sempre gasta mais que abril). */
function compararComAnoPassado(lancamentos, chaveMes) {
  const [ano, mes] = chaveMes.split("-").map(Number);
  const chaveAnoPassado = `${ano - 1}-${String(mes).padStart(2, "0")}`;
  function totalTipo(chave, tipo) {
    return lancamentos.filter((l) => chaveMesDe(l.data) === chave && l.tipo === tipo).reduce((a, l) => a + l.valor, 0);
  }
  return {
    chaveAnoPassado,
    despesasAtual: totalTipo(chaveMes, "despesa"), despesasAnoPassado: totalTipo(chaveAnoPassado, "despesa"),
    receitasAtual: totalTipo(chaveMes, "receita"), receitasAnoPassado: totalTipo(chaveAnoPassado, "receita"),
  };
}
/* Categoria que mais pesou no gasto, mês a mês — mostra se é sempre a mesma "vencendo" ou se muda. */
function categoriaTopPorMes(lancamentos, categorias, quantidadeMeses) {
  let chaves = [chaveMesAtual()];
  for (let i = 1; i < quantidadeMeses; i++) chaves.unshift(mesAnteriorDe(chaves[0]));
  return chaves.map((chave) => {
    const despesas = lancamentosDoMes(lancamentos, chave).filter((l) => l.tipo === "despesa");
    const porCategoria = {};
    despesas.forEach((d) => {
      const cat = by(categorias, d.categoria_id);
      const nome = cat?.nome || "Sem categoria";
      porCategoria[nome] = (porCategoria[nome] || 0) + d.valor;
    });
    const ordenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    return { chave, topNome: ordenadas[0]?.[0] || null, topValor: ordenadas[0]?.[1] || 0 };
  });
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
/* Pedido do usuário — "o leitor de PDF se embaralha todo": pdf.js devolve os itens de texto na
   ordem em que foram DESENHADOS no PDF (ordem do stream interno), não na ordem de leitura
   visual. Em tabelas e layouts de várias colunas isso embaralha tudo. Essa função reconstrói a
   ordem de leitura de verdade: agrupa itens por linha usando uma FAIXA de tolerância de Y (não
   arredondamento exato — testado que arredondamento quebra quando dois itens da mesma linha
   caem em lados opostos de uma fronteira de arredondamento), e ordena cada linha da esquerda pra
   direita. Compartilhada pelos 3 leitores de PDF do app (nota fiscal, extrato bancário,
   documento anexado) — antes cada um tinha sua própria lógica (uma delas nem reordenava nada). */
function itensPdfEmLinhas(items) {
  const comPosicao = items.filter((it) => it.str.trim() !== "").map((it) => ({ texto: it.str, x: it.transform[4], y: it.transform[5] }));
  const ordenadoPorY = [...comPosicao].sort((a, b) => b.y - a.y);
  const LIMIAR_MESMA_LINHA = 3; // unidades de PDF — itens dentro dessa faixa de Y contam como a mesma linha
  const linhas = [];
  for (const item of ordenadoPorY) {
    let linha = linhas.find((l) => Math.abs(l.y - item.y) < LIMIAR_MESMA_LINHA);
    if (!linha) { linha = { y: item.y, itens: [] }; linhas.push(linha); }
    linha.itens.push(item);
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x));
}
async function extrairTextoDoPdf(arrayBuffer) {
  const pdfjsLib = await carregarPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linhas = itensPdfEmLinhas(content.items);
    textoCompleto += linhas.map((linha) => linha.map((it) => it.texto).join(" ")).join("\n") + "\n";
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
/* Compartilhada entre TelaDocumentos, ModalDetalheLancamento e o Mercado (via
   verNotaFiscalDoFinancas) — abrir um documento anexado numa aba nova. Quando existe uma versão
   reconstruída em HTML (Etapa 7), abre ela por padrão — mais fácil de ler que o PDF/foto crua —
   com um link "Ver arquivo original" que abre o arquivo de verdade numa segunda aba (nunca
   embutido dentro do HTML reconstruído, pra não duplicar o arquivo guardado em dobro). Documento
   sem reconstrução (upload antigo, ou tipo que não gera HTML) cai no comportamento de sempre. */
function abrirArquivoDocumento(doc) {
  const w = window.open();
  if (!w) return;
  if (doc.html_reconstruido) {
    w.document.write(doc.html_reconstruido);
    const link = w.document.getElementById("linkOriginal");
    if (link) link.addEventListener("click", (e) => { e.preventDefault(); window.open(doc.arquivo_base64, "_blank"); });
    return;
  }
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
    const linhasDaPagina = itensPdfEmLinhas(content.items);
    for (const linha of linhasDaPagina) {
      const texto = linha.map((it) => it.texto).join(" ").trim();
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

/* Extrai os campos de UM bloco de texto (várias linhas que pertencem à mesma transação) —
   date/id/valor/saldo podem estar em qualquer posição dentro do bloco (achado real: a linha com
   os números fica no MEIO do bloco quando a descrição é longa, não no fim), então extrai por
   busca de padrão no texto inteiro do bloco, não por posição fixa. */
function extrairTransacaoDoBloco(linhasDoBloco) {
  const textoCompleto = linhasDoBloco.join(" ").replace(/\s+/g, " ").trim();
  const mData = textoCompleto.match(/(\d{2}-\d{2}-\d{4})/);
  const mId = textoCompleto.match(/\b(\d{9,15})\b/);
  const valoresRs = [...textoCompleto.matchAll(/R\$\s*(-?[\d.,]+)/g)];
  if (!mData || !mId || valoresRs.length < 2) return null; // não é uma transação de verdade (cabeçalho, rodapé de página etc.)
  const descricao = textoCompleto
    .replace(mData[0], "").replace(mId[0], "").replace(valoresRs[0][0], "").replace(valoresRs[1][0], "")
    .replace(/\s+/g, " ").trim();
  const [dia, mes, ano] = mData[1].split("-");
  const valor = parseFloat(valoresRs[0][1].replace(/\./g, "").replace(",", "."));
  const saldoApos = parseFloat(valoresRs[1][1].replace(/\./g, "").replace(",", ".")); // pedido do usuário: usar pra corrigir saldo inicial
  return {
    data: new Date(`${ano}-${mes}-${dia}T12:00:00`).toISOString(),
    descricao: descricao || "Transação", valor: Math.abs(valor), tipo: valor >= 0 ? "receita" : "despesa",
    saldoApos,
  };
}
/* Pedido do usuário — testando contra um extrato real do Mercado Pago, achei um bug sério:
   descrições longas quebram em várias linhas, e a linha com data/ID/valor/saldo fica no MEIO
   desse bloco (não no fim), na altura vertical que varia dependendo de quantas linhas a
   descrição ocupa — a lógica antiga (juntar cada linha solta ao "vizinho mais próximo" por
   distância de índice) colava pedaços de transações diferentes juntos. A correção usa outro
   sinal, mais confiável: o ESPAÇAMENTO vertical entre linhas. Dentro de um mesmo bloco (mesma
   transação) o espaçamento é pequeno (~5-12 unidades de PDF); entre um bloco e o próximo é bem
   maior (~23-27) — testado e conferido contra o PDF real. Agrupa por esse salto, extrai
   data/id/valor/saldo de qualquer posição dentro do bloco, e o resto do texto vira a descrição. */
async function extrairTransacoesMercadoPagoPdf(pdf) {
  const transacoes = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const marcador = content.items.find((it) => it.str.includes("DETALHE DOS MOVIMENTOS"));
    const yCorte = marcador ? marcador.transform[5] : Infinity;
    const itensDaPagina = content.items.filter((item) => item.transform[5] < yCorte); // ainda no cabeçalho da página (CPF, resumo) fica de fora

    const comPosicao = itensDaPagina.filter((it) => it.str.trim() !== "").map((it) => ({ texto: it.str, x: it.transform[4], y: it.transform[5] }));
    const ordenadoPorY = [...comPosicao].sort((a, b) => b.y - a.y);
    const LIMIAR_MESMA_LINHA = 3;
    const linhasBrutas = [];
    for (const item of ordenadoPorY) {
      let linha = linhasBrutas.find((l) => Math.abs(l.y - item.y) < LIMIAR_MESMA_LINHA);
      if (!linha) { linha = { y: item.y, itens: [] }; linhasBrutas.push(linha); }
      linha.itens.push(item);
    }
    const linhasComY = linhasBrutas.map((l) => ({ y: l.y, texto: l.itens.sort((a, b) => a.x - b.x).map((i) => i.texto).join(" ") }));

    /* "Data de geração:" marca o início do rodapé legal (SAC, ouvidoria, CNPJ) — corta tudo a
       partir dali, não só essa linha, senão o texto do rodapé vaza pra descrição da última
       transação. */
    const idxRodape = linhasComY.findIndex((l) => /^Data de geração:/.test(l.texto));
    const linhasUteis = idxRodape >= 0 ? linhasComY.slice(0, idxRodape) : linhasComY;

    const LIMIAR_NOVO_BLOCO = 18; // unidades de PDF — salto maior que isso indica nova linha da tabela
    const blocos = [];
    let blocoAtual = [];
    for (let i = 0; i < linhasUteis.length; i++) {
      if (i > 0 && linhasUteis[i - 1].y - linhasUteis[i].y > LIMIAR_NOVO_BLOCO) {
        if (blocoAtual.length) blocos.push(blocoAtual);
        blocoAtual = [];
      }
      blocoAtual.push(linhasUteis[i].texto);
    }
    if (blocoAtual.length) blocos.push(blocoAtual);

    for (const bloco of blocos) {
      const t = extrairTransacaoDoBloco(bloco);
      if (t) transacoes.push(t);
    }
  }
  const checkpoints = transacoes.filter((t) => t.saldoApos != null).map((t) => ({ data: t.data, saldo: t.saldoApos }));
  transacoes.forEach((t) => delete t.saldoApos); // não faz parte do formato de transação normal, só usado pra montar os checkpoints
  return { transacoes, checkpoints };
}
/* Pedido do usuário: PDF do extrato do Itaú (conta corrente/universitária), quando a pessoa não
   tem acesso fácil ao OFX. Testado e conferido linha por linha contra um extrato real de 5
   páginas — cada linha de transação é "DD/MM/AAAA descrição valor", exceto as linhas "SALDO DO
   DIA" (não são transação de verdade, são só o saldo acumulado daquele dia — têm que ser
   ignoradas na lista de transações, senão viram lançamentos falsos enormes). O valor pode ter
   sinal negativo (despesa) ou não (receita) — o próprio texto já indica isso.
   Além das transações, também captura os "checkpoints" de saldo real do banco (essas mesmas
   linhas SALDO DO DIA) — pedido do usuário: usar isso pra corrigir automaticamente o saldo
   inicial da conta, em vez de depender do usuário lembrar/acertar um valor de cabeça. */
async function extrairTransacoesItauPdf(pdf) {
  let todasAsLinhas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    todasAsLinhas.push(...itensPdfEmLinhas(content.items).map((linha) => linha.map((it) => it.texto).join(" ")));
  }
  const transacoes = [];
  const checkpoints = [];
  const regexData = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/;
  for (const linha of todasAsLinhas) {
    const m = linha.match(regexData);
    if (!m) continue;
    const [, dataStr, resto] = m;
    const [dia, mes, ano] = dataStr.split("/");
    const dataIso = new Date(`${ano}-${mes}-${dia}T12:00:00`).toISOString();
    if (resto.includes("SALDO DO DIA")) {
      const saldoMatch = resto.match(/-?[\d.]+,\d{2}/);
      if (saldoMatch) {
        const saldo = parseFloat(saldoMatch[0].replace(/\./g, "").replace(",", "."));
        checkpoints.push({ data: dataIso, saldo });
      }
      continue;
    }
    const numeros = resto.match(/-?[\d.]+,\d{2}/g);
    if (!numeros || !numeros.length) continue;
    const valorTexto = numeros[numeros.length - 1];
    const valor = parseFloat(valorTexto.replace(/\./g, "").replace(",", "."));
    const descricao = resto.slice(0, resto.lastIndexOf(valorTexto)).trim();
    if (!descricao) continue;
    transacoes.push({
      data: dataIso, descricao, valor: Math.abs(valor), tipo: valor < 0 ? "despesa" : "receita",
    });
  }
  return { transacoes, checkpoints };
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
/* Pedido do usuário: sugerir categoria automaticamente ao importar extrato, baseado em
   palavra-chave na descrição. Cada regra procura no NOME da categoria (não por ID fixo — assim
   funciona mesmo se o usuário renomeou ou criou categorias próprias, casa com qualquer
   configuração). A primeira regra que bater com a descrição E achar uma categoria correspondente
   ganha; sem correspondência, a transação fica sem sugestão (comportamento de sempre, "aguardando
   categoria"). Testado contra um extrato real de 136 transações — achados no caminho:
   - "MERCADO PAGO" (empresa) precisa de exclusão explícita, senão confunde com "Mercado"
     (categoria de supermercado) — o regex de mercado usa negative lookahead pra isso.
   - Muita descrição vem com a data colada direto no nome, sem espaço (ex: "CLARO30/06"),
     quebrando fronteira de palavra (\b não separa letra de dígito) — por isso limpa a data colada
     antes de testar os padrões. */
const REGRAS_AUTO_CATEGORIZACAO = [
  { padrao: /sal[aá]rio|remunera[cç][aã]o/i, tipo: "receita", palavrasChave: ["salário", "salario"] },
  { padrao: /rend[\s.]*pago|rendimento/i, tipo: "receita", palavrasChave: ["outros"] },
  { padrao: /imobili[aá]ria|aluguel|condom[ií]nio/i, tipo: "despesa", palavrasChave: ["moradia"] },
  { padrao: /\bagua\b|\bluz\b|\benergia\b|internet|\bnet\b|telefonia|\bclaro\b|\bvivo\b|\btim\b/i, tipo: "despesa", palavrasChave: ["água", "luz", "internet"] },
  { padrao: /mercado(?!\s*pago)|superm|padaria|acai|a[cç]a[íi]|hortifruti|sacola[ãa]o|mega\s*master|minimercado/i, tipo: "despesa", palavrasChave: ["mercado"] },
  { padrao: /\bposto\b|combust[ií]vel|\buber\b|99app|estacionamento/i, tipo: "despesa", palavrasChave: ["transporte"] },
  { padrao: /farm[aá]cia|drogas|drogaria|hospital|cl[ií]nica|laborat[oó]rio|\bvet\b|veterin[aá]ri/i, tipo: "despesa", palavrasChave: ["saúde"] },
  { padrao: /netflix|spotify|amazon\s*prime|disney|hbo|wellh|gympass|academia|assinatura/i, tipo: "despesa", palavrasChave: ["assinatura"] },
  { padrao: /ifood|restaurante|lanchonete|lanch\b|hamburgu|pizzaria|\bbar\b|burguer/i, tipo: "despesa", palavrasChave: ["lazer"] },
  { padrao: /\bjuros\b|\biof\b|tarifa\s*banc[aá]ria|anuidade/i, tipo: "despesa", palavrasChave: ["outros"] },
];
function categoriaAutoDetectada(descricaoOriginal, tipo, categorias) {
  const descricao = descricaoOriginal.replace(/\d{2}\/\d{2}$/, "").trim(); // tira data colada sem espaço no final
  for (const regra of REGRAS_AUTO_CATEGORIZACAO) {
    if (regra.tipo !== tipo) continue;
    if (!regra.padrao.test(descricao)) continue;
    for (const palavra of regra.palavrasChave) {
      const cat = categorias.find((c) => c.tipo === tipo && c.nome.toLowerCase().includes(palavra.toLowerCase()));
      if (cat) return cat.id;
    }
  }
  return null;
}
/* Pedido do usuário: em vez de só evitar duplicata, casar o que importa do banco com o que já
   foi lançado na mão durante a semana — conciliação bancária de verdade. Casa por: mesma conta,
   mesmo tipo, valor EXATO (evita casar coisa parecida por acaso), data dentro de uma folga de
   alguns dias (banco processa PIX/débito às vezes com atraso). Nunca casa duas vezes o mesmo
   lançamento, nem casa contra algo que já veio do próprio banco antes (evitaria comparar banco
   com banco) ou já foi conciliado numa importação anterior. Testado com um cenário cobrindo os
   5 casos: casamento normal, sem par nenhum lado, já conciliado antes, já veio do banco antes,
   conta diferente. */
function conciliarTransacoesImportadas(transacoesImportadas, lancamentosExistentes, contaId) {
  const JANELA_DIAS = 3;
  const candidatos = lancamentosExistentes.filter((l) => l.conta_id === contaId && !l.origem_extrato && !l.conciliado);
  const usados = new Set();
  const conciliadas = [];
  const novasDoBanco = [];

  for (const t of transacoesImportadas) {
    const dataT = new Date(t.data).getTime();
    const candidato = candidatos.find((l) => {
      if (usados.has(l.id)) return false;
      if (l.tipo !== t.tipo) return false;
      if (Math.abs(l.valor - t.valor) >= 0.01) return false;
      const difDias = Math.abs(new Date(l.data).getTime() - dataT) / 86400000;
      return difDias <= JANELA_DIAS;
    });
    if (candidato) { usados.add(candidato.id); conciliadas.push({ transacaoImportada: t, lancamentoExistenteId: candidato.id }); }
    else novasDoBanco.push(t);
  }
  const naoBateram = candidatos.filter((l) => !usados.has(l.id));
  return { conciliadas, novasDoBanco, naoBateram };
}
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
      categoria_id: compraBase.categoria_id, valor: valorDessaParcela, data: dataVencimento.toISOString(), data_compra_original: compraBase.data,
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
          const atualizadosDocs = documentos.map((d) => (d.id === documentoIdFinal ? { ...d, nome_arquivo: sessaoMercado.nfe.nome_arquivo || d.nome_arquivo, arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type, html_reconstruido: sessaoMercado.nfe.html_reconstruido } : d));
          persist("fn_documentos", atualizadosDocs);
        } else {
          // não tinha nota antes (ou tinha um resumo de versão antiga) -- cria de novo
          documentoIdFinal = uid();
          const novoDocumento = { id: documentoIdFinal, tipo: "saida", categoria_documento: "nota_fiscal", nome_arquivo: sessaoMercado.nfe.nome_arquivo || ("NFe — " + (nomeMercado || "compra")), arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type, html_reconstruido: sessaoMercado.nfe.html_reconstruido, data_upload: new Date().toISOString(), lancamento_id: existente.id };
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
        id: documentoId, tipo: "saida", categoria_documento: "nota_fiscal", nome_arquivo: sessaoMercado.nfe.nome_arquivo || ("NFe — " + (nomeMercado || "compra")),
        arquivo_base64: sessaoMercado.nfe.arquivo_base64, mime_type: sessaoMercado.nfe.mime_type, html_reconstruido: sessaoMercado.nfe.html_reconstruido,
        data_upload: new Date().toISOString(), lancamento_id: novaDespesa.id,
      };
      persist("fn_documentos", [...documentos, novoDocumento]);
    }
    return documentoId;
  } catch (e) { console.error("Falha ao integrar compra do Mercado com Finanças:", e); return null; }
}

function loadAllFinancas() {
  let categorias = null, contas = [], lancamentos = [], lancamentosFixos = [], lembretes5Dias = [], reflexoesMensais = {}, limiar5Dias = 100, metas = [], documentos = [], cartoes = [], gruposOrcamento = null, rendaManual = null, historicoAportes = [], financiamentos = [], historicoPagamentosFinanciamento = [];
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
  try { const v = localStorage.getItem("fn_financiamentos"); financiamentos = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("fn_historicoPagamentosFinanciamento"); historicoPagamentosFinanciamento = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  if (!categorias) categorias = SEED_CATEGORIAS_FINANCEIRAS;
  if (!gruposOrcamento) gruposOrcamento = SEED_GRUPOS_ORCAMENTO;
  return { categorias, contas, lancamentos, lancamentosFixos, lembretes5Dias, reflexoesMensais, limiar5Dias, metas, documentos, cartoes, gruposOrcamento, rendaManual, historicoAportes, financiamentos, historicoPagamentosFinanciamento, houveErroCarregamento };
}

/* ---------- ModalConta — criar/editar conta financeira ---------- */
function ModalConta({ conta, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(conta?.nome || "");
  const [saldoTexto, setSaldoTexto] = useState(conta?.saldo_inicial != null ? formatarValorCampo(conta.saldo_inicial) : "");
  const [data, setData] = useState(conta?.data_saldo_inicial ? conta.data_saldo_inicial.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [ativa, setAtiva] = useState(conta?.ativa !== false); // contas antigas sem esse campo continuam ativas por padrão

  function salvar() {
    const saldo = parseValorFinanceiro(saldoTexto);
    if (!nome.trim()) { alert("Dá um nome pra essa conta."); return; }
    if (saldo == null) { alert("Preenche o saldo inicial — pode ser 0 se a conta está zerada."); return; }
    onSalvar({ id: conta?.id || uid(), nome: nome.trim(), saldo_inicial: saldo, data_saldo_inicial: new Date(data).toISOString(), ativa });
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

        <label className="flex items-center gap-2 text-sm text-stone-600 mb-4 tap-target">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="w-5 h-5" aria-label="Conta ativa" />
          Conta ativa — desmarcando, some do saldo total e da lista pra novos lançamentos, mas o histórico continua guardado
        </label>

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
function ModalLancamento({ lancamento, tipoInicial, categorias, contas, contaPadraoId, cartoes, limiar5Dias, valorInicial, documentoId, lancamentos, documentos, onSalvar, onAdiar5Dias, onRemover, onAnexarDocumento, onAnexarNotaColada, onVincularDocumentoExistente, onEditarNoMercado, onFechar }) {
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
  /* Pedido do usuário: colar a nota fiscal direto no "+", puxando descrição/valor/data/categoria
     sozinho — só falta escolher a conta. Reaproveita o mesmo parser e o mesmo "monta HTML" que
     Mercado e Documentos já usam (nenhuma lógica nova de extração, só um jeito novo de chegar
     nela). Confere de novo com o usuário na hora, não confirma sozinho: os campos vêm preenchidos
     mas continuam editáveis antes de salvar. */
  const [colandoNota, setColandoNota] = useState(false);
  const [textoNotaColada, setTextoNotaColada] = useState("");
  const [erroNota, setErroNota] = useState(null);
  const [processandoNota, setProcessandoNota] = useState(false);
  async function processarNotaColada() {
    setErroNota(null);
    setProcessandoNota(true);
    try {
      const nfeLida = parsearTextoConsultaNFCe(textoNotaColada);
      const arquivoBase64 = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(textoNotaColada)));
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, dataEmissao: nfeLida.data_emissao,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do texto colado da consulta oficial — não é o documento oficial.",
      });
      setTipo("despesa");
      setDescricao(nfeLida.nome_emit || "Nota fiscal");
      setValorTexto(formatarValorCampo(nfeLida.valor_total));
      if (nfeLida.data_emissao) setData(nfeLida.data_emissao);
      const catSugerida = categoriaAutoDetectada(nfeLida.nome_emit || "", "despesa", categorias);
      if (catSugerida) setCategoriaId(catSugerida);
      if (onAnexarNotaColada) {
        const novoId = await onAnexarNotaColada({ arquivoBase64, htmlReconstruido, nomeArquivo: "nfce-consulta.txt" }, "saida");
        setDocumentoAnexadoId(novoId);
      }
      setColandoNota(false);
      setTextoNotaColada("");
    } catch (err) {
      setErroNota(err.message);
    } finally {
      setProcessandoNota(false);
    }
  }

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

  /* Etapa sobre simplificar o Finanças: os atalhos deixam de ser uma tela própria antes do
     formulário — viram uma fileira compacta e dispensável no topo do formulário completo (pedido
     do usuário: "toca em algo parecido, ou já lança do zero", sem hop de tela nenhum). Só o botão
     de dispensar precisa de estado — sem isso, os atalhos aparecem sempre que existirem. */
  const [atalhosDispensados, setAtalhosDispensados] = useState(false);

  /* Teclado abre direto no valor (pedido do usuário: "quanto gastei" costuma ser o primeiro
     pensamento) — só em lançamento novo, uma vez ao montar. */
  useEffect(() => {
    if (ehNovo) setTimeout(() => valorInputRef.current?.focus(), 150);
  }, []);

  /* Atalho: preenche tudo a partir de um lançamento passado, foca e seleciona o valor pra só
     precisar ajustar o número (pedido do usuário: "ajusta só o valor e depois edita"). Some a
     fileira de atalhos depois de aplicado, pra não competir visualmente com o formulário já
     preenchido. */
  function aplicarSugestao(s) {
    setTipo(s.tipo);
    setDescricao(s.descricao);
    setCategoriaId(s.categoria_id);
    setValorTexto(formatarValorCampo(s.valor));
    if (s.forma_pagamento) setFormaPagamento(s.forma_pagamento);
    if (s.conta_id) setContaId(s.conta_id);
    setAtalhosDispensados(true);
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
        /* Corrige a rotação (EXIF) antes do OCR — sem isso, foto tirada em retrato (a maioria)
           faz o Tesseract tentar ler o texto deitado e sai lixo. Mesmo ajuste feito nos outros
           4 pontos de OCR do app; aqui precisa calcular do zero porque essa função só lê o
           valor, não guarda arquivo nenhum. */
        const corrigida = await resizeImage(file, 1000, 0.75);
        const Tesseract = await carregarTesseract();
        const resultado = await Tesseract.recognize(corrigida, "por");
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{lancamento ? "Editar lançamento" : "Novo lançamento"}</h3>

        {ehNovo && temAtalhos && !atalhosDispensados && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-stone-400 uppercase">Atalhos — toca em algo parecido</span>
              <button onClick={() => setAtalhosDispensados(true)} aria-label="Esconder atalhos" className="text-stone-300 tap-target px-1">✕</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {ultimoLancamento && (
                <button onClick={() => aplicarSugestao(ultimoLancamento)} className="flex flex-col items-start bg-emerald-50 border-2 border-emerald-200 rounded-xl p-2.5 text-left tap-target shrink-0 w-32">
                  <span className="text-[10px] text-emerald-600 font-semibold mb-0.5">🔁 Último</span>
                  <span className="text-xs text-stone-800 font-medium truncate w-full">{ultimoLancamento.descricao}</span>
                  <span className="text-sm font-mono2 font-bold text-stone-800">{brl(ultimoLancamento.valor)}</span>
                </button>
              )}
              {sugestoes.filter((s) => s.id !== ultimoLancamento?.id).map((s) => {
                const cat = by(categorias, s.categoria_id);
                return (
                  <button key={s.id} onClick={() => aplicarSugestao(s)} className="flex flex-col items-start bg-stone-50 border-2 border-stone-200 rounded-xl p-2.5 text-left tap-target shrink-0 w-32">
                    <span className="text-sm mb-0.5">{cat?.icone || "🏷️"}</span>
                    <span className="text-xs text-stone-800 font-medium truncate w-full">{s.descricao}</span>
                    <span className="text-sm font-mono2 font-bold text-stone-800">{brl(s.valor)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {ehNovo && onAnexarNotaColada && (
          <div className="mb-4">
            {!colandoNota ? (
              <button onClick={() => setColandoNota(true)} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-emerald-300 rounded-xl py-2.5 text-sm text-emerald-700 font-semibold tap-target">
                📎 Colar nota fiscal (preenche sozinho)
              </button>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-xs text-stone-500 mb-2">Abre o link da consulta oficial da nota, seleciona tudo, copia, e cola aqui. Preenche descrição, valor, data e categoria sozinho — só falta escolher a conta.</p>
                <textarea value={textoNotaColada} onChange={(e) => setTextoNotaColada(e.target.value)} rows={4} placeholder="Cola aqui (Ctrl+V)..." className="w-full border border-stone-300 rounded-lg p-2 text-xs font-mono2" aria-label="Texto colado da nota fiscal" disabled={processandoNota} />
                {erroNota && <p className="text-xs text-red-600 mt-2">{erroNota}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => { setColandoNota(false); setTextoNotaColada(""); setErroNota(null); }} disabled={processandoNota} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-semibold tap-target disabled:opacity-40">Cancelar</button>
                  <button onClick={processarNotaColada} disabled={!textoNotaColada.trim() || processandoNota} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold tap-target disabled:opacity-40">{processandoNota ? "Lendo..." : "Ler nota"}</button>
                </div>
              </div>
            )}
          </div>
        )}

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

        <label className="text-xs font-semibold text-stone-500 uppercase flex items-center gap-1.5 justify-between">
          <span className="flex items-center gap-1.5">Valor{origemMercadoSessaoId && <span className="text-[10px] normal-case font-normal text-stone-400">🔒 vem do Mercado</span>}</span>
          {!origemMercadoSessaoId && <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 normal-case font-normal">150→R$150,00</span>}
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
              {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
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
      const resultado = await Tesseract.recognize(base64, "por");
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
    const htmlReconstruido = montarHtmlRecibo({
      nomeEmit: descricao.trim() || "Recibo",
      valorTotal: valor,
      avisoOrigem: "Lido por foto (OCR) — só o total, sem itens. Confira contra a foto original se tiver dúvida.",
    });
    onSalvar({
      documento: { id: documentoId, tipo: "saida", categoria_documento: "recibo", nome_arquivo: arquivo.nomeArquivo, arquivo_base64: arquivo.base64, mime_type: "image/jpeg", html_reconstruido: htmlReconstruido, data_upload: new Date().toISOString(), lancamento_id: null },
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

            <label className="text-xs font-semibold text-stone-500 uppercase flex items-center justify-between">
              Valor
              <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 normal-case font-normal">150→R$150,00</span>
            </label>
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
                  {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
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

/* Pedido do usuário: ao abrir o detalhe de um lançamento, se ele for parte de uma série (parcela
   de cartão OU pagamento de financiamento), mostrar não só essa entrada mas a série toda —
   quantidade de parcelas, % já pago, quanto falta. Pra transação comum, não mostra nada disso. */
function InfoSerieLancamento({ item, lancamentos, financiamentos }) {
  if (item.compra_parcelada_id) {
    const parcelasDaCompra = lancamentos.filter((l) => l.compra_parcelada_id === item.compra_parcelada_id);
    const total = item.parcela_total || parcelasDaCompra.length;
    const valorTotal = item.valor * total; // parcelas de cartão têm o mesmo valor entre si (rateio já feito na criação)
    const valorPago = item.valor * item.parcela_atual;
    const pct = total > 0 ? Math.min(100, (item.parcela_atual / total) * 100) : 0;
    return (
      <div className="bg-stone-50 rounded-xl p-3 mb-4">
        <div className="text-xs font-semibold text-stone-600 mb-2">💳 Parte de uma compra parcelada</div>
        <div className="text-sm text-stone-700 mb-1.5">Parcela {item.parcela_atual} de {total}</div>
        <div className="w-full bg-stone-200 rounded-full h-2 mb-1.5">
          <div className="bg-emerald-600 h-2 rounded-full" style={{ width: pct + "%" }} />
        </div>
        <div className="text-xs text-stone-500 font-mono2">{brl(valorPago)} pagos de {brl(valorTotal)} ({Math.round(pct)}%) · faltam {brl(valorTotal - valorPago)}</div>
      </div>
    );
  }
  if (item.financiamento_id) {
    const f = (financiamentos || []).find((x) => x.id === item.financiamento_id);
    if (!f) return null;
    const { pago, pct } = progressoFinanciamento(f);
    const { parcelasRestantes } = previsaoQuitacaoFinanciamento(f);
    return (
      <div className="bg-stone-50 rounded-xl p-3 mb-4">
        <div className="text-xs font-semibold text-stone-600 mb-2">{f.icone} Parte do financiamento "{f.nome}"</div>
        <div className="text-sm text-stone-700 mb-1.5">Parcela {f.parcelas_pagas} de {f.parcelas_totais} · faltam {parcelasRestantes}</div>
        <div className="w-full bg-stone-200 rounded-full h-2 mb-1.5">
          <div className="bg-emerald-600 h-2 rounded-full" style={{ width: pct + "%" }} />
        </div>
        <div className="text-xs text-stone-500 font-mono2">{brl(pago)} pagos de {brl(f.valor_total)} ({Math.round(pct)}%) · saldo devedor {brl(f.saldo_devedor)}</div>
      </div>
    );
  }
  return null;
}
function ModalDetalheLancamento({ item, categoria, conta, documento, lancamentos, financiamentos, onEditar, onExcluir, onFechar }) {
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
          {item.fixa && <div className="flex justify-between"><span className="text-stone-400">Tipo</span><span className="text-stone-700">{item.recorrente ? "Fixo recorrente" : "Fixo"}</span></div>}
        </div>

        <InfoSerieLancamento item={item} lancamentos={lancamentos} financiamentos={financiamentos} />

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
/* Sugestão ao lançar receita nova — pedido do usuário: dividir pelo orçamento configurado e,
   dentro da fatia de poupança, entre as metas ativas. Só informativo (sem ação de depositar
   direto aqui) — usa se quiser, os aportes de verdade continuam sendo feitos na aba Metas. */
function ModalSugestaoReceita({ receita, gruposOrcamento, metas, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const {
    porGrupo,
    grupoPoupanca, porMetaPoupanca,
    grupoDesejos, porMetaDesejo,
    grupoNecessidades, valorNecessidades, porMetaReserva, totalReservas,
  } = distribuicaoRecomendadaReceita(receita.valor, gruposOrcamento, metas, new Date());
  const semNenhumaSugestao = !porMetaPoupanca.length && !porMetaDesejo.length && !porMetaReserva.length;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">💡 Sugestão pra {brl(receita.valor)}</h3>
        <p className="text-xs text-stone-500 mb-4">Baseado no orçamento que você configurou em Preferências.</p>

        <div className="space-y-2 mb-4">
          {porGrupo.map(({ grupo, valorSugerido }) => (
            <div key={grupo.id} className="flex items-center justify-between text-sm">
              <span className="text-stone-600">{grupo.nome} <span className="text-stone-400 text-xs">({grupo.percentual}%)</span></span>
              <span className="font-mono2 font-semibold text-stone-800">{brl(valorSugerido)}</span>
            </div>
          ))}
        </div>

        {grupoPoupanca && porMetaPoupanca.length > 0 && (
          <div className="bg-emerald-50 rounded-xl p-3 mb-3">
            <div className="text-xs font-semibold text-emerald-700 mb-2">🐷 Dentro de "{grupoPoupanca.nome}" — poupança sem teto</div>
            <div className="space-y-1.5">
              {porMetaPoupanca.map(({ meta, valorSugerido, percentualDaReceita }) => (
                <div key={meta.id} className="flex items-center justify-between text-xs">
                  <span className="text-emerald-700">{meta.icone} {meta.nome}</span>
                  <span className="font-mono2 font-semibold text-emerald-800">{brl(valorSugerido)} <span className="text-emerald-500">({percentualDaReceita.toFixed(0)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {grupoDesejos && porMetaDesejo.length > 0 && (
          <div className="bg-blue-50 rounded-xl p-3 mb-3">
            <div className="text-xs font-semibold text-blue-700 mb-2">🎯 Dentro de "{grupoDesejos.nome}" — metas com alvo</div>
            <div className="space-y-1.5">
              {porMetaDesejo.map(({ meta, valorSugerido, percentualDaReceita }) => (
                <div key={meta.id} className="flex items-center justify-between text-xs">
                  <span className="text-blue-700">{meta.icone} {meta.nome}</span>
                  <span className="font-mono2 font-semibold text-blue-800">{brl(valorSugerido)} <span className="text-blue-400">({percentualDaReceita.toFixed(0)}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {porMetaReserva.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-3">
            <div className="text-xs font-semibold text-amber-800 mb-1">🧾 Reservas pra conta fixa (obrigações sazonais)</div>
            <p className="text-[10px] text-amber-700 mb-2">Cada uma mostra o próprio valor mensal necessário — não reparte a fatia de {grupoNecessidades ? `"${grupoNecessidades.nome}"` : "necessidades"}, que também cobre suas outras contas fixas.</p>
            <div className="space-y-1.5">
              {porMetaReserva.map(({ meta, valorSugerido, percentualDaReceita }) => (
                <div key={meta.id} className="flex items-center justify-between text-xs">
                  <span className="text-amber-800">{meta.icone} {meta.nome}</span>
                  <span className="font-mono2 font-semibold text-amber-900">{brl(valorSugerido)} <span className="text-amber-600">({percentualDaReceita.toFixed(0)}%)</span></span>
                </div>
              ))}
            </div>
            {grupoNecessidades && (
              <div className="text-[10px] text-amber-700 mt-2 pt-2 border-t border-amber-200">Sobra {brl(valorNecessidades - totalReservas)} de {brl(valorNecessidades)} da fatia de "{grupoNecessidades.nome}" pras suas outras contas fixas.</div>
            )}
          </div>
        )}

        {semNenhumaSugestao && (
          <p className="text-xs text-stone-400">Nenhuma meta com prazo ou poupança sem teto cadastrada ainda — sem isso não dá pra sugerir uma divisão.</p>
        )}

        <button onClick={onFechar} className="w-full py-2.5 mt-4 rounded-lg border border-stone-300 text-stone-600 font-semibold tap-target">Fechar</button>
      </div>
    </div>
  );
}

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

function TelaExtrato({ categorias, contas, lancamentos, documentos, onSalvarLancamento, onRemoverLancamento, lancamentosFixos, setLancamentosFixos, lembretes5Dias, limiar5Dias, onAdiar5Dias, onConfirmarLembrete, onDescartarLembrete, reflexoesMensais, onSalvarReflexao, metas, cartoes, gruposOrcamento, rendaManual, historicoAportes, financiamentos, onResolverPendente, onAnexarDocumento, onAnexarNotaColada, onVincularDocumentoExistente, onFotografarRecibo, onEditarNoMercado, onAbrirConfig }) {
  const [chaveMes, setChaveMes] = useState(chaveMesAtual());
  const [subVisao, setSubVisao] = useState("lista");
  const [modalLancamento, setModalLancamento] = useState(null); // null | {} (novo) | item (editar)
  const [tipoNovo, setTipoNovo] = useState("despesa");
  const [confirmar, setConfirmar] = useState(null);
  const [modalConciliacao, setModalConciliacao] = useState(null); // conta escolhida pra conciliar, ou null
  const [saldoExpandido, setSaldoExpandido] = useState(false);
  const [modalDetalhe, setModalDetalhe] = useState(null); // item sendo visualizado (antes de editar)
  const [diaSelecionado, setDiaSelecionado] = useState(null); // grupo de dia tocado, pro resumo
  const refListaExtrato = useRef(null); // pedido do usuário: a tela abre já no fim (mais recente), como um chat
  const [modalAvisos, setModalAvisos] = useState(false);
  const [sugestaoReceita, setSugestaoReceita] = useState(null);
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
  /* Pedido do usuário: a tela não deve só inverter a ordem dos dados — precisa abrir já mostrando
     o fim (mais recente), como um chat, exigindo rolar pra cima pra ver o histórico. Dispara ao
     trocar de mês, ao voltar pra aba Lista (o container é desmontado quando vai pra
     Resumo/Evolução e remontado do zero ao voltar, perdendo a posição de rolagem), e quando um
     lançamento novo aparece no mês atual. */
  useEffect(() => {
    if (subVisao === "lista" && refListaExtrato.current) {
      refListaExtrato.current.scrollTop = refListaExtrato.current.scrollHeight;
    }
  }, [chaveMes, subVisao, gruposPorDia.length]);
  const { entradas, saidas, saldoDoMes } = totaisDoMes(itensDoMes);
  const saldosPorConta = contas.filter((c) => c.ativa !== false).map((c) => ({ conta: c, saldo: calcularSaldoConta(c, lancamentos, chaveMesEhFutura(chaveMes) ? null : chaveMes) }));
  const saldoTotal = saldosPorConta.reduce((a, s) => a + s.saldo, 0);
  const lembretesVencidos = lembretes5Dias.filter((l) => new Date(l.data_lembrete) <= new Date());
  const pendentesCategorizacao = lancamentos.filter((l) => l.categoria_id == null && !l.previsto);
  const mesPassado = chaveMes < chaveMesAtual();
  const reflexaoDesseMes = reflexoesMensais[chaveMes];
  const totalAvisos = lembretesVencidos.length + pendentesCategorizacao.length + (mesPassado && !reflexaoDesseMes ? 1 : 0);

  function salvarLancamento(dados) {
    if (dados.previsto) return; // segurança, nunca deveria salvar um item previsto direto
    const eraNovo = Array.isArray(dados) ? false : !lancamentos.some((l) => l.id === dados.id);
    onSalvarLancamento(dados);
    setModalLancamento(null);
    /* Pedido do usuário: ao lançar uma receita nova, sugerir como dividi-la entre orçamento e
       metas. Só dispara pra receita realmente NOVA (não edição), e só se tiver grupo de
       orçamento configurado — sem isso não tem base nenhuma pra sugerir nada. */
    if (eraNovo && !Array.isArray(dados) && dados.tipo === "receita" && gruposOrcamento?.length) {
      setSugestaoReceita(dados);
    }
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
          <button onClick={() => setSubVisao("evolucao")} className={`tap-target text-sm font-semibold pb-2 border-b-2 -mb-px ${subVisao === "evolucao" ? "text-emerald-700 border-emerald-700" : "text-stone-400 border-transparent"}`}>Evolução</button>
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
      ) : subVisao === "evolucao" ? (
        <TelaEvolucaoFinancas chaveMes={chaveMes} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} categorias={categorias} contas={contas} rendaManual={rendaManual} historicoAportes={historicoAportes} />
      ) : (
        <>
          <div className="flex-1 relative">
            <div ref={refListaExtrato} className="absolute inset-0 overflow-y-auto px-4 pb-20">
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

            {mostrarMenuNovo && <div className="fixed inset-0 z-[5]" onClick={() => setMostrarMenuNovo(false)} />}
            <div className="absolute bottom-4 right-4 z-10">
              {mostrarMenuNovo && (
                <div className="absolute bottom-16 right-0 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
                  <button onClick={() => { setTipoNovo("despesa"); setModalLancamento({}); setMostrarMenuNovo(false); }} className="flex items-center gap-2 px-4 py-3 text-sm text-stone-700 tap-target w-full text-left whitespace-nowrap">✏️ Novo lançamento</button>
                  <button onClick={() => { setModalFoto(true); setMostrarMenuNovo(false); }} className="flex items-center gap-2 px-4 py-3 text-sm text-stone-700 tap-target w-full text-left border-t border-stone-100 whitespace-nowrap">📸 Fotografar recibo</button>
                </div>
              )}
              <button onClick={() => setMostrarMenuNovo((v) => !v)} aria-label="Novo lançamento" className="w-14 h-14 rounded-full bg-emerald-700 text-white text-3xl shadow-lg flex items-center justify-center tap-target">+</button>
            </div>
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

      {sugestaoReceita && (
        <ModalSugestaoReceita receita={sugestaoReceita} gruposOrcamento={gruposOrcamento} metas={metas} onFechar={() => setSugestaoReceita(null)} />
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
          lancamentos={lancamentos}
          financiamentos={financiamentos}
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
          onAnexarNotaColada={onAnexarNotaColada}
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

function TelaConfigFinancas({ categorias, setCategorias, contas, setContas, lancamentos, lancamentosFixos, limiar5Dias, setLimiar5Dias, onImportarExtrato, onConciliar, onCorrigirSaldoInicial, onSalvarArquivoExtrato, gruposOrcamento, setGruposOrcamento, rendaManual, setRendaManual, metas, cartoes, pin, onSalvarPin, onRemoverPin }) {
  const [subaba, setSubaba] = useState("contas");
  const [formConta, setFormConta] = useState(null);
  const [formCategoria, setFormCategoria] = useState(null);
  const [formGrupo, setFormGrupo] = useState(null);
  const [modalRenda, setModalRenda] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [limiarTexto, setLimiarTexto] = useState(formatarValorCampo(limiar5Dias));
  const [modalImportar, setModalImportar] = useState(null); // conta escolhida pra importar
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [modalPin, setModalPin] = useState(null); // null | "criar" | "trocar" | "remover"

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
              <div key={c.id} className={`bg-white border rounded-xl p-3 ${c.ativa === false ? "border-stone-100 opacity-60" : "border-stone-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 tap-target">
                    <input type="checkbox" checked={c.ativa !== false} onChange={(e) => setContas((cs) => cs.map((x) => (x.id === c.id ? { ...x, ativa: e.target.checked } : x)))} aria-label={`Conta ${c.nome} ativa`} className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-semibold text-stone-800">{c.nome}{c.ativa === false && <span className="text-xs text-stone-400 font-normal ml-1">(inativa)</span>}</div>
                      <div className="text-xs text-stone-400 font-mono2">Saldo atual: {brl(calcularSaldoConta(c, lancamentos, null))}</div>
                    </div>
                  </label>
                  <div className="flex gap-3 shrink-0"><button onClick={() => setFormConta(c)} aria-label={`Editar ${c.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerConta(c)} aria-label={`Excluir ${c.nome}`} className="text-red-400 tap-target">🗑️</button></div>
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
            <div className="font-semibold text-stone-700 mb-1">🔒 Bloqueio com PIN</div>
            <p className="text-xs text-stone-500 mb-3">Pede um PIN toda vez que você abrir o Finanças — conteúdo pessoal, fica só pra você ver.</p>
            {pin ? (
              <div className="flex gap-2">
                <button onClick={() => setModalPin("trocar")} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-sm font-semibold tap-target">Trocar PIN</button>
                <button onClick={() => setModalPin("remover")} className="flex-1 py-2 rounded-lg border border-red-300 text-red-500 text-sm font-semibold tap-target">Remover</button>
              </div>
            ) : (
              <button onClick={() => setModalPin("criar")} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-sm tap-target">Ativar PIN</button>
            )}
          </div>

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
        <ModalImportarExtrato contaFixa={modalImportar} contas={contas} lancamentosExistentes={lancamentos} categorias={categorias} onImportar={onImportarExtrato} onConciliar={onConciliar} onCorrigirSaldoInicial={onCorrigirSaldoInicial} onSalvarArquivoExtrato={onSalvarArquivoExtrato} onFechar={() => setModalImportar(null)} />
      )}
      {formGrupo !== null && <ModalGrupoOrcamento grupo={formGrupo.id ? formGrupo : null} onSalvar={salvarGrupo} onFechar={() => setFormGrupo(null)} />}
      {modalRenda && <ModalRendaMensal rendaManual={rendaManual} rendaAutomatica={rendaAutomatica} onSalvar={setRendaManual} onFechar={() => setModalRenda(false)} />}
      {modalPin && (
        <ModalDefinirPin
          modo={modalPin} pinAtual={pin}
          onSalvar={(novoPin) => { onSalvarPin(novoPin); setModalPin(null); }}
          onRemover={() => { onRemoverPin(); setModalPin(null); }}
          onFechar={() => setModalPin(null)}
        />
      )}
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
/* ---------- ModalFinanciamento — criar/editar um financiamento (ex: casa própria) ---------- */
function ModalFinanciamento({ financiamento, categorias, contas, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(financiamento?.nome || "");
  const [icone, setIcone] = useState(financiamento?.icone || "🏠");
  const [valorTotalTexto, setValorTotalTexto] = useState(financiamento?.valor_total != null ? formatarValorCampo(financiamento.valor_total) : "");
  const [saldoDevedorTexto, setSaldoDevedorTexto] = useState(financiamento?.saldo_devedor != null ? formatarValorCampo(financiamento.saldo_devedor) : "");
  const [valorParcelaTexto, setValorParcelaTexto] = useState(financiamento?.valor_parcela != null ? formatarValorCampo(financiamento.valor_parcela) : "");
  const [parcelasTotaisTexto, setParcelasTotaisTexto] = useState(financiamento?.parcelas_totais ? String(financiamento.parcelas_totais) : "");
  const [parcelasPagasTexto, setParcelasPagasTexto] = useState(financiamento?.parcelas_pagas != null ? String(financiamento.parcelas_pagas) : "0");
  const [dataInicio, setDataInicio] = useState(financiamento?.data_inicio ? financiamento.data_inicio.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [diaVencimentoTexto, setDiaVencimentoTexto] = useState(financiamento?.dia_vencimento ? String(financiamento.dia_vencimento) : "10");
  const [categoriaId, setCategoriaId] = useState(financiamento?.categoria_id || categorias.find((c) => c.tipo === "despesa")?.id || null);
  const [contaId, setContaId] = useState(financiamento?.conta_id || contas[0]?.id || null);
  const [taxaJurosTexto, setTaxaJurosTexto] = useState(financiamento?.taxa_juros_mensal != null ? String(financiamento.taxa_juros_mensal).replace(".", ",") : "");
  const [sistemaAmortizacao, setSistemaAmortizacao] = useState(financiamento?.sistema_amortizacao || "sac");

  const categoriasDespesa = categorias.filter((c) => c.tipo === "despesa");

  function salvar() {
    if (!nome.trim()) { alert('Dá um nome (ex: "Financiamento da casa").'); return; }
    const valorTotal = parseValorFinanceiro(valorTotalTexto);
    if (valorTotal == null || valorTotal <= 0) { alert("Preenche o valor total financiado."); return; }
    const saldoDevedor = parseValorFinanceiro(saldoDevedorTexto);
    if (saldoDevedor == null || saldoDevedor < 0) { alert("Preenche o saldo devedor atual — o que ainda falta pagar, olha no extrato do banco."); return; }
    const valorParcela = parseValorFinanceiro(valorParcelaTexto);
    if (valorParcela == null || valorParcela <= 0) { alert("Preenche o valor da parcela."); return; }
    const parcelasTotais = numDe(parcelasTotaisTexto);
    if (!parcelasTotais || parcelasTotais <= 0) { alert("Preenche quantas parcelas tem o contrato inteiro."); return; }
    onSalvar({
      id: financiamento?.id || uid(), nome: nome.trim(), icone: icone.trim() || "🏠",
      valor_total: valorTotal, saldo_devedor: saldoDevedor, valor_parcela: valorParcela,
      parcelas_totais: parcelasTotais, parcelas_pagas: numDe(parcelasPagasTexto) || 0,
      data_inicio: new Date(dataInicio).toISOString(), dia_vencimento: numDe(diaVencimentoTexto) || 10,
      categoria_id: categoriaId, conta_id: contaId,
      taxa_juros_mensal: taxaJurosTexto.trim() ? parseFloat(taxaJurosTexto.replace(",", ".")) : null,
      sistema_amortizacao: taxaJurosTexto.trim() ? sistemaAmortizacao : null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">{financiamento ? "Editar financiamento" : "Novo financiamento"}</h3>

        <div className="flex gap-2 mb-3">
          <input value={icone} onChange={(e) => setIcone(e.target.value)} className="w-16 text-center text-xl border border-stone-300 rounded-xl p-2.5" aria-label="Ícone" maxLength={2} />
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Financiamento da casa..." className="flex-1 border border-stone-300 rounded-xl p-2.5" aria-label="Nome do financiamento" />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor total financiado</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-1">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorTotalTexto} onChange={(e) => setValorTotalTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor total financiado" />
        </div>
        <p className="text-xs text-stone-400 mb-3">O valor à vista/sem juros (ex: preço do imóvel, ou preço à vista da TV) — não a soma de todas as parcelas, que costuma ser maior por causa dos juros.</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Saldo devedor atual</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-1">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={saldoDevedorTexto} onChange={(e) => setSaldoDevedorTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Saldo devedor atual" />
        </div>
        <p className="text-xs text-stone-400 mb-3">Olha no extrato do banco — é o que ainda falta pagar, não o valor original do contrato.</p>

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor da parcela</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorParcelaTexto} onChange={(e) => setValorParcelaTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor da parcela" />
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Parcelas no total</label>
            <input value={parcelasTotaisTexto} onChange={(e) => setParcelasTotaisTexto(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="ex: 360" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1" aria-label="Parcelas totais" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Já pagas</label>
            <input value={parcelasPagasTexto} onChange={(e) => setParcelasPagasTexto(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1" aria-label="Parcelas pagas" />
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Início do contrato</label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1" aria-label="Data de início" />
          </div>
          <div className="w-24">
            <label className="text-xs font-semibold text-stone-500 uppercase">Dia venc.</label>
            <input value={diaVencimentoTexto} onChange={(e) => setDiaVencimentoTexto(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-full border border-stone-300 rounded-xl p-2.5 mt-1" aria-label="Dia de vencimento" />
          </div>
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Taxa de juros mensal (opcional)</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-1">
          <input value={taxaJurosTexto} onChange={(e) => setTaxaJurosTexto(e.target.value.replace(/[^0-9,]/g, ""))} placeholder="ex: 0,8" inputMode="decimal" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Taxa de juros mensal" />
          <span className="text-stone-400 font-mono2">% ao mês</span>
        </div>
        <button
          onClick={() => {
            const total = parseValorFinanceiro(valorTotalTexto), parcelas = numDe(parcelasTotaisTexto), parcela = parseValorFinanceiro(valorParcelaTexto);
            if (!total || !parcelas || !parcela) { alert('Preenche "Valor total financiado", "Parcelas no total" e "Valor da parcela" primeiro — a taxa é calculada a partir desses três.'); return; }
            const taxa = taxaJurosImplicita(total, parcelas, parcela);
            setTaxaJurosTexto(taxa > 0 ? (taxa * 100).toFixed(3).replace(".", ",") : "0");
          }}
          className="text-xs text-emerald-700 underline mb-1 tap-target"
        >🧮 Não sabe a taxa? Calcular a partir do valor total, parcelas e valor da parcela</button>
        <p className="text-xs text-stone-400 mb-3">Preenchendo a taxa, o app sugere automaticamente juros/amortização de cada parcela (SAC ou Price) ao registrar pagamento — sempre editável, não substitui o boleto real. Deixa em branco se não souber, continua funcionando igual antes.</p>

        {taxaJurosTexto.trim() && (
          <>
            <label className="text-xs font-semibold text-stone-500 uppercase">Sistema de amortização</label>
            <div className="flex gap-2 mb-3 mt-1">
              <Chip selected={sistemaAmortizacao === "sac"} onClick={() => setSistemaAmortizacao("sac")}>SAC</Chip>
              <Chip selected={sistemaAmortizacao === "price"} onClick={() => setSistemaAmortizacao("price")}>Price</Chip>
            </div>
          </>
        )}

        <label className="text-xs font-semibold text-stone-500 uppercase">Categoria</label>
        <select value={categoriaId || ""} onChange={(e) => setCategoriaId(e.target.value || null)} className="w-full border border-stone-300 rounded-xl p-2.5 mt-1 mb-3" aria-label="Categoria">
          <option value="">Escolha uma categoria</option>
          {categoriasDespesa.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
        </select>

        {contas.length > 1 && (
          <>
            <label className="text-xs font-semibold text-stone-500 uppercase">Conta</label>
            <div className="flex gap-2 flex-wrap mt-1 mb-3">
              {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
            </div>
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
/* Registrar um pagamento — diferente de meta (que só soma), aqui pede também "quanto abateu do
   saldo devedor" separado do valor pago, porque parcela de financiamento tem juros embutidos
   (o valor pago não é igual ao tanto que a dívida efetivamente diminuiu). Por padrão os dois
   campos começam iguais (simplificação honesta pra quem não sabe separar), editável pra quem
   sabe o valor exato do boleto. */
function ModalPagamentoFinanciamento({ financiamento, contas, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const sugestao = sugestaoPagamentoFinanciamento(financiamento);
  const [valorPagoTexto, setValorPagoTexto] = useState(formatarValorCampo(sugestao ? sugestao.parcela : financiamento.valor_parcela));
  const [valorAmortizadoTexto, setValorAmortizadoTexto] = useState(formatarValorCampo(sugestao ? sugestao.amortizacao : financiamento.valor_parcela));
  const [registrarComoDespesa, setRegistrarComoDespesa] = useState(true);
  const [contaId, setContaId] = useState(financiamento.conta_id || contas[0]?.id || null);

  function salvar() {
    const valorPago = parseValorFinanceiro(valorPagoTexto);
    if (valorPago == null || valorPago <= 0) { alert("Preenche o valor pago."); return; }
    const valorAmortizado = parseValorFinanceiro(valorAmortizadoTexto);
    if (valorAmortizado == null || valorAmortizado < 0) { alert("Preenche quanto abateu do saldo devedor — pode ser igual ao valor pago, se não souber separar dos juros."); return; }
    onSalvar({ valorPago, valorAmortizado, registrarComoDespesa: registrarComoDespesa && !!contaId, contaId });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">{financiamento.icone} Registrar pagamento</h3>
        <p className="text-xs text-stone-500 mb-3">"{financiamento.nome}" — saldo devedor atual: {brl(financiamento.saldo_devedor)}</p>

        {sugestao && (
          <div className="bg-blue-50 rounded-lg p-2.5 mb-3 text-xs text-blue-700">
            💡 Sugestão calculada ({financiamento.sistema_amortizacao === "price" ? "Price" : "SAC"}, {financiamento.taxa_juros_mensal}% a.m.): juros {brl(sugestao.juros)}, amortização {brl(sugestao.amortizacao)}. Confere com o boleto e ajusta se precisar.
          </div>
        )}

        <label className="text-xs font-semibold text-stone-500 uppercase">Valor pago</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-3">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorPagoTexto} onChange={(e) => setValorPagoTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor pago" autoFocus />
        </div>

        <label className="text-xs font-semibold text-stone-500 uppercase">Quanto abateu do saldo devedor</label>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1 mb-1">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={valorAmortizadoTexto} onChange={(e) => setValorAmortizadoTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor amortizado" />
        </div>
        <p className="text-xs text-stone-400 mb-3">{sugestao ? "Já veio calculado acima — ajusta se o boleto mostrar diferente." : "Por padrão igual ao valor pago. Se seu boleto separa juros de amortização e você sabe o valor exato, ajusta aqui."}</p>

        {contas.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-stone-600 mb-3 tap-target">
            <input type="checkbox" checked={registrarComoDespesa} onChange={(e) => setRegistrarComoDespesa(e.target.checked)} className="w-5 h-5" />
            Também registrar como despesa (esse dinheiro sai da conta)
          </label>
        )}
        {registrarComoDespesa && contas.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Registrar</button>
        </div>
      </div>
    </div>
  );
}
/* Atualizar o saldo devedor direto, sem passar por "registrar pagamento" — útil pra bater com o
   extrato do banco de vez em quando, sem precisar reconstruir todo o histórico de pagamentos. */
function ModalAtualizarSaldoDevedor({ financiamento, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [saldoTexto, setSaldoTexto] = useState(formatarValorCampo(financiamento.saldo_devedor));
  function salvar() {
    const saldo = parseValorFinanceiro(saldoTexto);
    if (saldo == null || saldo < 0) { alert("Preenche o saldo devedor certo."); return; }
    onSalvar(saldo);
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">Atualizar saldo devedor</h3>
        <p className="text-xs text-stone-500 mb-3">"{financiamento.nome}" — bate com o extrato do banco, sem afetar o histórico de pagamentos.</p>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mb-4">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={saldoTexto} onChange={(e) => setSaldoTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Novo saldo devedor" autoFocus />
        </div>
        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Atualizar</button>
        </div>
      </div>
    </div>
  );
}

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
            {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
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

function TelaMetas({ metas, setMetas, contas, historicoAportes, onRegistrarAporte, onAporteComoDespesa, categorias, financiamentos, setFinanciamentos, historicoPagamentosFinanciamento, onRegistrarPagamentoFinanciamento, onPagamentoFinanciamentoComoDespesa }) {
  const [subVisaoMetas, setSubVisaoMetas] = useState("metas"); // "metas" | "financiamentos"
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

  const [formFinanciamento, setFormFinanciamento] = useState(null);
  const [modalPagamentoFinanciamento, setModalPagamentoFinanciamento] = useState(null);
  const [modalSaldoDevedor, setModalSaldoDevedor] = useState(null);

  function salvarFinanciamento(dados) { setFinanciamentos((fs) => upsertBy(fs, [dados])); setFormFinanciamento(null); }
  function removerFinanciamento(f) {
    setConfirmar({
      titulo: "Excluir financiamento", severo: false, textoConfirmar: "Excluir",
      mensagem: `Excluir "${f.nome}"? Só o registro de acompanhamento some — não afeta o financiamento de verdade, é só esse app parando de rastrear.`,
      acao: () => { setFinanciamentos((fs) => fs.filter((x) => x.id !== f.id)); setConfirmar(null); },
    });
  }
  function aplicarPagamentoFinanciamento(f, { valorPago, valorAmortizado, registrarComoDespesa, contaId }) {
    setFinanciamentos((fs) => fs.map((x) => (x.id === f.id ? { ...x, saldo_devedor: Math.max(0, x.saldo_devedor - valorAmortizado), parcelas_pagas: x.parcelas_pagas + 1 } : x)));
    onRegistrarPagamentoFinanciamento({ id: uid(), financiamento_id: f.id, valor_pago: valorPago, valor_amortizado: valorAmortizado, data: new Date().toISOString() });
    if (registrarComoDespesa && contaId) {
      onPagamentoFinanciamentoComoDespesa({
        id: uid(), tipo: "despesa", descricao: "Parcela: " + f.nome, categoria_id: f.categoria_id,
        valor: valorPago, data: new Date().toISOString(), fixa: false, recorrente: false, dia_recorrencia: null,
        forma_pagamento: null, conta_id: contaId, origem_fixo_id: null, financiamento_id: f.id,
      });
    }
    setModalPagamentoFinanciamento(null);
  }
  function atualizarSaldoDevedor(f, novoSaldo) {
    setFinanciamentos((fs) => fs.map((x) => (x.id === f.id ? { ...x, saldo_devedor: novoSaldo } : x)));
    setModalSaldoDevedor(null);
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex gap-4 mb-4 border-b border-stone-200">
        <button onClick={() => setSubVisaoMetas("metas")} className={`tap-target text-sm font-semibold pb-2 border-b-2 -mb-px ${subVisaoMetas === "metas" ? "text-emerald-700 border-emerald-700" : "text-stone-400 border-transparent"}`}>🎯 Metas</button>
        <button onClick={() => setSubVisaoMetas("financiamentos")} className={`tap-target text-sm font-semibold pb-2 border-b-2 -mb-px ${subVisaoMetas === "financiamentos" ? "text-emerald-700 border-emerald-700" : "text-stone-400 border-transparent"}`}>🏠 Financiamentos</button>
      </div>

      {subVisaoMetas === "financiamentos" ? (
        <>
          <button onClick={() => setFormFinanciamento({})} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Novo financiamento</button>

          {!financiamentos.length && <p className="text-sm text-stone-400 text-center py-10">Nenhum financiamento cadastrado. Financiamento da casa, carro, o que for pago em parcelas de longo prazo com saldo devedor entra aqui.</p>}

          <div className="space-y-3">
            {financiamentos.map((f) => {
              const { pago, pct } = progressoFinanciamento(f);
              const { dataContrato, parcelasRestantes } = previsaoQuitacaoFinanciamento(f);
              const quitado = f.saldo_devedor <= 0;
              return (
                <div key={f.id} className="bg-white border border-stone-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{f.icone}</span>
                      <div>
                        <div className="font-semibold text-stone-800">{f.nome}</div>
                        <div className="text-xs text-stone-400">{quitado ? "Quitado 🎉" : `${parcelasRestantes} parcela${parcelasRestantes === 1 ? "" : "s"} restante${parcelasRestantes === 1 ? "" : "s"}`}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setFormFinanciamento(f)} className="text-stone-400 tap-target">✏️</button>
                      <button onClick={() => removerFinanciamento(f)} className="text-red-400 tap-target">🗑️</button>
                    </div>
                  </div>

                  {quitado ? (
                    <div className="bg-emerald-50 text-emerald-700 font-semibold text-sm rounded-lg p-2.5 text-center mb-3">✓ Quitado! {brl(f.valor_total)} pagos.</div>
                  ) : (
                    <>
                      <div className="w-full bg-stone-100 rounded-full h-2.5 mb-1.5">
                        <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: pct + "%" }} />
                      </div>
                      <div className="text-xs text-stone-500 font-mono2 mb-1">{brl(pago)} pagos de {brl(f.valor_total)} ({Math.round(pct)}%)</div>
                      <div className="text-xs text-stone-500 mb-3">Saldo devedor: <b className="font-mono2 text-stone-700">{brl(f.saldo_devedor)}</b> · Previsão de quitação (contrato): {dataContrato.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
                    </>
                  )}

                  <div className="mb-3">
                    <div className="text-[10px] text-stone-400 uppercase mb-1">Amortizado por mês</div>
                    <GraficoBarraSimples dados={pagamentosPorMes(historicoPagamentosFinanciamento, f.id, 4)} />
                  </div>

                  {!quitado && (
                    <div className="flex gap-2">
                      <button onClick={() => setModalPagamentoFinanciamento(f)} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold tap-target">+ Registrar pagamento</button>
                      <button onClick={() => setModalSaldoDevedor(f)} className="py-2 px-3 rounded-lg border border-stone-300 text-stone-600 text-sm font-semibold tap-target">Ajustar saldo</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {formFinanciamento !== null && <ModalFinanciamento financiamento={formFinanciamento.id ? formFinanciamento : null} categorias={categorias} contas={contas} onSalvar={salvarFinanciamento} onFechar={() => setFormFinanciamento(null)} />}
          {modalPagamentoFinanciamento && <ModalPagamentoFinanciamento financiamento={modalPagamentoFinanciamento} contas={contas} onSalvar={(dados) => aplicarPagamentoFinanciamento(modalPagamentoFinanciamento, dados)} onFechar={() => setModalPagamentoFinanciamento(null)} />}
          {modalSaldoDevedor && <ModalAtualizarSaldoDevedor financiamento={modalSaldoDevedor} onSalvar={(novoSaldo) => atualizarSaldoDevedor(modalSaldoDevedor, novoSaldo)} onFechar={() => setModalSaldoDevedor(null)} />}
          {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
        </>
      ) : (
      <>
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
                const aportadoEsseMes = aportesPorMes(historicoAportes, m.id, 1)[0]?.total || 0;
                const pctMensal = sugestao.valorMensal > 0 ? Math.min(100, (aportadoEsseMes / sugestao.valorMensal) * 100) : 0;
                const bateuMensal = aportadoEsseMes >= sugestao.valorMensal;
                return (
                  <div className="bg-blue-50 rounded-lg p-2.5 mb-3 text-xs text-blue-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">🎯 Meta mensal: {brl(sugestao.valorMensal)}</span>
                      <span className="text-blue-500">{sugestao.mesesRestantes} {sugestao.mesesRestantes === 1 ? "mês" : "meses"} restantes</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-1.5 mb-1">
                      <div className={`h-1.5 rounded-full ${bateuMensal ? "bg-emerald-600" : "bg-blue-600"}`} style={{ width: pctMensal + "%" }} />
                    </div>
                    <div className="mb-1.5">{bateuMensal ? "✓ Meta desse mês batida" : `${brl(aportadoEsseMes)} de ${brl(sugestao.valorMensal)} esse mês`}</div>
                    {!bateuMensal && (
                      <button onClick={() => depositarRecomendado(m, sugestao.valorMensal - aportadoEsseMes)} className="w-full py-2 rounded-lg bg-blue-600 text-white font-semibold tap-target">Depositar {brl(sugestao.valorMensal - aportadoEsseMes)} agora</button>
                    )}
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
      </>
      )}
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
  const [colandoTexto, setColandoTexto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  /* Etapa 6 do bloco de reconstrução de NF: mesmo caminho que já existe no Mercado (colar o
     texto da consulta oficial), reaproveitando o parser de lá (parsearTextoConsultaNFCe) —
     sem etapa de conferência contra catálogo aqui, porque isso é conceito só do Mercado (bater
     item com produto cadastrado). Aqui é só: extrai os dados, monta o recibo em HTML, anexa. */
  function processarTextoColado() {
    try {
      const nfeLida = parsearTextoConsultaNFCe(textoColado);
      const arquivoBase64 = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(textoColado)));
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, dataEmissao: nfeLida.data_emissao,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do texto colado da consulta oficial — não é o documento oficial.",
      });
      setArquivo({ base64: arquivoBase64, mimeType: "text/plain", nomeArquivo: "nfce-consulta.txt", htmlPreconstruido: htmlReconstruido });
      setValorEncontrado(nfeLida.valor_total);
      setErro(null);
      setColandoTexto(false);
      setTextoColado("");
    } catch (err) { setErro(err.message); }
  }
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
        const resultado = await Tesseract.recognize(base64Comprimido, "por");
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

        {!arquivo && !processando && !colandoTexto && (
          <>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
              📎 Escolher PDF ou foto
              <input type="file" accept=".pdf,image/*" onChange={aoEscolherArquivo} className="hidden" />
            </label>
            {tipoDocumento === "saida" && (
              <button onClick={() => setColandoTexto(true)} className="w-full text-center text-xs text-stone-500 underline mt-3 tap-target">
                Ou colar o texto da consulta oficial da nota (NFC-e)
              </button>
            )}
          </>
        )}
        {colandoTexto && (
          <div>
            <p className="text-xs text-stone-500 mb-2">Abre o link da consulta oficial (fazenda.rj.gov.br/nfce/consulta ou equivalente do seu estado), seleciona tudo, copia, e cola aqui.</p>
            <textarea value={textoColado} onChange={(e) => setTextoColado(e.target.value)} rows={6}
              className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-mono2" placeholder="Cole aqui o texto da página..." aria-label="Texto colado da consulta oficial" />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setColandoTexto(false); setTextoColado(""); }} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
              <button onClick={processarTextoColado} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Processar</button>
            </div>
          </div>
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
              <span>{arquivo.mimeType === "application/pdf" ? "📄" : arquivo.mimeType === "text/plain" ? "🧾" : "📷"}</span>
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
                  {contas.filter((c) => c.ativa !== false || c.id === contaId).map((c) => <Chip key={c.id} selected={contaId === c.id} onClick={() => setContaId(c.id)}>{c.nome}</Chip>)}
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

/* Pedido do usuário: da tela de Documentos, vincular um documento já anexado (sem lançamento
   ainda) a um lançamento — existente ou novo. Reaproveita o mesmo mecanismo que ModalLancamento
   já usa pro caminho inverso ("escolher de documento existente"): onVincularDocumentoExistente
   só atualiza o documento_id, sem duplicar nada. */
function ModalVincularDocumento({ documento, lancamentos, onEscolherExistente, onCriarNovo, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const tipoLancamento = documento.tipo === "entrada" ? "receita" : "despesa";
  const candidatos = lancamentos
    .filter((l) => l.tipo === tipoLancamento && !l.documento_id)
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 20);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">🔗 Vincular documento</h3>
        <p className="text-xs text-stone-500 mb-3 truncate">"{documento.nome_arquivo}"</p>

        {candidatos.length > 0 ? (
          <div className="space-y-2 mb-3">
            {candidatos.map((l) => (
              <button key={l.id} onClick={() => onEscolherExistente(l.id)} className="w-full flex items-center justify-between bg-stone-50 border border-stone-200 rounded-lg p-3 text-left tap-target">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-800 truncate">{l.descricao}</div>
                  <div className="text-xs text-stone-400">{dataCurta(l.data)}</div>
                </div>
                <span className="font-mono2 font-semibold text-stone-700 shrink-0 ml-2">{brl(l.valor)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-400 mb-3">Nenhum lançamento de {tipoLancamento === "receita" ? "entrada" : "saída"} sem documento pra vincular ainda.</p>
        )}

        <button onClick={onCriarNovo} className="w-full py-2.5 rounded-lg border border-emerald-700 text-emerald-700 font-semibold tap-target">+ Criar lançamento novo com esse documento</button>
        <button onClick={onFechar} className="w-full py-2.5 mt-3 text-stone-500 font-semibold tap-target">Cancelar</button>
      </div>
    </div>
  );
}
/* Pedido do usuário: pastas por tipo de documento na aba Docs, mostrando o que já está guardado
   (não só notas fiscais — extrato e contracheque agora também viram documento de verdade). */
const CATEGORIAS_DOCUMENTO = [
  { id: "nota_fiscal", nome: "Notas fiscais", icone: "🧾" },
  { id: "extrato", nome: "Extratos", icone: "🏦" },
  { id: "contracheque", nome: "Contracheques", icone: "💰" },
  { id: "recibo", nome: "Recibos", icone: "🧷" },
  { id: "outro", nome: "Outros", icone: "📎" },
];
function categoriaDocumentoDe(doc) {
  return CATEGORIAS_DOCUMENTO.find((c) => c.id === (doc.categoria_documento || "outro")) || CATEGORIAS_DOCUMENTO[CATEGORIAS_DOCUMENTO.length - 1];
}
function ModalRenomearDocumento({ documento, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nome, setNome] = useState(documento.nome_customizado || documento.nome_arquivo || "");
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-[80]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">✏️ Renomear documento</h3>
        <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2.5 mb-4" aria-label="Nome do documento" autoFocus />
        <div className="flex gap-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={() => { onSalvar(nome.trim() || documento.nome_arquivo); onFechar(); }} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}
function TelaDocumentos({ documentos, setDocumentos, lancamentos, onSalvarLancamento, categorias, contas, arquivoCompartilhado, onUsarArquivoCompartilhado, onImportarExtrato, onConciliar, onCorrigirSaldoInicial, onSalvarArquivoExtrato, onVincularDocumentoExistente }) {
  const [tipoDocumento, setTipoDocumento] = useState("todos");
  const [pastaSelecionada, setPastaSelecionada] = useState(null); // null = mostra as pastas; senão, o id da categoria aberta
  const [modalRenomear, setModalRenomear] = useState(null);
  const [modalUpload, setModalUpload] = useState(false);
  const [arquivoParaModal, setArquivoParaModal] = useState(null); // File vindo do compartilhamento, pra pular a etapa de escolher arquivo
  const [modalContracheque, setModalContracheque] = useState(false);
  const [modalImportarExtrato, setModalImportarExtrato] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [modalVincular, setModalVincular] = useState(null); // documento sendo vinculado
  const [criandoLancamentoPara, setCriandoLancamentoPara] = useState(null); // documento -> abre ModalLancamento direto

  const documentosDoTipo = (tipoDocumento === "todos" ? documentos : documentos.filter((d) => d.tipo === tipoDocumento))
    .filter((d) => !pastaSelecionada || (d.categoria_documento || "outro") === pastaSelecionada)
    .sort((a, b) => new Date(b.data_upload) - new Date(a.data_upload));
  const tamanhoTotalKB = documentos.reduce((acc, d) => acc + tamanhoAproximadoKB(d.arquivo_base64), 0);
  const espacoApertado = tamanhoTotalKB > 3000; // aviso a partir de ~3MB guardado em documentos
  const tipoParaNovoUpload = tipoDocumento === "todos" ? "saida" : tipoDocumento; // "todos" é só filtro de visualização, nunca o tipo real de um documento

  function aoSalvarUpload({ arquivo, lancamentoId, criarNovo, dadosLancamento, semVincular, ajustarValorPara, marcarDivergente }) {
    const documentoId = uid();
    let idFinal = lancamentoId;
    let valorParaHtml = null, descricaoParaHtml = null;
    if (semVincular) {
      idFinal = null;
    } else if (criarNovo) {
      idFinal = dadosLancamento.id;
      valorParaHtml = dadosLancamento.valor;
      descricaoParaHtml = dadosLancamento.descricao;
      onSalvarLancamento({ ...dadosLancamento, documento_id: documentoId });
    } else {
      // marca o lançamento existente como tendo documento vinculado
      const lancamentoAlvo = lancamentos.find((l) => l.id === lancamentoId);
      if (lancamentoAlvo) {
        valorParaHtml = ajustarValorPara != null ? ajustarValorPara : lancamentoAlvo.valor;
        descricaoParaHtml = lancamentoAlvo.descricao;
        const atualizado = { ...lancamentoAlvo, documento_id: documentoId };
        if (ajustarValorPara != null) atualizado.valor = ajustarValorPara;
        if (marcarDivergente) atualizado.valor_divergente = true;
        onSalvarLancamento(atualizado);
      }
    }
    /* Só monta a reconstrução aqui quando ainda não veio pronta — o texto colado (Etapa 6) já
       traz a própria versão itemizada montada no momento do parse, não precisa refazer genérico. */
    const htmlReconstruido = arquivo.htmlPreconstruido || (valorParaHtml != null ? montarHtmlRecibo({
      nomeEmit: descricaoParaHtml || "Documento",
      valorTotal: valorParaHtml,
      avisoOrigem: arquivo.mimeType === "application/pdf"
        ? "Reconstruído a partir do PDF anexado — não é o documento oficial."
        : "Lido por foto (OCR) — só o total, sem itens.",
    }) : null);
    setDocumentos((ds) => [...ds, {
      id: documentoId, tipo: tipoParaNovoUpload, categoria_documento: arquivo.mimeType === "text/plain" ? "nota_fiscal" : "outro", nome_arquivo: arquivo.nomeArquivo, arquivo_base64: arquivo.base64,
      mime_type: arquivo.mimeType, html_reconstruido: htmlReconstruido, data_upload: new Date().toISOString(), lancamento_id: idFinal,
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
      id: documentoId, tipo: "entrada", categoria_documento: "contracheque", nome_arquivo: documento.nome_arquivo, arquivo_base64: documento.arquivo_base64,
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
        <div className="flex gap-2">
          <button onClick={() => setModalImportarExtrato(true)} className="flex-1 border border-emerald-700 text-emerald-700 font-semibold py-2.5 rounded-xl tap-target">📥 Anexar extrato</button>
          <button onClick={() => setModalContracheque(true)} className="flex-1 border border-emerald-700 text-emerald-700 font-semibold py-2.5 rounded-xl tap-target">📄 Anexar contracheque</button>
        </div>
      </div>

      {!pastaSelecionada ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIAS_DOCUMENTO.map((cat) => {
              const qtd = documentos.filter((d) => (d.categoria_documento || "outro") === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setPastaSelecionada(cat.id)} className="bg-white border border-stone-200 rounded-xl p-4 text-left tap-target">
                  <div className="text-3xl mb-2">{cat.icone}</div>
                  <div className="font-semibold text-stone-800">{cat.nome}</div>
                  <div className="text-xs text-stone-400">{qtd} documento{qtd === 1 ? "" : "s"}</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <>
      <button onClick={() => setPastaSelecionada(null)} className="text-sm text-emerald-700 font-semibold mb-2 px-4 tap-target text-left">← Todas as pastas</button>
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {!documentosDoTipo.length && (
          <p className="text-sm text-stone-400 text-center py-10">
            Nenhum documento {tipoDocumento === "todos" ? "" : tipoDocumento === "entrada" ? "de entrada " : "de saída "}nessa pasta ainda.
          </p>
        )}
        {documentosDoTipo.map((doc) => {
          const lancamentoVinculado = by(lancamentos, doc.lancamento_id);
          return (
            <div key={doc.id} className="bg-white border border-stone-200 rounded-xl p-3">
              <button onClick={() => abrirArquivo(doc)} className="w-full flex items-center gap-2.5 min-w-0 text-left tap-target mb-2">
                <span className="text-xl shrink-0">{doc.mime_type === "application/pdf" ? "📄" : doc.mime_type === "text/plain" ? "🧾" : "📷"}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-stone-800 truncate">{doc.nome_customizado || doc.nome_arquivo}</div>
                  <div className="text-xs text-stone-400 truncate">
                    {lancamentoVinculado
                      ? `Vinculado a: ${lancamentoVinculado.descricao} · ${brl(lancamentoVinculado.valor)}`
                      : "Sem lançamento vinculado"}
                  </div>
                  <div className="text-[10px] text-stone-300">Anexado em {dataCurta(doc.data_upload)}</div>
                </div>
                <span className="text-[10px] text-stone-400 shrink-0 uppercase">{doc.tipo === "entrada" ? "📥" : "📤"}</span>
              </button>
              <div className="flex gap-3 pt-2 border-t border-stone-100 text-xs flex-wrap">
                <button onClick={() => baixarOuCompartilharArquivo(doc.arquivo_base64, doc.nome_arquivo, doc.mime_type, false)} className="text-emerald-700 font-semibold tap-target">⬇️ Baixar</button>
                <button onClick={() => baixarOuCompartilharArquivo(doc.arquivo_base64, doc.nome_arquivo, doc.mime_type, true)} className="text-emerald-700 font-semibold tap-target">📤 Compartilhar</button>
                <button onClick={() => setModalRenomear(doc)} className="text-stone-500 font-semibold tap-target">✏️ Renomear</button>
                {!lancamentoVinculado && <button onClick={() => setModalVincular(doc)} className="text-blue-600 font-semibold tap-target">🔗 Vincular</button>}
                <button onClick={() => removerDocumento(doc)} className="text-red-400 font-semibold tap-target ml-auto">🗑️ Excluir</button>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

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
      {modalImportarExtrato && (
        <ModalImportarExtrato contaFixa={null} contas={contas} lancamentosExistentes={lancamentos} categorias={categorias} onImportar={onImportarExtrato} onConciliar={onConciliar} onCorrigirSaldoInicial={onCorrigirSaldoInicial} onSalvarArquivoExtrato={onSalvarArquivoExtrato} onFechar={() => setModalImportarExtrato(false)} />
      )}
      {modalRenomear && (
        <ModalRenomearDocumento
          documento={modalRenomear}
          onSalvar={(novoNome) => setDocumentos((ds) => ds.map((d) => (d.id === modalRenomear.id ? { ...d, nome_customizado: novoNome } : d)))}
          onFechar={() => setModalRenomear(null)}
        />
      )}
      {modalVincular && (
        <ModalVincularDocumento
          documento={modalVincular} lancamentos={lancamentos}
          onEscolherExistente={(lancamentoId) => {
            onVincularDocumentoExistente(modalVincular.id, lancamentoId);
            const lancamentoAlvo = lancamentos.find((l) => l.id === lancamentoId);
            if (lancamentoAlvo) onSalvarLancamento({ ...lancamentoAlvo, documento_id: modalVincular.id });
            setModalVincular(null);
          }}
          onCriarNovo={() => { setCriandoLancamentoPara(modalVincular); setModalVincular(null); }}
          onFechar={() => setModalVincular(null)}
        />
      )}
      {criandoLancamentoPara && (
        <ModalLancamento
          tipoInicial={criandoLancamentoPara.tipo === "entrada" ? "receita" : "despesa"}
          categorias={categorias} contas={contas} contaPadraoId={contas[0]?.id}
          documentoId={criandoLancamentoPara.id}
          onSalvar={(dados) => { onSalvarLancamento(dados); setCriandoLancamentoPara(null); }}
          onVincularDocumentoExistente={onVincularDocumentoExistente}
          onFechar={() => setCriandoLancamentoPara(null)}
        />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* ---------- ModalImportarExtrato — Fase (seção 14): sobe OFX ou PDF, deduplica, mostra prévia ---------- */
function ModalImportarExtrato({ contaFixa, contas, lancamentosExistentes, categorias, onImportar, onConciliar, onCorrigirSaldoInicial, onSalvarArquivoExtrato, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [transacoesBrutas, setTransacoesBrutas] = useState(null); // já leu o arquivo, ainda não sabe a conta
  const [checkpointsBrutos, setCheckpointsBrutos] = useState([]); // saldo real do banco, extraído junto (Itaú/Mercado Pago)
  const [arquivoParaGuardar, setArquivoParaGuardar] = useState(null); // pedido do usuário: guardar o arquivo em si, não só os dados extraídos
  const [formatoDetectado, setFormatoDetectado] = useState(null);
  const [contaId, setContaId] = useState(contaFixa?.id || (contas.length === 1 ? contas[0].id : null));
  const [resultado, setResultado] = useState(null);

  /* Pedido do usuário: o saldo total não batia com o banco, e mesmo corrigindo na mão continuava
     errado — pediu pro app puxar o saldo real automaticamente do próprio extrato. Itaú e Mercado
     Pago já trazem o saldo embutido em cada linha (antes descartado) — usa o checkpoint mais
     RECENTE encontrado (quanto mais recente, menos transações futuras entram no caminho até
     "agora", menos chance de erro acumular) como novo ponto de partida do saldo da conta — só se
     for mais recente que a data configurada hoje, pra nunca voltar no tempo à toa. */
  function processarConciliacao(transacoes, checkpoints, formato, contaEscolhidaId) {
    const fingerprintsExistentes = new Set(lancamentosExistentes.map(fingerprintTransacao));
    const semReimportacao = transacoes.filter((t) => !fingerprintsExistentes.has(fingerprintTransacao(t)));
    const { conciliadas, novasDoBanco, naoBateram } = conciliarTransacoesImportadas(semReimportacao, lancamentosExistentes, contaEscolhidaId);
    const novasComCategoria = novasDoBanco.map((t) => ({ ...t, categoria_id: categoriaAutoDetectada(t.descricao, t.tipo, categorias) }));
    const categorizadasAuto = novasComCategoria.filter((t) => t.categoria_id).length;

    let correcaoSaldo = null;
    const contaEscolhida = by(contas, contaEscolhidaId);
    if (checkpoints.length && contaEscolhida) {
      const maisRecente = checkpoints.reduce((a, b) => (new Date(b.data) > new Date(a.data) ? b : a));
      if (new Date(maisRecente.data) > new Date(contaEscolhida.data_saldo_inicial)) {
        /* Fim do dia (23:59:59.999), não meio-dia como as transações — testado que usar o mesmo
           horário das transações conta a movimentação do PRÓPRIO dia do checkpoint duas vezes
           (uma embutida no saldo, outra somada de novo pelo filtro d >= inicio). */
        const dc = new Date(maisRecente.data);
        const fimDoDia = new Date(dc.getFullYear(), dc.getMonth(), dc.getDate(), 23, 59, 59, 999);
        correcaoSaldo = { saldo: maisRecente.saldo, data: fimDoDia.toISOString() };
      }
    }

    setResultado({
      conciliadas, novasDoBanco: novasComCategoria, naoBateram, formato, categorizadasAuto,
      duplicadas: transacoes.length - semReimportacao.length, correcaoSaldo,
    });
  }

  async function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      const arquivoBase64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
      setArquivoParaGuardar({ nomeArquivo: file.name, base64: arquivoBase64, mimeType: file.type || "application/octet-stream" });
      const ehOfx = /\.ofx$/i.test(file.name);
      const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let transacoes = [], checkpoints = [], formato = null;
      if (ehOfx) {
        const texto = await file.text();
        transacoes = parsearOfx(texto);
        formato = "ofx";
        if (!transacoes.length) throw new Error("Não consegui identificar nenhuma transação nesse arquivo OFX.");
      } else if (ehPdf) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await carregarPdfJs();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const primeiraPagina = await pdf.getPage(1);
        const conteudoPrimeiraPagina = await primeiraPagina.getTextContent();
        const textoPrimeiraPagina = conteudoPrimeiraPagina.items.map((it) => it.str).join(" ");
        if (/DETALHE DOS MOVIMENTOS/i.test(textoPrimeiraPagina)) {
          ({ transacoes, checkpoints } = await extrairTransacoesMercadoPagoPdf(pdf));
          formato = "pdf-mercadopago";
        } else if (/\bitaú\b/i.test(textoPrimeiraPagina) || /extrato conta\s*\/\s*lançamentos/i.test(textoPrimeiraPagina)) {
          ({ transacoes, checkpoints } = await extrairTransacoesItauPdf(pdf));
          formato = "pdf-itau";
        } else {
          throw new Error("Não reconheço esse formato de PDF ainda — hoje só Mercado Pago e Itaú. Manda um exemplo que a gente adiciona suporte.");
        }
        if (!transacoes.length) throw new Error("Não consegui reconhecer transações nesse PDF — o formato pode ter mudado.");
      } else {
        throw new Error("Formato não reconhecido — precisa ser .ofx ou .pdf.");
      }
      setTransacoesBrutas(transacoes);
      setCheckpointsBrutos(checkpoints);
      setFormatoDetectado(formato);
      /* Pedido do usuário: se a conta já é conhecida (veio fixada, ou só existe uma), roda a
         conciliação direto. Senão, ainda falta perguntar — fica esperando a escolha. */
      if (contaId) processarConciliacao(transacoes, checkpoints, formato, contaId);
    } catch (err) {
      setErro(err.message);
    } finally {
      setProcessando(false);
    }
  }

  function escolherConta(id) {
    setContaId(id);
    processarConciliacao(transacoesBrutas, checkpointsBrutos, formatoDetectado, id);
  }

  function confirmar() {
    if (resultado.conciliadas.length) onConciliar(resultado.conciliadas.map((c) => c.lancamentoExistenteId));
    if (resultado.novasDoBanco.length) onImportar(resultado.novasDoBanco, contaId);
    if (resultado.correcaoSaldo) onCorrigirSaldoInicial(contaId, resultado.correcaoSaldo.saldo, resultado.correcaoSaldo.data);
    if (arquivoParaGuardar) onSalvarArquivoExtrato(arquivoParaGuardar, contaId);
    onFechar();
  }

  const totalParaAgir = resultado ? resultado.conciliadas.length + resultado.novasDoBanco.length : 0;
  const nomeContaEscolhida = contaId ? by(contas, contaId)?.nome : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[70]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📥 Importar e conciliar extrato</h3>
        <p className="text-xs text-stone-500 mb-3">{nomeContaEscolhida ? `Pra "${nomeContaEscolhida}". ` : ""}Aceita OFX (qualquer banco) ou PDF (Itaú, Mercado Pago). Compara com o que você já lançou na mão — não duplica o que bateu.</p>

        {!transacoesBrutas && !processando && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-6 text-sm text-stone-500 cursor-pointer tap-target">
            📎 Escolher arquivo (.ofx ou .pdf)
            <input type="file" accept=".ofx,.pdf,application/pdf" onChange={aoEscolherArquivo} className="hidden" />
          </label>
        )}
        {processando && (
          <div className="text-center py-8">
            <div className="text-sm text-stone-500">Lendo e conciliando o extrato...</div>
            <div className="text-xs text-stone-400 mt-1">Pode levar alguns segundos, principalmente em PDF</div>
          </div>
        )}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

        {transacoesBrutas && !contaId && (
          <div className="mb-3">
            <p className="text-sm text-stone-600 mb-2">Encontrei {transacoesBrutas.length} transação(ões). De qual conta é esse extrato?</p>
            <div className="flex gap-2 flex-wrap">
              {contas.filter((c) => c.ativa !== false).map((c) => <Chip key={c.id} selected={false} onClick={() => escolherConta(c.id)}>{c.nome}</Chip>)}
            </div>
          </div>
        )}

        {resultado && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
                <div className="font-mono2 font-bold text-lg text-emerald-700">{resultado.conciliadas.length}</div>
                <div className="text-[10px] text-emerald-700 leading-tight">bateram certo ✓</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2.5 text-center">
                <div className="font-mono2 font-bold text-lg text-blue-700">{resultado.novasDoBanco.length}</div>
                <div className="text-[10px] text-blue-700 leading-tight">novas do banco</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                <div className="font-mono2 font-bold text-lg text-amber-700">{resultado.naoBateram.length}</div>
                <div className="text-[10px] text-amber-700 leading-tight">não bateram</div>
              </div>
            </div>

            {resultado.conciliadas.length > 0 && (
              <div className="bg-emerald-50 rounded-lg p-2.5 mb-2 text-xs text-emerald-800">✓ {resultado.conciliadas.length} lançamento(s) que você já tinha feito na mão batem exatos com o banco — vão ser marcados como conferidos, sem duplicar.</div>
            )}
            {resultado.naoBateram.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-2.5 mb-2 text-xs text-amber-800">⚠️ {resultado.naoBateram.length} lançamento(s) seu(s) não apareceram nesse extrato — pode ser um erro de valor/data, ou o banco ainda não processou. Continuam no seu controle, só sem confirmação do banco ainda.</div>
            )}
            {resultado.correcaoSaldo && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mb-2 text-xs text-blue-800">
                🔧 O saldo inicial dessa conta vai ser corrigido automaticamente pro saldo real do banco em {dataCurta(resultado.correcaoSaldo.data)}: <b className="font-mono2">{brl(resultado.correcaoSaldo.saldo)}</b>. Isso resolve qualquer diferença acumulada até aqui.
              </div>
            )}
            {resultado.duplicadas > 0 && <div className="text-xs text-stone-400 mb-2">{resultado.duplicadas} transação(ões) já importada(s) antes — ignoradas.</div>}
            {resultado.categorizadasAuto > 0 && <div className="text-xs text-emerald-700 mb-2">🏷️ {resultado.categorizadasAuto} das novas já vêm com categoria sugerida automaticamente.</div>}
            {resultado.formato?.startsWith("pdf") && <div className="text-xs text-amber-700 mb-2">⚠️ Extração de PDF é melhor esforço — confira se os valores fazem sentido antes de confirmar.</div>}

            {resultado.novasDoBanco.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1 mb-3 border border-stone-100 rounded-lg p-2">
                <div className="text-[10px] font-semibold text-stone-400 uppercase mb-1">Novas (sem lançamento seu correspondente)</div>
                {resultado.novasDoBanco.slice(0, 20).map((t, i) => {
                  const cat = t.categoria_id ? by(categorias, t.categoria_id) : null;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-stone-600 truncate">{cat ? cat.icone + " " : ""}{dataCurta(t.data)} · {t.descricao.slice(0, 26)}</span>
                      <span className={`font-mono2 font-semibold shrink-0 ml-2 ${t.tipo === "receita" ? "text-emerald-700" : "text-red-500"}`}>{t.tipo === "receita" ? "+" : "−"} {brl(t.valor)}</span>
                    </div>
                  );
                })}
                {resultado.novasDoBanco.length > 20 && <div className="text-center text-stone-400 text-xs pt-1">e mais {resultado.novasDoBanco.length - 20}...</div>}
              </div>
            )}
            {!totalParaAgir && !resultado.naoBateram.length && (
              <p className="text-sm text-stone-500 text-center py-2">Nada novo pra importar.</p>
            )}
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">{resultado ? "Cancelar" : "Fechar"}</button>
          {resultado && totalParaAgir > 0 && (
            <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Confirmar</button>
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
        textoExtraido = await extrairTextoDoPdf(arrayBuffer);
      } else {
        arquivoBase64 = await resizeImage(file, 1000, 0.75);
        mimeType = "image/jpeg";
        const Tesseract = await carregarTesseract();
        const r = await Tesseract.recognize(arquivoBase64, "por");
        textoExtraido = r.data.text;
      }
      const total = extrairTotalDoTextoOcr(textoExtraido);
      const documento = { id: uid(), tipo: "saida", categoria_documento: "outro", nome_arquivo: file.name, arquivo_base64: arquivoBase64, mime_type: mimeType, data_upload: new Date().toISOString(), lancamento_id: null };
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
  const [financiamentos, setFinanciamentos] = useState([]);
  const [historicoPagamentosFinanciamento, setHistoricoPagamentosFinanciamento] = useState([]);
  const [aba, setAba] = useState("extrato");
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [erroSalvamento, setErroSalvamento] = useState(false);
  /* Pedido do usuário: PIN pedido toda vez que abre o Finanças (conteúdo pessoal). Estado de
     desbloqueio NÃO é persistido de propósito — reseta a cada montagem do componente, que é
     exatamente quando você "abre" o Finanças (troca de aba no Hub). */
  const [pin, setPin] = useState(() => { try { return localStorage.getItem("fn_pin") || null; } catch (e) { return null; } });
  const [desbloqueado, setDesbloqueado] = useState(false);

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
    setFinanciamentos(d.financiamentos);
    setHistoricoPagamentosFinanciamento(d.historicoPagamentosFinanciamento);
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
  useEffect(() => { if (!loading) { const ok = persist("fn_gruposOrcamento", gruposOrcamento); if (!ok) setErroSalvamento(true); } }, [gruposOrcamento, loading]);
  useEffect(() => { if (!loading) { if (rendaManual == null) localStorage.removeItem("fn_rendaManual"); else localStorage.setItem("fn_rendaManual", String(rendaManual)); } }, [rendaManual, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_historicoAportes", historicoAportes); if (!ok) setErroSalvamento(true); } }, [historicoAportes, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_financiamentos", financiamentos); if (!ok) setErroSalvamento(true); } }, [financiamentos, loading]);
  useEffect(() => { if (!loading) { const ok = persist("fn_historicoPagamentosFinanciamento", historicoPagamentosFinanciamento); if (!ok) setErroSalvamento(true); } }, [historicoPagamentosFinanciamento, loading]);

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
  /* Seção 14 do mapa: importa em lote. Categoria vem null (pendente) por padrão, exceto quando
     a auto-categorização (pedido do usuário) já sugeriu uma com confiança. origem_extrato marca
     que veio direto do banco — usado pela conciliação pra nunca tentar casar banco com banco. */
  function importarTransacoes(transacoes, contaId) {
    const novos = transacoes.map((t) => ({
      id: uid(), tipo: t.tipo, descricao: t.descricao, categoria_id: t.categoria_id ?? null, valor: t.valor, data: t.data,
      fixa: false, recorrente: false, dia_recorrencia: null, forma_pagamento: null,
      conta_id: contaId, origem_fixo_id: null, documento_id: null, origem_extrato: true, conciliado: true,
    }));
    setLancamentos((ls) => [...ls, ...novos]);
  }
  /* Pedido do usuário: conciliação bancária — lançamento feito na mão que bateu com o extrato
     importado vira "conciliado", sem duplicar. */
  function marcarConciliados(idsLancamentos) {
    const idsSet = new Set(idsLancamentos);
    setLancamentos((ls) => ls.map((l) => (idsSet.has(l.id) ? { ...l, conciliado: true } : l)));
  }
  /* Pedido do usuário: o saldo não batia com o banco, e ele queria que o app corrigisse sozinho
     puxando o saldo real de dentro do próprio extrato importado (Itaú/Mercado Pago já trazem
     isso embutido em cada linha). */
  function corrigirSaldoInicial(contaId, novoSaldo, novaData) {
    setContas((cs) => cs.map((c) => (c.id === contaId ? { ...c, saldo_inicial: novoSaldo, data_saldo_inicial: novaData } : c)));
  }
  /* Pedido do usuário: guardar TODOS os arquivos que sobe, não só notas fiscais — extrato
     importado agora também vira um documento de verdade no repositório, não só dados extraídos
     que descartam o arquivo original. */
  function salvarArquivoExtrato(arquivo, contaId) {
    setDocumentos((ds) => [...ds, {
      id: uid(), tipo: "saida", categoria_documento: "extrato", nome_arquivo: arquivo.nomeArquivo,
      arquivo_base64: arquivo.base64, mime_type: arquivo.mimeType, data_upload: new Date().toISOString(),
      lancamento_id: null, conta_id: contaId,
    }]);
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
  /* Pedido do usuário: colar o texto da nota direto no "+", sem precisar passar por Documentos —
     já chega com tudo pronto (parseado + HTML montado), então não repete a extração que
     anexarDocumentoALancamento faz pra PDF/foto — só grava o documento. */
  function anexarNotaColadaALancamento(dadosNfe, tipoDocumento) {
    const documentoId = uid();
    setDocumentos((ds) => [...ds, {
      id: documentoId, tipo: tipoDocumento, categoria_documento: "nota_fiscal", nome_arquivo: dadosNfe.nomeArquivo,
      arquivo_base64: dadosNfe.arquivoBase64, mime_type: "text/plain", html_reconstruido: dadosNfe.htmlReconstruido,
      data_upload: new Date().toISOString(), lancamento_id: null,
    }]);
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

  if (pin && !desbloqueado) {
    return <TelaBloqueioPin pin={pin} onDesbloqueou={() => setDesbloqueado(true)} onVoltarHub={onVoltarHub} />;
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
            metas={metas} cartoes={cartoes} gruposOrcamento={gruposOrcamento} rendaManual={rendaManual} historicoAportes={historicoAportes} financiamentos={financiamentos} onResolverPendente={resolverPendente}
            onAnexarDocumento={anexarDocumentoALancamento}
            onAnexarNotaColada={anexarNotaColadaALancamento}
            onVincularDocumentoExistente={vincularDocumentoAoLancamento}
            onFotografarRecibo={fotografarRecibo}
            onEditarNoMercado={onEditarNoMercado}
            onAbrirConfig={() => setAba("config")}
          />
        )}
        {aba === "metas" && (
          <TelaMetas
            metas={metas} setMetas={setMetas} contas={contas} historicoAportes={historicoAportes}
            onRegistrarAporte={(registro) => setHistoricoAportes((h) => [...h, registro])} onAporteComoDespesa={salvarLancamentosComFixo}
            categorias={categorias} financiamentos={financiamentos} setFinanciamentos={setFinanciamentos}
            historicoPagamentosFinanciamento={historicoPagamentosFinanciamento}
            onRegistrarPagamentoFinanciamento={(registro) => setHistoricoPagamentosFinanciamento((h) => [...h, registro])}
            onPagamentoFinanciamentoComoDespesa={salvarLancamentosComFixo}
          />
        )}
        {aba === "cartoes" && (
          <TelaCartoes cartoes={cartoes} setCartoes={setCartoes} lancamentos={lancamentos} categorias={categorias} onAnexarFatura={anexarFatura} />
        )}
        {aba === "documentos" && (
          <TelaDocumentos documentos={documentos} setDocumentos={setDocumentos} lancamentos={lancamentos} onSalvarLancamento={salvarLancamentosComFixo} categorias={categorias} contas={contas} arquivoCompartilhado={arquivoCompartilhado} onUsarArquivoCompartilhado={onUsarArquivoCompartilhado} onImportarExtrato={importarTransacoes} onConciliar={marcarConciliados} onCorrigirSaldoInicial={corrigirSaldoInicial} onSalvarArquivoExtrato={salvarArquivoExtrato} onVincularDocumentoExistente={vincularDocumentoAoLancamento} />
        )}
        {aba === "config" && (
          <TelaConfigFinancas categorias={categorias} setCategorias={setCategorias} contas={contas} setContas={setContas} lancamentos={lancamentos} lancamentosFixos={lancamentosFixos} limiar5Dias={limiar5Dias} setLimiar5Dias={setLimiar5Dias} onImportarExtrato={importarTransacoes} onConciliar={marcarConciliados} onCorrigirSaldoInicial={corrigirSaldoInicial} onSalvarArquivoExtrato={salvarArquivoExtrato} gruposOrcamento={gruposOrcamento} setGruposOrcamento={setGruposOrcamento} rendaManual={rendaManual} setRendaManual={setRendaManual} metas={metas} cartoes={cartoes} pin={pin} onSalvarPin={(novoPin) => { try { localStorage.setItem("fn_pin", novoPin); } catch (e) {} setPin(novoPin); setDesbloqueado(true); }} onRemoverPin={() => { try { localStorage.removeItem("fn_pin"); } catch (e) {} setPin(null); }} />
        )}
      </div>
      <TabBarFinancas aba={aba} setAba={setAba} />
    </div>
  );
}
