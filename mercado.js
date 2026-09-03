function tamanhoDisplay(variante) {
  if (!variante) return "";
  if (variante.tamanho && variante.tamanho.trim()) return variante.tamanho;
  if (variante.tamanho_quantidade && variante.tamanho_unidade) return `${variante.tamanho_quantidade}${variante.tamanho_unidade}`;
  return "";
}

function precoParaHistorico(item) {
  return item.preco_normal ?? item.preco_pago;
}
function calcHistorico(sessoes, varianteId, unidade, mercadoId = null) {
  const regs = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    if (mercadoId && s.mercado_id !== mercadoId) continue;
    for (const it of s.itens) {
      if (it.produto_variante_id === varianteId && it.preco_pago != null && it.unidade === unidade) {
        regs.push({ preco: precoParaHistorico(it), data: s.data_hora });
      }
    }
  }
  if (!regs.length) return null;
  const precos = regs.map((r) => r.preco);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const media = precos.reduce((a, b) => a + b, 0) / precos.length;
  return {
    min, max, media, n: regs.length,
    dataMin: regs.find((r) => r.preco === min).data,
    dataMax: regs.find((r) => r.preco === max).data,
  };
}
function historicoQualquerUnidade(sessoes, varianteId) {
  for (const u of ["un", "kg", "l"]) {
    const h = calcHistorico(sessoes, varianteId, u);
    if (h) return { ...h, unidade: u };
  }
  return null;
}
function historicoCronologico(sessoes, varianteId, unidade) {
  const regs = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    for (const it of s.itens) {
      if (it.produto_variante_id === varianteId && it.preco_pago != null && it.unidade === unidade) {
        regs.push({ preco: precoParaHistorico(it), data: s.data_hora, mercado_id: s.mercado_id });
      }
    }
  }
  return regs.sort((a, b) => new Date(a.data) - new Date(b.data));
}
function calcMediaRecente(sessoes, varianteId, unidade, mercadoId = null, meses = 3) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);
  const precos = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    if (new Date(s.data_hora) < limite) continue;
    if (mercadoId && s.mercado_id !== mercadoId) continue;
    for (const it of s.itens) {
      if (it.produto_variante_id === varianteId && it.preco_pago != null && it.unidade === unidade) {
        precos.push(precoParaHistorico(it));
      }
    }
  }
  if (!precos.length) return null;
  return precos.reduce((a, b) => a + b, 0) / precos.length;
}
function calcUltimaCompra(sessoes, varianteId, mercadoId) {
  let melhor = null;
  for (const s of sessoes) {
    if (s.status !== "fechada" || s.mercado_id !== mercadoId) continue;
    for (const it of s.itens) {
      if (it.produto_variante_id === varianteId && it.preco_pago != null) {
        if (!melhor || new Date(s.data_hora) > new Date(melhor.data)) {
          melhor = { preco: it.preco_pago, data: s.data_hora };
        }
      }
    }
  }
  return melhor;
}
function calcIndicador(precoPago, media) {
  if (media == null) return null;
  if (precoPago <= media * 0.95) return "bom";
  if (precoPago <= media * 1.05) return "normal";
  return "caro";
}
/* Etapa sobre "desconto de clube" — média de referência só com histórico REAL de compra
   (nunca estimativa de IA, nunca comparação entre tamanhos diferentes) — é a única fonte
   confiável o bastante pra justificar reescrever um preço já registrado no histórico. Repare
   que é mais restrita que mediaRefPara (usada só pra mostrar o indicador 🔴/🟢 durante a compra,
   onde uma estimativa a menos é aceitável porque é só informativo, não muda dado nenhum). */
function mediaHistoricaReal(sessoes, varianteId, unidade, mercadoId) {
  const rec = calcMediaRecente(sessoes, varianteId, unidade, mercadoId);
  const ger = calcHistorico(sessoes, varianteId, unidade)?.media;
  return rec ?? ger ?? null;
}
/* Decisão do usuário: os valores no app devem refletir o preço REAL pago, registrado de verdade
   — o objetivo aqui não é "proteger" o histórico de poluição, é corrigi-lo pro valor certo.
   Tenta explicar a diferença entre o total calculado (preço de tabela, o que fica impresso item
   a item na nota) e o "Descontos R$" que a própria nota declara: soma o excesso (preço pago menos
   a própria média histórica) só dos itens que o indicador já marcaria como 🔴 caro. Bate exato
   com o desconto declarado → aplica, cada item volta pro seu preço real (a própria média — não
   uma fração arbitrária do desconto total, é o valor mais correto disponível pra "quanto eu
   realmente paguei"). Não bate → não mexe em nada, a suposição pode estar errada (pode ser reajuste
   de preço de verdade, não desconto) — cai no aviso de diferença comum, sem sugestão automática.
   Item sem histórico real não entra na conta (não tem uma "própria média" pra comparar). */
function tentarExplicarDescontoClube(itens, valorDesconto, sessoes, catalogo, mercadoId) {
  if (valorDesconto == null || valorDesconto <= 0) return null;
  const candidatos = [];
  let somaExcesso = 0;
  for (const item of itens) {
    if (item.preco_pago == null || !item.comprado) continue;
    const variante = by(catalogo.variantes, item.produto_variante_id);
    if (!variante) continue;
    const media = mediaHistoricaReal(sessoes, item.produto_variante_id, item.unidade, mercadoId);
    if (media == null) continue;
    if (calcIndicador(item.preco_pago, media) !== "caro") continue;
    const excesso = multiplicarValor(item.preco_pago - media, item.quantidade || 1);
    candidatos.push({ itemId: item.id, precoAntigo: item.preco_pago, precoNovo: media, quantidade: item.quantidade || 1 });
    somaExcesso += excesso;
  }
  if (!candidatos.length) return null;
  if (Math.abs(somaExcesso - valorDesconto) > 0.05) return null;
  return candidatos;
}
function calcItensFrequentes(sessoes, catalogo, n = 8) {
  const cont = {};
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    for (const it of s.itens) cont[it.produto_variante_id] = (cont[it.produto_variante_id] || 0) + 1;
  }
  return Object.entries(cont)
    .sort((a, b) => {
      const va = by(catalogo.variantes, a[0]), vb = by(catalogo.variantes, b[0]);
      const fa = va?.favorita ? 1 : 0, fb = vb?.favorita ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b[1] - a[1];
    })
    .slice(0, n).map(([id]) => id);
}
function subtotalPorCategoria(itens, catalogo) {
  const porCat = {};
  for (const it of itens) {
    if (it.preco_pago == null) continue;
    const v = by(catalogo.variantes, it.produto_variante_id);
    const p = v && by(catalogo.produtos, v.produto_id);
    const cat = p && by(catalogo.categorias, p.categoria_id);
    const nome = cat?.nome || "Outros";
    porCat[nome] = (porCat[nome] || 0) + (it.subtotal || 0);
  }
  return porCat;
}
/* Seção 22.4b: instantâneo do gasto por categoria no momento do fechamento — fica salvo junto da sessão */
function snapshotCategorias(itens, catalogo) {
  const porCat = {};
  for (const it of itens) {
    if (!it.comprado || it.preco_pago == null) continue;
    const v = by(catalogo.variantes, it.produto_variante_id);
    const p = v && by(catalogo.produtos, v.produto_id);
    const cat = p && by(catalogo.categorias, p.categoria_id);
    const id = cat?.id || "sem_categoria";
    if (!porCat[id]) porCat[id] = { categoria_id: id, nome: cat?.nome || "Outros", icone: cat?.icone || "🛒", valor: 0 };
    porCat[id].valor += it.subtotal || 0;
  }
  return Object.values(porCat);
}
function totalPrevisto(itens, catalogo, sessoes, mercadoId) {
  let total = 0;
  for (const it of itens) {
    if (it.preco_pago != null) { total += it.subtotal || 0; continue; }
    const mediaRec = calcMediaRecente(sessoes, it.produto_variante_id, it.unidade, mercadoId);
    const mediaGer = calcHistorico(sessoes, it.produto_variante_id, it.unidade)?.media;
    const ref = mediaRec ?? mediaGer ?? 0;
    total += ref * it.quantidade;
  }
  return total;
}
function itensBaratosAgora(catalogo, sessoes, precoIaCache) {
  const avisos = [];
  for (const v of catalogo.variantes) {
    const est = ultimaEstimativa(precoIaCache, v.id);
    if (!est) continue;
    const hist = historicoQualquerUnidade(sessoes, v.id);
    if (!hist) continue;
    if (est.preco_medio_estimado < hist.media * 0.9) {
      const p = by(catalogo.produtos, v.produto_id);
      avisos.push({ nome: p?.nome || "item", economia: hist.media - est.preco_medio_estimado });
    }
  }
  return avisos.sort((a, b) => b.economia - a.economia).slice(0, 3);
}
function upsertBy(arr, incoming) {
  const map = new Map((arr || []).map((x) => [x.id, x]));
  for (const item of incoming || []) map.set(item.id, { ...map.get(item.id), ...item });
  return Array.from(map.values());
}
function categoriasOrdenadas(catalogo, mercado) {
  const ordem = mercado?.ordem_categorias;
  if (!ordem || !ordem.length) return catalogo.categorias;
  const emOrdem = ordem.map((id) => by(catalogo.categorias, id)).filter(Boolean);
  const idsEmOrdem = new Set(emOrdem.map((c) => c.id));
  const resto = catalogo.categorias.filter((c) => !idsEmOrdem.has(c.id));
  return [...emOrdem, ...resto];
}
function calcTendencia(sessoes, varianteId, unidade) {
  const cron = historicoCronologico(sessoes, varianteId, unidade);
  if (cron.length < 2) return null;
  const meio = Math.floor(cron.length / 2);
  const antigos = cron.slice(0, meio || 1);
  const recentes = cron.slice(meio || 1);
  if (!antigos.length || !recentes.length) return null;
  const mediaAntiga = antigos.reduce((a, r) => a + r.preco, 0) / antigos.length;
  const mediaRecente = recentes.reduce((a, r) => a + r.preco, 0) / recentes.length;
  const pct = mediaAntiga ? ((mediaRecente - mediaAntiga) / mediaAntiga) * 100 : 0;
  if (pct > 5) return { direcao: "subindo", pct };
  if (pct < -5) return { direcao: "caindo", pct };
  return { direcao: "estavel", pct };
}

/* =========================================================
   NFC-e: leitura do PDF (DANFE), casamento com a lista, checagem de duplicidade (seção 26)
   XML removido — consumidor comum não consegue baixar XML sem certificado digital, então
   suportar esse formato não tinha uso real (ver conversa: regra nacional desde 2020). */
/* Pontua o quanto a descrição bruta da nota ("ARROZ TP1 5KG TIO JOAO") combina com um item da lista —
   nome do produto vale mais, marca aparecendo como substring é sinal forte. */
function pontuarMatchNfe(descricaoNfe, item, catalogo) {
  const variante = by(catalogo.variantes, item.produto_variante_id);
  const produto = variante && by(catalogo.produtos, variante.produto_id);
  if (!produto) return 0;
  const marca = variante?.marca_id ? by(catalogo.marcas, variante.marca_id) : null;
  const descNorm = normalizar(descricaoNfe);
  const palavrasNfe = new Set(descNorm.split(/\s+/).filter(Boolean));
  let pontos = 0;
  for (const p of normalizar(produto.nome).split(/\s+/).filter(Boolean)) if (palavrasNfe.has(p)) pontos += 2;
  if (marca?.nome) {
    const marcaJunta = normalizar(marca.nome).replace(/\s+/g, "");
    if (descNorm.replace(/\s+/g, "").includes(marcaJunta)) pontos += 3;
  }
  return pontos;
}
function melhorMatchNfe(descricaoNfe, itensCandidatos, catalogo) {
  let melhor = null, melhorPontos = 0;
  for (const item of itensCandidatos) {
    const pontos = pontuarMatchNfe(descricaoNfe, item, catalogo);
    if (pontos > melhorPontos) { melhorPontos = pontos; melhor = item; }
  }
  return melhorPontos >= 2 ? melhor : null;
}
/* Etapa sobre conferência de nota: agrupa linhas da nota com descrição IDÊNTICA antes de tentar
   casar com a lista. Sem isso, quando o mesmo produto vem em várias linhas separadas (pesado em
   pacotes diferentes no açougue, ou registrado com código interno diferente por variação de lote)
   a tela casava só a PRIMEIRA linha com o item da lista e tratava o resto como "não encontrado" —
   fazia parecer um rombo de preço gigante que não existia (achado testando com nota real: Acém
   Bovino pesado em 3 pacotes, "divergência" de R$58 que na verdade era R$3, a soma dos 3 batia
   com o esperado). Só agrupa por descrição EXATAMENTE igual, nunca por semelhança — junta coisa
   errada é pior que deixar "não encontrado" separado, que pelo menos é honesto sobre a incerteza.
   Preserva quantas linhas originais viraram uma, pra mostrar isso na tela (nunca silencioso). */
function agruparLinhasNfePorDescricao(itens) {
  const grupos = new Map();
  for (const linha of itens) {
    const chave = linha.descricao.trim();
    if (!grupos.has(chave)) {
      grupos.set(chave, { ...linha, linhasOriginais: 1 });
    } else {
      const atual = grupos.get(chave);
      atual.quantidade = (atual.quantidade || 0) + (linha.quantidade || 0);
      atual.valor_total = (atual.valor_total || 0) + (linha.valor_total || 0);
      atual.linhasOriginais += 1;
    }
  }
  return [...grupos.values()];
}
/* Evita anexar a mesma nota duas vezes por engano — procura a chave de acesso em todas as sessões */
/* Pedido do usuário: ver a nota fiscal com 1 toque desde o histórico do Mercado, sem duplicar
   arquivo — lê direto de fn_documentos (mesma fonte que o Finanças usa), igual o padrão de
   leitura cruzada já usado em integrarCompraMercado. */
function verNotaFiscalDoFinancas(documentoId) {
  try {
    const documentosRaw = localStorage.getItem("fn_documentos");
    const documentos = documentosRaw ? JSON.parse(documentosRaw) : [];
    const documento = documentos.find((d) => d.id === documentoId);
    if (!documento) { alert("Não achei essa nota fiscal — pode ter sido removida em Documentos, no Finanças."); return; }
    abrirArquivoDocumento(documento); // definida em financas.js — por essa altura, já carregado
  } catch (e) { alert("Não consegui abrir a nota fiscal."); }
}
function sessaoComMesmaNfe(sessoes, chaveAcesso, ignorarSessaoId) {
  return sessoes.find((s) => s.id !== ignorarSessaoId && s.nfe?.chave_acesso === chaveAcesso) || null;
}
/* Nível 2 (seção 27): o QR Code do cupom aponta pra uma URL do portal da Sefaz contendo a chave de
   acesso (44 dígitos) como parâmetro — não dá pra baixar o XML direto por CORS, mas já adianta a
   checagem de duplicidade e leva o usuário direto pro portal certo. */
/* DANFE em PDF — diferente do XML, é a versão pra consumidor, sem trava de certificado digital.
   Testado contra um PDF real (baixado do site oficial da SEFAZ-RJ, ferramenta "Consulta DF-e").
   Achados testando: o pdf.js extrai o texto numa ordem BEM diferente da leitura visual — os
   totais (qtd, valor total, desconto, valor a pagar) saem logo no início do texto, junto com um
   trecho do rodapé, bem longe dos rótulos deles; acentos como "Código" saem quebrados em
   "C ó digo" (glifo do acento vira um item de texto separado). Item por item funciona bem porque
   essa parte mantém ordem sequencial normal. Produz a MESMA forma que parsearNfeXml, pra
   reaproveitar a tela de conferência inteira sem duplicar nada.
   Ressalva: só testei contra esse PDF específico (RJ) — outras fontes ou estados podem ter
   layout diferente; o parser é tolerante (cai pra soma dos itens se não achar o padrão de
   totais esperado) mas pode precisar de ajuste se aparecer um formato muito diferente. */
/* Etapa sobre "quero TODAS as informações da original" — reescrita completa, testada ponta a
   ponta contra um PDF real ("Consulta_DF-e.PDF", export direto da página oficial de consulta,
   não do Meu Danfe). Achado importante nesse teste: o formato de item nesse tipo de PDF é
   diferente do texto colado — "Vl. Total" gruda na linha do NOME do item (não na linha do valor),
   porque assim que a tabela é desenhada visualmente, e itensPdfEmLinhas (que já reconstrói a
   ordem de leitura corretamente) preserva esse agrupamento por linha visual. Testei simulando de
   verdade o pipeline completo (extração de posição + itensPdfEmLinhas) contra o PDF real antes
   de escrever esse regex — bateu os 7 itens exatos, com a soma batendo com "Valor total" da nota. */
function parsearDanfePdf(texto) {
  const regexItem = /(.+?)\s*\(C.{0,3}digo:\s*(\d+)\s*\)\s*Vl\.\s*Total\s*\nQtde\.:\s*([\d,]+)\s*UN:\s*(\S+)\s*Vl\.\s*Unit\.:\s*([\d,]+)\s*([\d,]+)/g;
  const itens = [];
  let m;
  while ((m = regexItem.exec(texto)) !== null) {
    let nome = m[1].trim().replace(/^[A-ZÀ-Ú]{1,2}\s+(?=[A-ZÀ-Ú]{3,})/, "");
    itens.push({ id: uid(), descricao: nome, quantidade: numDe(m[3]), valor_unitario: numDe(m[5]), valor_total: numDe(m[6]), vinculado_item_id: null, ignorado: false });
  }
  if (!itens.length) throw new Error("Não consegui achar os itens nesse PDF — pode ser um formato diferente do que já testei. Anexa mesmo assim como referência e digita os itens à mão, ou me manda esse PDF pra eu ajustar a leitura.");

  const somaItens = itens.reduce((a, it) => a + (it.valor_total || 0), 0);
  const valorPagarMatch = texto.match(/Valor a pagar R\$:\s*([\d,]+)/);
  const valorTotal = valorPagarMatch ? numDe(valorPagarMatch[1]) : somaItens;

  const chaveAcesso = extrairChaveDoTextoPlano(texto);
  if (!chaveAcesso) throw new Error("Achei os itens, mas não consegui achar a chave de acesso nesse PDF.");

  const nomeMatch = texto.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s]{5,60}?)\s+CNPJ:/);
  const cnpjMatch = texto.match(/CNPJ:\s*([\d.\/-]+)/);
  const descontoMatch = texto.match(/Descontos?\s*R\$:?\s*([\d,]+)/i);
  const dataMatch = texto.match(/Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const dataEmissao = dataMatch ? `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}` : null;

  let endereco = null;
  const cnpjIdx = texto.search(/CNPJ:\s*[\d.\/-]+/);
  if (cnpjIdx >= 0) {
    const candidata = texto.slice(cnpjIdx).split("\n").slice(1).find((l) => l.trim() && !/^Filtrar itens/i.test(l.trim()));
    if (candidata && !/Código:|Qtde\./.test(candidata)) endereco = candidata.trim();
  }
  const numSerieMatch = texto.match(/Número:\s*(\d+)\s*Série:\s*(\d+)/);
  const protocoloMatch = texto.match(/Protocolo de Autorização:\s*(\d+)/);
  /* Diferença encontrada testando contra o PDF real: aqui tem um espaço entre "pagamento:" e
     "Valor pago R$:" (o texto colado da consulta oficial não tem esse espaço) — regex aceita
     os dois formatos. */
  const blocoPgtoMatch = texto.match(/Forma de pagamento:\s*Valor pago R\$:\s*\n([\s\S]*?)(?:\n\s*\n|EMISSÃO|Informa)/);
  const formaPagamento = [];
  if (blocoPgtoMatch) {
    for (const linha of blocoPgtoMatch[1].split("\n")) {
      const lm = linha.match(/^(.+?)\s*([\d.]*\d,\d{2})$/);
      if (lm) formaPagamento.push({ nome: lm[1].trim(), valor: numDe(lm[2]) });
    }
  }
  const fcpMatch = texto.match(/Total do FCP:\s*R\$\s*([\d.,]+)/i);
  const fcpstMatch = texto.match(/Total do FCPST:\s*R\$\s*([\d.,]+)/i);
  const tribAproxMatch = texto.match(/Federal\s*R\$\s*([\d.,]+).*?Estadual\s*R\$\s*([\d.,]+).*?Municipal\s*R\$\s*([\d.,]+)/is);

  return {
    chave_acesso: chaveAcesso, cnpj_emit: cnpjMatch ? cnpjMatch[1] : null, nome_emit: nomeMatch ? nomeMatch[1].trim() : null,
    endereco, data_emissao: dataEmissao, valor_total: valorTotal, valor_desconto: descontoMatch ? numDe(descontoMatch[1]) : null,
    numero_nota: numSerieMatch ? numSerieMatch[1] : null, serie_nota: numSerieMatch ? numSerieMatch[2] : null,
    protocolo_autorizacao: protocoloMatch ? protocoloMatch[1] : null, forma_pagamento: formaPagamento,
    tributos: {
      fcp: fcpMatch ? numDe(fcpMatch[1]) : null, fcpst: fcpstMatch ? numDe(fcpstMatch[1]) : null,
      federal: tribAproxMatch ? numDe(tribAproxMatch[1]) : null, estadual: tribAproxMatch ? numDe(tribAproxMatch[2]) : null, municipal: tribAproxMatch ? numDe(tribAproxMatch[3]) : null,
    },
    itens,
  };
}
function extrairChaveDoQrNfce(conteudoQr) {
  const porParametro = conteudoQr.match(/[?&]p=(\d{44})/);
  if (porParametro) return porParametro[1];
  const qualquerSequencia = conteudoQr.match(/(\d{44})/);
  return qualquerSequencia ? qualquerSequencia[1] : null;
}
/* Chave de acesso a partir de texto corrido (PDF/OCR) — diferente do QR, aqui a chave costuma
   vir formatada em grupos de 4 dígitos com espaço (igual aparece impressa no papel), não como
   uma sequência única. Tenta as duas formas. */
function extrairChaveDoTextoPlano(texto) {
  const semEspaco = texto.match(/(\d{44})/);
  if (semEspaco) return semEspaco[1];
  const comGrupos = texto.match(/(\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4})/);
  return comGrupos ? comGrupos[1].replace(/\s+/g, "") : null;
}
/* Extrai o texto do PDF já na ordem de leitura certa (itensPdfEmLinhas resolve o problema de
   ordem embaralhada — seção 23 do mapa), pra parsearDanfePdf conseguir ler item por item e
   todos os campos da nota, não só o valor total. */
async function extrairTextoDePdf(arrayBuffer) {
  const pdfjsLib = await carregarPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const linhas = itensPdfEmLinhas(content.items); // compartilhada com financas.js — seção sobre leitura de PDF embaralhada
    textoCompleto += linhas.map((linha) => linha.map((it) => it.texto).join(" ")).join("\n") + "\n";
  }
  return textoCompleto;
}
/* Código IBGE da UF = 2 primeiros dígitos da chave de acesso — tabela fixa e estável (a última
   mudança foi 1988, criação do TO), pode confiar de cabeça. */
const UF_POR_CODIGO_IBGE = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
/* URLs de consulta de NFC-e por estado (produção) — pesquisado, NÃO testado individualmente como
   o link do RJ (esse sim já foi usado de verdade nesta conversa). Fonte principal é uma lista de
   2019 que pode estar desatualizada em alguns estados (Sefaz muda essas URLs periodicamente, sem
   aviso). Mesmo assim, é estritamente melhor que o comportamento antigo (mandar TODO mundo pro
   RJ, sempre errado pra quem não é do RJ) — e a chave continua visível/copiável na tela pra
   colar manualmente numa busca, caso o link de algum estado tenha mudado. Santa Catarina (SC)
   não tem NFC-e (confirmado na pesquisa) — cai no fallback de busca. */
const URL_CONSULTA_NFCE_POR_UF = {
  AC: "https://www.sefaznet.ac.gov.br/nfce/consulta",
  AL: "https://www.sefaz.al.gov.br/nfce/consulta",
  AM: "https://www.sefaz.am.gov.br/nfce/consulta",
  BA: "https://www.sefaz.ba.gov.br/nfce/consulta",
  CE: "https://www.sefaz.ce.gov.br/nfce/consulta",
  DF: "https://www.fazenda.df.gov.br/nfce/consulta",
  ES: "https://app.sefaz.es.gov.br/consultaNFCe/",
  GO: "https://www.sefaz.go.gov.br/nfce/consulta",
  MA: "https://www.sefaz.ma.gov.br/nfce/consulta",
  MG: "https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/consultanfce.xhtml",
  MS: "https://www.dfe.ms.gov.br/nfce/consulta",
  MT: "https://www.sefaz.mt.gov.br/nfce/consultanfce",
  PA: "https://www.sefa.pa.gov.br/nfce/consulta",
  PB: "https://www.sefaz.pb.gov.br/servirtual/documentos-fiscais/nfc-e/consultar-nfc-e",
  PE: "https://nfce.sefaz.pe.gov.br/nfce/consulta",
  PI: "https://www.sefaz.pi.gov.br/nfce/consulta",
  PR: "https://www.fazenda.pr.gov.br/nfce/consulta",
  RJ: "https://www.fazenda.rj.gov.br/nfce/consulta",
  RN: "https://www.set.rn.gov.br/nfce/consulta",
  RO: "https://www.sefin.ro.gov.br/nfce/consulta",
  RR: "https://www.sefaz.rr.gov.br/nfce/consulta",
  RS: "https://www.sefaz.rs.gov.br/nfce/consulta",
  SE: "https://www.nfce.se.gov.br/nfce/consulta",
  SP: "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaPublica.aspx",
  TO: "https://www.sefaz.to.gov.br/nfce/consulta",
};
/* Seção 34 do mapa: em vez de abrir o portal cru da Sefaz (varia por estado, pode ter captcha,
   navegação confusa), abre o Meu Danfe já com a chave preenchida — usuário só clica em baixar.
   Formato do link é uma aposta razoável (não confirmado com a documentação oficial deles, que
   bloqueia acesso automatizado) — por isso a chave também fica visível e copiável embaixo, pra
   colar manualmente se o preenchimento automático não pegar. */
function montarUrlMeuDanfe(chave) {
  return `https://meudanfe.com.br/?chave=${chave}`;
}
/* Pedido do usuário: em vez de tentar buscar a página da Sefaz automaticamente (bloqueada por
   IP tanto pra automação quanto, às vezes, pro próprio usuário — é anti-fraude do governo, não
   dá pra contornar), a PESSOA abre o link no navegador dela mesma (não é um robô, não cai no
   bloqueio), copia o texto da página inteira, e cola de volta aqui — o app remonta os dados
   sozinho. Link oficial do governo (não terceiro) sempre que a chave veio de um QR de verdade
   (guarda a URL original do QR, que já é o link certo). Pra chave digitada na mão, sem URL de
   QR pra usar, detecta o estado pelos 2 primeiros dígitos da própria chave (código IBGE, seção
   sobre corrigir o estado errado) e manda pro portal certo — antes mandava sempre pro RJ,
   errado pra qualquer outro estado. */
function montarUrlConsultaOficial(chaveDoQr) {
  if (chaveDoQr?.url) return chaveDoQr.url; // URL original do QR, já é o link certo e completo
  const uf = UF_POR_CODIGO_IBGE[chaveDoQr?.chave?.slice(0, 2)];
  const urlDoEstado = uf && URL_CONSULTA_NFCE_POR_UF[uf];
  if (urlDoEstado) return urlDoEstado;
  // Estado não mapeado (ou SC, que não tem NFC-e) — cai numa busca, melhor que mandar pro estado errado
  return `https://www.google.com/search?q=consulta+NFCe+${uf || "chave+de+acesso"}`;
}
/* Testado contra o texto real copiado da página de consulta da Sefaz-RJ (22 itens, bateu 100%
   com a soma "Valor total R$"). Formato por item, sempre 3 linhas:
     NOME (Código: 12345 )
     Qtde.:1  UN: UN  Vl. Unit.:   9,99 	Vl. Total
     9,99
   Produz a MESMA forma que parsearDanfePdf, pra reaproveitar a tela de conferência inteira. */
function parsearTextoConsultaNFCe(texto) {
  const regexItem = /(.+?)\s*\(Código:\s*(\d+)\s*\)\s*\nQtde\.:\s*([\d,]+)\s+UN:\s*(\S+)\s+Vl\.\s*Unit\.:\s*([\d,]+)\s*[\t ]*Vl\.\s*Total\s*\n\s*([\d,]+)/g;
  const itens = [];
  let m;
  while ((m = regexItem.exec(texto)) !== null) {
    itens.push({ id: uid(), descricao: m[1].trim(), quantidade: numDe(m[3]), valor_unitario: numDe(m[5]), valor_total: numDe(m[6]), vinculado_item_id: null, ignorado: false });
  }
  if (!itens.length) throw new Error("Não consegui achar itens nesse texto — confere se colou a página inteira (do nome do mercado até a chave de acesso).");

  const somaItens = itens.reduce((a, it) => a + (it.valor_total || 0), 0);
  const valorPagarMatch = texto.match(/Valor a pagar R\$:\s*([\d,]+)/);
  const valorTotal = valorPagarMatch ? numDe(valorPagarMatch[1]) : somaItens;

  const chaveMatch = texto.match(/Chave de acesso:\s*\n?\s*([\d\s]{40,})/) || texto.match(/(\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4})/);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, "") : null;
  if (!chaveAcesso || chaveAcesso.length !== 44) throw new Error("Achei os itens, mas não consegui achar a chave de acesso de 44 números — confere se colou o texto até o final da página.");

  const nomeMatch = texto.match(/DOCUMENTO AUXILIAR.*?\n+(.+?)\s*\nCNPJ:/s);
  const cnpjMatch = texto.match(/CNPJ:\s*([\d.\/-]+)/);
  /* Etapa sobre desconto de clube: rótulo confirmado contra nota real (Tere Hortifruti,
     "Descontos R$:12,26") — usado depois pra tentar explicar diferença sem mexer em preço às
     cegas, ver tentarExplicarDescontoClube. */
  const descontoMatch = texto.match(/Descontos?\s*R\$:?\s*([\d,]+)/i);
  /* Testado contra as 2 notas reais já usadas nessa conversa — bateu certo nas duas. */
  const dataMatch = texto.match(/Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const dataEmissao = dataMatch ? `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}` : null;

  /* Etapa sobre "quero TODAS as informações da original" — testado ponta a ponta contra o texto
     real da nota do Tere Hortifruti (com desconto e pagamento dividido em 2 formas). */
  let endereco = null;
  const cnpjIdx = texto.search(/CNPJ:\s*[\d.\/-]+/);
  if (cnpjIdx >= 0) {
    const candidata = texto.slice(cnpjIdx).split("\n").slice(1).find((l) => l.trim() && !/^Filtrar itens/i.test(l.trim()));
    if (candidata && !/Código:|Qtde\./.test(candidata)) endereco = candidata.trim();
  }
  const numSerieMatch = texto.match(/Número:\s*(\d+)\s*Série:\s*(\d+)/);
  const protocoloMatch = texto.match(/Protocolo de Autorização:\s*(\d+)/);
  /* Pagamento pode vir dividido em várias formas (ex: parte cartão, parte PIX) — cada linha é
     "NOME DA FORMAVALOR", às vezes sem espaço entre o nome e o valor, às vezes com — o regex
     aceita os dois formatos (testado contra as 2 notas reais já usadas nessa conversa). */
  const blocoPgtoMatch = texto.match(/Forma de pagamento:Valor pago R\$:\s*\n([\s\S]*?)(?:\n\s*\n|EMISSÃO)/);
  const formaPagamento = [];
  if (blocoPgtoMatch) {
    for (const linha of blocoPgtoMatch[1].split("\n")) {
      const lm = linha.match(/^(.+?)\s*([\d.]*\d,\d{2})$/);
      if (lm) formaPagamento.push({ nome: lm[1].trim(), valor: numDe(lm[2]) });
    }
  }
  const fcpMatch = texto.match(/Total do FCP:\s*R\$\s*([\d.,]+)/i);
  const fcpstMatch = texto.match(/Total do FCPST:\s*R\$\s*([\d.,]+)/i);
  /* Nem toda nota mostra a quebra Federal/Estadual/Municipal (a do Tere não mostra, só FCP/FCPST)
     — quando existir, captura; quando não, fica null sem quebrar nada (mesmo espírito do
     valor_desconto: melhor-esforço, falha em silêncio). */
  const tribAproxMatch = texto.match(/Federal\s*R\$\s*([\d.,]+).*?Estadual\s*R\$\s*([\d.,]+).*?Municipal\s*R\$\s*([\d.,]+)/is);

  return {
    chave_acesso: chaveAcesso, cnpj_emit: cnpjMatch ? cnpjMatch[1] : null, nome_emit: nomeMatch ? nomeMatch[1].trim() : null,
    endereco, data_emissao: dataEmissao, valor_total: valorTotal, valor_desconto: descontoMatch ? numDe(descontoMatch[1]) : null,
    numero_nota: numSerieMatch ? numSerieMatch[1] : null, serie_nota: numSerieMatch ? numSerieMatch[2] : null,
    protocolo_autorizacao: protocoloMatch ? protocoloMatch[1] : null, forma_pagamento: formaPagamento,
    tributos: {
      fcp: fcpMatch ? numDe(fcpMatch[1]) : null, fcpst: fcpstMatch ? numDe(fcpstMatch[1]) : null,
      federal: tribAproxMatch ? numDe(tribAproxMatch[1]) : null, estadual: tribAproxMatch ? numDe(tribAproxMatch[2]) : null, municipal: tribAproxMatch ? numDe(tribAproxMatch[3]) : null,
    },
    itens,
  };
}
/* Reserva pro scanner (seção 30): Safari/iOS não tem BarcodeDetector nativo — nenhum navegador
   no iPhone tem, é regra da Apple todo navegador ali usar o motor do Safari por baixo. A ZXing
   decodifica em JavaScript puro, funciona em qualquer navegador, carregada só sob demanda. */
let promessaZxingCarregado = null;
function precoPorUnidadeBase(item, variante) {
  if (item.preco_pago == null) return null;
  const preco = precoParaHistorico(item);
  /* Comprado direto por peso/volume (ex: balcão, granel) — já é o preço por unidade-base */
  if (item.unidade === "kg" || item.unidade === "l") {
    return { valor: preco, unidadeBase: item.unidade };
  }
  /* Comprado como pacote fechado — normaliza dividindo pelo tamanho do pacote */
  if (item.unidade === "un" && variante?.tamanho_quantidade && variante?.tamanho_unidade) {
    return { valor: preco / variante.tamanho_quantidade, unidadeBase: variante.tamanho_unidade };
  }
  return null;
}
function historicoNormalizado(sessoes, varianteId, variante) {
  const porUnidade = {};
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    for (const it of s.itens) {
      if (it.produto_variante_id !== varianteId) continue;
      const norm = precoPorUnidadeBase(it, variante);
      if (norm) (porUnidade[norm.unidadeBase] = porUnidade[norm.unidadeBase] || []).push(norm.valor);
    }
  }
  const entradas = Object.entries(porUnidade);
  if (!entradas.length) return null;
  const [unidadeBase, valores] = entradas.sort((a, b) => b[1].length - a[1].length)[0];
  return { media: valores.reduce((a, b) => a + b, 0) / valores.length, unidadeBase, n: valores.length };
}
function compararVariantes(catalogo, sessoes, varianteId) {
  const variante = by(catalogo.variantes, varianteId);
  if (!variante) return null;
  const atual = historicoNormalizado(sessoes, varianteId, variante);
  if (!atual) return null;
  const irmas = catalogo.variantes.filter((v) => v.produto_id === variante.produto_id && v.marca_id === variante.marca_id);
  const comparaveis = irmas
    .map((v) => { const norm = historicoNormalizado(sessoes, v.id, v); return norm && norm.unidadeBase === atual.unidadeBase ? { variante: v, normalizado: norm } : null; })
    .filter(Boolean)
    .sort((a, b) => a.normalizado.media - b.normalizado.media);
  return comparaveis.length > 1 ? comparaveis : null;
}
/* Quando o TAMANHO específico ainda não tem histórico (ex: comprou Nescau 950g pela primeira vez),
   deriva uma referência a partir do preço normalizado dos "irmãos" (mesmo produto+marca, outro tamanho) —
   sem isso, o indicador ▼/▲ simplesmente não tinha o que comparar. */
function precoReferenciaEntreTamanhos(catalogo, sessoes, varianteId) {
  const variante = by(catalogo.variantes, varianteId);
  if (!variante || !variante.tamanho_quantidade || !variante.tamanho_unidade) return null;
  const irmas = catalogo.variantes.filter((v) => v.produto_id === variante.produto_id && v.marca_id === variante.marca_id && v.id !== varianteId);
  const normalizados = irmas
    .map((v) => historicoNormalizado(sessoes, v.id, v))
    .filter((n) => n && n.unidadeBase === variante.tamanho_unidade);
  if (!normalizados.length) return null;
  const mediaNormalizada = normalizados.reduce((a, n) => a + n.media, 0) / normalizados.length;
  return mediaNormalizada * variante.tamanho_quantidade;
}
/* Todas as variantes de mesmo produto+marca (incluindo a própria) — usado pro gráfico comparativo entre tamanhos */
function todasVariantesIrmas(catalogo, varianteId) {
  const variante = by(catalogo.variantes, varianteId);
  if (!variante) return [];
  return catalogo.variantes.filter((v) => v.produto_id === variante.produto_id && v.marca_id === variante.marca_id);
}
/* Histórico cronológico já normalizado por unidade-base (R$/kg, R$/l ou R$/un) — pra plotar tamanhos diferentes
   no mesmo gráfico, correndo juntos no tempo, em vez do preço bruto (que não é comparável entre tamanhos). */
function historicoNormalizadoCronologico(sessoes, varianteId, variante) {
  const regs = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    for (const it of s.itens) {
      if (it.produto_variante_id !== varianteId) continue;
      const norm = precoPorUnidadeBase(it, variante);
      if (norm) regs.push({ preco: norm.valor, unidadeBase: norm.unidadeBase, data: s.data_hora, mercado_id: s.mercado_id });
    }
  }
  return regs.sort((a, b) => new Date(a.data) - new Date(b.data));
}
/* Sinaliza quando um valor de referência veio de estimativa por IA, ou de outro tamanho, em vez de histórico direto (seção 22.10) */
function referenciaComFonte(mediaRecente, mediaGeral, referenciaCruzada, estimativaIA) {
  if (mediaRecente != null) return { valor: mediaRecente, fonte: "real" };
  if (mediaGeral != null) return { valor: mediaGeral, fonte: "real" };
  if (referenciaCruzada != null) return { valor: referenciaCruzada, fonte: "cruzada" };
  if (estimativaIA != null) return { valor: estimativaIA, fonte: "ia" };
  return null;
}

/* =========================================================
   PROMOÇÕES (seção 24): "leve N pague M" e "desconto % com quantidade mínima".
   O preço NORMAL (sem desconto) é o que fica registrado pro histórico (via precoParaHistorico) —
   essas funções só calculam o preço EFETIVO, pra total/gasto real, sem tocar no preço normal.
========================================================= */
function calcularPrecoComPromocao(precoNormal, quantidade, promocao) {
  if (!promocao || precoNormal == null) return { precoEfetivo: precoNormal, ativada: true, faltam: 0 };
  if (promocao.tipo === "desconto_percentual") {
    const minima = promocao.quantidade_minima || 1;
    if (quantidade < minima) return { precoEfetivo: precoNormal, ativada: false, faltam: minima - quantidade };
    const precoEfetivo = precoNormal * (1 - (promocao.percentual || 0) / 100);
    return { precoEfetivo, ativada: true, faltam: 0 };
  }
  if (promocao.tipo === "leve_pague") {
    const leve = promocao.leve || 1, pague = promocao.pague || 1;
    if (quantidade < leve) return { precoEfetivo: precoNormal, ativada: false, faltam: leve - quantidade };
    const unidadesPagas = Math.floor(quantidade / leve) * pague + (quantidade % leve);
    const precoEfetivo = (precoNormal * unidadesPagas) / quantidade;
    return { precoEfetivo, ativada: true, faltam: 0 };
  }
  /* "Bloco": preço fechado por lote (ex: "1 é 8, 2 é 15" — comum em hortifrúti). Diferente do
     leve-pague: aqui não tem "unidade grátis", é um preço fixo pro bloco inteiro. Quantidade que
     não completa um bloco paga o preço normal por unidade (sem exigir mínimo pra começar). */
  if (promocao.tipo === "bloco") {
    const qtdBloco = promocao.quantidade_bloco || 1, precoBloco = promocao.preco_bloco ?? precoNormal;
    const blocosCompletos = Math.floor(quantidade / qtdBloco);
    const restante = quantidade % qtdBloco;
    const total = blocosCompletos * precoBloco + restante * precoNormal;
    const precoEfetivo = total / quantidade;
    return { precoEfetivo, ativada: true, faltam: restante > 0 ? qtdBloco - restante : 0 };
  }
  return { precoEfetivo: precoNormal, ativada: true, faltam: 0 };
}
function descontoEfetivoPercentual(precoNormal, precoEfetivo) {
  if (!precoNormal) return 0;
  return ((precoNormal - precoEfetivo) / precoNormal) * 100;
}
function textoPromocao(promocao) {
  if (!promocao) return "";
  if (promocao.tipo === "desconto_percentual") return `${promocao.percentual}% off (a partir de ${promocao.quantidade_minima} un.)`;
  if (promocao.tipo === "leve_pague") return `Leve ${promocao.leve}, pague ${promocao.pague}`;
  if (promocao.tipo === "bloco") return `${promocao.quantidade_bloco} por ${brl(promocao.preco_bloco)}`;
  return "";
}
/* Lista cronológica só das compras que tiveram promoção — usada na tela de histórico da variante */
function historicoPromocoes(sessoes, varianteId) {
  const regs = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    for (const it of s.itens) {
      if (it.produto_variante_id !== varianteId || !it.promocao || it.preco_normal == null || it.preco_pago == null) continue;
      regs.push({
        data: s.data_hora, mercado_id: s.mercado_id, promocao: it.promocao,
        precoNormal: it.preco_normal, precoEfetivo: it.preco_pago,
        economia: (it.preco_normal - it.preco_pago) * it.quantidade,
        descontoPercentual: descontoEfetivoPercentual(it.preco_normal, it.preco_pago),
      });
    }
  }
  return regs.sort((a, b) => new Date(a.data) - new Date(b.data));
}
/* Compara o desconto de UMA promoção com a média das OUTRAS promoções do mesmo item — "melhor/pior/igual" */
function indicadorPromocao(descontoAtual, todosDescontos, indiceAtual) {
  const outros = todosDescontos.filter((_, i) => i !== indiceAtual);
  if (!outros.length) return null;
  const media = outros.reduce((a, d) => a + d, 0) / outros.length;
  const diff = descontoAtual - media;
  if (diff > 3) return "melhor";
  if (diff < -3) return "pior";
  return "igual";
}

/* =========================================================
   PREÇO POR IA — seção 22.10 "preparar o terreno":
   cache passa de 1 valor por variante pra um HISTÓRICO (array) por variante.
   Cada "Atualizar" ACRESCENTA um ponto novo, não sobrescreve mais.
========================================================= */
function migrarPrecoIaCache(raw) {
  const migrado = {};
  for (const [id, val] of Object.entries(raw || {})) {
    if (Array.isArray(val)) migrado[id] = val;
    else if (val && typeof val === "object") migrado[id] = [val]; // formato antigo (1 objeto) vira historico de 1 ponto
  }
  return migrado;
}
function ultimaEstimativa(precoIaCache, varianteId) {
  const arr = precoIaCache[varianteId];
  return arr && arr.length ? arr[arr.length - 1] : null;
}
function adicionarEstimativa(precoIaCache, varianteId, estimativa) {
  const arr = precoIaCache[varianteId] || [];
  return { ...precoIaCache, [varianteId]: [...arr, { ...estimativa, consultado_em: new Date().toISOString() }] };
}

/* =========================================================
   EXPORTAÇÃO
========================================================= */
function exportarExcel(sessoes, catalogo) {
  const linhas = [];
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    const m = by(catalogo.mercados, s.mercado_id);
    for (const it of s.itens) {
      if (!it.comprado) continue;
      const v = by(catalogo.variantes, it.produto_variante_id);
      const p = v && by(catalogo.produtos, v.produto_id);
      const marca = v?.marca_id && by(catalogo.marcas, v.marca_id);
      const cat = p && by(catalogo.categorias, p.categoria_id);
      linhas.push({
        Data: new Date(s.data_hora).toLocaleDateString("pt-BR"),
        Mercado: m?.nome || "", Categoria: cat?.nome || "", Produto: p?.nome || "", Marca: marca?.nome || "",
        Quantidade: it.quantidade, Unidade: it.unidade, "Preço pago (R$)": it.preco_pago,
      });
    }
  }
  const porMes = {}, porMercado = {};
  for (const s of sessoes) {
    if (s.status !== "fechada") continue;
    const valor = s.valor_nota_fiscal ?? somarValores(...s.itens.map((it) => it.subtotal || 0));
    porMes[mesAno(s.data_hora)] = (porMes[mesAno(s.data_hora)] || 0) + valor;
    const nomeM = by(catalogo.mercados, s.mercado_id)?.nome || s.mercado_id;
    porMercado[nomeM] = (porMercado[nomeM] || 0) + valor;
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Compras");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(porMes).map(([k, v]) => ({ Mês: k, "Total (R$)": v }))), "Resumo por mes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(porMercado).map(([k, v]) => ({ Mercado: k, "Total (R$)": v }))), "Resumo por mercado");
  XLSX.writeFile(wb, `historico-nossa-casa-${dataParaArquivo()}.xlsx`);
}

/* =========================================================
   BUSCA DE PREÇO POR IA
========================================================= */
async function buscarPrecoIA(nome, marcaNome, tamanho, apiKey) {
  if (!apiKey) throw new Error("SEM_CHAVE");
  const descricao = `${nome}${marcaNome ? ", marca " + marcaNome : ""}${tamanho ? ", " + tamanho : ""}`;
  const prompt = `Pesquise na internet e estime o preço médio de mercado atual no Brasil para o produto: ${descricao}. Responda APENAS com um JSON válido, sem nenhum texto antes ou depois e sem markdown, exatamente neste formato: {"preco_min_estimado": numero, "preco_medio_estimado": numero, "preco_max_estimado": numero}`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "x-api-key": apiKey,
      "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("Erro da API (" + resp.status + "): " + t.slice(0, 150));
  }
  const data = await resp.json();
  const texto = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar a resposta.");
  return JSON.parse(match[0]);
}

/* =========================================================
   CAMPOS DA TABELA NUTRICIONAL
========================================================= */
const CAMPOS_NUTRICIONAIS = [
  { key: "porcao", label: "Porção", texto: true, placeholder: "ex: 30g" },
  { key: "porcoes_por_embalagem", label: "Porções/embalagem" },
  { key: "valor_energetico_kcal", label: "Valor energético (kcal)" },
  { key: "carboidratos_g", label: "Carboidratos (g)" },
  { key: "acucares_totais_g", label: "Açúcares totais (g)" },
  { key: "acucares_adicionados_g", label: "Açúcares adicionados (g)" },
  { key: "proteinas_g", label: "Proteínas (g)" },
  { key: "gorduras_totais_g", label: "Gorduras totais (g)" },
  { key: "gorduras_saturadas_g", label: "Gorduras saturadas (g)" },
  { key: "gorduras_trans_g", label: "Gorduras trans (g)" },
  { key: "fibra_alimentar_g", label: "Fibra alimentar (g)" },
  { key: "sodio_mg", label: "Sódio (mg)" },
];

const CORES_CATEGORIA = ["#2E6B4E","#C97A2E","#2E5F8A","#8A3B5C","#5C6B2E","#B23A3A","#6B4E9E","#4E9E8A","#9E4E6B","#4E6B9E","#9E8A4E","#6B9E4E","#8A4E9E","#4E9E4E","#9E6B4E"];
function corCategoria(catId, todasCategorias) {
  const idx = todasCategorias.findIndex((c) => c.id === catId);
  return CORES_CATEGORIA[idx >= 0 ? idx % CORES_CATEGORIA.length : 0];
}

/* =========================================================
   DADOS INICIAIS
========================================================= */
const SEED_CATALOGO = {
  "mercados": [
    {
      "id": "mercado_rio_sul",
      "nome": "Rio Sul",
      "razao_social": "",
      "cnpj": "",
      "telefone": "",
      "cor": "#2E6B4E",
      "endereco": "",
      "ativo": true,
      "ordem_categorias": []
    },
    {
      "id": "mercado_tere_frutas",
      "nome": "Tere Frutas",
      "razao_social": "",
      "cnpj": "",
      "telefone": "",
      "cor": "#C97A2E",
      "endereco": "",
      "ativo": true,
      "ordem_categorias": []
    }
  ],
  "categorias": [
    {
      "id": "cat_graos",
      "nome": "Grãos",
      "icone": "🌾"
    },
    {
      "id": "cat_oleos",
      "nome": "Óleos",
      "icone": "🛢️"
    },
    {
      "id": "cat_hortifruti",
      "nome": "Hortifruti",
      "icone": "🍅"
    },
    {
      "id": "cat_limpeza",
      "nome": "Limpeza",
      "icone": "🧼"
    },
    {
      "id": "cat_bebidas",
      "nome": "Bebidas",
      "icone": "🥤"
    },
    {
      "id": "cat_higiene",
      "nome": "Higiene",
      "icone": "🧻"
    },
    {
      "id": "cat_laticinios",
      "nome": "Laticínios",
      "icone": "🥛"
    },
    {
      "id": "cat_padaria",
      "nome": "Padaria",
      "icone": "🍞"
    },
    {
      "id": "cat_mercearia",
      "nome": "Mercearia",
      "icone": "🛒"
    },
    {
      "id": "cat_massas",
      "nome": "Massas",
      "icone": "🍝"
    },
    {
      "id": "cat_temperos",
      "nome": "Temperos e Condimentos",
      "icone": "🧂"
    },
    {
      "id": "cat_carnes",
      "nome": "Carnes e Peixes",
      "icone": "🥩"
    },
    {
      "id": "cat_ovos",
      "nome": "Ovos",
      "icone": "🥚"
    },
    {
      "id": "cat_congelados",
      "nome": "Congelados",
      "icone": "🧊"
    },
    {
      "id": "cat_enlatados",
      "nome": "Enlatados e Conservas",
      "icone": "🥫"
    }
  ],
  "produtos": [
    {
      "id": "prod_arroz",
      "nome": "Arroz Branco Tipo 1",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_feijao",
      "nome": "Feijão Carioca",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_oleo",
      "nome": "Óleo de Soja",
      "descricao": "",
      "categoria_id": "cat_oleos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_acucar",
      "nome": "Açúcar Refinado",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_cafe",
      "nome": "Café",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_sabao",
      "nome": "Sabão em Pó",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_detergente",
      "nome": "Detergente",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_papel",
      "nome": "Papel Higiênico",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_leite",
      "nome": "Leite Integral",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_tomate",
      "nome": "Tomate",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_cebola",
      "nome": "Cebola",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_banana",
      "nome": "Banana",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_pao",
      "nome": "Pão Francês",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_refrigerante",
      "nome": "Refrigerante",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_macarrao",
      "nome": "Macarrão",
      "descricao": "",
      "categoria_id": "cat_massas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_biscoito_maizena",
      "nome": "Biscoito Maizena",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_biscoito_creamcracker",
      "nome": "Biscoito Cream Cracker",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_paodeforma",
      "nome": "Pão de Forma",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_rosquinha",
      "nome": "Rosquinha",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_farinhalactea",
      "nome": "Farinha Láctea",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_achocolatado",
      "nome": "Achocolatado em Pó",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_mel",
      "nome": "Mel",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_azeite",
      "nome": "Azeite de Oliva",
      "descricao": "",
      "categoria_id": "cat_oleos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_vinagre",
      "nome": "Vinagre",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_pimenta",
      "nome": "Pimenta do Reino em Pó",
      "descricao": "Pura",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_ketchup",
      "nome": "Ketchup",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_farinhatrigo",
      "nome": "Farinha de Trigo",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_sal",
      "nome": "Sal Refinado",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_cerveja",
      "nome": "Cerveja",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_uvaverde",
      "nome": "Uva Verde",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_uvapreta",
      "nome": "Uva Preta",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_batatainglesa",
      "nome": "Batata Inglesa",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_abobrinha",
      "nome": "Abobrinha",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_beterraba",
      "nome": "Beterraba",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_mangapalmer",
      "nome": "Manga Palmer",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_mangatommy",
      "nome": "Manga Tommy",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_ponkan",
      "nome": "Ponkan (tangerina)",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_inhame",
      "nome": "Inhame",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_inhamecara",
      "nome": "Inhame Cará",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_alho",
      "nome": "Alho",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_pera",
      "nome": "Pera",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_queijomussarelafatiado",
      "nome": "Queijo Mussarela Fatiado",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_queijomussarelapedaco",
      "nome": "Queijo Mussarela em Pedaço",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_queijopratofatiado",
      "nome": "Queijo Prato Fatiado",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_queijominaspedaco",
      "nome": "Queijo Minas em Pedaço",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_danoninho",
      "nome": "Danoninho",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_ovodegalinha",
      "nome": "Ovo de Galinha",
      "descricao": "",
      "categoria_id": "cat_ovos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_peixecavalinha",
      "nome": "Peixe Cavalinha",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_peixetilapia",
      "nome": "Peixe Tilápia",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_peixemerluza",
      "nome": "Peixe Merluza",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_carneacem",
      "nome": "Carne Bovina Acém",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_carnemusculo",
      "nome": "Carne Bovina Músculo",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_carnealcatra",
      "nome": "Carne Bovina Alcatra",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_carnepatinho",
      "nome": "Carne Bovina Patinho",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_carreseuino",
      "nome": "Carne Suína Carré",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_capalombo",
      "nome": "Carne Suína Capa de Lombo",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_salsicha",
      "nome": "Salsicha",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_linguica",
      "nome": "Linguiça",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_feijao_preto",
      "nome": "Feijão Preto",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_lentilha",
      "nome": "Lentilha",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_grao_de_bico",
      "nome": "Grão de Bico",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_milho_de_pipoca",
      "nome": "Milho de Pipoca",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_aveia_em_flocos",
      "nome": "Aveia em Flocos",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_fuba",
      "nome": "Fubá",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_farinha_de_mandioca",
      "nome": "Farinha de Mandioca",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_quinoa",
      "nome": "Quinoa",
      "descricao": "",
      "categoria_id": "cat_graos",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_macarrao_instantaneo_miojo",
      "nome": "Macarrão Instantâneo (Miojo)",
      "descricao": "",
      "categoria_id": "cat_massas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_molho_de_tomate_pronto",
      "nome": "Molho de Tomate Pronto",
      "descricao": "",
      "categoria_id": "cat_massas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_massa_para_lasanha",
      "nome": "Massa para Lasanha",
      "descricao": "",
      "categoria_id": "cat_massas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_oleo_de_girassol",
      "nome": "Óleo de Girassol",
      "descricao": "",
      "categoria_id": "cat_oleos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_oleo_de_canola",
      "nome": "Óleo de Canola",
      "descricao": "",
      "categoria_id": "cat_oleos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_maionese",
      "nome": "Maionese",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_mostarda",
      "nome": "Mostarda",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_molho_shoyu",
      "nome": "Molho Shoyu",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_caldo_em_tablete",
      "nome": "Caldo em Tablete",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_oregano",
      "nome": "Orégano",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_colorau",
      "nome": "Colorau",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_extrato_de_tomate",
      "nome": "Extrato de Tomate",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_molho_ingles",
      "nome": "Molho Inglês",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_molho_de_pimenta",
      "nome": "Molho de Pimenta",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_adocante",
      "nome": "Adoçante",
      "descricao": "",
      "categoria_id": "cat_temperos",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_cenoura",
      "nome": "Cenoura",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_alface",
      "nome": "Alface",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_couve",
      "nome": "Couve",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_espinafre",
      "nome": "Espinafre",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_chuchu",
      "nome": "Chuchu",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_pepino",
      "nome": "Pepino",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_pimentao",
      "nome": "Pimentão",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_repolho",
      "nome": "Repolho",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_laranja",
      "nome": "Laranja",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_limao",
      "nome": "Limão",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_maca",
      "nome": "Maçã",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_mamao",
      "nome": "Mamão",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_melancia",
      "nome": "Melancia",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_abacaxi",
      "nome": "Abacaxi",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_morango",
      "nome": "Morango",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_coco",
      "nome": "Coco",
      "descricao": "",
      "categoria_id": "cat_hortifruti",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_frango_inteiro",
      "nome": "Frango Inteiro",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_peito_de_frango",
      "nome": "Peito de Frango",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_coxa_e_sobrecoxa_de_frango",
      "nome": "Coxa e Sobrecoxa de Frango",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_bacon",
      "nome": "Bacon",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_presunto_fatiado",
      "nome": "Presunto Fatiado",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_carne_moida",
      "nome": "Carne Moída",
      "descricao": "",
      "categoria_id": "cat_carnes",
      "unidade_padrao": "kg"
    },
    {
      "id": "prod_manteiga",
      "nome": "Manteiga",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_margarina",
      "nome": "Margarina",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_requeijao",
      "nome": "Requeijão",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_creme_de_leite",
      "nome": "Creme de Leite",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_leite_condensado",
      "nome": "Leite Condensado",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_iogurte_natural",
      "nome": "Iogurte Natural",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_leite_em_po",
      "nome": "Leite em Pó",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_queijo_parmesao_ralado",
      "nome": "Queijo Parmesão Ralado",
      "descricao": "",
      "categoria_id": "cat_laticinios",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_bolo_pronto",
      "nome": "Bolo Pronto",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_torradas",
      "nome": "Torradas",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_bisnaguinha",
      "nome": "Bisnaguinha",
      "descricao": "",
      "categoria_id": "cat_padaria",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_fermento_em_po_quimico",
      "nome": "Fermento em Pó Químico",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_fermento_biologico",
      "nome": "Fermento Biológico",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_gelatina_em_po",
      "nome": "Gelatina em Pó",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_pudim_em_po",
      "nome": "Pudim em Pó",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_cha_em_saquinho",
      "nome": "Chá em Saquinho",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_cereal_matinal",
      "nome": "Cereal Matinal",
      "descricao": "",
      "categoria_id": "cat_mercearia",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_suco_em_po",
      "nome": "Suco em Pó",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_suco_de_caixinha",
      "nome": "Suco de Caixinha",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_agua_mineral",
      "nome": "Água Mineral",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_refrigerante_guarana",
      "nome": "Refrigerante Guaraná",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_agua_de_coco",
      "nome": "Água de Coco",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_vinho_tinto",
      "nome": "Vinho Tinto",
      "descricao": "",
      "categoria_id": "cat_bebidas",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_agua_sanitaria",
      "nome": "Água Sanitária",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_amaciante_de_roupas",
      "nome": "Amaciante de Roupas",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_desinfetante",
      "nome": "Desinfetante",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_sabao_em_barra",
      "nome": "Sabão em Barra",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_esponja_de_aco_la_de_aco",
      "nome": "Esponja de Aço (Lã de Aço)",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_esponja_de_cozinha",
      "nome": "Esponja de Cozinha",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_saco_de_lixo",
      "nome": "Saco de Lixo",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_papel_toalha",
      "nome": "Papel Toalha",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_alcool_70",
      "nome": "Álcool 70%",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_limpador_multiuso",
      "nome": "Limpador Multiuso",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_alvejante",
      "nome": "Alvejante",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "l"
    },
    {
      "id": "prod_detergente_limpol",
      "nome": "Detergente Limpol",
      "descricao": "",
      "categoria_id": "cat_limpeza",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_sabonete",
      "nome": "Sabonete",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_shampoo",
      "nome": "Shampoo",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_condicionador",
      "nome": "Condicionador",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_creme_dental",
      "nome": "Creme Dental",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_escova_de_dente",
      "nome": "Escova de Dente",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_absorvente",
      "nome": "Absorvente",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_desodorante",
      "nome": "Desodorante",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_fralda_descartavel",
      "nome": "Fralda Descartável",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_cotonete",
      "nome": "Cotonete",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_fio_dental",
      "nome": "Fio Dental",
      "descricao": "",
      "categoria_id": "cat_higiene",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_hamburguer_congelado",
      "nome": "Hambúrguer Congelado",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_batata_frita_congelada",
      "nome": "Batata Frita Congelada",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_pizza_congelada",
      "nome": "Pizza Congelada",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_acai_congelado",
      "nome": "Açaí Congelado",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_nuggets_congelado",
      "nome": "Nuggets Congelado",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_polpa_de_fruta_congelada",
      "nome": "Polpa de Fruta Congelada",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_sorvete",
      "nome": "Sorvete",
      "descricao": "",
      "categoria_id": "cat_congelados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_milho_em_conserva",
      "nome": "Milho em Conserva",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_ervilha_em_conserva",
      "nome": "Ervilha em Conserva",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_atum_em_lata",
      "nome": "Atum em Lata",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_sardinha_em_lata",
      "nome": "Sardinha em Lata",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_palmito_em_conserva",
      "nome": "Palmito em Conserva",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    },
    {
      "id": "prod_azeitona",
      "nome": "Azeitona",
      "descricao": "",
      "categoria_id": "cat_enlatados",
      "unidade_padrao": "un"
    }
  ],
  "marcas": [
    {
      "id": "marca_tiojoao",
      "nome": "Tio João"
    },
    {
      "id": "marca_camil",
      "nome": "Camil"
    },
    {
      "id": "marca_soya",
      "nome": "Soya"
    },
    {
      "id": "marca_liza",
      "nome": "Liza"
    },
    {
      "id": "marca_uniao",
      "nome": "União"
    },
    {
      "id": "marca_pilao",
      "nome": "Pilão"
    },
    {
      "id": "marca_omo",
      "nome": "Omo"
    },
    {
      "id": "marca_ype",
      "nome": "Ypê"
    },
    {
      "id": "marca_neve",
      "nome": "Neve"
    },
    {
      "id": "marca_itambe",
      "nome": "Itambé"
    },
    {
      "id": "marca_cocacola",
      "nome": "Coca-Cola"
    },
    {
      "id": "marca_piracanjuba",
      "nome": "Piracanjuba"
    },
    {
      "id": "marca_ninho",
      "nome": "Ninho"
    },
    {
      "id": "marca_quissama",
      "nome": "Quissamã"
    },
    {
      "id": "marca_aldente",
      "nome": "Aldente"
    },
    {
      "id": "marca_favorito",
      "nome": "Favorito"
    },
    {
      "id": "marca_melitta",
      "nome": "Melitta"
    },
    {
      "id": "marca_terefrutas",
      "nome": "Tere Frutas"
    },
    {
      "id": "marca_gallo",
      "nome": "Gallo"
    },
    {
      "id": "marca_castelo",
      "nome": "Castelo"
    },
    {
      "id": "marca_predilecta",
      "nome": "Predilecta"
    },
    {
      "id": "marca_adria",
      "nome": "Adria"
    },
    {
      "id": "marca_eisenbahn",
      "nome": "Eisenbahn"
    },
    {
      "id": "marca_cisne",
      "nome": "Cisne"
    },
    {
      "id": "marca_danone",
      "nome": "Danone"
    },
    {
      "id": "marca_rancheiro",
      "nome": "Rancheiro"
    },
    {
      "id": "marca_sabor",
      "nome": "Sabor"
    },
    {
      "id": "marca_toddy",
      "nome": "Toddy"
    },
    {
      "id": "marca_nescau",
      "nome": "Nescau"
    },
    {
      "id": "marca_nestle",
      "nome": "Nestlé"
    },
    {
      "id": "marca_kicaldo",
      "nome": "Kicaldo"
    },
    {
      "id": "marca_yoki",
      "nome": "Yoki"
    },
    {
      "id": "marca_quaker",
      "nome": "Quaker"
    },
    {
      "id": "marca_nissin",
      "nome": "Nissin"
    },
    {
      "id": "marca_fugini",
      "nome": "Fugini"
    },
    {
      "id": "marca_quero",
      "nome": "Quero"
    },
    {
      "id": "marca_renata",
      "nome": "Renata"
    },
    {
      "id": "marca_hellmann_s",
      "nome": "Hellmann's"
    },
    {
      "id": "marca_hemmer",
      "nome": "Hemmer"
    },
    {
      "id": "marca_sakura",
      "nome": "Sakura"
    },
    {
      "id": "marca_knorr",
      "nome": "Knorr"
    },
    {
      "id": "marca_maggi",
      "nome": "Maggi"
    },
    {
      "id": "marca_elefante",
      "nome": "Elefante"
    },
    {
      "id": "marca_lea_perrins",
      "nome": "Lea & Perrins"
    },
    {
      "id": "marca_zero_cal",
      "nome": "Zero-Cal"
    },
    {
      "id": "marca_sadia",
      "nome": "Sadia"
    },
    {
      "id": "marca_perdigao",
      "nome": "Perdigão"
    },
    {
      "id": "marca_seara",
      "nome": "Seara"
    },
    {
      "id": "marca_aviacao",
      "nome": "Aviação"
    },
    {
      "id": "marca_qualy",
      "nome": "Qualy"
    },
    {
      "id": "marca_catupiry",
      "nome": "Catupiry"
    },
    {
      "id": "marca_moca",
      "nome": "Moça"
    },
    {
      "id": "marca_ana_maria",
      "nome": "Ana Maria"
    },
    {
      "id": "marca_bauducco",
      "nome": "Bauducco"
    },
    {
      "id": "marca_pullman",
      "nome": "Pullman"
    },
    {
      "id": "marca_wickbold",
      "nome": "Wickbold"
    },
    {
      "id": "marca_royal",
      "nome": "Royal"
    },
    {
      "id": "marca_fleischmann",
      "nome": "Fleischmann"
    },
    {
      "id": "marca_leao",
      "nome": "Leão"
    },
    {
      "id": "marca_sucrilhos",
      "nome": "Sucrilhos"
    },
    {
      "id": "marca_tang",
      "nome": "Tang"
    },
    {
      "id": "marca_del_valle",
      "nome": "Del Valle"
    },
    {
      "id": "marca_guarana_antarctica",
      "nome": "Guaraná Antarctica"
    },
    {
      "id": "marca_qboa",
      "nome": "Qboa"
    },
    {
      "id": "marca_candida",
      "nome": "Cândida"
    },
    {
      "id": "marca_comfort",
      "nome": "Comfort"
    },
    {
      "id": "marca_downy",
      "nome": "Downy"
    },
    {
      "id": "marca_pinho_sol",
      "nome": "Pinho Sol"
    },
    {
      "id": "marca_bombril",
      "nome": "Bombril"
    },
    {
      "id": "marca_scotch_brite",
      "nome": "Scotch-Brite"
    },
    {
      "id": "marca_snob",
      "nome": "Snob"
    },
    {
      "id": "marca_veja",
      "nome": "Veja"
    },
    {
      "id": "marca_vanish",
      "nome": "Vanish"
    },
    {
      "id": "marca_limpol",
      "nome": "Limpol"
    },
    {
      "id": "marca_dove",
      "nome": "Dove"
    },
    {
      "id": "marca_lux",
      "nome": "Lux"
    },
    {
      "id": "marca_seda",
      "nome": "Seda"
    },
    {
      "id": "marca_pantene",
      "nome": "Pantene"
    },
    {
      "id": "marca_colgate",
      "nome": "Colgate"
    },
    {
      "id": "marca_sorriso",
      "nome": "Sorriso"
    },
    {
      "id": "marca_oral_b",
      "nome": "Oral-B"
    },
    {
      "id": "marca_always",
      "nome": "Always"
    },
    {
      "id": "marca_sempre_livre",
      "nome": "Sempre Livre"
    },
    {
      "id": "marca_rexona",
      "nome": "Rexona"
    },
    {
      "id": "marca_nivea",
      "nome": "Nivea"
    },
    {
      "id": "marca_pampers",
      "nome": "Pampers"
    },
    {
      "id": "marca_huggies",
      "nome": "Huggies"
    },
    {
      "id": "marca_johnson_s",
      "nome": "Johnson's"
    },
    {
      "id": "marca_mccain",
      "nome": "McCain"
    },
    {
      "id": "marca_kibon",
      "nome": "Kibon"
    },
    {
      "id": "marca_bonduelle",
      "nome": "Bonduelle"
    },
    {
      "id": "marca_gomes_da_costa",
      "nome": "Gomes da Costa"
    },
    {
      "id": "marca_caravelas",
      "nome": "Caravelas"
    }
  ],
  "variantes": [
    {
      "id": "var_arroz_tiojoao_5kg",
      "produto_id": "prod_arroz",
      "marca_id": "marca_tiojoao",
      "tamanho": "5kg",
      "tamanho_quantidade": 5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_arroz_camil_5kg",
      "produto_id": "prod_arroz",
      "marca_id": "marca_camil",
      "tamanho": "5kg",
      "tamanho_quantidade": 5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_feijao_camil_1kg",
      "produto_id": "prod_feijao",
      "marca_id": "marca_camil",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_oleo_soya_900ml",
      "produto_id": "prod_oleo",
      "marca_id": "marca_soya",
      "tamanho": "900ml",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_oleo_liza_900ml",
      "produto_id": "prod_oleo",
      "marca_id": "marca_liza",
      "tamanho": "900ml",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_acucar_uniao_1kg",
      "produto_id": "prod_acucar",
      "marca_id": "marca_uniao",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cafe_pilao_500g",
      "produto_id": "prod_cafe",
      "marca_id": "marca_pilao",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sabao_omo_1kg",
      "produto_id": "prod_sabao",
      "marca_id": "marca_omo",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_detergente_ype_500ml",
      "produto_id": "prod_detergente",
      "marca_id": "marca_ype",
      "tamanho": "500ml",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_papel_neve_12un",
      "produto_id": "prod_papel",
      "marca_id": "marca_neve",
      "tamanho": "pacote 12un",
      "tamanho_quantidade": 12,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_itambe_1l",
      "produto_id": "prod_leite",
      "marca_id": "marca_itambe",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_tomate_kg",
      "produto_id": "prod_tomate",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cebola_kg",
      "produto_id": "prod_cebola",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_banana_kg",
      "produto_id": "prod_banana",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pao_kg",
      "produto_id": "prod_pao",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_refrigerante_cocacola_2l",
      "produto_id": "prod_refrigerante",
      "marca_id": "marca_cocacola",
      "tamanho": "2l",
      "tamanho_quantidade": 2,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_piracanjuba_1l",
      "produto_id": "prod_leite",
      "marca_id": "marca_piracanjuba",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_ninho_1l",
      "produto_id": "prod_leite",
      "marca_id": "marca_ninho",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_quissama_1l",
      "produto_id": "prod_leite",
      "marca_id": "marca_quissama",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_macarrao_aldente_espaguete_1kg",
      "produto_id": "prod_macarrao",
      "marca_id": "marca_aldente",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "Espaguete",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_macarrao_aldente_talharim_500g",
      "produto_id": "prod_macarrao",
      "marca_id": "marca_aldente",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "Talharim",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cafe_favorito_500g",
      "produto_id": "prod_cafe",
      "marca_id": "marca_favorito",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cafe_favorito_250g",
      "produto_id": "prod_cafe",
      "marca_id": "marca_favorito",
      "tamanho": "250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cafe_melitta_250g",
      "produto_id": "prod_cafe",
      "marca_id": "marca_melitta",
      "tamanho": "250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cafe_melitta_500g",
      "produto_id": "prod_cafe",
      "marca_id": "marca_melitta",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_biscoito_maizena_200g",
      "produto_id": "prod_biscoito_maizena",
      "marca_id": null,
      "tamanho": "200g (aprox. — confirme a marca que você compra)",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_biscoito_creamcracker_200g",
      "produto_id": "prod_biscoito_creamcracker",
      "marca_id": null,
      "tamanho": "200g (aprox. — confirme a marca que você compra)",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_paodeforma_500g",
      "produto_id": "prod_paodeforma",
      "marca_id": null,
      "tamanho": "500g (aprox. — confirme a marca)",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_rosquinha_rancheiro_300g",
      "produto_id": "prod_rosquinha",
      "marca_id": "marca_rancheiro",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "Coco (confirme o sabor)",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_farinhalactea_nestle_360g",
      "produto_id": "prod_farinhalactea",
      "marca_id": "marca_nestle",
      "tamanho": "360g",
      "tamanho_quantidade": 0.36,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_arroz_terefrutas_5kg",
      "produto_id": "prod_arroz",
      "marca_id": "marca_terefrutas",
      "tamanho": "5kg",
      "tamanho_quantidade": 5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_achocolatado_toddy_750g",
      "produto_id": "prod_achocolatado",
      "marca_id": "marca_toddy",
      "tamanho": "750g",
      "tamanho_quantidade": 0.75,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_achocolatado_nescau_350g",
      "produto_id": "prod_achocolatado",
      "marca_id": "marca_nescau",
      "tamanho": "350g",
      "tamanho_quantidade": 0.35,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_mel_terefrutas_500g",
      "produto_id": "prod_mel",
      "marca_id": "marca_terefrutas",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_azeite_gallo_classico_500ml",
      "produto_id": "prod_azeite",
      "marca_id": "marca_gallo",
      "tamanho": "500ml",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "Clássico",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_vinagre_castelo_alcool_750ml",
      "produto_id": "prod_vinagre",
      "marca_id": "marca_castelo",
      "tamanho": "750ml",
      "tamanho_quantidade": 0.75,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "de Álcool",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pimenta_sabor_30g",
      "produto_id": "prod_pimenta",
      "marca_id": "marca_sabor",
      "tamanho": "30g",
      "tamanho_quantidade": 0.03,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_uvaverde_kg",
      "produto_id": "prod_uvaverde",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_uvapreta_kg",
      "produto_id": "prod_uvapreta",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_ketchup_predilecta_400g",
      "produto_id": "prod_ketchup",
      "marca_id": "marca_predilecta",
      "tamanho": "400g",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_ovodegalinha_20un",
      "produto_id": "prod_ovodegalinha",
      "marca_id": null,
      "tamanho": "bandeja 20un",
      "tamanho_quantidade": 20,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_ovodegalinha_30un",
      "produto_id": "prod_ovodegalinha",
      "marca_id": null,
      "tamanho": "bandeja 30un",
      "tamanho_quantidade": 30,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_acucar_caravelas_1kg",
      "produto_id": "prod_acucar",
      "marca_id": "marca_caravelas",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_farinhatrigo_adria_1kg",
      "produto_id": "prod_farinhatrigo",
      "marca_id": "marca_adria",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_batatainglesa_kg",
      "produto_id": "prod_batatainglesa",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_abobrinha_kg",
      "produto_id": "prod_abobrinha",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_beterraba_kg",
      "produto_id": "prod_beterraba",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cerveja_eisenbahn_473ml",
      "produto_id": "prod_cerveja",
      "marca_id": "marca_eisenbahn",
      "tamanho": "lata 473ml",
      "tamanho_quantidade": 0.473,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_mangapalmer_kg",
      "produto_id": "prod_mangapalmer",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_mangatommy_kg",
      "produto_id": "prod_mangatommy",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_ponkan_kg",
      "produto_id": "prod_ponkan",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_inhame_kg",
      "produto_id": "prod_inhame",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_inhamecara_kg",
      "produto_id": "prod_inhamecara",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sal_cisne_1kg",
      "produto_id": "prod_sal",
      "marca_id": "marca_cisne",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_alho_kg",
      "produto_id": "prod_alho",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pera_kg",
      "produto_id": "prod_pera",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_queijomussarelafatiado_150g",
      "produto_id": "prod_queijomussarelafatiado",
      "marca_id": null,
      "tamanho": "150g (aprox. — confirme a marca)",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_queijomussarelapedaco_kg",
      "produto_id": "prod_queijomussarelapedaco",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_queijopratofatiado_150g",
      "produto_id": "prod_queijopratofatiado",
      "marca_id": null,
      "tamanho": "150g (aprox. — confirme a marca)",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_queijominaspedaco_kg",
      "produto_id": "prod_queijominaspedaco",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_danoninho_danone_600g",
      "produto_id": "prod_danoninho",
      "marca_id": "marca_danone",
      "tamanho": "pack 6x100g",
      "tamanho_quantidade": 0.6,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "Pack com 6 unidades de 100g",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_peixecavalinha_kg",
      "produto_id": "prod_peixecavalinha",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_peixetilapia_kg",
      "produto_id": "prod_peixetilapia",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_peixemerluza_kg",
      "produto_id": "prod_peixemerluza",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carneacem_kg",
      "produto_id": "prod_carneacem",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carnemusculo_kg",
      "produto_id": "prod_carnemusculo",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carnealcatra_kg",
      "produto_id": "prod_carnealcatra",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carnepatinho_kg",
      "produto_id": "prod_carnepatinho",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carreseuino_kg",
      "produto_id": "prod_carreseuino",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_capalombo_kg",
      "produto_id": "prod_capalombo",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_salsicha_500g",
      "produto_id": "prod_salsicha",
      "marca_id": null,
      "tamanho": "500g (aprox. — confirme a marca/tamanho)",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_linguica_kg",
      "produto_id": "prod_linguica",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_feijao_preto_camil_1kg",
      "produto_id": "prod_feijao_preto",
      "marca_id": "marca_camil",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_feijao_preto_kicaldo_1kg",
      "produto_id": "prod_feijao_preto",
      "marca_id": "marca_kicaldo",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_lentilha_generico_500g",
      "produto_id": "prod_lentilha",
      "marca_id": null,
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_grao_de_bico_generico_500g",
      "produto_id": "prod_grao_de_bico",
      "marca_id": null,
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_milho_de_pipoca_yoki_500g",
      "produto_id": "prod_milho_de_pipoca",
      "marca_id": "marca_yoki",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_aveia_em_flocos_quaker_170g",
      "produto_id": "prod_aveia_em_flocos",
      "marca_id": "marca_quaker",
      "tamanho": "170g",
      "tamanho_quantidade": 0.17,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fuba_yoki_1kg",
      "produto_id": "prod_fuba",
      "marca_id": "marca_yoki",
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_farinha_de_mandioca_generico_1kg",
      "produto_id": "prod_farinha_de_mandioca",
      "marca_id": null,
      "tamanho": "1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_quinoa_generico_250g",
      "produto_id": "prod_quinoa",
      "marca_id": null,
      "tamanho": "250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_macarrao_instantaneo_miojo_nissin_85g",
      "produto_id": "prod_macarrao_instantaneo_miojo",
      "marca_id": "marca_nissin",
      "tamanho": "85g",
      "tamanho_quantidade": 0.085,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_molho_de_tomate_pronto_fugini_340g",
      "produto_id": "prod_molho_de_tomate_pronto",
      "marca_id": "marca_fugini",
      "tamanho": "340g",
      "tamanho_quantidade": 0.34,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_molho_de_tomate_pronto_quero_340g",
      "produto_id": "prod_molho_de_tomate_pronto",
      "marca_id": "marca_quero",
      "tamanho": "340g",
      "tamanho_quantidade": 0.34,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_massa_para_lasanha_renata_500g",
      "produto_id": "prod_massa_para_lasanha",
      "marca_id": "marca_renata",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_oleo_de_girassol_generico_900ml",
      "produto_id": "prod_oleo_de_girassol",
      "marca_id": null,
      "tamanho": "900ml",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_oleo_de_canola_generico_900ml",
      "produto_id": "prod_oleo_de_canola",
      "marca_id": null,
      "tamanho": "900ml",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_maionese_hellmann_s_500g",
      "produto_id": "prod_maionese",
      "marca_id": "marca_hellmann_s",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_mostarda_hemmer_200g",
      "produto_id": "prod_mostarda",
      "marca_id": "marca_hemmer",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_molho_shoyu_sakura_150ml",
      "produto_id": "prod_molho_shoyu",
      "marca_id": "marca_sakura",
      "tamanho": "150ml",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_caldo_em_tablete_knorr_57g_6_tabletes",
      "produto_id": "prod_caldo_em_tablete",
      "marca_id": "marca_knorr",
      "tamanho": "57g (6 tabletes)",
      "tamanho_quantidade": 0.057,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_caldo_em_tablete_maggi_57g_6_tabletes",
      "produto_id": "prod_caldo_em_tablete",
      "marca_id": "marca_maggi",
      "tamanho": "57g (6 tabletes)",
      "tamanho_quantidade": 0.057,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_oregano_generico_10g",
      "produto_id": "prod_oregano",
      "marca_id": null,
      "tamanho": "10g",
      "tamanho_quantidade": 0.01,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_colorau_generico_100g",
      "produto_id": "prod_colorau",
      "marca_id": null,
      "tamanho": "100g",
      "tamanho_quantidade": 0.1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_extrato_de_tomate_elefante_340g",
      "produto_id": "prod_extrato_de_tomate",
      "marca_id": "marca_elefante",
      "tamanho": "340g",
      "tamanho_quantidade": 0.34,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_molho_ingles_lea_perrins_150ml",
      "produto_id": "prod_molho_ingles",
      "marca_id": "marca_lea_perrins",
      "tamanho": "150ml",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_molho_de_pimenta_generico_150ml",
      "produto_id": "prod_molho_de_pimenta",
      "marca_id": null,
      "tamanho": "150ml",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_adocante_zero_cal_100ml",
      "produto_id": "prod_adocante",
      "marca_id": "marca_zero_cal",
      "tamanho": "100ml",
      "tamanho_quantidade": 0.1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cenoura_generico_kg",
      "produto_id": "prod_cenoura",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_alface_generico_unidade",
      "produto_id": "prod_alface",
      "marca_id": null,
      "tamanho": "unidade",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_couve_generico_maco",
      "produto_id": "prod_couve",
      "marca_id": null,
      "tamanho": "maço",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_espinafre_generico_maco",
      "produto_id": "prod_espinafre",
      "marca_id": null,
      "tamanho": "maço",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_chuchu_generico_kg",
      "produto_id": "prod_chuchu",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pepino_generico_kg",
      "produto_id": "prod_pepino",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pimentao_generico_kg",
      "produto_id": "prod_pimentao",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_repolho_generico_kg",
      "produto_id": "prod_repolho",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_laranja_generico_kg",
      "produto_id": "prod_laranja",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_limao_generico_kg",
      "produto_id": "prod_limao",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_maca_generico_kg",
      "produto_id": "prod_maca",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_mamao_generico_kg",
      "produto_id": "prod_mamao",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_melancia_generico_kg",
      "produto_id": "prod_melancia",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_abacaxi_generico_unidade",
      "produto_id": "prod_abacaxi",
      "marca_id": null,
      "tamanho": "unidade",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_morango_generico_bandeja_250g",
      "produto_id": "prod_morango",
      "marca_id": null,
      "tamanho": "bandeja 250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_coco_generico_unidade",
      "produto_id": "prod_coco",
      "marca_id": null,
      "tamanho": "unidade",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_frango_inteiro_generico_kg",
      "produto_id": "prod_frango_inteiro",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_peito_de_frango_generico_kg",
      "produto_id": "prod_peito_de_frango",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_coxa_e_sobrecoxa_de_frango_generico_kg",
      "produto_id": "prod_coxa_e_sobrecoxa_de_frango",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_bacon_sadia_250g",
      "produto_id": "prod_bacon",
      "marca_id": "marca_sadia",
      "tamanho": "250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_bacon_perdigao_250g",
      "produto_id": "prod_bacon",
      "marca_id": "marca_perdigao",
      "tamanho": "250g",
      "tamanho_quantidade": 0.25,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_presunto_fatiado_sadia_200g",
      "produto_id": "prod_presunto_fatiado",
      "marca_id": "marca_sadia",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_presunto_fatiado_seara_200g",
      "produto_id": "prod_presunto_fatiado",
      "marca_id": "marca_seara",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_carne_moida_generico_kg",
      "produto_id": "prod_carne_moida",
      "marca_id": null,
      "tamanho": "kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_manteiga_aviacao_200g",
      "produto_id": "prod_manteiga",
      "marca_id": "marca_aviacao",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_manteiga_itambe_200g",
      "produto_id": "prod_manteiga",
      "marca_id": "marca_itambe",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_margarina_qualy_500g",
      "produto_id": "prod_margarina",
      "marca_id": "marca_qualy",
      "tamanho": "500g",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_requeijao_catupiry_200g",
      "produto_id": "prod_requeijao",
      "marca_id": "marca_catupiry",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_requeijao_itambe_200g",
      "produto_id": "prod_requeijao",
      "marca_id": "marca_itambe",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_creme_de_leite_nestle_200g",
      "produto_id": "prod_creme_de_leite",
      "marca_id": "marca_nestle",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_creme_de_leite_itambe_200g",
      "produto_id": "prod_creme_de_leite",
      "marca_id": "marca_itambe",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_condensado_moca_395g",
      "produto_id": "prod_leite_condensado",
      "marca_id": "marca_moca",
      "tamanho": "395g",
      "tamanho_quantidade": 0.395,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_condensado_itambe_395g",
      "produto_id": "prod_leite_condensado",
      "marca_id": "marca_itambe",
      "tamanho": "395g",
      "tamanho_quantidade": 0.395,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_iogurte_natural_itambe_900g",
      "produto_id": "prod_iogurte_natural",
      "marca_id": "marca_itambe",
      "tamanho": "900g",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_iogurte_natural_danone_900g",
      "produto_id": "prod_iogurte_natural",
      "marca_id": "marca_danone",
      "tamanho": "900g",
      "tamanho_quantidade": 0.9,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_em_po_ninho_400g",
      "produto_id": "prod_leite_em_po",
      "marca_id": "marca_ninho",
      "tamanho": "400g",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_leite_em_po_itambe_400g",
      "produto_id": "prod_leite_em_po",
      "marca_id": "marca_itambe",
      "tamanho": "400g",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_queijo_parmesao_ralado_itambe_50g",
      "produto_id": "prod_queijo_parmesao_ralado",
      "marca_id": "marca_itambe",
      "tamanho": "50g",
      "tamanho_quantidade": 0.05,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_bolo_pronto_ana_maria_400g",
      "produto_id": "prod_bolo_pronto",
      "marca_id": "marca_ana_maria",
      "tamanho": "400g",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_torradas_bauducco_160g",
      "produto_id": "prod_torradas",
      "marca_id": "marca_bauducco",
      "tamanho": "160g",
      "tamanho_quantidade": 0.16,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_bisnaguinha_pullman_300g",
      "produto_id": "prod_bisnaguinha",
      "marca_id": "marca_pullman",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_bisnaguinha_wickbold_300g",
      "produto_id": "prod_bisnaguinha",
      "marca_id": "marca_wickbold",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fermento_em_po_quimico_royal_100g",
      "produto_id": "prod_fermento_em_po_quimico",
      "marca_id": "marca_royal",
      "tamanho": "100g",
      "tamanho_quantidade": 0.1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fermento_biologico_fleischmann_10g",
      "produto_id": "prod_fermento_biologico",
      "marca_id": "marca_fleischmann",
      "tamanho": "10g",
      "tamanho_quantidade": 0.01,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_gelatina_em_po_royal_20g",
      "produto_id": "prod_gelatina_em_po",
      "marca_id": "marca_royal",
      "tamanho": "20g",
      "tamanho_quantidade": 0.02,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pudim_em_po_royal_40g",
      "produto_id": "prod_pudim_em_po",
      "marca_id": "marca_royal",
      "tamanho": "40g",
      "tamanho_quantidade": 0.04,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cha_em_saquinho_leao_10_saquinhos",
      "produto_id": "prod_cha_em_saquinho",
      "marca_id": "marca_leao",
      "tamanho": "10 saquinhos",
      "tamanho_quantidade": 0.02,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cereal_matinal_sucrilhos_300g",
      "produto_id": "prod_cereal_matinal",
      "marca_id": "marca_sucrilhos",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_suco_em_po_tang_25g_rende_1l",
      "produto_id": "prod_suco_em_po",
      "marca_id": "marca_tang",
      "tamanho": "25g (rende 1l)",
      "tamanho_quantidade": 0.025,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_suco_de_caixinha_del_valle_1l",
      "produto_id": "prod_suco_de_caixinha",
      "marca_id": "marca_del_valle",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_agua_mineral_generico_garrafa_1_5l",
      "produto_id": "prod_agua_mineral",
      "marca_id": null,
      "tamanho": "garrafa 1,5l",
      "tamanho_quantidade": 1.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_refrigerante_guarana_guarana_antarctica_2l",
      "produto_id": "prod_refrigerante_guarana",
      "marca_id": "marca_guarana_antarctica",
      "tamanho": "2l",
      "tamanho_quantidade": 2,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_agua_de_coco_generico_1l",
      "produto_id": "prod_agua_de_coco",
      "marca_id": null,
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_vinho_tinto_generico_garrafa_750ml",
      "produto_id": "prod_vinho_tinto",
      "marca_id": null,
      "tamanho": "garrafa 750ml",
      "tamanho_quantidade": 0.75,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_agua_sanitaria_qboa_1l",
      "produto_id": "prod_agua_sanitaria",
      "marca_id": "marca_qboa",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_agua_sanitaria_candida_1l",
      "produto_id": "prod_agua_sanitaria",
      "marca_id": "marca_candida",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_amaciante_de_roupas_comfort_1l",
      "produto_id": "prod_amaciante_de_roupas",
      "marca_id": "marca_comfort",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_amaciante_de_roupas_downy_1l",
      "produto_id": "prod_amaciante_de_roupas",
      "marca_id": "marca_downy",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_desinfetante_pinho_sol_1l",
      "produto_id": "prod_desinfetante",
      "marca_id": "marca_pinho_sol",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sabao_em_barra_ype_5x200g",
      "produto_id": "prod_sabao_em_barra",
      "marca_id": "marca_ype",
      "tamanho": "5x200g",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_esponja_de_aco_la_de_aco_bombril_pacote_c_8",
      "produto_id": "prod_esponja_de_aco_la_de_aco",
      "marca_id": "marca_bombril",
      "tamanho": "pacote c/8",
      "tamanho_quantidade": 0.24,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_esponja_de_cozinha_scotch_brite_pacote_c_3",
      "produto_id": "prod_esponja_de_cozinha",
      "marca_id": "marca_scotch_brite",
      "tamanho": "pacote c/3",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_saco_de_lixo_generico_rolo_c_10_50l",
      "produto_id": "prod_saco_de_lixo",
      "marca_id": null,
      "tamanho": "rolo c/10 · 50l",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_papel_toalha_snob_pacote_c_2",
      "produto_id": "prod_papel_toalha",
      "marca_id": "marca_snob",
      "tamanho": "pacote c/2",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_alcool_70_generico_1l",
      "produto_id": "prod_alcool_70",
      "marca_id": null,
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_limpador_multiuso_veja_500ml",
      "produto_id": "prod_limpador_multiuso",
      "marca_id": "marca_veja",
      "tamanho": "500ml",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_alvejante_vanish_1l",
      "produto_id": "prod_alvejante",
      "marca_id": "marca_vanish",
      "tamanho": "1l",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_detergente_limpol_limpol_500ml",
      "produto_id": "prod_detergente_limpol",
      "marca_id": "marca_limpol",
      "tamanho": "500ml",
      "tamanho_quantidade": 0.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sabonete_dove_90g",
      "produto_id": "prod_sabonete",
      "marca_id": "marca_dove",
      "tamanho": "90g",
      "tamanho_quantidade": 0.09,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sabonete_lux_90g",
      "produto_id": "prod_sabonete",
      "marca_id": "marca_lux",
      "tamanho": "90g",
      "tamanho_quantidade": 0.09,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_shampoo_seda_325ml",
      "produto_id": "prod_shampoo",
      "marca_id": "marca_seda",
      "tamanho": "325ml",
      "tamanho_quantidade": 0.325,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_shampoo_pantene_400ml",
      "produto_id": "prod_shampoo",
      "marca_id": "marca_pantene",
      "tamanho": "400ml",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_condicionador_seda_325ml",
      "produto_id": "prod_condicionador",
      "marca_id": "marca_seda",
      "tamanho": "325ml",
      "tamanho_quantidade": 0.325,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_creme_dental_colgate_90g",
      "produto_id": "prod_creme_dental",
      "marca_id": "marca_colgate",
      "tamanho": "90g",
      "tamanho_quantidade": 0.09,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_creme_dental_sorriso_90g",
      "produto_id": "prod_creme_dental",
      "marca_id": "marca_sorriso",
      "tamanho": "90g",
      "tamanho_quantidade": 0.09,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_escova_de_dente_oral_b_unidade",
      "produto_id": "prod_escova_de_dente",
      "marca_id": "marca_oral_b",
      "tamanho": "unidade",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_absorvente_always_pacote_c_8",
      "produto_id": "prod_absorvente",
      "marca_id": "marca_always",
      "tamanho": "pacote c/8",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_absorvente_sempre_livre_pacote_c_8",
      "produto_id": "prod_absorvente",
      "marca_id": "marca_sempre_livre",
      "tamanho": "pacote c/8",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_desodorante_rexona_150ml",
      "produto_id": "prod_desodorante",
      "marca_id": "marca_rexona",
      "tamanho": "150ml",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_desodorante_nivea_150ml",
      "produto_id": "prod_desodorante",
      "marca_id": "marca_nivea",
      "tamanho": "150ml",
      "tamanho_quantidade": 0.15,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fralda_descartavel_pampers_pacote_m",
      "produto_id": "prod_fralda_descartavel",
      "marca_id": "marca_pampers",
      "tamanho": "pacote M",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fralda_descartavel_huggies_pacote_m",
      "produto_id": "prod_fralda_descartavel",
      "marca_id": "marca_huggies",
      "tamanho": "pacote M",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_cotonete_johnson_s_pacote_c_75",
      "produto_id": "prod_cotonete",
      "marca_id": "marca_johnson_s",
      "tamanho": "pacote c/75",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_fio_dental_oral_b_50m",
      "produto_id": "prod_fio_dental",
      "marca_id": "marca_oral_b",
      "tamanho": "50m",
      "tamanho_quantidade": null,
      "tamanho_unidade": "un",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_hamburguer_congelado_sadia_672g_12un",
      "produto_id": "prod_hamburguer_congelado",
      "marca_id": "marca_sadia",
      "tamanho": "672g (12un)",
      "tamanho_quantidade": 0.672,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_hamburguer_congelado_seara_672g_12un",
      "produto_id": "prod_hamburguer_congelado",
      "marca_id": "marca_seara",
      "tamanho": "672g (12un)",
      "tamanho_quantidade": 0.672,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_batata_frita_congelada_mccain_400g",
      "produto_id": "prod_batata_frita_congelada",
      "marca_id": "marca_mccain",
      "tamanho": "400g",
      "tamanho_quantidade": 0.4,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_pizza_congelada_sadia_460g",
      "produto_id": "prod_pizza_congelada",
      "marca_id": "marca_sadia",
      "tamanho": "460g",
      "tamanho_quantidade": 0.46,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_acai_congelado_generico_pacote_1kg",
      "produto_id": "prod_acai_congelado",
      "marca_id": null,
      "tamanho": "pacote 1kg",
      "tamanho_quantidade": 1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_nuggets_congelado_sadia_300g",
      "produto_id": "prod_nuggets_congelado",
      "marca_id": "marca_sadia",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_nuggets_congelado_perdigao_300g",
      "produto_id": "prod_nuggets_congelado",
      "marca_id": "marca_perdigao",
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_polpa_de_fruta_congelada_generico_100g",
      "produto_id": "prod_polpa_de_fruta_congelada",
      "marca_id": null,
      "tamanho": "100g",
      "tamanho_quantidade": 0.1,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sorvete_kibon_1_5l",
      "produto_id": "prod_sorvete",
      "marca_id": "marca_kibon",
      "tamanho": "1,5l",
      "tamanho_quantidade": 1.5,
      "tamanho_unidade": "l",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_milho_em_conserva_quero_200g",
      "produto_id": "prod_milho_em_conserva",
      "marca_id": "marca_quero",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_milho_em_conserva_bonduelle_200g",
      "produto_id": "prod_milho_em_conserva",
      "marca_id": "marca_bonduelle",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_ervilha_em_conserva_quero_200g",
      "produto_id": "prod_ervilha_em_conserva",
      "marca_id": "marca_quero",
      "tamanho": "200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_atum_em_lata_gomes_da_costa_170g",
      "produto_id": "prod_atum_em_lata",
      "marca_id": "marca_gomes_da_costa",
      "tamanho": "170g",
      "tamanho_quantidade": 0.17,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_sardinha_em_lata_gomes_da_costa_125g",
      "produto_id": "prod_sardinha_em_lata",
      "marca_id": "marca_gomes_da_costa",
      "tamanho": "125g",
      "tamanho_quantidade": 0.125,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_palmito_em_conserva_generico_300g",
      "produto_id": "prod_palmito_em_conserva",
      "marca_id": null,
      "tamanho": "300g",
      "tamanho_quantidade": 0.3,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    },
    {
      "id": "var_azeitona_generico_vidro_200g",
      "produto_id": "prod_azeitona",
      "marca_id": null,
      "tamanho": "vidro 200g",
      "tamanho_quantidade": 0.2,
      "tamanho_unidade": "kg",
      "codigo_barras": "",
      "descricao_variante": "",
      "foto": null,
      "tabela_nutricional": null
    }
  ]
};

/* =========================================================
   ARMAZENAMENTO (seção 22.9: falha de leitura/escrita agora é visível, não silenciosa)
========================================================= */
function loadAll() {
  let catalogo = null, sessoes = [], precoIaCache = {}, apiKey = "", lastBackup = null;
  let houveErroCarregamento = false;
  try { const v = localStorage.getItem("nc_catalogo"); catalogo = v ? JSON.parse(v) : null; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("nc_sessoes"); sessoes = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("nc_precoIaCache"); precoIaCache = migrarPrecoIaCache(v ? JSON.parse(v) : {}); } catch (e) { houveErroCarregamento = true; }
  try { apiKey = localStorage.getItem("nc_apiKey") || ""; } catch (e) {}
  try { lastBackup = localStorage.getItem("nc_lastBackup"); } catch (e) {}
  if (!catalogo) catalogo = SEED_CATALOGO;
  return { catalogo, sessoes, precoIaCache, apiKey, lastBackup, houveErroCarregamento };
}
const CORES_MERCADO = ["#2E6B4E", "#C97A2E", "#2E5F8A", "#8A3B5C", "#5C6B2E", "#B23A3A"];

function Sparkline({ pontos, largura = 280, altura = 90 }) {
  if (!pontos || pontos.length < 2) {
    return <div className="text-xs text-stone-400 text-center py-3">Histórico curto demais pra gráfico ainda (precisa de pelo menos 2 compras).</div>;
  }
  const valores = pontos.map((p) => p.preco);
  const min = Math.min(...valores), max = Math.max(...valores);
  const range = max - min || 1;
  const alturaUtil = altura - 16; // reserva espaço embaixo pras datas
  const passoX = largura / (pontos.length - 1);
  const pontosXY = pontos.map((p, i) => ({ x: i * passoX, y: alturaUtil - ((p.preco - min) / range) * (alturaUtil - 14) - 7 }));
  const linha = pontosXY.map((p) => `${p.x},${p.y}`).join(" ");
  const mostrarTodasDatas = pontos.length <= 6;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-1">
        <polyline points={linha} fill="none" stroke="#2E6B4E" strokeWidth="2" />
        {pontosXY.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#2E6B4E" />)}
        {pontosXY.map((p, i) => (mostrarTodasDatas || i === 0 || i === pontos.length - 1) && (
          <text key={"d" + i} x={p.x} y={altura - 2} fontSize="7" fill="#a8a29e" textAnchor={i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"}>{dataCompacta(pontos[i].data)}</text>
        ))}
      </svg>
      <div className="flex justify-between text-xs text-stone-400 font-mono2"><span>Mín {brl(min)}</span><span>Máx {brl(max)}</span></div>
    </div>
  );
}

/* Seção 22.10, parte 2: gráfico de preço real x estimado por IA, com toggle por série.
   Eixo X é por DATA de verdade (não índice), pra alinhar as duas séries no tempo.
   Estimativa por IA vem tracejada, pra nunca ser confundida com preço confirmado.
   Seção 31: rótulos agora dizem "Mín/Máx" explicitamente (não mais números soltos que pareciam
   marcar início/fim do desenho) e cada ponto ganha a data embaixo, pra dar noção de escala. */
function GraficoPrecoDuplo({ pontosReal, pontosIA, largura = 280, altura = 100 }) {
  const [verReal, setVerReal] = useState(pontosReal.length > 0);
  const [verIA, setVerIA] = useState(pontosReal.length === 0 && pontosIA.length > 0);

  const todasDatas = [...pontosReal, ...pontosIA].map((p) => new Date(p.data).getTime());
  const minData = todasDatas.length ? Math.min(...todasDatas) : 0;
  const maxDataRaw = todasDatas.length ? Math.max(...todasDatas) : 1;
  const maxData = maxDataRaw === minData ? minData + 1 : maxDataRaw;

  const visiveisReal = verReal ? pontosReal : [];
  const visiveisIA = verIA ? pontosIA : [];
  const valoresVisiveis = [...visiveisReal, ...visiveisIA].map((p) => p.preco);
  const alturaUtil = altura - 16;

  function coordsDe(pontos) {
    const min = Math.min(...valoresVisiveis), max = Math.max(...valoresVisiveis);
    const range = max - min || 1;
    return pontos.map((p) => ({
      x: ((new Date(p.data).getTime() - minData) / (maxData - minData)) * largura,
      y: alturaUtil - ((p.preco - min) / range) * (alturaUtil - 14) - 7,
    }));
  }
  const totalPontosVisiveis = visiveisReal.length + visiveisIA.length;
  const mostrarTodasDatas = totalPontosVisiveis <= 6;

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <Chip selected={verReal} onClick={() => setVerReal(!verReal)}>● Real</Chip>
        <Chip selected={verIA} onClick={() => setVerIA(!verIA)}>◌ Estimado IA</Chip>
      </div>
      {valoresVisiveis.length < 2 ? (
        <div className="text-xs text-stone-400 text-center py-3">
          {!pontosReal.length && !pontosIA.length ? "Sem dados ainda pra esse gráfico." : "Marque pelo menos uma série com 2+ pontos pra desenhar o gráfico."}
        </div>
      ) : (
        <>
          <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-1">
            {verReal && pontosReal.length >= 2 && (() => {
              const c = coordsDe(pontosReal);
              return <polyline points={c.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--ink-green)" strokeWidth="2" />;
            })()}
            {verIA && pontosIA.length >= 2 && (() => {
              const c = coordsDe(pontosIA);
              return <polyline points={c.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#8a8a8a" strokeWidth="2" strokeDasharray="4 3" />;
            })()}
            {verReal && coordsDe(pontosReal).map((p, i, arr) => (
              <g key={"r" + i}>
                <circle cx={p.x} cy={p.y} r="3" fill="var(--ink-green)" />
                {(mostrarTodasDatas || i === 0 || i === arr.length - 1) &&
                  <text x={p.x} y={altura - 2} fontSize="7" fill="#a8a29e" textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}>{dataCompacta(pontosReal[i].data)}</text>}
              </g>
            ))}
            {verIA && coordsDe(pontosIA).map((p, i, arr) => (
              <g key={"i" + i}>
                <circle cx={p.x} cy={p.y} r="3" fill="#8a8a8a" />
                {(mostrarTodasDatas || i === 0 || i === arr.length - 1) &&
                  <text x={p.x} y={altura - 2} fontSize="7" fill="#a8a29e" textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}>{dataCompacta(pontosIA[i].data)}</text>}
              </g>
            ))}
          </svg>
          <div className="flex justify-between text-xs text-stone-400 font-mono2"><span>Mín {brl(Math.min(...valoresVisiveis))}</span><span>Máx {brl(Math.max(...valoresVisiveis))}</span></div>
        </>
      )}
    </div>
  );
}

/* Gráfico comparativo entre tamanhos do mesmo produto+marca (pedido do usuário): cada tamanho vira
   uma linha própria, todas no mesmo eixo de tempo e no mesmo eixo de valor (preço normalizado por
   kg/l/un) — dá pra ver visualmente qual tamanho valia mais a pena em cada momento, não só hoje.
   Seção 31: mesma correção de rótulo Mín/Máx + datas por ponto. */
function GraficoComparacaoTamanhos({ series, unidadeBase, largura = 300, altura = 130 }) {
  const seriesComDados = series.filter((s) => s.pontos.length >= 1);
  const todosPontos = seriesComDados.flatMap((s) => s.pontos);
  if (seriesComDados.length < 2 || todosPontos.length < 2) {
    return <div className="text-xs text-stone-400 text-center py-3">Precisa de histórico de pelo menos 2 tamanhos pra desenhar esse gráfico.</div>;
  }
  const todasDatas = todosPontos.map((p) => new Date(p.data).getTime());
  const minData = Math.min(...todasDatas);
  const maxDataRaw = Math.max(...todasDatas);
  const maxData = maxDataRaw === minData ? minData + 1 : maxDataRaw;
  const todosValores = todosPontos.map((p) => p.preco);
  const minV = Math.min(...todosValores), maxV = Math.max(...todosValores);
  const rangeV = maxV - minV || 1;
  const alturaUtil = altura - 16;

  function coordsDe(pontos) {
    return pontos.map((p) => ({
      x: ((new Date(p.data).getTime() - minData) / (maxData - minData)) * largura,
      y: alturaUtil - ((p.preco - minV) / rangeV) * (alturaUtil - 14) - 7,
    }));
  }
  const mostrarTodasDatas = todosPontos.length <= 8;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-1">
        {seriesComDados.map((s) => s.pontos.length >= 2 && (
          <polyline key={"linha-" + s.label} points={coordsDe(s.pontos).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={s.cor} strokeWidth="2" />
        ))}
        {seriesComDados.map((s) => coordsDe(s.pontos).map((p, i, arr) => (
          <g key={s.label + i}>
            <circle cx={p.x} cy={p.y} r="3" fill={s.cor} />
            {(mostrarTodasDatas || i === 0 || i === arr.length - 1) &&
              <text x={p.x} y={altura - 2} fontSize="7" fill="#a8a29e" textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}>{dataCompacta(s.pontos[i].data)}</text>}
          </g>
        )))}
      </svg>
      <div className="flex justify-between text-xs text-stone-400 font-mono2 mb-2">
        <span>Mín {brl(minV)}/{unidadeBase}</span><span>Máx {brl(maxV)}/{unidadeBase}</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {seriesComDados.map((s) => <span key={s.label} className="text-xs flex items-center gap-1"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />{s.label}</span>)}
      </div>
    </div>
  );
}

/* Etapa sobre criar item/marca no fluxo de compra: SeletorBusca ganha "+ Criar" quando a busca
   não acha nada — resolve de uma vez o bug de "não dá pra criar marca nova" nos dois formulários
   que usam esse componente (FormVariante e o formulário rápido dentro da lista), sem duplicar
   lógica. Quem CRIA de verdade é sempre quem chama o componente (via onCriarNovo) — SeletorBusca
   só sabe mostrar o botão e fechar depois, não sabe editar catálogo. */
/* Etapa sobre redesenhar o seletor de unidade: antes eram 3 chips sempre visíveis (kg/l/un)
   competindo por atenção do lado da quantidade. Agora a unidade fica embutida no próprio campo
   de quantidade, e mudar é uma ação deliberada — abre isso aqui, pergunta pra qual unidade e,
   escolhida, pergunta se quer salvar como padrão do produto (não só pra essa compra), pra não
   precisar corrigir de novo na próxima vez que comprar o mesmo item. */
function ModalMudarUnidade({ unidadeAtual, nomeProduto, onEscolher, onFechar }) {
  const [novaUnidade, setNovaUnidade] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[85]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        {novaUnidade == null ? (
          <>
            <h3 className="text-lg font-bold mb-3">Mudar unidade</h3>
            <div className="flex gap-2 mb-2">
              {["kg", "l", "un"].map((u) => (
                <button key={u} onClick={() => (u === unidadeAtual ? onFechar() : setNovaUnidade(u))}
                  className={`flex-1 py-3 rounded-xl border-2 font-semibold tap-target ${u === unidadeAtual ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-stone-300 text-stone-700"}`}>
                  {u}{u === unidadeAtual ? " ✓" : ""}
                </button>
              ))}
            </div>
            <button onClick={onFechar} className="w-full py-2 text-stone-400 text-sm tap-target mt-2">Cancelar</button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold mb-2">Mudar pra "{novaUnidade}"</h3>
            <p className="text-sm text-stone-500 mb-4">Quer salvar essa unidade como padrão{nomeProduto ? ` de "${nomeProduto}"` : " desse produto"} também, pra não precisar mudar de novo na próxima compra?</p>
            <div className="flex gap-2">
              <button onClick={() => onEscolher(novaUnidade, false)} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Só essa vez</button>
              <button onClick={() => onEscolher(novaUnidade, true)} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Sim, salvar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function SeletorBusca({ label, opcoes, valorId, onSelecionar, permitirNenhum, nenhumLabel, onCriarNovo, labelCriar }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const selecionado = opcoes.find((o) => o.id === valorId);
  const filtradas = opcoes.filter((o) => normalizar(o.nome).includes(normalizar(busca)));

  function escolher(id) {
    onSelecionar(id);
    setAberto(false);
    setBusca("");
  }
  function criar() {
    if (!onCriarNovo || !busca.trim()) return;
    onCriarNovo(busca.trim());
    setAberto(false);
    setBusca("");
  }

  return (
    <div>
      {label && <label className="text-xs font-semibold text-stone-500 uppercase">{label}</label>}
      {!aberto ? (
        <button onClick={() => setAberto(true)} aria-label={`Selecionar ${label || "opção"}`}
          className="w-full flex items-center justify-between border border-stone-300 rounded-lg p-2.5 mt-1 text-left tap-target">
          <span className={selecionado ? "text-stone-800 font-medium" : "text-stone-400"}>
            {selecionado ? selecionado.nome : (nenhumLabel || "Selecionar...")}
          </span>
          <span className="text-stone-400">▾</span>
        </button>
      ) : (
        <div className="border border-stone-300 rounded-lg mt-1 overflow-hidden">
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..."
            className="w-full p-2.5 border-b border-stone-200 outline-none" aria-label={`Buscar ${label || "opção"}`} />
          <div className="max-h-52 overflow-y-auto">
            {permitirNenhum && (
              <button onClick={() => escolher(null)} className="w-full text-left p-2.5 border-b border-stone-100 text-stone-500 tap-target">
                {nenhumLabel || "Nenhum"}
              </button>
            )}
            {filtradas.map((o) => (
              <button key={o.id} onClick={() => escolher(o.id)}
                className={`w-full text-left p-2.5 border-b border-stone-100 tap-target ${o.id === valorId ? "bg-emerald-50 font-semibold text-emerald-700" : "text-stone-700"}`}>
                {o.nome}
              </button>
            ))}
            {!filtradas.length && (
              <div className="p-3 text-center">
                <div className="text-xs text-stone-400 mb-2">Nada encontrado</div>
                {onCriarNovo && busca.trim() && (
                  <button onClick={criar} className="text-xs text-emerald-700 font-semibold underline tap-target">
                    + Criar {labelCriar || ""} "{busca.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
          <button onClick={() => { setAberto(false); setBusca(""); }} className="w-full text-center p-2 text-xs text-stone-400 border-t border-stone-100 tap-target">
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   GRÁFICO: gasto por categoria — barra empilhada OU pizza, com seletor (seção 22.4)
   Reutilizado em 3 lugares: prévia da compra, sessão fechada, resumo agregado do histórico.
   entradas: [{nome, valor, cor}]
========================================================= */
function GraficoCategorias({ entradas, tituloVazio = "Sem gastos ainda", tipoInicial = "barra" }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [expandido, setExpandido] = useState(false);
  const total = entradas.reduce((a, e) => a + e.valor, 0);
  if (!entradas.length || total <= 0) return <p className="text-stone-400 text-xs text-center py-3">{tituloVazio}</p>;
  const ordenadas = [...entradas].sort((a, b) => b.valor - a.valor);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1.5">
          <Chip selected={tipo === "barra"} onClick={() => setTipo("barra")}>▬ Barra</Chip>
          <Chip selected={tipo === "pizza"} onClick={() => setTipo("pizza")}>◔ Pizza</Chip>
        </div>
      </div>

      {tipo === "barra" ? (
        <div>
          <button onClick={() => setExpandido(!expandido)} aria-label={expandido ? "Recolher detalhe" : "Ver detalhe por categoria"} className="w-full py-1">
            <div className="h-3 rounded-full overflow-hidden flex w-full bg-stone-100">
              {entradas.map((e) => <div key={e.nome} style={{ width: `${(e.valor / total) * 100}%`, backgroundColor: e.cor }} />)}
            </div>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center py-1">
          <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
            <svg width="130" height="130" viewBox="0 0 120 120">
              <g transform="rotate(-90 60 60)">
                {(() => {
                  const raio = 45, circunferencia = 2 * Math.PI * raio;
                  let acumulado = 0;
                  return entradas.map((e) => {
                    const fracao = e.valor / total;
                    const comprimento = fracao * circunferencia;
                    const offset = -acumulado * circunferencia;
                    acumulado += fracao;
                    return <circle key={e.nome} cx="60" cy="60" r={raio} fill="none" stroke={e.cor} strokeWidth="22" strokeDasharray={`${comprimento} ${circunferencia - comprimento}`} strokeDashoffset={offset} />;
                  });
                })()}
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-stone-400">Total</span>
              <span className="font-mono2 font-bold text-stone-800 text-sm text-center px-2">{brl(total)}</span>
            </div>
          </div>
        </div>
      )}

      {(tipo === "pizza" || expandido) && (
        <div className="mt-2 space-y-1 pb-1">
          {ordenadas.map((e) => (
            <div key={e.nome} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                {e.icone ? <span className="shrink-0">{e.icone}</span> : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.cor }} />}
                {e.nome}
              </span>
              <span className="font-mono2 text-stone-600">{brl(e.valor)} · {((e.valor / total) * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function entradasGraficoDe(porCategoriaObj, catalogo) {
  return Object.entries(porCategoriaObj).map(([nome, valor], i) => {
    const cat = catalogo.categorias.find((c) => c.nome === nome);
    return { nome, valor, cor: cat ? corCategoria(cat.id, catalogo.categorias) : CORES_CATEGORIA[i % CORES_CATEGORIA.length], icone: cat?.icone };
  });
}
function entradasGraficoDeSnapshot(snapshot, catalogo) {
  return (snapshot || []).map((s) => {
    const cat = catalogo.categorias.find((c) => c.id === s.categoria_id);
    return { nome: s.nome, valor: s.valor, cor: corCategoria(s.categoria_id, catalogo.categorias), icone: cat?.icone };
  });
}

/* =========================================================
   TELA: MERCADOS (com reordenar categorias)
========================================================= */
function TelaMercados({ catalogo, setCatalogo, sessoes }) {
  const [form, setForm] = useState(null);
  const [reordenando, setReordenando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  useFecharComVoltar(!!form, () => setForm(null));

  function temHistorico(mercadoId) { return sessoes.some((s) => s.status === "fechada" && s.mercado_id === mercadoId); }
  function salvar() {
    if (!form.nome.trim()) return;
    setCatalogo((c) => {
      const existe = c.mercados.some((m) => m.id === form.id);
      const mercados = existe ? c.mercados.map((m) => (m.id === form.id ? form : m)) : [...c.mercados, { ...form, id: form.id || uid() }];
      return { ...c, mercados };
    });
    setForm(null);
    setReordenando(false);
  }
  function remover(m) {
    if (temHistorico(m.id)) {
      setConfirmar({
        titulo: "Desativar mercado", severo: false, textoConfirmar: "Desativar",
        mensagem: `"${m.nome}" já tem compras no histórico — não dá pra excluir de vez. Deseja desativar (esconder de novas listas, mantendo o histórico)?`,
        acao: () => { setCatalogo((c) => ({ ...c, mercados: c.mercados.map((x) => (x.id === m.id ? { ...x, ativo: false } : x)) })); setConfirmar(null); },
      });
    } else {
      setConfirmar({
        titulo: "Excluir mercado", severo: true, textoConfirmar: "Excluir",
        mensagem: `Excluir "${m.nome}" definitivamente? Não tem histórico vinculado, então some de vez.`,
        acao: () => { setCatalogo((c) => ({ ...c, mercados: c.mercados.filter((x) => x.id !== m.id) })); setConfirmar(null); },
      });
    }
  }

  function ordemAtual() {
    const ordem = form.ordem_categorias && form.ordem_categorias.length ? form.ordem_categorias : catalogo.categorias.map((c) => c.id);
    return ordem.map((id) => by(catalogo.categorias, id)).filter(Boolean);
  }
  function moverCategoria(idx, direcao) {
    const lista = ordemAtual();
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= lista.length) return;
    [lista[idx], lista[novoIdx]] = [lista[novoIdx], lista[idx]];
    setForm({ ...form, ordem_categorias: lista.map((c) => c.id) });
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-emerald-900">Mercados</h2>
        <button onClick={() => setForm({ nome: "", razao_social: "", cnpj: "", telefone: "", cor: CORES_MERCADO[0], endereco: "", ativo: true, ordem_categorias: [] })}
          className="flex items-center gap-1 bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg tap-target">+ Novo</button>
      </div>
      <div className="space-y-2">
        {catalogo.mercados.map((m) => (
          <div key={m.id} className={`bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between ${!m.ativo ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: m.cor }} />
              <div className="min-w-0">
                <div className="font-semibold text-stone-800 truncate">{m.nome}</div>
                <div className="text-xs text-stone-500 truncate">{[m.razao_social, m.cnpj].filter(Boolean).join(" · ") || m.endereco}</div>
              </div>
            </div>
            <div className="flex gap-3 shrink-0 items-center">
              {!m.ativo && (
                <label className="flex items-center gap-1.5 text-xs text-stone-500 tap-target">
                  <input type="checkbox" checked={false} onChange={() => setCatalogo((c) => ({ ...c, mercados: c.mercados.map((x) => (x.id === m.id ? { ...x, ativo: true } : x)) }))} className="w-5 h-5" />
                  Reativar
                </label>
              )}
              <button onClick={() => setForm({ ordem_categorias: [], ...m })} aria-label={`Editar ${m.nome}`} className="text-stone-400 tap-target">✏️</button>
              {m.ativo && <button onClick={() => remover(m)} aria-label={`Remover ${m.nome}`} className="text-red-400 tap-target">🗑️</button>}
            </div>
          </div>
        ))}
        {!catalogo.mercados.length && <p className="text-stone-400 text-sm text-center py-8">Nenhum mercado cadastrado ainda.</p>}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => { setForm(null); setReordenando(false); }}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {!reordenando ? (
              <>
                <h3 className="text-lg font-bold mb-3">{form.id ? "Editar mercado" : "Novo mercado"}</h3>
                <label className="text-xs font-semibold text-stone-500 uppercase">Nome fantasia</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1" placeholder="Ex: Rio Sul" />
                <label className="text-xs font-semibold text-stone-500 uppercase">Razão social (opcional)</label>
                <input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1" placeholder="Nome jurídico oficial" />
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><label className="text-xs font-semibold text-stone-500 uppercase">CNPJ</label>
                    <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1 font-mono2 text-sm" placeholder="00.000.000/0000-00" /></div>
                  <div><label className="text-xs font-semibold text-stone-500 uppercase">Telefone</label>
                    <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1" placeholder="(00) 0000-0000" /></div>
                </div>
                <label className="text-xs font-semibold text-stone-500 uppercase">Cor de identificação</label>
                <div className="flex gap-2 mt-1 mb-3">
                  {CORES_MERCADO.map((c) => <button key={c} onClick={() => setForm({ ...form, cor: c })} aria-label={`Cor ${c}`} className="w-8 h-8 rounded-full border-2 tap-target" style={{ backgroundColor: c, borderColor: form.cor === c ? "#1c1917" : "transparent" }} />)}
                </div>
                <label className="text-xs font-semibold text-stone-500 uppercase">Endereço (opcional)</label>
                <input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1" />

                {form.id && (
                  <label className="flex items-center gap-2 text-sm text-stone-600 mb-3 tap-target">
                    <input type="checkbox" checked={!!form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="w-5 h-5" />
                    Mercado ativo (aparece nas novas listas)
                  </label>
                )}

                <button onClick={() => setReordenando(true)} className="w-full text-left text-sm text-emerald-700 font-semibold border border-emerald-700 rounded-lg p-2.5 mb-4 tap-target">
                  📑 Ordem das categorias nesse mercado →
                </button>

                <div className="flex gap-2">
                  <button onClick={() => { setForm(null); }} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
                  <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-1">Ordem das categorias</h3>
                <p className="text-xs text-stone-500 mb-3">Organize na ordem que você percorre esse mercado — a lista de compras vai seguir essa sequência quando esse mercado estiver selecionado.</p>
                <div className="space-y-1.5 mb-4">
                  {ordemAtual().map((cat, idx) => (
                    <div key={cat.id} className="flex items-center justify-between bg-stone-50 rounded-lg p-2.5">
                      <span className="text-sm">{cat.icone} {cat.nome}</span>
                      <div className="flex gap-1">
                        <button onClick={() => moverCategoria(idx, -1)} disabled={idx === 0} aria-label={`Mover ${cat.nome} pra cima`}
                          className="tap-target flex items-center justify-center text-stone-500 disabled:opacity-20">▲</button>
                        <button onClick={() => moverCategoria(idx, 1)} disabled={idx === ordemAtual().length - 1} aria-label={`Mover ${cat.nome} pra baixo`}
                          className="tap-target flex items-center justify-center text-stone-500 disabled:opacity-20">▼</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setReordenando(false)} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Voltar</button>
              </>
            )}
          </div>
        </div>
      )}

      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* =========================================================
   TELA: PRODUTOS / MARCAS / CATEGORIAS
========================================================= */
function TelaProdutos({ catalogo, setCatalogo, sessoes, precoIaCache, setPrecoIaCache, apiKey }) {
  const [subaba, setSubaba] = useState("produtos");
  const [busca, setBusca] = useState("");
  const [produtoAberto, setProdutoAberto] = useState(null);
  const [categoriaExpandida, setCategoriaExpandida] = useState(null);
  const [formProduto, setFormProduto] = useState(null);
  const [formVariante, setFormVariante] = useState(null);
  const [formMarca, setFormMarca] = useState(null);
  const [formCategoria, setFormCategoria] = useState(null);
  const [avisoDuplicataProduto, setAvisoDuplicataProduto] = useState(null);
  const [avisoDuplicataMarca, setAvisoDuplicataMarca] = useState(null);
  const [historicoVarianteId, setHistoricoVarianteId] = useState(null);
  const [atualizando, setAtualizando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const cancelarRef = useRef(false);
  useFecharComVoltar(!!formProduto, () => setFormProduto(null));
  useFecharComVoltar(!!formMarca, () => setFormMarca(null));
  useFecharComVoltar(!!formCategoria, () => setFormCategoria(null));

  if (historicoVarianteId) {
    return <TelaHistoricoVariante varianteId={historicoVarianteId} catalogo={catalogo} sessoes={sessoes} precoIaCache={precoIaCache} onClose={() => setHistoricoVarianteId(null)} />;
  }

  function produtoBateComBusca(p) {
    if (!busca.trim()) return true;
    const alvo = normalizar(busca);
    if (normalizar(p.nome).includes(alvo)) return true;
    return catalogo.variantes.some((v) => v.produto_id === p.id && v.marca_id && normalizar(by(catalogo.marcas, v.marca_id)?.nome || "").includes(alvo));
  }
  /* Quando a busca bateu só pela marca (não pelo nome do produto), mostra só as variantes
     daquela marca — evita listar as 5 marcas de um produto quando a pessoa procurou 1. */
  function variantesParaExibir(p) {
    const todas = catalogo.variantes.filter((v) => v.produto_id === p.id);
    if (!busca.trim()) return todas;
    const alvo = normalizar(busca);
    if (normalizar(p.nome).includes(alvo)) return todas;
    return todas.filter((v) => v.marca_id && normalizar(by(catalogo.marcas, v.marca_id)?.nome || "").includes(alvo));
  }
  const produtosFiltrados = catalogo.produtos.filter(produtoBateComBusca);
  const produtosPorCategoria = {};
  for (const p of produtosFiltrados) (produtosPorCategoria[p.categoria_id] = produtosPorCategoria[p.categoria_id] || []).push(p);

  function varianteTemHistorico(varianteId) {
    return sessoes.some((s) => s.itens.some((it) => it.produto_variante_id === varianteId && it.preco_pago != null));
  }
  function salvarProduto() {
    if (!formProduto.nome.trim() || !formProduto.categoria_id) return;
    const existe = catalogo.produtos.some((p) => p.id === formProduto.id);
    if (!existe && !avisoDuplicataProduto) {
      const parecido = achaNomeParecido(formProduto.nome, catalogo.produtos, null);
      if (parecido) { setAvisoDuplicataProduto(parecido); return; }
    }
    setCatalogo((c) => {
      const existeAgora = c.produtos.some((p) => p.id === formProduto.id);
      return { ...c, produtos: existeAgora ? c.produtos.map((p) => (p.id === formProduto.id ? formProduto : p)) : [...c.produtos, { ...formProduto, id: uid() }] };
    });
    setFormProduto(null);
    setAvisoDuplicataProduto(null);
  }
  function removerProduto(p) {
    const variantesDoProduto = catalogo.variantes.filter((v) => v.produto_id === p.id);
    if (variantesDoProduto.some((v) => varianteTemHistorico(v.id))) { alert("Esse produto tem variantes com histórico de compra — remova ou desative as variantes primeiro."); return; }
    setConfirmar({
      titulo: "Excluir produto", severo: true, textoConfirmar: "Excluir",
      mensagem: `Excluir "${p.nome}" e todas as suas variantes? Nenhuma tem histórico, então some de vez.`,
      acao: () => { setCatalogo((c) => ({ ...c, produtos: c.produtos.filter((x) => x.id !== p.id), variantes: c.variantes.filter((v) => v.produto_id !== p.id) })); setConfirmar(null); },
    });
  }
  function salvarVariante() {
    if (!formVariante.produto_id) return;
    setCatalogo((c) => {
      const existe = c.variantes.some((v) => v.id === formVariante.id);
      return { ...c, variantes: existe ? c.variantes.map((v) => (v.id === formVariante.id ? formVariante : v)) : [...c.variantes, { ...formVariante, id: uid() }] };
    });
    setFormVariante(null);
  }
  function removerVariante(v) {
    if (varianteTemHistorico(v.id)) { alert("Essa variante já tem compras no histórico — não dá pra excluir de vez."); return; }
    setConfirmar({
      titulo: "Excluir variante", severo: true, textoConfirmar: "Excluir",
      mensagem: "Excluir essa variante definitivamente?",
      acao: () => { setCatalogo((c) => ({ ...c, variantes: c.variantes.filter((x) => x.id !== v.id) })); setConfirmar(null); },
    });
  }
  function salvarMarca() {
    if (!formMarca.nome.trim()) return;
    const existe = catalogo.marcas.some((m) => m.id === formMarca.id);
    if (!existe && !avisoDuplicataMarca) {
      const parecido = achaNomeParecido(formMarca.nome, catalogo.marcas, null);
      if (parecido) { setAvisoDuplicataMarca(parecido); return; }
    }
    setCatalogo((c) => {
      const existeAgora = c.marcas.some((m) => m.id === formMarca.id);
      return { ...c, marcas: existeAgora ? c.marcas.map((m) => (m.id === formMarca.id ? formMarca : m)) : [...c.marcas, { ...formMarca, id: uid() }] };
    });
    setFormMarca(null);
    setAvisoDuplicataMarca(null);
  }
  function removerMarca(m) {
    const emUso = catalogo.variantes.filter((v) => v.marca_id === m.id).length;
    if (emUso > 0) { alert(`${emUso} variante(s) usam essa marca — não dá pra excluir enquanto estiver em uso.`); return; }
    setConfirmar({
      titulo: "Excluir marca", severo: true, textoConfirmar: "Excluir",
      mensagem: `Excluir a marca "${m.nome}"?`,
      acao: () => { setCatalogo((c) => ({ ...c, marcas: c.marcas.filter((x) => x.id !== m.id) })); setConfirmar(null); },
    });
  }
  function salvarCategoria() {
    if (!formCategoria.nome.trim()) return;
    setCatalogo((c) => {
      const existe = c.categorias.some((cc) => cc.id === formCategoria.id);
      return { ...c, categorias: existe ? c.categorias.map((cc) => (cc.id === formCategoria.id ? formCategoria : cc)) : [...c.categorias, { ...formCategoria, id: uid() }] };
    });
    setFormCategoria(null);
  }
  function removerCategoria(cat) {
    const emUso = catalogo.produtos.filter((p) => p.categoria_id === cat.id).length;
    if (emUso > 0) { alert(`${emUso} produto(s) usam essa categoria — mova-os antes de excluir.`); return; }
    setConfirmar({
      titulo: "Excluir categoria", severo: true, textoConfirmar: "Excluir",
      mensagem: `Excluir a categoria "${cat.nome}"?`,
      acao: () => { setCatalogo((c) => ({ ...c, categorias: c.categorias.filter((x) => x.id !== cat.id) })); setConfirmar(null); },
    });
  }

  function iniciarAtualizarTodosPrecos() {
    if (!apiKey) { alert("Adicione sua chave de API da Anthropic em Configurações primeiro."); return; }
    const todas = catalogo.variantes;
    if (!todas.length) return;
    const segundosEstimados = todas.length * 3;
    const minEstimado = Math.max(1, Math.round(segundosEstimados / 60));
    setConfirmar({
      titulo: "Atualizar todos os preços", severo: false, textoConfirmar: "Começar",
      mensagem: `Isso vai consultar o preço de ${todas.length} produtos, um por vez — cada consulta é uma chamada de API e pode gerar custo (geralmente poucos centavos cada). Tempo estimado: ~${minEstimado} min. Confirma?`,
      acao: () => { setConfirmar(null); atualizarTodosPrecos(); },
    });
  }
  async function atualizarTodosPrecos() {
    const todas = catalogo.variantes;
    cancelarRef.current = false;
    setAtualizando({ atual: 0, total: todas.length });
    for (let i = 0; i < todas.length; i++) {
      if (cancelarRef.current) break;
      const v = todas[i];
      setAtualizando({ atual: i + 1, total: todas.length });
      const p = by(catalogo.produtos, v.produto_id);
      const m = v.marca_id && by(catalogo.marcas, v.marca_id);
      try {
        const est = await buscarPrecoIA(p?.nome || "", m?.nome, v.tamanho, apiKey);
        setPrecoIaCache((c) => adicionarEstimativa(c, v.id, est));
      } catch (e) { console.error("Falhou atualizar", v.id, e); }
    }
    setAtualizando(null);
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      <h2 className="text-2xl font-bold text-emerald-900 mb-3">Produtos</h2>
      <div className="flex gap-2 mb-4">
        <Chip selected={subaba === "produtos"} onClick={() => setSubaba("produtos")}>Produtos</Chip>
        <Chip selected={subaba === "marcas"} onClick={() => setSubaba("marcas")}>Marcas</Chip>
        <Chip selected={subaba === "categorias"} onClick={() => setSubaba("categorias")}>Categorias</Chip>
      </div>

      {subaba === "produtos" && (
        <>
          <div className="flex gap-2 mb-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar produto..." className="flex-1 border border-stone-300 rounded-lg p-2.5 text-sm" aria-label="Buscar produto" />
            <button onClick={() => setFormProduto({ nome: "", descricao: "", categoria_id: catalogo.categorias[0]?.id || "", unidade_padrao: "un" })}
              className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg shrink-0 tap-target">+ Produto</button>
          </div>
          <button onClick={iniciarAtualizarTodosPrecos} className="w-full text-xs text-emerald-700 font-semibold border border-emerald-700 rounded-lg px-3 py-2.5 mb-3 tap-target">
            🔄 Atualizar todos os preços por IA
          </button>

          {catalogo.categorias.map((cat) => {
            const produtos = produtosPorCategoria[cat.id];
            if (!produtos || !produtos.length) return null;
            return (
              <div key={cat.id} className="mb-4">
                <div className="text-xs font-semibold text-stone-400 uppercase mb-2">{cat.icone} {cat.nome}</div>
                <div className="space-y-2">
                  {produtos.map((p) => {
                    const variantes = variantesParaExibir(p);
                    const totalVariantesDoProduto = catalogo.variantes.filter((v) => v.produto_id === p.id).length;
                    const aberto = produtoAberto === p.id;
                    return (
                      <div key={p.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <button className="w-full flex items-center justify-between p-3 text-left tap-target" onClick={() => setProdutoAberto(aberto ? null : p.id)}>
                          <div className="min-w-0">
                            <div className="font-semibold text-stone-800 truncate">{p.nome}</div>
                            <div className="text-xs text-stone-400">
                              {variantes.length !== totalVariantesDoProduto ? `${variantes.length} de ${totalVariantesDoProduto} variante(s) combinam` : `${totalVariantesDoProduto} variante(s)`} · {p.unidade_padrao}
                            </div>
                          </div>
                          <span className="text-stone-400 shrink-0">{aberto ? "▾" : "▸"}</span>
                        </button>
                        {aberto && (
                          <div className="border-t border-stone-100 p-3 space-y-2">
                            {p.descricao && <p className="text-xs text-stone-500 italic">{p.descricao}</p>}
                            {variantes.map((v) => {
                              const marca = v.marca_id && by(catalogo.marcas, v.marca_id);
                              return (
                                <div key={v.id} className="flex items-center justify-between bg-stone-50 rounded-lg p-2 gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {v.foto && <img src={v.foto} className="w-8 h-8 rounded object-cover shrink-0" alt="" />}
                                    <div className="text-sm text-stone-700 truncate">
                                      {v.favorita && <span title="Favorita">⭐ </span>}
                                      {marca?.nome || "genérico"} · {tamanhoDisplay(v) || "—"}
                                    </div>
                                  </div>
                                  <div className="flex gap-2.5 shrink-0">
                                    <button onClick={() => setHistoricoVarianteId(v.id)} aria-label={`Histórico de ${marca?.nome || p.nome}`} className="flex flex-col items-center text-stone-400 tap-target"><span className="text-sm">📊</span><span className="text-[10px] leading-tight">Estatísticas</span></button>
                                    <button onClick={() => setFormVariante(v)} aria-label={`Editar ${marca?.nome || p.nome}`} className="flex flex-col items-center text-stone-400 tap-target"><span className="text-sm">✏️</span><span className="text-[10px] leading-tight">Editar</span></button>
                                    <button onClick={() => removerVariante(v)} aria-label={`Excluir ${marca?.nome || p.nome}`} className="flex flex-col items-center text-red-400 tap-target"><span className="text-sm">🗑️</span><span className="text-[10px] leading-tight">Apagar</span></button>
                                  </div>
                                </div>
                              );
                            })}
                            <div className="flex gap-2 pt-1 flex-wrap">
                              <button onClick={() => setFormVariante({ produto_id: p.id, marca_id: null, tamanho: "", tamanho_quantidade: null, tamanho_unidade: p.unidade_padrao, codigo_barras: "", descricao_variante: "", foto: null, tabela_nutricional: null, favorita: false, observacao: "" })}
                                className="text-emerald-700 text-xs font-semibold tap-target">+ Variante</button>
                              <button onClick={() => setFormProduto(p)} className="text-stone-500 text-xs font-semibold tap-target">Editar produto</button>
                              <button onClick={() => removerProduto(p)} className="text-red-400 text-xs font-semibold tap-target">Excluir produto</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!produtosFiltrados.length && <p className="text-stone-400 text-sm text-center py-8">Nenhum produto encontrado.</p>}
        </>
      )}

      {subaba === "marcas" && (
        <>
          <button onClick={() => setFormMarca({ nome: "" })} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Marca</button>
          <div className="space-y-2">
            {catalogo.marcas.map((m) => {
              const usos = catalogo.variantes.filter((v) => v.marca_id === m.id).length;
              return (
                <div key={m.id} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                  <div><div className="font-semibold text-stone-800">{m.nome}</div><div className="text-xs text-stone-400">{usos} variante(s)</div></div>
                  <div className="flex gap-3"><button onClick={() => setFormMarca(m)} aria-label={`Editar marca ${m.nome}`} className="text-stone-400 tap-target">✏️</button><button onClick={() => removerMarca(m)} aria-label={`Excluir marca ${m.nome}`} className="text-red-400 tap-target">🗑️</button></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {subaba === "categorias" && (
        <>
          <button onClick={() => setFormCategoria({ nome: "", icone: "🛒" })} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg mb-3 tap-target">+ Categoria</button>
          <div className="space-y-2">
            {catalogo.categorias.map((cat) => {
              const produtosDaCategoria = catalogo.produtos.filter((p) => p.categoria_id === cat.id);
              const expandida = categoriaExpandida === cat.id;
              return (
                <div key={cat.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <button className="w-full flex items-center justify-between p-3 text-left tap-target" onClick={() => setCategoriaExpandida(expandida ? null : cat.id)}>
                    <div><div className="font-semibold text-stone-800">{cat.icone} {cat.nome}</div><div className="text-xs text-stone-400">{produtosDaCategoria.length} produto(s)</div></div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setFormCategoria(cat); }} aria-label={`Editar categoria ${cat.nome}`} className="text-stone-400 tap-target">✏️</button>
                      <button onClick={(e) => { e.stopPropagation(); removerCategoria(cat); }} aria-label={`Excluir categoria ${cat.nome}`} className="text-red-400 tap-target">🗑️</button>
                      <span className="text-stone-400">{expandida ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  {expandida && (
                    <div className="border-t border-stone-100 p-3">
                      {produtosDaCategoria.length ? (
                        <div className="space-y-1">
                          {produtosDaCategoria.map((p) => <div key={p.id} className="text-sm text-stone-600 py-1">{p.nome}</div>)}
                        </div>
                      ) : <p className="text-xs text-stone-400 text-center py-2">Nenhum produto nessa categoria ainda.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {formProduto && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => { setFormProduto(null); setAvisoDuplicataProduto(null); }}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">{formProduto.id ? "Editar produto" : "Novo produto"}</h3>
            <label className="text-xs font-semibold text-stone-500 uppercase">Nome</label>
            <input value={formProduto.nome} onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1" />
            <label className="text-xs font-semibold text-stone-500 uppercase">Descrição (opcional)</label>
            <input value={formProduto.descricao} onChange={(e) => setFormProduto({ ...formProduto, descricao: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1" placeholder="ex: grão longo fino, tipo 1" />
            <label className="text-xs font-semibold text-stone-500 uppercase">Categoria</label>
            <select value={formProduto.categoria_id} onChange={(e) => setFormProduto({ ...formProduto, categoria_id: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-3 mt-1">
              {catalogo.categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
            </select>
            <label className="text-xs font-semibold text-stone-500 uppercase">Unidade padrão</label>
            <div className="flex gap-2 mt-1 mb-4">{["kg", "l", "un", "pacote"].map((u) => <Chip key={u} selected={formProduto.unidade_padrao === u} onClick={() => setFormProduto({ ...formProduto, unidade_padrao: u })}>{u}</Chip>)}</div>
            <div className="flex gap-2">
              <button onClick={() => { setFormProduto(null); setAvisoDuplicataProduto(null); }} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
              <button onClick={salvarProduto} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
            </div>
          </div>
        </div>
      )}
      {avisoDuplicataProduto && (
        <ModalConfirmar titulo="Já existe um produto parecido" severo={false}
          mensagem={`Já tem "${avisoDuplicataProduto.nome}" cadastrado. Criar "${formProduto?.nome}" mesmo assim, ou cancelar e usar o que já existe?`}
          textoConfirmar="Criar mesmo assim" textoCancelar="Cancelar"
          onConfirmar={salvarProduto} onCancelar={() => setAvisoDuplicataProduto(null)} />
      )}

      {formVariante && <FormVariante catalogo={catalogo} variante={formVariante} setVariante={setFormVariante} sessoes={sessoes} onSalvar={salvarVariante} onFechar={() => setFormVariante(null)} onVerHistorico={() => { setHistoricoVarianteId(formVariante.id); setFormVariante(null); }}
        onCriarMarca={(nome) => { const novaMarca = { id: uid(), nome }; setCatalogo((c) => ({ ...c, marcas: [...c.marcas, novaMarca] })); return novaMarca.id; }} />}

      {formMarca && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => { setFormMarca(null); setAvisoDuplicataMarca(null); }}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">{formMarca.id ? "Editar marca" : "Nova marca"}</h3>
            <input value={formMarca.nome} onChange={(e) => setFormMarca({ ...formMarca, nome: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mb-4" placeholder="Nome da marca" />
            <div className="flex gap-2">
              <button onClick={() => { setFormMarca(null); setAvisoDuplicataMarca(null); }} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
              <button onClick={salvarMarca} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
            </div>
          </div>
        </div>
      )}
      {avisoDuplicataMarca && (
        <ModalConfirmar titulo="Já existe uma marca parecida" severo={false}
          mensagem={`Já tem "${avisoDuplicataMarca.nome}" cadastrada. Criar "${formMarca?.nome}" mesmo assim, ou cancelar e usar a que já existe?`}
          textoConfirmar="Criar mesmo assim" textoCancelar="Cancelar"
          onConfirmar={salvarMarca} onCancelar={() => setAvisoDuplicataMarca(null)} />
      )}

      {formCategoria && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => setFormCategoria(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">{formCategoria.id ? "Editar categoria" : "Nova categoria"}</h3>
            <div className="flex gap-2 mb-3">
              <input value={formCategoria.icone} onChange={(e) => setFormCategoria({ ...formCategoria, icone: e.target.value })} className="w-16 border border-stone-300 rounded-lg p-2.5 text-center text-xl" />
              <input value={formCategoria.nome} onChange={(e) => setFormCategoria({ ...formCategoria, nome: e.target.value })} className="flex-1 border border-stone-300 rounded-lg p-2.5" placeholder="Nome da categoria" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFormCategoria(null)} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
              <button onClick={salvarCategoria} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {atualizando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-72 text-center">
            <div className="text-sm font-semibold mb-2">Atualizando preços...</div>
            <div className="text-xs text-stone-500 mb-3">{atualizando.atual} de {atualizando.total}</div>
            <div className="h-2 bg-stone-100 rounded-full mb-4"><div className="h-2 bg-emerald-600 rounded-full" style={{ width: `${(atualizando.atual / atualizando.total) * 100}%` }} /></div>
            <button onClick={() => { cancelarRef.current = true; }} className="text-red-500 text-sm font-semibold tap-target">Cancelar</button>
          </div>
        </div>
      )}

      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

function FormVariante({ catalogo, variante, setVariante, sessoes, onSalvar, onFechar, onVerHistorico, onCriarMarca }) {
  useFecharComVoltar(true, onFechar);
  const [carregandoFoto, setCarregandoFoto] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  async function onFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCarregandoFoto(true);
    try { const dataUrl = await resizeImage(file); setVariante({ ...variante, foto: dataUrl }); } catch (err) { alert("Não consegui processar essa imagem."); }
    setCarregandoFoto(false);
  }
  function setNutri(key, val) { setVariante({ ...variante, tabela_nutricional: { ...(variante.tabela_nutricional || {}), [key]: val } }); }
  const temHistorico = variante.id && historicoQualquerUnidade(sessoes, variante.id);

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col max-w-md mx-auto">
      <div className="flex items-center gap-3 p-4 border-b border-stone-200 shrink-0"><button onClick={onFechar} aria-label="Voltar" className="tap-target">←</button><h3 className="text-lg font-bold">{variante.id ? "Editar variante" : "Nova variante"}</h3></div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <SeletorBusca label="Marca" opcoes={catalogo.marcas} valorId={variante.marca_id} onSelecionar={(id) => setVariante({ ...variante, marca_id: id })} permitirNenhum nenhumLabel="genérico"
          onCriarNovo={onCriarMarca ? (nome) => { const id = onCriarMarca(nome); setVariante((v) => ({ ...v, marca_id: id })); } : null} labelCriar="marca" />

        {variante.marca_id && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={!!variante.favorita} onChange={(e) => setVariante({ ...variante, favorita: e.target.checked })} className="w-5 h-5" />
            ⭐ Marca favorita (aparece primeiro nas buscas)
          </label>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Quantidade</label>
            <input type="number" step="0.01" value={variante.tamanho_quantidade ?? ""} onChange={(e) => setVariante({ ...variante, tamanho_quantidade: e.target.value === "" ? null : parseFloat(e.target.value) })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1 font-mono2" placeholder="0.9" />
          </div>
          <div className="col-span-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Unidade</label>
            <div className="flex gap-1 mt-1">{["kg", "l", "un"].map((u) => <Chip key={u} selected={variante.tamanho_unidade === u} onClick={() => setVariante({ ...variante, tamanho_unidade: u })}>{u}</Chip>)}</div>
          </div>
          <div className="col-span-1">
            <label className="text-xs font-semibold text-stone-500 uppercase">Tamanho (texto)</label>
            <input value={variante.tamanho || ""} onChange={(e) => setVariante({ ...variante, tamanho: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1" placeholder={tamanhoDisplay(variante) || "auto"} />
          </div>
        </div>
        <p className="text-xs text-stone-400 -mt-2">Quantidade + unidade é o que conta pra comparar preço por embalagem. O texto do tamanho é só pra exibição — deixe em branco pra usar "{variante.tamanho_quantidade && variante.tamanho_unidade ? `${variante.tamanho_quantidade}${variante.tamanho_unidade}` : "quantidade+unidade"}" automaticamente, ou escreva algo mais descritivo (ex: "pacote 12un").</p>

        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase">Código de barras (opcional)</label>
          <div className="flex gap-2 mt-1">
            <input value={variante.codigo_barras || ""} onChange={(e) => setVariante({ ...variante, codigo_barras: e.target.value })} className="flex-1 border border-stone-300 rounded-lg p-2.5 font-mono2" placeholder="789..." />
            <button onClick={() => setEscaneando(true)} aria-label="Ler código de barras pela câmera" className="border border-stone-300 rounded-lg px-3 tap-target text-stone-700"><IconeCodigoBarras /></button>
          </div>
        </div>
        {escaneando && <ScannerCodigoBarras onDetectado={(codigo) => { setVariante({ ...variante, codigo_barras: codigo }); setEscaneando(false); }} onFechar={() => setEscaneando(false)} />}
        <div><label className="text-xs font-semibold text-stone-500 uppercase">Descrição da variante (opcional)</label><input value={variante.descricao_variante || ""} onChange={(e) => setVariante({ ...variante, descricao_variante: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1" placeholder="ex: integral, sem glúten" /></div>
        <div><label className="text-xs font-semibold text-stone-500 uppercase">Observação pessoal (opcional)</label><input value={variante.observacao || ""} onChange={(e) => setVariante({ ...variante, observacao: e.target.value })} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1" placeholder="ex: sempre mais barato no Rio Sul" /></div>

        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase">Foto (opcional)</label>
          <div className="flex items-center gap-3 mt-1">
            {variante.foto && <img src={variante.foto} className="w-14 h-14 rounded-lg object-cover border border-stone-200" alt="" />}
            <label className="text-sm text-emerald-700 font-semibold border border-emerald-700 rounded-lg px-3 py-2 cursor-pointer tap-target">
              {carregandoFoto ? "Processando..." : (variante.foto ? "Trocar foto" : "Adicionar foto")}
              <input type="file" accept="image/*" capture="environment" onChange={onFoto} className="hidden" />
            </label>
            {variante.foto && <button onClick={() => setVariante({ ...variante, foto: null })} className="text-xs text-red-400 tap-target">remover</button>}
          </div>
        </div>

        <details>
          <summary className="text-xs font-semibold text-emerald-700 cursor-pointer select-none py-1">Tabela nutricional (opcional) ▸</summary>
          <div className="grid grid-cols-2 gap-2 mt-2 bg-stone-50 p-3 rounded-lg">
            {CAMPOS_NUTRICIONAIS.map((campo) => (
              <div key={campo.key}>
                <label className="text-xs text-stone-400">{campo.label}</label>
                {campo.texto
                  ? <input value={variante.tabela_nutricional?.[campo.key] || ""} onChange={(e) => setNutri(campo.key, e.target.value)} placeholder={campo.placeholder} className="w-full border border-stone-300 rounded p-1.5 text-sm mt-0.5" />
                  : <input type="number" step="0.1" value={variante.tabela_nutricional?.[campo.key] ?? ""} onChange={(e) => setNutri(campo.key, e.target.value === "" ? null : parseFloat(e.target.value))} className="w-full border border-stone-300 rounded p-1.5 text-sm mt-0.5 font-mono2" />}
              </div>
            ))}
          </div>
        </details>

        {variante.id && (
          <button onClick={onVerHistorico} className="w-full text-left text-sm text-emerald-700 font-semibold border border-emerald-700 rounded-lg p-2.5 tap-target">
            📊 {temHistorico ? "Ver histórico completo de preço →" : "Sem histórico ainda"}
          </button>
        )}
      </div>
      <div className="p-4 border-t border-stone-200 shrink-0"><button onClick={onSalvar} className="w-full bg-emerald-700 text-white font-semibold py-3 rounded-xl tap-target">Salvar variante</button></div>
    </div>
  );
}

/* =========================================================
   TELA: HISTÓRICO DE PREÇO DE UMA VARIANTE
========================================================= */
function TelaHistoricoVariante({ varianteId, catalogo, sessoes, precoIaCache, onClose }) {
  useFecharComVoltar(true, onClose);
  const variante = by(catalogo.variantes, varianteId);
  const produto = variante && by(catalogo.produtos, variante.produto_id);
  const marca = variante?.marca_id ? by(catalogo.marcas, variante.marca_id) : null;
  const historico = historicoQualquerUnidade(sessoes, varianteId);
  const cronologia = historico ? historicoCronologico(sessoes, varianteId, historico.unidade) : [];
  const tendencia = historico ? calcTendencia(sessoes, varianteId, historico.unidade) : null;
  const historicoIA = precoIaCache[varianteId] || [];
  const pontosIA = historicoIA.map((e) => ({ preco: e.preco_medio_estimado, data: e.consultado_em }));
  const comparacao = compararVariantes(catalogo, sessoes, varianteId);
  const irmas = todasVariantesIrmas(catalogo, varianteId);
  const seriesComparacao = irmas.map((v, i) => ({
    label: tamanhoDisplay(v) || (v.marca_id ? by(catalogo.marcas, v.marca_id)?.nome : "genérico") || "—",
    cor: CORES_CATEGORIA[i % CORES_CATEGORIA.length],
    pontos: historicoNormalizadoCronologico(sessoes, v.id, v),
  }));
  const unidadeBaseComparacao = seriesComparacao.find((s) => s.pontos.length)?.pontos[0]?.unidadeBase || "un";
  const promocoes = historicoPromocoes(sessoes, varianteId);
  const descontosPromocoes = promocoes.map((p) => p.descontoPercentual);
  const pontosEconomia = promocoes.map((p) => ({ preco: p.economia, data: p.data }));

  const iconeTendencia = tendencia?.direcao === "subindo" ? "📈" : tendencia?.direcao === "caindo" ? "📉" : "→";
  const textoTendencia = tendencia?.direcao === "subindo" ? `Subindo (+${tendencia.pct.toFixed(0)}%)` : tendencia?.direcao === "caindo" ? `Caindo (${tendencia.pct.toFixed(0)}%)` : tendencia ? "Estável" : "";

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      <button onClick={onClose} aria-label="Voltar" className="flex items-center gap-1 text-stone-500 text-sm mb-3 tap-target">← Voltar</button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-2xl bg-stone-50 border border-stone-200">
          {variante?.foto ? <img src={variante.foto} className="w-full h-full object-cover" alt="" /> : "📦"}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-lg text-stone-800 truncate">{produto?.nome}</div>
          <div className="text-xs text-stone-500 truncate">{marca?.nome || "genérico"}{variante?.tamanho ? ` · ${tamanhoDisplay(variante)}` : ""}</div>
        </div>
      </div>

      {!historico && !historicoIA.length && <p className="text-stone-400 text-sm text-center py-10">Ainda não há nenhuma compra ou estimativa registrada desse item.</p>}

      {historico && (
        <div className="grid grid-cols-3 text-center bg-white border border-stone-200 rounded-xl p-3 mb-3">
          <div><div className="text-stone-400 text-xs uppercase">Mínimo</div><div className="font-mono2 font-bold text-lg">{brl(historico.min)}</div><div className="text-xs text-stone-400">{dataCurta(historico.dataMin)}</div></div>
          <div><div className="text-stone-400 text-xs uppercase">Médio</div><div className="font-mono2 font-bold text-lg">{brl(historico.media)}</div></div>
          <div><div className="text-stone-400 text-xs uppercase">Máximo</div><div className="font-mono2 font-bold text-lg">{brl(historico.max)}</div><div className="text-xs text-stone-400">{dataCurta(historico.dataMax)}</div></div>
        </div>
      )}

      {tendencia && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-stone-700">Tendência</span>
          <span className="text-sm font-mono2 font-semibold">{iconeTendencia} {textoTendencia}</span>
        </div>
      )}

      {(historico || !!historicoIA.length) && (
        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-4">
          <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Evolução do preço — real x estimado</div>
          <GraficoPrecoDuplo pontosReal={cronologia} pontosIA={pontosIA} />
        </div>
      )}

      {comparacao && (
        <div className="bg-white border border-emerald-200 rounded-xl p-3 mb-4">
          <div className="text-xs font-semibold text-emerald-700 uppercase mb-2">Comparação por tamanho (mesma marca)</div>
          <div className="space-y-1.5">
            {comparacao.map(({ variante: v, normalizado }, i) => {
              const vMarca = v.marca_id ? by(catalogo.marcas, v.marca_id) : null;
              const ehAtual = v.id === varianteId;
              return (
                <div key={v.id} className={`flex items-center justify-between text-sm rounded-lg px-2 py-1.5 ${ehAtual ? "bg-emerald-50 font-semibold" : ""}`}>
                  <span className="truncate">{i === 0 && "🏆 "}{tamanhoDisplay(v) || vMarca?.nome || "—"}{ehAtual ? " (esse)" : ""}</span>
                  <span className="font-mono2 shrink-0">{brl(normalizado.media)}/{normalizado.unidadeBase}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-stone-400 mt-2 mb-3">Comparando só entre tamanhos da mesma marca — preço normalizado por {comparacao[0].normalizado.unidadeBase}.</p>
          <div className="border-t border-dashed border-emerald-200 pt-3">
            <div className="text-xs font-semibold text-emerald-700 uppercase mb-2">Quem valia mais a pena, ao longo do tempo</div>
            <GraficoComparacaoTamanhos series={seriesComparacao} unidadeBase={unidadeBaseComparacao} />
          </div>
        </div>
      )}

      {historico && (
        <>
          <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Todas as compras</div>
          <div className="space-y-2 mb-4">
            {[...cronologia].reverse().map((r, i) => {
              const m = by(catalogo.mercados, r.mercado_id);
              return (
                <div key={i} className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m?.cor }} />
                    <div><div className="text-sm font-semibold text-stone-700">{m?.nome}</div><div className="text-xs text-stone-400">{dataCurta(r.data)}</div></div>
                  </div>
                  <span className="font-mono2 font-semibold">{brl(r.preco)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!!historicoIA.length && (
        <>
          <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Estimativas por IA ao longo do tempo</div>
          <div className="space-y-2">
            {[...historicoIA].reverse().map((est, i) => (
              <div key={i} className="bg-white border border-dashed border-stone-300 rounded-xl p-3 flex items-center justify-between">
                <div className="text-xs text-stone-400">{dataCurta(est.consultado_em)}</div>
                <div className="text-sm font-mono2">~{brl(est.preco_medio_estimado)} <span className="text-stone-400">({brl(est.preco_min_estimado)}–{brl(est.preco_max_estimado)})</span></div>
              </div>
            ))}
          </div>
        </>
      )}

      {!!promocoes.length && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-amber-700 uppercase mb-2">🏷️ Histórico de promoções</div>
          {promocoes.length >= 2 && (
            <div className="bg-white border border-amber-200 rounded-xl p-3 mb-3">
              <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Economia ao longo do tempo</div>
              <Sparkline pontos={pontosEconomia} />
            </div>
          )}
          <div className="space-y-2">
            {[...promocoes].reverse().map((p, iReversa) => {
              const iOriginal = promocoes.length - 1 - iReversa;
              const m = by(catalogo.mercados, p.mercado_id);
              const ind = indicadorPromocao(p.descontoPercentual, descontosPromocoes, iOriginal);
              const iconeInd = ind === "melhor" ? "📈 melhor" : ind === "pior" ? "📉 pior" : ind === "igual" ? "→ igual" : null;
              return (
                <div key={iReversa} className="bg-white border border-amber-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m?.cor }} />
                      <div className="text-sm font-semibold text-stone-700 truncate">{textoPromocao(p.promocao)}</div>
                    </div>
                    {iconeInd && <span className="text-xs font-semibold text-stone-500 shrink-0">{iconeInd}</span>}
                  </div>
                  <div className="text-xs text-stone-400 mb-1">{m?.nome} · {dataCurta(p.data)}</div>
                  <div className="text-xs font-mono2 flex justify-between">
                    <span className="text-stone-500">Normal {brl(p.precoNormal)} → pagou {brl(p.precoEfetivo)}</span>
                    <span className="text-emerald-700 font-semibold">-{p.descontoPercentual.toFixed(0)}% · economia {brl(p.economia)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MODAL: NOVA SESSÃO
========================================================= */
function ModalNovaSessao({ catalogo, sessoes, setSessoes, onCriada, onClose }) {
  useFecharComVoltar(true, onClose);
  const ativos = catalogo.mercados.filter((m) => m.ativo);
  const [escolhido, setEscolhido] = useState(null);
  const [orcamentoTexto, setOrcamentoTexto] = useState("");
  const temUltima = escolhido && sessoes.some((s) => s.status === "fechada" && s.mercado_id === escolhido);
  function iniciar(mercadoId, repetir) {
    let itens = [];
    if (repetir) {
      const ultima = [...sessoes].filter((s) => s.status === "fechada" && s.mercado_id === mercadoId).sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))[0];
      if (ultima) itens = ultima.itens.map((it) => ({ id: uid(), produto_variante_id: it.produto_variante_id, quantidade: it.quantidade, unidade: it.unidade, preco_pago: null, subtotal: null, comprado: false }));
    }
    const orcamento = parsePrecoInteligente(orcamentoTexto);
    const novaId = uid();
    setSessoes((ss) => [...ss, { id: novaId, mercado_id: mercadoId, data_hora: new Date().toISOString(), status: "em_andamento", origem: "manual", itens, valor_nota_fiscal: null, grafico_categorias: null, orcamento: orcamento || null }]);
    if (onCriada) onCriada(novaId);
    onClose();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">Onde você vai comprar?</h3>
        {!ativos.length && <p className="text-sm text-stone-500 mb-3">Cadastre um mercado primeiro, na aba Mercados.</p>}
        <div className="space-y-2 mb-4">
          {ativos.map((m) => (
            <button key={m.id} onClick={() => setEscolhido(m.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border tap-target ${escolhido === m.id ? "border-emerald-700 bg-emerald-50" : "border-stone-200"}`}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m.cor }} /><span className="font-semibold text-stone-700">{m.nome}</span>
            </button>
          ))}
        </div>
        {escolhido && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase">Orçamento pra essa compra (opcional)</label>
              <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1">
                <span className="text-stone-400 font-mono2">R$</span>
                <input value={orcamentoTexto} onChange={(e) => setOrcamentoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 30000 = R$300,00" className="font-mono2 font-bold flex-1 outline-none" aria-label="Orçamento da compra" />
              </div>
              <p className="text-xs text-stone-400 mt-1">Dá pra definir ou mudar isso depois também, direto na Lista.</p>
            </div>
            <div className="space-y-2">
              {temUltima && <button onClick={() => iniciar(escolhido, true)} className="w-full py-2.5 rounded-lg border border-emerald-700 text-emerald-700 font-semibold text-sm tap-target">Repetir última lista desse mercado</button>}
              <button onClick={() => iniciar(escolhido, false)} className="w-full py-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-sm tap-target">Começar lista em branco</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   FORMULÁRIO ENXUTO: cadastrar item novo sem sair da lista (seção 22.7)
========================================================= */
function FormNovoItemRapido({ catalogo, setCatalogo, codigoBarrasInicial, onCriado, onCancelar }) {
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState(catalogo.categorias[0]?.id || "");
  const [unidadePadrao, setUnidadePadrao] = useState("un");
  const [marcaId, setMarcaId] = useState(null);
  const [tamanhoQuantidade, setTamanhoQuantidade] = useState("");
  const [tamanhoUnidade, setTamanhoUnidade] = useState("un");
  const [tamanhoTexto, setTamanhoTexto] = useState("");
  const [codigoBarras, setCodigoBarras] = useState(codigoBarrasInicial || "");
  const [escaneando, setEscaneando] = useState(false);

  const [avisoMarcaParecida, setAvisoMarcaParecida] = useState(null);
  const [avisoProdutoParecido, setAvisoProdutoParecido] = useState(null);

  /* Etapa sobre simplificar (seção 9.7 do mapa, nunca implementada até agora): aqui dá pra
     oferecer "usar a existente" de verdade, diferente da tela de Produtos — já temos acesso
     direto a setMarcaId pra selecionar na hora, sem precisar sair do fluxo de compra. */
  function criarMarcaDeVerdade(novoNome) {
    const novaMarca = { id: uid(), nome: novoNome };
    setCatalogo((c) => ({ ...c, marcas: [...c.marcas, novaMarca] }));
    setMarcaId(novaMarca.id);
  }
  function criarMarca(novoNome) {
    const parecida = achaNomeParecido(novoNome, catalogo.marcas, null);
    if (parecida) { setAvisoMarcaParecida({ existente: parecida, nomeDigitado: novoNome }); return; }
    criarMarcaDeVerdade(novoNome);
  }

  function salvar() {
    if (!nome.trim() || !categoriaId) return;
    if (!avisoProdutoParecido) {
      const parecido = achaNomeParecido(nome, catalogo.produtos, null);
      if (parecido) { setAvisoProdutoParecido(parecido); return; }
    }
    const categoria = by(catalogo.categorias, categoriaId);
    const qtdNum = tamanhoQuantidade === "" ? null : parseFloat(tamanhoQuantidade);
    const novoProduto = { id: uid(), nome: nome.trim(), descricao: "", categoria_id: categoriaId, unidade_padrao: unidadePadrao };
    const novaVariante = { id: uid(), produto_id: novoProduto.id, marca_id: marcaId, tamanho: tamanhoTexto, tamanho_quantidade: qtdNum, tamanho_unidade: qtdNum ? tamanhoUnidade : null, codigo_barras: codigoBarras, descricao_variante: "", foto: null, tabela_nutricional: null, favorita: false, observacao: "" };
    setCatalogo((c) => ({ ...c, produtos: [...c.produtos, novoProduto], variantes: [...c.variantes, novaVariante] }));
    onCriado(novaVariante.id);
  }

  return (
    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5">
      <div className="text-xs font-semibold text-emerald-700 uppercase">Cadastrar item novo</div>
      <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do produto" className="w-full border border-stone-300 rounded-lg p-2.5" aria-label="Nome do produto" />
      <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2.5" aria-label="Categoria">
        {catalogo.categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
      </select>
      <div>
        <label className="text-xs font-semibold text-stone-500 uppercase">Unidade padrão</label>
        <div className="flex gap-1.5 mt-1">{["kg", "l", "un", "pacote"].map((u) => <Chip key={u} selected={unidadePadrao === u} onClick={() => setUnidadePadrao(u)}>{u}</Chip>)}</div>
      </div>
      <SeletorBusca label={null} opcoes={catalogo.marcas} valorId={marcaId} onSelecionar={setMarcaId} permitirNenhum nenhumLabel="Marca (opcional)" onCriarNovo={criarMarca} labelCriar="marca" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase">Quantidade (opcional)</label>
          <input type="number" step="0.01" value={tamanhoQuantidade} onChange={(e) => setTamanhoQuantidade(e.target.value)} className="w-full border border-stone-300 rounded-lg p-2.5 mt-1 font-mono2" placeholder="0.9" />
        </div>
        <div>
          <label className="text-xs font-semibold text-stone-500 uppercase">Unidade</label>
          <div className="flex gap-1 mt-1">{["kg", "l", "un"].map((u) => <Chip key={u} selected={tamanhoUnidade === u} onClick={() => setTamanhoUnidade(u)}>{u}</Chip>)}</div>
        </div>
      </div>
      <input value={tamanhoTexto} onChange={(e) => setTamanhoTexto(e.target.value)} placeholder={tamanhoQuantidade ? `auto: ${tamanhoQuantidade}${tamanhoUnidade}` : "Tamanho em texto (opcional, ex: pacote 12un)"} className="w-full border border-stone-300 rounded-lg p-2.5" />
      <div className="flex gap-2">
        <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="Código de barras (opcional)" className="flex-1 border border-stone-300 rounded-lg p-2.5 font-mono2 text-sm" />
        <button onClick={() => setEscaneando(true)} aria-label="Ler código de barras pela câmera" className="border border-stone-300 rounded-lg px-3 tap-target text-stone-700"><IconeCodigoBarras /></button>
      </div>
      {escaneando && <ScannerCodigoBarras onDetectado={(codigo) => { setCodigoBarras(codigo); setEscaneando(false); }} onFechar={() => setEscaneando(false)} />}
      <p className="text-xs text-stone-500">Foto e tabela nutricional dá pra completar depois, na aba Produtos.</p>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancelar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 text-sm tap-target">Cancelar</button>
        <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold text-sm tap-target">Criar e continuar</button>
      </div>
      {avisoMarcaParecida && (
        <ModalConfirmar titulo="Já existe uma marca parecida" severo={false}
          mensagem={`Já tem "${avisoMarcaParecida.existente.nome}" cadastrada. Criar "${avisoMarcaParecida.nomeDigitado}" mesmo assim, ou usar a que já existe?`}
          textoConfirmar="Criar mesmo assim" textoCancelar="Usar a existente"
          onConfirmar={() => { criarMarcaDeVerdade(avisoMarcaParecida.nomeDigitado); setAvisoMarcaParecida(null); }}
          onCancelar={() => { setMarcaId(avisoMarcaParecida.existente.id); setAvisoMarcaParecida(null); }} />
      )}
      {avisoProdutoParecido && (
        <ModalConfirmar titulo="Já existe um produto parecido" severo={false}
          mensagem={`Já tem "${avisoProdutoParecido.nome}" cadastrado. Criar "${nome}" mesmo assim, ou cancelar e buscar o que já existe?`}
          textoConfirmar="Criar mesmo assim" textoCancelar="Cancelar"
          onConfirmar={() => { salvar(); }} onCancelar={() => setAvisoProdutoParecido(null)} />
      )}
    </div>
  );
}

/* =========================================================
   MODAL: ADICIONAR ITEM (busca + filtro + criação rápida)
========================================================= */
/* Comparador ao vivo — digite o preço que está vendo em cada tamanho AGORA, sem depender de histórico.
   Só aparece quando existe mais de um tamanho da mesma marca (ou "genérico") pro mesmo produto. */
function ComparadorTamanhos({ catalogo, variante, onEscolher }) {
  const [precos, setPrecos] = useState({});
  const irmas = catalogo.variantes.filter((v) => v.produto_id === variante.produto_id && v.marca_id === variante.marca_id && v.tamanho_quantidade && v.tamanho_unidade);
  if (irmas.length < 2) return null;

  const comPreco = irmas.map((v) => {
    const num = parsePrecoInteligente(precos[v.id] || "");
    return { v, num, normalizado: num != null ? num / v.tamanho_quantidade : null };
  });
  const validos = comPreco.filter((x) => x.normalizado != null);
  const maisBarato = validos.length > 1 ? [...validos].sort((a, b) => a.normalizado - b.normalizado)[0] : null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="text-xs font-semibold text-amber-700 uppercase">⚖️ Qual tamanho compensa mais?</div>
      <p className="text-xs text-stone-600">Digite o preço de cada um que você está vendo agora na prateleira:</p>
      <div className="space-y-1.5">
        {comPreco.map(({ v, num, normalizado }) => {
          const ehVencedor = maisBarato?.v.id === v.id;
          return (
            <div key={v.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-2 ${ehVencedor ? "bg-emerald-100 border border-emerald-300" : "bg-white border border-stone-200"}`}>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{tamanhoDisplay(v)}{v.id === variante.id ? " (esse)" : ""}</div>
                {normalizado != null && <div className="text-xs font-mono2 text-stone-500">{brl(normalizado)}/{v.tamanho_unidade}{ehVencedor ? " 🏆" : ""}</div>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-stone-400 text-xs font-mono2">R$</span>
                <input value={precos[v.id] || ""} onChange={(e) => setPrecos({ ...precos, [v.id]: sanitizarEntradaPreco(e.target.value) })} placeholder="0,00"
                  className="w-16 text-right font-mono2 text-sm border border-stone-300 rounded px-1.5 py-1" aria-label={`Preço de ${tamanhoDisplay(v)}`} />
                {num != null && <button onClick={() => onEscolher(v.id, formatarValorCampo(num))} className="text-xs text-emerald-700 font-semibold underline shrink-0 tap-target">usar</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModalAdicionarItem({ catalogo, setCatalogo, sessoes, sessaoAtiva, precoIaCache, setPrecoIaCache, apiKey, onAdd, onClose }) {
  const frequentes = calcItensFrequentes(sessoes, catalogo);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState(null);
  const [categoriasExpandidas, setCategoriasExpandidas] = useState(false); // Etapa sobre filtro de categoria colapsável
  const [varianteId, setVarianteId] = useState(null);
  const [escaneando, setEscaneando] = useState(false);
  useFecharComVoltar(true, onClose);
  useFecharComVoltar(!!varianteId, () => setVarianteId(null));
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [quantidade, setQuantidade] = useState(1);
  const [trocandoUnidade, setTrocandoUnidade] = useState(false);
  const [unidade, setUnidade] = useState("un");
  const [precoTexto, setPrecoTexto] = useState("");
  const [buscandoIa, setBuscandoIa] = useState(false);
  const [promocaoAtual, setPromocaoAtual] = useState(null);

  function escolherVariante(vId) {
    /* Se veio de um scan sem correspondência e o usuário escolheu "anexar em existente", grava
       o código nessa variante antes de seguir o fluxo normal de escolha. */
    if (codigoParaAnexar) {
      setCatalogo((c) => ({ ...c, variantes: c.variantes.map((v) => (v.id === vId ? { ...v, codigo_barras: codigoParaAnexar } : v)) }));
      setCodigoParaAnexar(null);
    }
    setVarianteId(vId); setQuantidade(1); setPrecoTexto(""); setCriandoNovo(false); setPromocaoAtual(null);
  }

  /* Pedido do usuário: código escaneado sem match no catálogo oferece dois caminhos, em vez de
     um alert genérico mandando ir cadastrar manualmente em outro lugar — cadastrar novo (com o
     código já preenchido) ou anexar num item que já existe (buscando e tocando nele). */
  const [codigoNaoEncontrado, setCodigoNaoEncontrado] = useState(null);
  const [codigoParaNovoItem, setCodigoParaNovoItem] = useState(null);
  const [codigoParaAnexar, setCodigoParaAnexar] = useState(null);

  function aoDetectarCodigo(codigo) {
    setEscaneando(false);
    const encontrada = catalogo.variantes.find((v) => v.codigo_barras && v.codigo_barras === codigo);
    if (encontrada) { escolherVariante(encontrada.id); }
    else { setCodigoNaoEncontrado(codigo); }
  }

  const variante = varianteId ? by(catalogo.variantes, varianteId) : null;
  const produtoDaVariante = variante ? by(catalogo.produtos, variante.produto_id) : null;

  useEffect(() => {
    /* Etapa sobre corrigir unidade padrão (achado real: Abobrinha vindo "un" em vez de "kg") —
       a lógica antiga usava tamanho_quantidade pra decidir a unidade, o que está errado: ter um
       tamanho de embalagem cadastrado (usado só pra preço por unidade, seção 5.7) não tem nada
       a ver com qual unidade você usa pra COMPRAR o item. Unidade padrão do produto é sempre a
       fonte certa. */
    if (variante) setUnidade(produtoDaVariante?.unidade_padrao || "kg");
  }, [varianteId]);

  function infoVariante(v) {
    const produto = by(catalogo.produtos, v.produto_id);
    const marca = v.marca_id ? by(catalogo.marcas, v.marca_id) : null;
    const categoria = produto ? by(catalogo.categorias, produto.categoria_id) : null;
    return { produto, marca, categoria };
  }

  const listaFiltrada = catalogo.variantes
    .map((v) => ({ v, ...infoVariante(v) }))
    .filter(({ produto, marca }) => {
      if (!produto) return false;
      const texto = normalizar(`${produto.nome} ${marca?.nome || ""}`);
      if (busca.trim() && !texto.includes(normalizar(busca))) return false;
      return true;
    })
    .filter(({ produto }) => !categoriaFiltro || produto.categoria_id === categoriaFiltro);

  /* Agrupa por produto+marca — pra tamanhos diferentes do mesmo item (ex: Nescau 350g/950g)
     aparecerem juntos num só cartão, em vez de linhas soltas repetindo produto+marca. */
  const gruposFiltrados = (() => {
    const grupos = {};
    for (const item of listaFiltrada) {
      const chave = `${item.produto.id}::${item.marca?.id || "generico"}`;
      if (!grupos[chave]) grupos[chave] = { produto: item.produto, marca: item.marca, categoria: item.categoria, variantes: [] };
      grupos[chave].variantes.push(item.v);
    }
    return Object.values(grupos).sort((a, b) => {
      const fa = a.variantes.some((v) => v.favorita) ? 1 : 0, fb = b.variantes.some((v) => v.favorita) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return (a.produto.nome || "").localeCompare(b.produto.nome || "");
    });
  })();

  function escolherComPreco(vId, precoJaDigitado) { setVarianteId(vId); setQuantidade(1); setPrecoTexto(precoJaDigitado); setCriandoNovo(false); setPromocaoAtual(null); }

  async function atualizarIA() {
    if (!variante || !produtoDaVariante) return;
    if (!apiKey) { alert("Adicione sua chave de API da Anthropic em Configurações pra usar essa função."); return; }
    setBuscandoIa(true);
    try {
      const marca = variante.marca_id && by(catalogo.marcas, variante.marca_id);
      const est = await buscarPrecoIA(produtoDaVariante.nome, marca?.nome, variante.tamanho, apiKey);
      setPrecoIaCache((c) => adicionarEstimativa(c, variante.id, est));
    } catch (e) { alert("Não consegui buscar o preço agora: " + e.message); }
    finally { setBuscandoIa(false); }
  }

  function confirmarAdicionar() {
    const preco = parsePrecoInteligente(precoTexto);
    const qtd = parseQuantidadeInteligente(String(quantidade), unidade !== "un") || 1;
    if (promocaoAtual) {
      const resultado = calcularPrecoComPromocao(preco, qtd, promocaoAtual);
      if (!resultado.ativada) { alert(`Faltam ${resultado.faltam} unidade(s) pra ativar essa promoção. Aumente a quantidade ou remova a promoção pra adicionar sem desconto.`); return; }
      onAdd({ id: uid(), produto_variante_id: varianteId, quantidade: qtd, unidade, preco_pago: resultado.precoEfetivo, preco_normal: preco, promocao: promocaoAtual, subtotal: multiplicarValor(resultado.precoEfetivo, qtd), comprado: false });
      return;
    }
    onAdd({ id: uid(), produto_variante_id: varianteId, quantidade: qtd, unidade, preco_pago: preco, preco_normal: null, promocao: null, subtotal: preco != null ? multiplicarValor(preco, qtd) : null, comprado: false });
  }

  const historicoGeral = varianteId ? calcHistorico(sessoes, varianteId, unidade) : null;
  const iaCache = varianteId ? ultimaEstimativa(precoIaCache, varianteId) : null;
  const precoNum = parsePrecoInteligente(precoTexto);
  const qtdInterpretada = parseQuantidadeInteligente(String(quantidade), unidade !== "un") || 1;
  const mediaRefParaPromo = historicoGeral?.media ?? iaCache?.preco_medio_estimado ?? null;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col max-w-md mx-auto">
      <div className="flex items-center gap-3 p-4 border-b border-stone-200 shrink-0">
        <button onClick={variante ? () => setVarianteId(null) : onClose} aria-label="Voltar" className="tap-target">←</button>
        <h3 className="text-lg font-bold">{variante ? "Detalhes do item" : "Novo item"}</h3>
      </div>

      {!variante && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex gap-2">
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar por nome ou marca..." className="flex-1 border border-stone-300 rounded-lg p-3 text-base" aria-label="Buscar produto" />
            <button onClick={() => setEscaneando(true)} aria-label="Ler código de barras" className="border border-stone-300 rounded-lg px-3 tap-target text-stone-700"><IconeCodigoBarras /></button>
          </div>
          {escaneando && <ScannerCodigoBarras onDetectado={aoDetectarCodigo} onFechar={() => setEscaneando(false)} />}

          {codigoNaoEncontrado && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
              <p className="text-sm text-amber-800">Código <span className="font-mono2">{codigoNaoEncontrado}</span> não encontrado no catálogo. O que prefere?</p>
              <div className="flex gap-2">
                <button onClick={() => { setCodigoParaNovoItem(codigoNaoEncontrado); setCriandoNovo(true); setCodigoNaoEncontrado(null); }} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold tap-target">➕ Cadastrar novo</button>
                <button onClick={() => { setCodigoParaAnexar(codigoNaoEncontrado); setCodigoNaoEncontrado(null); }} className="flex-1 py-2 rounded-lg border border-emerald-700 text-emerald-700 text-sm font-semibold tap-target">🔎 Anexar em existente</button>
              </div>
            </div>
          )}
          {codigoParaAnexar && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-xs text-blue-700 flex items-center justify-between gap-2">
              <span>Busca e toca no item pra anexar o código <span className="font-mono2">{codigoParaAnexar}</span> nele.</span>
              <button onClick={() => setCodigoParaAnexar(null)} className="underline shrink-0 tap-target">cancelar</button>
            </div>
          )}

          {!categoriasExpandidas ? (
            <button onClick={() => setCategoriasExpandidas(true)} className="flex items-center gap-1.5 text-sm text-stone-600 border border-stone-300 rounded-lg px-3 py-2 tap-target">
              {categoriaFiltro ? (() => { const c = by(catalogo.categorias, categoriaFiltro); return `${c?.icone || ""} ${c?.nome || ""}`; })() : "🏷️ Filtrar categoria"} <span className="text-stone-400">▾</span>
            </button>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <Chip selected={!categoriaFiltro} onClick={() => { setCategoriaFiltro(null); setCategoriasExpandidas(false); }}>Todas</Chip>
              {catalogo.categorias.map((c) => <Chip key={c.id} selected={categoriaFiltro === c.id} onClick={() => { setCategoriaFiltro(categoriaFiltro === c.id ? null : c.id); setCategoriasExpandidas(false); }}>{c.icone} {c.nome}</Chip>)}
            </div>
          )}

          {!busca.trim() && !categoriaFiltro && !criandoNovo && !!frequentes.length && (
            <div>
              <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Comprados com frequência</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {frequentes.map((vId) => {
                  const v = by(catalogo.variantes, vId);
                  if (!v) return null;
                  const p = by(catalogo.produtos, v.produto_id);
                  return <Chip key={vId} onClick={() => escolherVariante(vId)}><span className="whitespace-nowrap">{v.favorita && "⭐ "}{p?.nome}</span></Chip>;
                })}
              </div>
            </div>
          )}

          {!criandoNovo && (
            <div className="space-y-1.5">
              {gruposFiltrados.map((grupo) => {
                const temFavorita = grupo.variantes.some((v) => v.favorita);
                return (
                  <div key={grupo.produto.id + "::" + (grupo.marca?.id || "generico")} className="bg-white border border-stone-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-stone-800 text-sm truncate">{temFavorita && "⭐ "}{grupo.produto.nome}</div>
                      <span className="text-xs text-stone-400 shrink-0">{grupo.categoria?.icone}</span>
                    </div>
                    <div className="text-xs text-stone-500 mb-2">{grupo.marca?.nome || "genérico"}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {grupo.variantes.map((v) => (
                        <button key={v.id} onClick={() => escolherVariante(v.id)} aria-label={`${grupo.produto.nome} ${tamanhoDisplay(v)}`}
                          className="text-xs px-2.5 py-1.5 rounded-full border border-stone-300 bg-stone-50 tap-target">
                          {tamanhoDisplay(v) || "un"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!gruposFiltrados.length && <p className="text-stone-400 text-sm text-center py-6">Nada encontrado. Toca em "+ Cadastrar item novo" abaixo pra criar.</p>}
            </div>
          )}

          {/* Etapa sobre o botão de criar item competir com a busca: desce pra depois dos
              resultados — só compete por atenção quando você já olhou e não achou, não antes. */}
          {criandoNovo ? (
            <FormNovoItemRapido catalogo={catalogo} setCatalogo={setCatalogo} codigoBarrasInicial={codigoParaNovoItem} onCriado={escolherVariante} onCancelar={() => { setCriandoNovo(false); setCodigoParaNovoItem(null); }} />
          ) : (
            <button onClick={() => setCriandoNovo(true)} className="w-full text-left text-sm text-emerald-700 font-semibold border border-dashed border-emerald-400 rounded-lg p-2.5 tap-target">
              + Cadastrar item novo
            </button>
          )}
        </div>
      )}

      {variante && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="font-bold text-lg text-stone-800">{variante.favorita && "⭐ "}{produtoDaVariante?.nome}</div>
              <div className="text-sm text-stone-500">{(variante.marca_id && by(catalogo.marcas, variante.marca_id)?.nome) || "genérico"}{tamanhoDisplay(variante) ? ` · ${tamanhoDisplay(variante)}` : ""}</div>
              {variante.observacao && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-1 inline-block">💬 {variante.observacao}</div>}
            </div>

            <ComparadorTamanhos catalogo={catalogo} variante={variante} onEscolher={escolherComPreco} />

            <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-3 space-y-2">
              {historicoGeral ? (
                <div className="grid grid-cols-3 text-center text-xs">
                  <div><div className="text-stone-400 text-xs">Mínimo</div><div className="font-mono2 font-semibold">{brl(historicoGeral.min)}</div><div className="text-xs text-stone-400">{dataCurta(historicoGeral.dataMin)}</div></div>
                  <div><div className="text-stone-400 text-xs">Médio</div><div className="font-mono2 font-semibold">{brl(historicoGeral.media)}</div></div>
                  <div><div className="text-stone-400 text-xs">Máximo</div><div className="font-mono2 font-semibold">{brl(historicoGeral.max)}</div><div className="text-xs text-stone-400">{dataCurta(historicoGeral.dataMax)}</div></div>
                </div>
              ) : <div className="text-xs text-stone-400 text-center">Sem histórico ainda pra esse item.</div>}

              <div className="border-t border-dashed border-stone-300 pt-2 space-y-1">
                {catalogo.mercados.filter((m) => m.ativo).map((m) => {
                  const u = calcUltimaCompra(sessoes, varianteId, m.id);
                  return (
                    <div key={m.id} className="flex justify-between text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.cor }} />{m.nome}</span>
                      <span className="font-mono2 text-stone-500">{u ? `${brl(u.preco)} · ${diasDesde(u.data)}` : "sem histórico"}</span>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-dashed border-stone-300 pt-2 flex justify-between items-center gap-2">
                <div className="text-xs">{iaCache ? <span className="font-mono2">IA: {brl(iaCache.preco_medio_estimado)} <span className="text-stone-400">({brl(iaCache.preco_min_estimado)}–{brl(iaCache.preco_max_estimado)})</span></span> : <span className="text-stone-400">Sem estimativa por IA</span>}</div>
                <button onClick={atualizarIA} disabled={buscandoIa} className="text-emerald-700 text-xs font-semibold flex items-center gap-1 shrink-0 tap-target">{buscandoIa ? "Buscando…" : "🔄 Atualizar"}</button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-stone-400 uppercase">
                  {variante.tamanho_quantidade && unidade === "un" ? `Quantas embalagens de ${tamanhoDisplay(variante)}?` : "Quantidade"}
                </div>
                {unidade !== "un" && <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">098→0,98{unidade}</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 border border-stone-300 rounded-xl px-3 py-2.5 flex-1">
                  <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="decimal" className="font-mono2 font-semibold flex-1 outline-none text-center min-w-0" aria-label="Quantidade" />
                  <span className="text-stone-400 font-mono2 text-sm shrink-0">{unidade}</span>
                </div>
                <button onClick={() => setTrocandoUnidade(true)} aria-label="Mudar unidade" className="border border-stone-300 rounded-xl px-3 py-2.5 text-stone-500 tap-target shrink-0">⇅</button>
              </div>
              {unidade !== "un" && (
                <div className="text-xs text-stone-400 mt-1">= {qtdInterpretada}{unidade}</div>
              )}
              {variante.tamanho_quantidade && unidade === "un" && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2">
                  = {(qtdInterpretada * variante.tamanho_quantidade).toLocaleString("pt-BR")} {variante.tamanho_unidade} no total ({qtdInterpretada}× {tamanhoDisplay(variante)})
                </p>
              )}
              {trocandoUnidade && (
                <ModalMudarUnidade unidadeAtual={unidade} nomeProduto={produtoDaVariante?.nome}
                  onEscolher={(novaUnidade, salvarNoCadastro) => {
                    setUnidade(novaUnidade);
                    if (salvarNoCadastro && produtoDaVariante) {
                      setCatalogo((c) => ({ ...c, produtos: c.produtos.map((p) => (p.id === produtoDaVariante.id ? { ...p, unidade_padrao: novaUnidade } : p)) }));
                    }
                    setTrocandoUnidade(false);
                  }}
                  onFechar={() => setTrocandoUnidade(false)} />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-stone-400 uppercase">{promocaoAtual ? "Preço normal (sem desconto)" : "Preço que você vai pagar aqui (opcional)"}</div>
                <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">350→R$3,50</span>
              </div>
              <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5">
                <span className="text-stone-400 font-mono2">R$</span>
                <input value={precoTexto} onChange={(e) => setPrecoTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 350 = R$3,50" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Preço" />
              </div>
              <div className="text-xs text-stone-400 mt-1">
                {precoNum != null ? <>= {brl(precoNum)}{variante.tamanho_quantidade && unidade === "un" ? ` · ${brl(precoNum / variante.tamanho_quantidade)}/${variante.tamanho_unidade}` : ""}</> : "digite sem vírgula (350 = R$3,50) ou com vírgula pra valor exato (120,00)"}
              </div>
            </div>

            <SecaoPromocao precoNormalNum={precoNum} quantidade={qtdInterpretada} unidade={unidade} mediaRef={mediaRefParaPromo} valorInicial={null} onMudar={setPromocaoAtual} />
          </div>
          <div className="p-4 border-t border-stone-200 shrink-0"><button onClick={confirmarAdicionar} className="w-full bg-emerald-700 text-white font-semibold py-3 rounded-xl tap-target">Adicionar à lista</button></div>
        </>
      )}
    </div>
  );
}

/* =========================================================
   LINHA DE ITEM — indicador de cor visível em Lista E Carrinho (seção 22.1),
   layout em 3 linhas pra nunca cortar preço/indicador
========================================================= */
function ItemLinha({ item, catalogo, mediaRef, onAbrirEditor, onToggleComprado, onRemoverConfirmado, onAtualizarQuantidade }) {
  const variante = by(catalogo.variantes, item.produto_variante_id);
  const produto = variante && by(catalogo.produtos, variante.produto_id);
  const marca = variante?.marca_id ? by(catalogo.marcas, variante.marca_id) : null;
  const categoria = produto && by(catalogo.categorias, produto.categoria_id);
  /* Etapa sobre editar quantidade direto na lista: estado local só dessa linha — toca no número,
     vira campo, confirma ao sair do foco ou Enter, sem precisar abrir o editor inteiro. Usa a
     mesma regra de "peso inteligente" quando a unidade é fracionável (kg/L). */
  const [editandoQtd, setEditandoQtd] = useState(false);
  const [qtdEditavel, setQtdEditavel] = useState("");
  function confirmarQtd() {
    const nova = parseQuantidadeInteligente(qtdEditavel, item.unidade !== "un");
    if (nova != null && nova > 0) onAtualizarQuantidade(item, nova);
    setEditandoQtd(false);
  }

  const temPromocao = !!item.promocao;
  const indicador = !temPromocao && item.preco_pago != null ? calcIndicador(item.preco_pago, mediaRef) : null;
  const corPreco = temPromocao ? "#b45309" : indicador === "bom" ? "var(--ink-green)" : indicador === "caro" ? "var(--ink-red)" : (item.comprado ? "var(--ink-blue)" : "var(--ink-black)");
  const simbolo = indicador === "bom" ? " ▼" : indicador === "caro" ? " ▲" : "";

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-xl bg-white border border-stone-200">
        {variante?.foto ? <img src={variante.foto} className="w-full h-full object-cover" alt="" /> : (categoria?.icone || "🛒")}
      </div>

      <div className="flex-1 min-w-0">
        <button onClick={() => onAbrirEditor(item)} aria-label={`Editar ${produto?.nome || "item"}`} className="text-left w-full">
          <div className="handwrite text-xl leading-tight truncate" style={{ color: item.comprado ? "var(--ink-blue)" : "var(--ink-black)", textDecoration: item.comprado ? "line-through" : "none" }}>
            {variante?.favorita && "⭐ "}{produto?.nome}
          </div>
        </button>
        <div className="text-xs text-stone-500 flex items-center gap-1">
          <button onClick={() => onAbrirEditor(item)} className="truncate text-left">{marca?.nome || "genérico"}</button>
          <span className="shrink-0">·</span>
          {editandoQtd ? (
            <input autoFocus inputMode="decimal" value={qtdEditavel} onChange={(e) => setQtdEditavel(e.target.value)}
              onBlur={confirmarQtd} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-14 font-mono2 border-b-2 border-emerald-600 outline-none text-center shrink-0" aria-label="Editar quantidade" />
          ) : (
            <button onClick={() => { setQtdEditavel(String(item.quantidade)); setEditandoQtd(true); }} aria-label="Tocar pra editar a quantidade"
              className="font-mono2 underline decoration-dotted decoration-stone-300 shrink-0 tap-target">
              {variante?.tamanho_quantidade && item.unidade === "un" ? `${item.quantidade}× ${tamanhoDisplay(variante)}` : `${item.quantidade}${item.unidade}`}
            </button>
          )}
        </div>
        <button onClick={() => onAbrirEditor(item)} className="text-left w-full">
          <div className="text-xs font-mono2 font-semibold" style={{ color: corPreco }}>
            {item.preco_pago != null ? <>{brl(item.subtotal)}{temPromocao ? " 🏷️" : simbolo}</> : <span className="text-stone-400 font-normal">sem preço ainda</span>}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => {
            /* Etapa sobre "comprado sem preço": marcar como comprado sem preço nenhum não faz
               sentido — é o núcleo do app (controlar gasto real). Em vez de só bloquear, abre o
               editor já pedindo o preço; salvando lá, o item já sai marcado como comprado, sem
               precisar tocar aqui de novo. Desmarcar (já comprado → não comprado) continua direto,
               sem pedir nada — isso nunca teve problema. */
            if (!item.comprado && item.preco_pago == null) { onAbrirEditor(item, true); return; }
            onToggleComprado(item);
          }}
          aria-label={item.comprado ? `Desmarcar ${produto?.nome} como comprado` : `Marcar ${produto?.nome} como comprado`}
          className={`tap-target rounded-md border-2 flex items-center justify-center text-base font-bold ${item.comprado ? "bg-emerald-600 border-emerald-600 text-white" : "border-stone-300 bg-white text-transparent"}`}>
          ✓
        </button>
        <button onClick={() => onRemoverConfirmado(item)} aria-label={`Remover ${produto?.nome} da lista`}
          className="tap-target rounded-md border-2 border-red-200 bg-white flex items-center justify-center text-red-500 text-base font-bold">
          ✕
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   MODAL: PEQUENO EDITOR DO ITEM
========================================================= */
/* Seção 31: componente único de promoção, reutilizado no editor pequeno E no Adicionar Item.
   Três tipos: % com mínimo, leve/pague, e bloco (ex: "1 é 8, 2 é 15" — comum em hortifrúti).
   Mostra também um indicador comparando o preço promocional com a média histórica REAL do item —
   pra não confiar cegamente que "promoção = bom negócio" (pedido do usuário). */
function SecaoPromocao({ precoNormalNum, quantidade, unidade, mediaRef, valorInicial, onMudar }) {
  const [promoAtiva, setPromoAtiva] = useState(!!valorInicial);
  const [tipoPromo, setTipoPromo] = useState(valorInicial?.tipo || "desconto_percentual");
  const [percentualTexto, setPercentualTexto] = useState(valorInicial?.percentual != null ? String(valorInicial.percentual) : "");
  const [qtdMinimaTexto, setQtdMinimaTexto] = useState(valorInicial?.quantidade_minima != null ? String(valorInicial.quantidade_minima) : "3");
  const [leveTexto, setLeveTexto] = useState(valorInicial?.leve != null ? String(valorInicial.leve) : "4");
  const [pagueTexto, setPagueTexto] = useState(valorInicial?.pague != null ? String(valorInicial.pague) : "3");
  const [qtdBlocoTexto, setQtdBlocoTexto] = useState(valorInicial?.quantidade_bloco != null ? String(valorInicial.quantidade_bloco) : "2");
  const [precoBlocoTexto, setPrecoBlocoTexto] = useState(valorInicial?.preco_bloco != null ? formatarValorCampo(valorInicial.preco_bloco) : "");

  const promoAtual = tipoPromo === "desconto_percentual"
    ? { tipo: "desconto_percentual", percentual: numDe(percentualTexto) || 0, quantidade_minima: numDe(qtdMinimaTexto) || 1 }
    : tipoPromo === "leve_pague"
    ? { tipo: "leve_pague", leve: numDe(leveTexto) || 1, pague: numDe(pagueTexto) || 1 }
    : { tipo: "bloco", quantidade_bloco: numDe(qtdBlocoTexto) || 1, preco_bloco: parsePrecoInteligente(precoBlocoTexto) };

  useEffect(() => { onMudar(promoAtiva ? promoAtual : null); },
    [promoAtiva, tipoPromo, percentualTexto, qtdMinimaTexto, leveTexto, pagueTexto, qtdBlocoTexto, precoBlocoTexto]);

  const resultadoPromo = promoAtiva && precoNormalNum != null ? calcularPrecoComPromocao(precoNormalNum, quantidade, promoAtual) : null;
  const indicadorVsHistorico = resultadoPromo?.ativada && mediaRef != null ? calcIndicador(resultadoPromo.precoEfetivo, mediaRef) : null;

  return (
    <div>
      <button onClick={() => setPromoAtiva(!promoAtiva)} className={`w-full text-left text-sm font-semibold border rounded-lg p-2.5 tap-target ${promoAtiva ? "bg-amber-50 border-amber-400 text-amber-700" : "border-stone-300 text-stone-600"}`}>
        🏷️ {promoAtiva ? "Promoção ativada — toque pra remover" : "Tem promoção nesse item?"}
      </button>
      {promoAtiva && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 mt-2">
          <div className="flex gap-2 flex-wrap">
            <Chip selected={tipoPromo === "desconto_percentual"} onClick={() => setTipoPromo("desconto_percentual")}>% de desconto</Chip>
            <Chip selected={tipoPromo === "leve_pague"} onClick={() => setTipoPromo("leve_pague")}>Leve/Pague</Chip>
            <Chip selected={tipoPromo === "bloco"} onClick={() => setTipoPromo("bloco")}>Preço em bloco</Chip>
          </div>
          {tipoPromo === "desconto_percentual" && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-stone-500">Desconto (%)</label><input value={percentualTexto} onChange={(e) => setPercentualTexto(e.target.value.replace(/\D/g, ""))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="30" aria-label="Percentual de desconto" /></div>
              <div><label className="text-xs text-stone-500">A partir de quantas un.</label><input value={qtdMinimaTexto} onChange={(e) => setQtdMinimaTexto(e.target.value.replace(/\D/g, ""))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="3" aria-label="Quantidade mínima" /></div>
            </div>
          )}
          {tipoPromo === "leve_pague" && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-stone-500">Leve</label><input value={leveTexto} onChange={(e) => setLeveTexto(e.target.value.replace(/\D/g, ""))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="4" aria-label="Leve quantas unidades" /></div>
              <div><label className="text-xs text-stone-500">Pague</label><input value={pagueTexto} onChange={(e) => setPagueTexto(e.target.value.replace(/\D/g, ""))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="3" aria-label="Pague quantas unidades" /></div>
            </div>
          )}
          {tipoPromo === "bloco" && (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-stone-500">Quantas unidades no bloco</label><input value={qtdBlocoTexto} onChange={(e) => setQtdBlocoTexto(e.target.value.replace(/\D/g, ""))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="2" aria-label="Quantidade do bloco" /></div>
              <div><label className="text-xs text-stone-500">Preço do bloco (R$)</label><input value={precoBlocoTexto} onChange={(e) => setPrecoBlocoTexto(sanitizarEntradaPreco(e.target.value))} className="w-full border border-stone-300 rounded-lg p-2 font-mono2" placeholder="15,00" aria-label="Preço do bloco" /></div>
            </div>
          )}
          {precoNormalNum == null && <p className="text-xs text-stone-500">Digite o preço normal acima pra ver o cálculo.</p>}
          {precoNormalNum != null && resultadoPromo && !resultadoPromo.ativada && (
            <p className="text-xs text-red-600 font-semibold">Faltam {resultadoPromo.faltam} unidade(s) pra ativar — promoção ainda não aplicada.</p>
          )}
          {precoNormalNum != null && resultadoPromo && resultadoPromo.ativada && (
            <div className="text-xs text-emerald-700 font-semibold bg-emerald-50 rounded-lg p-2">
              ✓ Ativada: {brl(resultadoPromo.precoEfetivo)}/{unidade} · total {brl(resultadoPromo.precoEfetivo * quantidade)} · economia de {brl((precoNormalNum - resultadoPromo.precoEfetivo) * quantidade)}
              {tipoPromo === "bloco" && resultadoPromo.faltam > 0 && <div className="text-stone-500 font-normal mt-1">Faltam {resultadoPromo.faltam} unidade(s) pra completar mais um bloco.</div>}
            </div>
          )}
          {indicadorVsHistorico && (
            <div className={`text-xs font-semibold rounded-lg p-2 ${indicadorVsHistorico === "bom" ? "bg-emerald-100 text-emerald-800" : indicadorVsHistorico === "caro" ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
              {indicadorVsHistorico === "bom" && "✓ Vale a pena — fica abaixo da média histórica desse item"}
              {indicadorVsHistorico === "caro" && "⚠️ Mesmo com a promoção, ainda fica acima da média histórica"}
              {indicadorVsHistorico === "normal" && "≈ Fica dentro do preço que esse item costuma ter, com ou sem promoção"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModalEditarItem({ item, marcarComprado, catalogo, setCatalogo, sessoes, sessaoAtiva, precoIaCache, setPrecoIaCache, apiKey, onChange, onRemoverConfirmado, onClose }) {
  useFecharComVoltar(true, onClose);
  const variante = by(catalogo.variantes, item.produto_variante_id);
  const produto = variante && by(catalogo.produtos, variante.produto_id);
  const marca = variante?.marca_id ? by(catalogo.marcas, variante.marca_id) : null;
  const [escaneando, setEscaneando] = useState(false);

  const [qtdTexto, setQtdTexto] = useState(String(item.quantidade).replace(".", ","));
  const [unidade, setUnidade] = useState(item.unidade);
  const [precoTexto, setPrecoTexto] = useState(item.preco_normal != null ? formatarValorCampo(item.preco_normal) : (item.preco_pago != null ? formatarValorCampo(item.preco_pago) : ""));
  const [buscandoIa, setBuscandoIa] = useState(false);
  const [alertaOutlier, setAlertaOutlier] = useState(false);
  const [promocaoAtual, setPromocaoAtual] = useState(item.promocao || null);
  const [trocandoUnidade, setTrocandoUnidade] = useState(false);

  const mediaRecente = calcMediaRecente(sessoes, item.produto_variante_id, unidade, sessaoAtiva.mercado_id);
  const mediaGeral = calcHistorico(sessoes, item.produto_variante_id, unidade)?.media;
  const referenciaCruzada = mediaRecente == null && mediaGeral == null ? precoReferenciaEntreTamanhos(catalogo, sessoes, item.produto_variante_id) : null;
  const iaCache = ultimaEstimativa(precoIaCache, item.produto_variante_id);
  const referencia = referenciaComFonte(mediaRecente, mediaGeral, referenciaCruzada, iaCache?.preco_medio_estimado);
  const mediaRef = referencia?.valor ?? null;
  const precoNum = parsePrecoInteligente(precoTexto); // quando tem promocaoAtual, isso é o preço NORMAL (sem desconto)
  const qtdNum = parseQuantidadeInteligente(String(qtdTexto), unidade !== "un") || item.quantidade;
  const resultadoPromo = promocaoAtual && precoNum != null ? calcularPrecoComPromocao(precoNum, qtdNum, promocaoAtual) : null;

  async function atualizarIA() {
    if (!apiKey) { alert("Adicione sua chave de API da Anthropic em Configurações."); return; }
    setBuscandoIa(true);
    try {
      const est = await buscarPrecoIA(produto?.nome || "", marca?.nome, variante?.tamanho, apiKey);
      setPrecoIaCache((c) => adicionarEstimativa(c, item.produto_variante_id, est));
    } catch (e) { alert("Não consegui buscar o preço agora: " + e.message); }
    finally { setBuscandoIa(false); }
  }

  function salvar(forcar) {
    if (precoNum != null && mediaRef && (precoNum > mediaRef * 3 || precoNum < mediaRef / 3) && !forcar) {
      setAlertaOutlier(true);
      return;
    }
    if (promocaoAtual && resultadoPromo && !resultadoPromo.ativada) {
      alert(`Faltam ${resultadoPromo.faltam} unidade(s) pra ativar essa promoção. Aumente a quantidade ou desative a promoção pra salvar sem desconto.`);
      return;
    }
    const precoEfetivo = promocaoAtual && resultadoPromo ? resultadoPromo.precoEfetivo : precoNum;
    onChange({
      quantidade: qtdNum, unidade,
      preco_pago: precoEfetivo,
      preco_normal: promocaoAtual ? precoNum : null,
      promocao: promocaoAtual,
      subtotal: precoEfetivo != null ? multiplicarValor(precoEfetivo, qtdNum) : null,
      /* Veio do toque no ✓ sem preço (seção sobre "comprado sem preço") — só marca como
         comprado se realmente saiu com um preço; se a pessoa salvou sem preencher nada, não
         reproduz o mesmo bug por outro caminho. */
      ...(marcarComprado && precoEfetivo != null ? { comprado: true } : {}),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center text-2xl bg-stone-50 border border-stone-200">
            {variante?.foto ? <img src={variante.foto} className="w-full h-full object-cover" alt="" /> : "🛒"}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-stone-800 truncate">{variante?.favorita && "⭐ "}{produto?.nome}</div>
            <div className="text-xs text-stone-500 truncate">{marca?.nome || "genérico"}{tamanhoDisplay(variante) ? ` · ${tamanhoDisplay(variante)}` : ""}</div>
          </div>
        </div>
        {variante?.observacao && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mb-3">💬 {variante.observacao}</div>}
        {marcarComprado && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-2 mb-3 font-semibold">Preenche o preço pra marcar como comprado.</div>}

        <button onClick={() => setEscaneando(true)} className="w-full text-left text-xs text-stone-500 border border-stone-200 rounded-lg px-2.5 py-2 mb-3 tap-target">
          <span className="inline-flex items-center gap-1"><IconeCodigoBarras size={16} /> {variante?.codigo_barras ? `Código vinculado: ${variante.codigo_barras}` : "Vincular código de barras a esse item"}</span>
        </button>
        {escaneando && (
          <ScannerCodigoBarras
            onDetectado={(codigo) => { setCatalogo((c) => ({ ...c, variantes: c.variantes.map((v) => (v.id === variante.id ? { ...v, codigo_barras: codigo } : v)) })); setEscaneando(false); }}
            onFechar={() => setEscaneando(false)} />
        )}

        {mediaRef != null && (
          <div className="bg-stone-50 border border-dashed border-stone-300 rounded-xl p-3 mb-3 flex justify-between items-center text-xs">
            <span>Referência: <b className="font-mono2">{referencia.fonte === "ia" ? "~" : ""}{brl(mediaRef)}</b>/{unidade}
              {referencia.fonte === "ia" && <span className="text-stone-400"> (estimado)</span>}
              {referencia.fonte === "cruzada" && <span className="text-stone-400"> (baseado em outro tamanho)</span>}
            </span>
            <button onClick={atualizarIA} disabled={buscandoIa} className="text-emerald-700 font-semibold tap-target">{buscandoIa ? "Buscando…" : "🔄 Atualizar IA"}</button>
          </div>
        )}
        {mediaRef == null && (
          <div className="flex justify-end mb-3">
            <button onClick={atualizarIA} disabled={buscandoIa} className="text-emerald-700 text-xs font-semibold tap-target">{buscandoIa ? "Buscando…" : "🔄 Buscar preço de referência por IA"}</button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-500 uppercase">
            {variante?.tamanho_quantidade && unidade === "un" ? `Quantas embalagens de ${tamanhoDisplay(variante)}?` : "Quantidade"}
          </label>
          {unidade !== "un" && <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">098→0,98{unidade}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex items-center gap-1.5 border border-stone-300 rounded-lg px-3 py-2.5 flex-1">
            <input value={qtdTexto} onChange={(e) => setQtdTexto(e.target.value)} inputMode="decimal" placeholder="1" className="font-mono2 font-bold text-lg flex-1 outline-none text-center min-w-0" aria-label="Quantidade" />
            <span className="text-stone-400 font-mono2 shrink-0">{unidade}</span>
          </div>
          <button onClick={() => setTrocandoUnidade(true)} aria-label="Mudar unidade" className="border border-stone-300 rounded-lg px-3 py-2.5 text-stone-500 tap-target shrink-0">⇅</button>
        </div>
        {unidade !== "un" && <div className="text-xs text-stone-400 mt-1">= {qtdNum}{unidade}</div>}
        {variante?.tamanho_quantidade && unidade === "un" && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2 mb-3">
            = {(qtdNum * variante.tamanho_quantidade).toLocaleString("pt-BR")} {variante.tamanho_unidade} no total ({qtdNum}× {tamanhoDisplay(variante)})
          </p>
        )}
        {!(variante?.tamanho_quantidade && unidade === "un") && <div className="mb-3" />}
        {trocandoUnidade && (
          <ModalMudarUnidade unidadeAtual={unidade} nomeProduto={produto?.nome}
            onEscolher={(novaUnidade, salvarNoCadastro) => {
              setUnidade(novaUnidade);
              if (salvarNoCadastro && produto) {
                setCatalogo((c) => ({ ...c, produtos: c.produtos.map((p) => (p.id === produto.id ? { ...p, unidade_padrao: novaUnidade } : p)) }));
              }
              setTrocandoUnidade(false);
            }}
            onFechar={() => setTrocandoUnidade(false)} />
        )}

        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-500 uppercase">{promocaoAtual ? `Preço normal (sem desconto), por ${unidade}` : `Preço (por ${unidade})`}</label>
          <span className="text-[10px] text-stone-400 font-mono2 bg-stone-100 rounded px-1.5 py-0.5 shrink-0">350→R$3,50</span>
        </div>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={precoTexto} onChange={(e) => { setPrecoTexto(sanitizarEntradaPreco(e.target.value)); setAlertaOutlier(false); }} placeholder="ex: 350 = R$3,50" className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Preço" />
        </div>
        <div className="text-xs text-stone-400 mt-1 mb-3">
          {precoNum != null && !promocaoAtual ? <>Subtotal: <b className="font-mono2">{brl(precoNum * qtdNum)}</b></> : !precoNum ? "digite sem vírgula (350=3,50) ou com vírgula pra valor exato (120,00)" : null}
        </div>

        <div className="mb-3">
          <SecaoPromocao precoNormalNum={precoNum} quantidade={qtdNum} unidade={unidade} mediaRef={mediaRef} valorInicial={item.promocao} onMudar={setPromocaoAtual} />
        </div>

        {alertaOutlier && (
          <div className="bg-amber-50 text-amber-700 text-xs p-3 rounded-lg mb-3">
            Esse preço está bem diferente do habitual (méd {brl(mediaRef)}). Confirma mesmo assim?
            <button onClick={() => salvar(true)} className="block font-semibold underline mt-1 tap-target">Confirmar e salvar</button>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={() => salvar(false)} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">{marcarComprado ? "✓ Marcar como comprado" : "Salvar"}</button>
        </div>
        <button onClick={() => onRemoverConfirmado(item)} className="w-full text-center text-red-400 text-xs font-semibold mt-3 tap-target">Remover item da lista</button>
      </div>
    </div>
  );
}

/* =========================================================
   CONFERÊNCIA DE NFC-e (seção 26): revisão item a item, sem aplicar nada sozinho.
   Usada tanto na Prévia (antes de finalizar) quanto numa compra já fechada sem nota.
========================================================= */
/* Nível 3 (OCR) — reserva pra quando não tem QR nem XML, só pro valor TOTAL, com carregamento
   sob demanda do Tesseract.js. Sempre pede confirmação/edição antes de usar o valor lido. */
/* Seção sobre unificar conferência de NF: além de ler o total, guarda a FOTO de verdade —
   antes essa função extraía o número e jogava a imagem fora, era o único dos 4 caminhos de
   leitura de nota que não deixava nada salvo. Comprime pro mesmo padrão já usado em outros
   lugares do app (resizeImage), pra não pesar o localStorage com foto em resolução cheia. */
function ModalLerCupomOcr({ onValorLido, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const [valorEncontrado, setValorEncontrado] = useState(null);
  const [valorTexto, setValorTexto] = useState("");
  const [fotoBase64, setFotoBase64] = useState(null);

  async function aoEscolherFoto(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      const [comprimida, Tesseract] = await Promise.all([resizeImage(file, 1000, 0.75), carregarTesseract()]);
      const resultado = await Tesseract.recognize(comprimida, "por");
      const total = extrairTotalDoTextoOcr(resultado.data.text);
      setFotoBase64(comprimida);
      if (total != null) { setValorEncontrado(total); setValorTexto(formatarValorCampo(total)); }
      else { setErro("Não consegui identificar o total nessa foto. Tente uma foto mais nítida e enquadrada, ou digite o valor manualmente na Prévia."); }
    } catch (err) { setErro("Não consegui ler essa foto: " + err.message); }
    finally { setProcessando(false); }
  }

  function confirmar() {
    const valor = parsePrecoInteligente(valorTexto);
    if (valor != null) {
      const htmlReconstruido = montarHtmlRecibo({
        valorTotal: valor,
        avisoOrigem: "Lido por foto (OCR) — só o total, sem itens. Confira contra a foto original se tiver dúvida.",
      });
      onValorLido({ valor, arquivoBase64: fotoBase64, mimeType: "image/jpeg", htmlReconstruido });
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[75]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-1">📸 Ler total por foto</h3>
        <p className="text-xs text-stone-500 mb-3">Reserva pra quando não tem QR Code nem XML — só tenta o valor total, não os itens (isso continua exigindo XML ou QR).</p>

        {!processando && valorEncontrado == null && (
          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-4 text-sm text-stone-500 cursor-pointer tap-target">
            📷 Tirar foto do cupom
            <input type="file" accept="image/*" capture="environment" onChange={aoEscolherFoto} className="hidden" />
          </label>
        )}
        {processando && (
          <div className="text-center py-6">
            <div className="text-sm text-stone-500">Lendo o cupom...</div>
            <div className="text-xs text-stone-400 mt-1">Pode levar alguns segundos</div>
          </div>
        )}
        {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

        {valorEncontrado != null && (
          <div className="mt-3">
            <label className="text-xs font-semibold text-stone-500 uppercase">Valor identificado — confira antes de usar</label>
            <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mt-1">
              <span className="text-stone-400 font-mono2">R$</span>
              <input value={valorTexto} onChange={(e) => setValorTexto(sanitizarEntradaPreco(e.target.value))} className="font-mono2 font-bold text-lg flex-1 outline-none" aria-label="Valor do total" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
              <button onClick={confirmar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Usar esse valor</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModalConferenciaNfe({ nfeInicial, itens, catalogo, onConfirmar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [nfe, setNfe] = useState(() => {
    const copia = { ...nfeInicial, itens: agruparLinhasNfePorDescricao(nfeInicial.itens).map((l) => ({ ...l })) };
    const usados = new Set();
    for (const linha of copia.itens) {
      const candidatos = itens.filter((it) => it.comprado && !usados.has(it.id));
      const achado = melhorMatchNfe(linha.descricao, candidatos, catalogo);
      if (achado) { linha.vinculado_item_id = achado.id; usados.add(achado.id); }
    }
    return copia;
  });
  const [vinculando, setVinculando] = useState(null); // id da linha da nota que está escolhendo item manualmente

  function atualizarLinha(linhaId, patch) {
    setNfe((n) => ({ ...n, itens: n.itens.map((l) => (l.id === linhaId ? { ...l, ...patch } : l)) }));
  }
  function itemDaLinha(linha) { return linha.vinculado_item_id ? itens.find((it) => it.id === linha.vinculado_item_id) : null; }

  const itensSemNota = itens.filter((it) => it.comprado && !nfe.itens.some((l) => l.vinculado_item_id === it.id));

  function confirmar() {
    onConfirmar(nfe);
  }

  return (
    <div className="fixed inset-0 bg-white z-[75] flex flex-col max-w-md mx-auto">
      <div className="flex items-center gap-3 p-4 border-b border-stone-200 shrink-0">
        <button onClick={onFechar} aria-label="Voltar" className="tap-target">←</button>
        <h3 className="text-lg font-bold">Conferir nota fiscal</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm">
          <div className="font-semibold text-stone-700">{nfe.nome_emit || "Emitente não identificado"}</div>
          <div className="text-xs text-stone-500 font-mono2">{nfe.data_emissao ? dataCurta(nfe.data_emissao) : ""} · Total da nota: {brl(nfe.valor_total)}</div>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Itens da nota ({nfe.itens.length})</div>
          <div className="space-y-2">
            {nfe.itens.map((linha) => {
              const item = itemDaLinha(linha);
              if (linha.ignorado) {
                return (
                  <div key={linha.id} className="bg-stone-50 border border-stone-200 rounded-xl p-3 opacity-60">
                    <div className="text-xs text-stone-400 truncate">{linha.descricao} — ignorada</div>
                    <button onClick={() => atualizarLinha(linha.id, { ignorado: false })} className="text-xs text-emerald-700 underline tap-target">Desfazer</button>
                  </div>
                );
              }
              if (!item) {
                return (
                  <div key={linha.id} className="bg-white border border-amber-300 rounded-xl p-3">
                    <div className="text-xs text-amber-700 uppercase font-semibold mb-1">Não encontrado na sua lista</div>
                    <div className="text-sm font-semibold text-stone-700 truncate">{linha.descricao}</div>
                    <div className="text-xs font-mono2 text-stone-500 mb-2">{linha.quantidade}x · {brl(linha.valor_total)}{linha.linhasOriginais > 1 ? ` · combina ${linha.linhasOriginais} linhas da nota` : ""}</div>
                    {vinculando === linha.id ? (
                      <div className="space-y-1 border-t border-stone-100 pt-2">
                        {itens.filter((it) => it.comprado).map((it) => {
                          const v = by(catalogo.variantes, it.produto_variante_id);
                          const p = v && by(catalogo.produtos, v.produto_id);
                          return (
                            <button key={it.id} onClick={() => { atualizarLinha(linha.id, { vinculado_item_id: it.id }); setVinculando(null); }}
                              className="w-full text-left text-xs bg-stone-50 rounded-lg px-2 py-1.5 tap-target">{p?.nome} · {brl(it.subtotal)}</button>
                          );
                        })}
                        <button onClick={() => setVinculando(null)} className="text-xs text-stone-400 tap-target">Cancelar</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setVinculando(linha.id)} className="flex-1 text-xs border border-stone-300 rounded-lg py-2 tap-target">Vincular a um item</button>
                        <button onClick={() => atualizarLinha(linha.id, { ignorado: true })} className="flex-1 text-xs border border-stone-300 rounded-lg py-2 text-stone-500 tap-target">Ignorar linha</button>
                      </div>
                    )}
                  </div>
                );
              }
              const v = by(catalogo.variantes, item.produto_variante_id);
              const p = v && by(catalogo.produtos, v.produto_id);
              const precoIgual = Math.abs((item.subtotal || 0) - (linha.valor_total || 0)) < 0.02;
              return (
                <div key={linha.id} className={`bg-white border rounded-xl p-3 ${precoIgual ? "border-emerald-200" : "border-amber-300"}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-sm font-semibold text-stone-700 truncate">{p?.nome}</div>
                    <span className="text-sm shrink-0">{precoIgual ? "✓" : "⚠️"}</span>
                  </div>
                  <div className="text-xs text-stone-400 truncate mb-1">na nota: "{linha.descricao}"{linha.linhasOriginais > 1 ? ` (${linha.linhasOriginais} linhas somadas)` : ""}</div>
                  {precoIgual ? (
                    <div className="text-xs font-mono2 text-emerald-700">Confere: {brl(linha.valor_total)}</div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono2 text-stone-500">Você: {brl(item.subtotal)} · nota: {brl(linha.valor_total)}</div>
                      <button onClick={() => atualizarLinha(linha.id, { aceitarValorNota: true })}
                        className={`text-xs font-semibold underline shrink-0 tap-target ${linha.aceitarValorNota ? "text-emerald-700" : "text-stone-500"}`}>
                        {linha.aceitarValorNota ? "✓ vai usar o valor da nota" : "Usar valor da nota"}
                      </button>
                    </div>
                  )}
                  <button onClick={() => atualizarLinha(linha.id, { vinculado_item_id: null })} className="text-xs text-stone-400 underline mt-1 tap-target">Desvincular</button>
                </div>
              );
            })}
          </div>
        </div>

        {!!itensSemNota.length && (
          <div>
            <div className="text-xs font-semibold text-red-600 uppercase mb-2">Não apareceram na nota</div>
            <div className="space-y-2">
              {itensSemNota.map((it) => {
                const v = by(catalogo.variantes, it.produto_variante_id);
                const p = v && by(catalogo.produtos, v.produto_id);
                return (
                  <div key={it.id} className="bg-white border border-red-200 rounded-xl p-3">
                    <div className="text-sm font-semibold text-stone-700">{p?.nome} · {brl(it.subtotal)}</div>
                    <p className="text-xs text-stone-400 mt-0.5">Pode ter sido erro de leitura na descrição, ou não estava mesmo na nota — sem problema deixar assim.</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-stone-200 shrink-0">
        <button onClick={confirmar} className="w-full bg-emerald-800 text-white font-semibold py-3 rounded-xl tap-target">✓ Confirmar conferência</button>
      </div>
    </div>
  );
}

/* =========================================================
   PRÉVIA DA COMPRA (seção 22.3 — antes era "fechar" direto).
   Mostra tudo, com gráfico embutido (22.4a); só finaliza ao tocar
   no botão separado "Finalizar compra".
========================================================= */
function ModalPreviaCompra({ catalogo, sessao, sessoes, setSessoes, onFinalizado, onClose, arquivoCompartilhado, onUsarArquivoCompartilhado }) {
  useFecharComVoltar(true, onClose);
  const totalCalc = somarValores(...sessao.itens.map((it) => it.subtotal || 0));
  const [notaTexto, setNotaTexto] = useState("");
  const [nfeParaConferir, setNfeParaConferir] = useState(null);
  const [erroNfe, setErroNfe] = useState(null);
  const [confirmarSemNfe, setConfirmarSemNfe] = useState(false);
  const [perguntaRascunho, setPerguntaRascunho] = useState(null); // null = não perguntou; array = perguntando
  const [lendoQr, setLendoQr] = useState(false);
  const [chaveDoQr, setChaveDoQr] = useState(null);
  const [digitandoChave, setDigitandoChave] = useState(false);
  const [maisOpcoesNfe, setMaisOpcoesNfe] = useState(false); // Etapa sobre simplificar anexar NF: 1 botão + escape hatch
  const [chaveDigitada, setChaveDigitada] = useState("");
  function usarChaveDigitada() {
    const limpa = chaveDigitada.replace(/\D/g, "");
    if (limpa.length !== 44) { alert("A chave de acesso tem que ter exatamente 44 números — confere se copiou tudo certo."); return; }
    const duplicada = sessaoComMesmaNfe(sessoes, limpa, sessao.id);
    if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
    setErroNfe(null);
    /* Etapa sobre pré-preencher a consulta oficial: não dá pra montar o link já preenchido pra
       chave digitada na mão (o site da Sefaz depende de token de sessão, e o formato do QR exige
       um hash que só o próprio QR carrega) — copiar pro clipboard é o substituto que garantidamente
       funciona: na página do governo, é só encostar no campo e colar, em vez de redigitar 44
       números. Falha em silêncio se o navegador negar a permissão (não é crítico pro fluxo). */
    navigator.clipboard?.writeText(limpa).catch(() => {});
    setChaveDoQr({ chave: limpa, url: null });
    setDigitandoChave(false);
    setChaveDigitada("");
  }
  const [lendoOcr, setLendoOcr] = useState(false);
  const [colandoTexto, setColandoTexto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  function processarTextoColado() {
    try {
      const nfeLida = parsearTextoConsultaNFCe(textoColado);
      const duplicada = sessaoComMesmaNfe(sessoes, nfeLida.chave_acesso, sessao.id);
      if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
      setErroNfe(null);
      /* Guarda o texto colado também, no mesmo formato que o PDF já usa (arquivo_base64 +
         mime_type + nome_arquivo) — antes disso era o único dos 4 caminhos de leitura de nota
         que processava e descartava, sem deixar nada salvo pra reconferir depois. */
      const arquivoBase64 = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(textoColado)));
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, endereco: nfeLida.endereco, dataEmissao: nfeLida.data_emissao,
        valorDesconto: nfeLida.valor_desconto, formaPagamento: nfeLida.forma_pagamento, numeroNota: nfeLida.numero_nota, serieNota: nfeLida.serie_nota,
        protocolo: nfeLida.protocolo_autorizacao, tributos: nfeLida.tributos,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do texto colado da consulta oficial — não é o documento oficial.",
      });
      setNfeParaConferir({ ...nfeLida, arquivo_base64: arquivoBase64, mime_type: "text/plain", nome_arquivo: "nfce-consulta.txt", html_reconstruido: htmlReconstruido });
      setColandoTexto(false);
      setTextoColado("");
    } catch (err) { setErroNfe(err.message); }
  }
  const mercado = by(catalogo.mercados, sessao.mercado_id);
  const nota = sessao.nfe?.conferida ? sessao.nfe.valor_total : parsePrecoInteligente(notaTexto);
  const diferenca = nota != null ? nota - totalCalc : null;
  const threshold = Math.max(0.5, totalCalc * 0.01);
  const alerta = diferenca != null && Math.abs(diferenca) > threshold;
  const comprados = sessao.itens.filter((it) => it.comprado);
  const entradasGrafico = entradasGraficoDe(subtotalPorCategoria(comprados, catalogo), catalogo);

  function aoDetectarQr(conteudo) {
    setLendoQr(false);
    const chave = extrairChaveDoQrNfce(conteudo);
    if (!chave) { setErroNfe("Não consegui identificar a chave da nota nesse QR Code."); return; }
    const duplicada = sessaoComMesmaNfe(sessoes, chave, sessao.id);
    if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
    setErroNfe(null);
    setChaveDoQr({ chave, url: conteudo });
  }

  async function processarArquivoNota(file) {
    if (!file) return;
    setErroNfe(null);
    const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!ehPdf) { setErroNfe("Só aceito PDF da nota — XML precisa de certificado digital que consumidor comum não tem, não tem como ler."); return; }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const texto = await extrairTextoDePdf(arrayBuffer);
      const nfeLida = parsearDanfePdf(texto);
      const duplicada = sessaoComMesmaNfe(sessoes, nfeLida.chave_acesso, sessao.id);
      if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
      /* Guarda o arquivo de verdade (não só os dados extraídos) — pedido do usuário: precisa dar
         pra ver a nota original com um toque no histórico depois. Fica temporariamente aqui até
         finalizar a compra, quando "muda de dono" pro repositório de Documentos do Finanças
         (mesma base, sem duplicar — ver integrarCompraMercado). */
      const arquivoBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, endereco: nfeLida.endereco, dataEmissao: nfeLida.data_emissao,
        valorDesconto: nfeLida.valor_desconto, formaPagamento: nfeLida.forma_pagamento, numeroNota: nfeLida.numero_nota, serieNota: nfeLida.serie_nota,
        protocolo: nfeLida.protocolo_autorizacao, tributos: nfeLida.tributos,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do PDF da nota — não é o documento oficial.",
      });
      setNfeParaConferir({ ...nfeLida, arquivo_base64: arquivoBase64, mime_type: "application/pdf", nome_arquivo: file.name, html_reconstruido: htmlReconstruido });
    } catch (err) { setErroNfe(err.message); }
  }
  /* Compartilhamento nativo do Android: se chegou um arquivo pendente (PDF do DANFE, por
     exemplo) e essa é a compra ativa, processa igual a um anexo manual. */
  function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    processarArquivoNota(file);
  }
  function usarArquivoCompartilhado() {
    if (!arquivoCompartilhado) return;
    processarArquivoNota(arquivoCompartilhado.arquivo);
    if (onUsarArquivoCompartilhado) onUsarArquivoCompartilhado();
  }

  function confirmarConferencia(nfeConferida) {
    setSessoes((ss) => ss.map((s) => {
      if (s.id !== sessao.id) return s;
      let itensAtualizados = s.itens;
      for (const linha of nfeConferida.itens) {
        if (linha.aceitarValorNota && linha.vinculado_item_id) {
          itensAtualizados = itensAtualizados.map((it) => it.id === linha.vinculado_item_id
            ? { ...it, preco_pago: linha.quantidade ? linha.valor_total / linha.quantidade : linha.valor_unitario, subtotal: linha.valor_total }
            : it);
        }
      }
      /* Etapa sobre desconto de clube: só tenta DEPOIS dos ajustes item a item acima, sobre o
         resultado já corrigido. Nunca silencioso — o ajuste fica registrado em
         nfe.desconto_clube_ajustes pra aparecer explícito na Prévia antes de finalizar (seção
         sobre a tela mostrar preço de tabela riscado → preço real). */
      const ajustes = tentarExplicarDescontoClube(itensAtualizados, nfeConferida.valor_desconto, sessoes, catalogo, sessao.mercado_id);
      if (ajustes) {
        itensAtualizados = itensAtualizados.map((it) => {
          const ajuste = ajustes.find((a) => a.itemId === it.id);
          return ajuste ? { ...it, preco_pago: ajuste.precoNovo, subtotal: multiplicarValor(ajuste.precoNovo, it.quantidade || 1) } : it;
        });
      }
      return { ...s, itens: itensAtualizados, nfe: { ...nfeConferida, conferida: true, desconto_clube_ajustes: ajustes } };
    }));
    setNfeParaConferir(null);
  }

  /* A finalização de verdade — separada de finalizar() pra poder ser chamada só depois de
     resolvida a pergunta sobre itens não comprados (antes era um window.confirm síncrono aqui
     dentro; agora é ModalConfirmar, que é assíncrono, então precisa desse corte). */
  function executarFinalizacao(naoComprados, levarParaRascunho) {
    const snapshot = snapshotCategorias(sessao.itens, catalogo);
    const dataFechamento = new Date().toISOString();

    /* Fase 6/7 do mapa de Finanças: integração automática — a compra finalizada vira despesa lá,
       e a NFe conferida (se teve) já entra vinculada, com o arquivo de verdade (não um resumo),
       sem precisar subir de novo. Chamada ANTES do setSessoes pra já ter o documentoId em mãos e
       trocar o arquivo bruto por um ponteiro no mesmo passo — fonte única de dado (pedido do
       usuário), o Mercado não guarda cópia própria depois de finalizado. A função em si mora em
       financas.js (dona do formato de dado); funciona mesmo com o módulo Finanças nunca tendo
       sido aberto ainda, porque escreve direto no localStorage. Se não existir (financas.js não
       carregou), falha silenciosamente — a compra do Mercado nunca deve travar por outro módulo. */
    const documentoIdIntegrado = typeof integrarCompraMercado === "function"
      ? integrarCompraMercado({ id: sessao.id, nfe: sessao.nfe, fechada_em: dataFechamento, itens: sessao.itens, valor_nota_fiscal: nota }, mercado?.nome)
      : null;

    setSessoes((ss) => {
      let novo = ss.map((s) => {
        if (s.id !== sessao.id) return s;
        let nfeAtualizada = s.nfe;
        if (s.nfe?.arquivo_base64) {
          const { arquivo_base64, mime_type, nome_arquivo, ...nfeSemArquivo } = s.nfe;
          nfeAtualizada = { ...nfeSemArquivo, documento_id: documentoIdIntegrado || s.nfe.documento_id || null };
        }
        return { ...s, status: "fechada", reaberta_para_correcao: false, valor_nota_fiscal: nota, fechada_em: dataFechamento, grafico_categorias: snapshot, nfe: nfeAtualizada };
      });
      if (naoComprados.length && levarParaRascunho) {
        novo = [...novo, { id: uid(), mercado_id: sessao.mercado_id, data_hora: new Date().toISOString(), status: "em_andamento", origem: "manual", itens: naoComprados.map((it) => ({ ...it, id: uid(), preco_pago: null, subtotal: null, comprado: false })), valor_nota_fiscal: null, grafico_categorias: null }];
      }
      return novo;
    });
    onClose();
    onFinalizado(sessao.id);
  }

  function finalizar() {
    if (!sessao.nfe?.conferida && !confirmarSemNfe) { setConfirmarSemNfe(true); return; }
    setConfirmarSemNfe(false);
    const naoComprados = sessao.itens.filter((it) => !it.comprado);
    if (naoComprados.length) { setPerguntaRascunho(naoComprados); return; }
    executarFinalizacao(naoComprados, false);
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col max-w-md mx-auto">
      <div className="flex items-center gap-3 p-4 border-b border-stone-200 shrink-0"><button onClick={onClose} aria-label="Voltar" className="tap-target">←</button><h3 className="text-lg font-bold">Prévia da compra</h3></div>
      <div className="flex-1 overflow-y-auto p-4 paper-sheet">
        <div className="paper-pad">
          <div className="ticket bg-white/70 shadow-md p-4 mb-4">
            <div className="text-center font-bold handwrite text-lg">{mercado?.nome?.toUpperCase()}</div>
            <div className="text-center text-xs text-stone-500 mb-2">{new Date(sessao.data_hora).toLocaleDateString("pt-BR")} · {comprados.length} itens</div>
            <div className="border-t border-dashed border-stone-400 my-2" />
            {comprados.map((it) => {
              const v = by(catalogo.variantes, it.produto_variante_id);
              const p = v && by(catalogo.produtos, v.produto_id);
              const ajuste = sessao.nfe?.desconto_clube_ajustes?.find((a) => a.itemId === it.id);
              return (
                <div key={it.id} className="flex justify-between gap-2 text-xs font-mono2 mb-1">
                  <span className="truncate">{p?.nome?.toUpperCase()}</span>
                  <span className="whitespace-nowrap">
                    {it.quantidade}{it.unidade}{" "}
                    {ajuste ? <><span className="line-through text-stone-400">{brl(ajuste.precoAntigo * ajuste.quantidade)}</span> <span className="text-emerald-700 font-semibold">{brl(it.subtotal)}</span></> : brl(it.subtotal)}
                  </span>
                </div>
              );
            })}
            {!comprados.length && <div className="text-center text-xs text-stone-400 py-2">Nenhum item marcado como comprado.</div>}
            <div className="border-t border-dashed border-stone-400 my-2" />
            <div className="flex justify-between font-mono2 font-bold"><span>TOTAL CALCULADO</span><span>{brl(totalCalc)}</span></div>
          </div>

          {!!sessao.nfe?.desconto_clube_ajustes?.length && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-3 text-xs text-emerald-800">
              🎟️ <strong>Desconto de clube identificado</strong> — {sessao.nfe.desconto_clube_ajustes.length} item(ns) com preço acima do seu histórico, e a diferença bateu exata com o desconto da nota. Preço corrigido pro valor real pago (visível riscado acima).
            </div>
          )}

          <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
            <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Gasto por categoria</div>
            <GraficoCategorias entradas={entradasGrafico} />
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">📄 Nota Fiscal</span>
              {sessao.nfe?.conferida && <span className="text-xs text-emerald-700 font-semibold">✓ Conferida</span>}
            </div>
            {sessao.nfe?.conferida ? (
              sessao.nfe.itens.length ? (
                <div className="text-xs text-stone-500">{sessao.nfe.nome_emit || "Emitente não identificado"} · {sessao.nfe.itens.filter((l) => !l.ignorado).length} itens · {brl(sessao.nfe.valor_total)}</div>
              ) : (
                <div className="text-xs text-stone-500">📷 Lido por foto (só o total, sem itens) · {brl(sessao.nfe.valor_total)}</div>
              )
            ) : (
              <>
                {arquivoCompartilhado && (
                  <button onClick={usarArquivoCompartilhado} className="w-full flex items-center justify-center gap-2 bg-emerald-700 text-white rounded-xl py-3 text-sm font-semibold mb-2 tap-target">
                    📎 Anexar "{arquivoCompartilhado.nome}" (recebido)
                  </button>
                )}
                {/* Etapa sobre simplificar mais um nível: antes "Anexar PDF" já vinha sempre
                    visível, com só o RESTO das opções atrás de "não tenho o PDF agora". Pedido do
                    usuário: nem isso — um botão só, tudo (PDF/QR/colar/chave) atrás dele. */}
                {!maisOpcoesNfe ? (
                  <button onClick={() => setMaisOpcoesNfe(true)} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-3 text-sm text-stone-500 tap-target">
                    📎 Adicionar nota fiscal
                  </button>
                ) : (
                  <div>
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-3 text-sm text-stone-500 cursor-pointer tap-target">
                      📎 Anexar PDF da nota
                      <input type="file" accept=".pdf,application/pdf" onChange={aoEscolherArquivo} className="hidden" />
                    </label>
                    {erroNfe && <p className="text-xs text-red-600 mt-2">{erroNfe}</p>}
                    <button onClick={() => setLendoQr(true)} className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-xl py-2.5 text-sm text-stone-500 mt-1.5 tap-target">
                      📷 Ler QR Code da nota
                    </button>
                    {!colandoTexto && (
                      <button onClick={() => setColandoTexto(true)} className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-xl py-2.5 text-sm text-stone-500 mt-1.5 tap-target">
                        📋 Já copiei o texto da nota, colar aqui
                      </button>
                    )}
                    {!digitandoChave ? (
                      <button onClick={() => setDigitandoChave(true)} className="text-xs text-stone-400 underline mt-1.5 tap-target">QR não lê? Digitar a chave de acesso manualmente</button>
                    ) : (
                      <div className="mt-1.5 flex gap-1.5">
                        <input value={chaveDigitada} onChange={(e) => setChaveDigitada(e.target.value)} placeholder="os 44 números da chave (embaixo do QR)" className="flex-1 border border-stone-300 rounded-lg p-2 font-mono2 text-xs" aria-label="Chave de acesso da nota" />
                        <button onClick={usarChaveDigitada} className="bg-emerald-700 text-white text-xs font-semibold px-3 rounded-lg tap-target shrink-0">Usar</button>
                      </div>
                    )}
                    {chaveDoQr && !colandoTexto && (
                      <div className="bg-stone-50 rounded-lg p-2.5 mt-2 text-xs">
                        <div className="text-stone-500 mb-1.5">Chave identificada: ...{chaveDoQr.chave.slice(-8)}. Duas formas de trazer os dados: abre a consulta oficial, seleciona tudo (Ctrl+A) e copia — ou baixa o PDF pelo Meu Danfe.
                        {!chaveDoQr.url && " Já copiei a chave — é só colar no campo \"Chave de acesso\" da página."}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <button onClick={() => window.open(montarUrlConsultaOficial(chaveDoQr), "_blank")} className="text-emerald-700 font-semibold underline tap-target">Abrir consulta oficial →</button>
                          <button onClick={() => setColandoTexto(true)} className="text-emerald-700 font-semibold underline tap-target">Já copiei, colar aqui →</button>
                          <button onClick={() => window.open(montarUrlMeuDanfe(chaveDoQr.chave), "_blank")} className="text-stone-400 underline tap-target">Baixar PDF (Meu Danfe)</button>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-200">
                          <span className="font-mono2 text-[11px] text-stone-400 flex-1 truncate">{chaveDoQr.chave}</span>
                          <button onClick={() => navigator.clipboard?.writeText(chaveDoQr.chave)} className="text-emerald-700 font-semibold shrink-0 tap-target">Copiar chave</button>
                        </div>
                      </div>
                    )}
                    {colandoTexto && (
                      <div className="bg-stone-50 rounded-lg p-2.5 mt-2">
                        <p className="text-xs text-stone-500 mb-2">Cola aqui o texto inteiro que você copiou da página (do nome do mercado até a chave de acesso).</p>
                        <textarea value={textoColado} onChange={(e) => setTextoColado(e.target.value)} rows={4} placeholder="Cola aqui (Ctrl+V)..." className="w-full border border-stone-300 rounded-lg p-2 text-xs font-mono2" aria-label="Texto colado da consulta da nota" />
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { setColandoTexto(false); setTextoColado(""); }} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-semibold tap-target">Cancelar</button>
                          <button onClick={processarTextoColado} disabled={!textoColado.trim()} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold tap-target disabled:opacity-40">Ler itens</button>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-stone-400 mt-2">Sem QR nem XML? <button onClick={() => setLendoOcr(true)} className="text-emerald-700 font-semibold underline tap-target">Ler o total por foto</button>, ou preencha manualmente abaixo.</p>
                  </div>
                )}
              </>

            )}
          </div>

          {!sessao.nfe?.conferida && (
            <div className="bg-white border border-stone-200 rounded-xl p-3 flex justify-between items-center mb-3">
              <span className="text-sm font-semibold">Valor da nota fiscal</span>
              <div className="flex items-center gap-1"><span className="text-stone-400 font-mono2 text-sm">R$</span><input value={notaTexto} onChange={(e) => setNotaTexto(sanitizarEntradaPreco(e.target.value))} placeholder="350=3,50" className="font-mono2 font-bold w-24 text-right outline-none" aria-label="Valor da nota fiscal" /></div>
            </div>
          )}
          {alerta && (
            <div className="bg-red-50 rounded-xl p-3 flex gap-2 items-start">
              <span className="text-red-500 mt-0.5 shrink-0">⚠️</span>
              <div><div className="text-red-600 font-semibold text-sm">Diferença de {brl(Math.abs(diferenca))}</div><div className="text-red-500 text-xs">{diferenca > 0 ? "A nota ficou maior" : "A nota ficou menor"} que o calculado. Vale conferir os itens.</div></div>
            </div>
          )}
          {diferenca != null && !alerta && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-xl p-3 font-semibold text-center">✓ Bateu certinho</div>}
        </div>
      </div>
      <div className="p-4 border-t border-stone-200 shrink-0 space-y-2">
        <p className="text-xs text-stone-400 text-center">Isso ainda não finaliza — é só a prévia.</p>
        <button onClick={finalizar} className="w-full bg-emerald-800 text-white font-semibold py-3 rounded-xl tap-target">✓ Finalizar compra</button>
      </div>
      {nfeParaConferir && (
        <ModalConferenciaNfe nfeInicial={nfeParaConferir} itens={sessao.itens} catalogo={catalogo}
          onConfirmar={confirmarConferencia} onFechar={() => setNfeParaConferir(null)} />
      )}
      {lendoQr && (
        <ScannerCodigoBarras formatos={["qr_code"]} titulo="Aponte pro QR Code da nota" onDetectado={aoDetectarQr} onFechar={() => setLendoQr(false)} />
      )}
      {lendoOcr && (
        <ModalLerCupomOcr
          onValorLido={({ valor, arquivoBase64, mimeType, htmlReconstruido }) => {
            /* Mesmo formato de "nfe" que o PDF/texto colado já usam — reaproveita o mesmo trecho
               do finalizar() que troca o arquivo bruto por um documento de verdade no Finanças.
               Sem itens (foto só lê o total), por isso nasce direto como "conferida": não tem
               item nenhum pra conferir contra a lista, então não faz sentido pedir revisão. */
            setSessoes((ss) => ss.map((s) => (s.id === sessao.id
              ? { ...s, nfe: { chave_acesso: null, cnpj_emit: null, nome_emit: null, data_emissao: null, valor_total: valor, itens: [], arquivo_base64: arquivoBase64, mime_type: mimeType, nome_arquivo: "cupom-foto.jpg", conferida: true, html_reconstruido: htmlReconstruido } }
              : s)));
            setLendoOcr(false);
          }}
          onFechar={() => setLendoOcr(false)} />
      )}
      {confirmarSemNfe && (
        <ModalConfirmar titulo="Finalizar sem nota fiscal" severo={false} textoConfirmar="Finalizar mesmo assim"
          mensagem="Os valores ficam sem conferência oficial da nota fiscal. Você pode anexar a nota depois, direto no histórico dessa compra."
          onConfirmar={finalizar} onCancelar={() => setConfirmarSemNfe(false)} />
      )}
      {perguntaRascunho && (
        <ModalConfirmar titulo="Itens não comprados" severo={false} textoConfirmar="Levar pra lista nova"
          mensagem={`${perguntaRascunho.length} item(ns) não foram comprados. Quer levar pra uma lista rascunho nova, pra não esquecer na próxima ida?`}
          onConfirmar={() => { const nc = perguntaRascunho; setPerguntaRascunho(null); executarFinalizacao(nc, true); }}
          onCancelar={() => { const nc = perguntaRascunho; setPerguntaRascunho(null); executarFinalizacao(nc, false); }} />
      )}
    </div>
  );
}

/* =========================================================
   TELA: LISTA ATUAL
========================================================= */
/* Seção 33.2 do mapa: editar o orçamento da compra a qualquer momento, não só na criação. */
function ModalOrcamento({ orcamentoAtual, onSalvar, onFechar }) {
  useFecharComVoltar(true, onFechar);
  const [texto, setTexto] = useState(orcamentoAtual != null ? formatarValorCampo(orcamentoAtual) : "");
  function salvar() { onSalvar(parsePrecoInteligente(texto)); onFechar(); }
  function remover() { onSalvar(null); onFechar(); }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-[65]" onClick={onFechar}>
      <div className="bg-white rounded-t-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-3">🎯 Orçamento da compra</h3>
        <div className="flex items-center gap-2 border border-stone-300 rounded-xl px-3 py-2.5 mb-4">
          <span className="text-stone-400 font-mono2">R$</span>
          <input value={texto} onChange={(e) => setTexto(sanitizarEntradaPreco(e.target.value))} placeholder="ex: 30000 = R$300,00" className="font-mono2 font-bold flex-1 outline-none" aria-label="Orçamento" autoFocus />
        </div>
        <div className="flex gap-2">
          {orcamentoAtual != null && <button onClick={remover} className="py-2.5 px-4 rounded-lg border border-red-300 text-red-500 font-semibold text-sm tap-target">Remover</button>}
          <button onClick={onFechar} className="flex-1 py-2.5 rounded-lg border border-stone-300 font-semibold text-stone-600 tap-target">Cancelar</button>
          <button onClick={salvar} className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white font-semibold tap-target">Salvar</button>
        </div>
      </div>
    </div>
  );
}

function TelaLista({ catalogo, setCatalogo, sessoes, setSessoes, precoIaCache, setPrecoIaCache, apiKey, onSessaoFinalizada, sessaoEmCorrecaoId, arquivoCompartilhado, onUsarArquivoCompartilhado }) {
  const ativas = sessoes.filter((s) => s.status === "em_andamento");
  const [sessaoAbertaId, setSessaoAbertaId] = useState(null);
  const [modalNova, setModalNova] = useState(false);
  const [modalAdd, setModalAdd] = useState(false);
  const [modalPrevia, setModalPrevia] = useState(false);
  const [itemEditando, setItemEditandoRaw] = useState(null); // { item, marcarCompradoAoSalvar }
  function abrirEditor(item, marcarCompradoAoSalvar) { setItemEditandoRaw({ item, marcarCompradoAoSalvar: !!marcarCompradoAoSalvar }); }
  const [confirmar, setConfirmar] = useState(null);
  const [modalOrcamento, setModalOrcamento] = useState(false);
  /* Etapa sobre simplificar: seção 6.12 pedia esse resumo "ao vivo" durante a compra, mas sumiu
     numa reversão antiga (seção 22.1, que tirou o GRÁFICO daqui — o texto simples original nunca
     voltou). Traz de volta como texto compacto e colapsável (não gráfico — essa decisão de tirar
     o gráfico daqui continua valendo), pra não voltar a pesar a tela como o cabeçalho pesava antes. */
  const [mostrarSubtotalCategoria, setMostrarSubtotalCategoria] = useState(false);
  const [mostrarLegenda, setMostrarLegenda] = useState(false); // Etapa sobre cabeçalho compacto — legenda vira popover

  useEffect(() => {
    if (sessaoEmCorrecaoId) { setSessaoAbertaId(sessaoEmCorrecaoId); return; }
    if (ativas.length === 1) setSessaoAbertaId(ativas[0].id);
    else if (ativas.length === 0) setSessaoAbertaId(null);
  }, [ativas.length, sessaoEmCorrecaoId]);

  if (!ativas.length) {
    const avisos = itensBaratosAgora(catalogo, sessoes, precoIaCache);
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="text-center py-12">
          <div className="text-5xl mb-3">🧺</div>
          <p className="text-stone-500 mb-4">Nenhuma compra em andamento.</p>
          <button onClick={() => setModalNova(true)} className="bg-emerald-700 text-white font-semibold px-5 py-3 rounded-xl tap-target">Iniciar nova compra</button>
        </div>
        {!!avisos.length && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
            <div className="text-xs font-semibold text-emerald-700 uppercase">🟢 Pode estar mais barato agora</div>
            {avisos.map((a, i) => <div key={i} className="text-sm text-emerald-800">{a.nome} — economia estimada de {brl(a.economia)}</div>)}
          </div>
        )}
        {modalNova && <ModalNovaSessao catalogo={catalogo} sessoes={sessoes} setSessoes={setSessoes} onCriada={setSessaoAbertaId} onClose={() => setModalNova(false)} />}
      </div>
    );
  }

  if (ativas.length > 1 && !sessaoAbertaId && !sessaoEmCorrecaoId) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <h2 className="text-lg font-bold text-stone-700 mb-3">Você tem {ativas.length} compras em andamento — qual quer continuar?</h2>
        <div className="space-y-2">
          {ativas.map((s) => {
            const m = by(catalogo.mercados, s.mercado_id);
            return (
              <button key={s.id} onClick={() => setSessaoAbertaId(s.id)} className="w-full bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between text-left tap-target">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: m?.cor }} /><div><div className="font-semibold text-stone-800">{m?.nome}</div><div className="text-xs text-stone-400">{s.itens.length} item(ns) · {dataCurta(s.data_hora)}</div></div></div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-stone-400 mt-3">As outras continuam salvas como rascunho, você pode trocar depois.</p>
      </div>
    );
  }

  const sessaoAtiva = ativas.find((s) => s.id === sessaoAbertaId) || ativas[0];

  function atualizarSessao(patch) { setSessoes((ss) => ss.map((s) => (s.id === sessaoAtiva.id ? { ...s, ...patch } : s))); }
  function atualizarItem(itemId, patch) { atualizarSessao({ itens: sessaoAtiva.itens.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }); }
  function toggleComprado(item) { atualizarItem(item.id, { comprado: !item.comprado }); }
  function atualizarQuantidade(item, novaQtd) {
    const patch = { quantidade: novaQtd };
    if (item.preco_pago != null) patch.subtotal = multiplicarValor(item.preco_pago, novaQtd);
    atualizarItem(item.id, patch);
  }
  function pedirRemocao(item) {
    const v = by(catalogo.variantes, item.produto_variante_id);
    const p = v && by(catalogo.produtos, v.produto_id);
    setConfirmar({
      titulo: "Remover item", severo: false, textoConfirmar: "Remover",
      mensagem: `Remover "${p?.nome || "esse item"}" da lista?`,
      acao: () => { atualizarSessao({ itens: sessaoAtiva.itens.filter((it) => it.id !== item.id) }); setConfirmar(null); setItemEditandoRaw(null); },
    });
  }
  function cancelarCompra() {
    if (sessaoAtiva.id === sessaoEmCorrecaoId) {
      setConfirmar({
        titulo: "Cancelar correção", severo: false, textoConfirmar: "Cancelar correção",
        mensagem: "Isso fecha a correção sem excluir nada — a compra volta pro histórico como estava antes de você reabrir.",
        acao: () => { setSessoes((ss) => ss.map((s) => (s.id === sessaoAtiva.id ? { ...s, status: "fechada", reaberta_para_correcao: false } : s))); setConfirmar(null); },
      });
      return;
    }
    setConfirmar({
      titulo: "Excluir compra em andamento", severo: false, textoConfirmar: "Excluir",
      mensagem: "Excluir essa compra em andamento? Ela não entra no histórico.",
      acao: () => { setSessoes((ss) => ss.filter((s) => s.id !== sessaoAtiva.id)); setConfirmar(null); },
    });
  }

  const mercado = by(catalogo.mercados, sessaoAtiva.mercado_id);
  const itensCarrinhoParaTotal = sessaoAtiva.itens.filter((it) => it.comprado);
  const totalAgora = somarValores(...itensCarrinhoParaTotal.map((it) => it.subtotal || 0));
  const totalPrev = totalPrevisto(sessaoAtiva.itens, catalogo, sessoes, sessaoAtiva.mercado_id);
  const estourouOrcamento = sessaoAtiva.orcamento != null && totalAgora > sessaoAtiva.orcamento;

  const itensLista = sessaoAtiva.itens.filter((it) => !it.comprado);
  const itensCarrinho = sessaoAtiva.itens.filter((it) => it.comprado);
  const ordemCategorias = categoriasOrdenadas(catalogo, mercado);

  function agrupar(itens) {
    const grupos = {};
    for (const it of itens) {
      const v = by(catalogo.variantes, it.produto_variante_id);
      const p = v && by(catalogo.produtos, v.produto_id);
      const cat = p && by(catalogo.categorias, p.categoria_id);
      const chave = cat?.id || "sem_categoria";
      if (!grupos[chave]) grupos[chave] = { id: chave, nome: cat?.nome || "Outros", icone: cat?.icone || "🛒", itens: [] };
      grupos[chave].itens.push(it);
    }
    const ordenados = [];
    for (const cat of ordemCategorias) if (grupos[cat.id]) ordenados.push(grupos[cat.id]);
    if (grupos["sem_categoria"]) ordenados.push(grupos["sem_categoria"]);
    return ordenados;
  }
  const gruposLista = agrupar(itensLista);
  const gruposCarrinho = agrupar(itensCarrinho);

  function mediaRefPara(item) {
    const rec = calcMediaRecente(sessoes, item.produto_variante_id, item.unidade, sessaoAtiva.mercado_id);
    const ger = calcHistorico(sessoes, item.produto_variante_id, item.unidade)?.media;
    const cruzada = rec == null && ger == null ? precoReferenciaEntreTamanhos(catalogo, sessoes, item.produto_variante_id) : null;
    const ia = ultimaEstimativa(precoIaCache, item.produto_variante_id)?.preco_medio_estimado;
    return rec ?? ger ?? cruzada ?? ia ?? null;
  }

  const emCorrecao = sessaoAtiva.id === sessaoEmCorrecaoId;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 pb-2 shrink-0">
        {emCorrecao && (
          <div className="bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg px-3 py-2 mb-2 text-center">
            🔧 Modo correção — finalize de novo pra voltar ao uso normal
          </div>
        )}
        <div className="bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: mercado?.cor }} />
            <div className="min-w-0"><div className="font-bold text-lg text-stone-800 leading-tight truncate">{mercado?.nome}</div><div className="text-xs text-stone-500">{dataCurta(sessaoAtiva.data_hora)}</div></div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!sessaoEmCorrecaoId && <button onClick={() => setModalNova(true)} className="text-xs text-emerald-700 font-semibold tap-target">+ Nova lista</button>}
            {ativas.length > 1 && !sessaoEmCorrecaoId && <button onClick={() => setSessaoAbertaId(null)} className="text-xs text-emerald-700 tap-target">trocar</button>}
            <button onClick={cancelarCompra} className="text-xs text-red-400 tap-target">{emCorrecao ? "Cancelar correção" : "Excluir"}</button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-1 mb-2 text-xs">
          <button onClick={() => setModalOrcamento(true)} className="text-stone-400 tap-target flex items-center gap-1">
            🎯 {sessaoAtiva.orcamento != null ? brl(sessaoAtiva.orcamento) : "Orçamento"}
          </button>
          <button onClick={() => setMostrarLegenda(true)} aria-label="Ver legenda de cores da lista" className="w-5 h-5 rounded-full border border-stone-300 text-stone-400 font-bold flex items-center justify-center tap-target shrink-0">?</button>
        </div>
        {mostrarLegenda && (
          <div className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center px-8" onClick={() => setMostrarLegenda(false)}>
            <div className="bg-white rounded-xl p-4 text-sm w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
              <div className="font-semibold mb-2 text-stone-700">Cores da lista</div>
              <div className="space-y-1.5">
                <div style={{ color: "var(--ink-black)" }}>● padrão (ainda não comprado)</div>
                <div style={{ color: "var(--ink-blue)" }}>● comprado</div>
                <div style={{ color: "var(--ink-green)" }}>▼ bom preço</div>
                <div style={{ color: "var(--ink-red)" }}>▲ caro</div>
              </div>
              <button onClick={() => setMostrarLegenda(false)} className="w-full mt-3 py-2 text-emerald-700 font-semibold text-sm tap-target">Fechar</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-y-auto paper-sheet">
          <div className="paper-pad pr-4 pb-24">
            {!itensLista.length && !itensCarrinho.length && <p className="text-stone-400 text-sm text-center py-10 handwrite text-lg">Lista vazia. Toque em "+" pra adicionar itens.</p>}

            {!!itensLista.length && (
              <div>
                <div className="handwrite text-lg font-bold mb-1" style={{ color: "var(--ink-black)" }}>📝 Lista</div>
                {gruposLista.map((grupo) => (
                  <div key={grupo.id} className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-stone-500 font-semibold mb-1">{grupo.icone} {grupo.nome}</div>
                    {grupo.itens.map((it) => (
                      <ItemLinha key={it.id} item={it} catalogo={catalogo} mediaRef={mediaRefPara(it)}
                        onAbrirEditor={abrirEditor} onToggleComprado={toggleComprado} onRemoverConfirmado={pedirRemocao} onAtualizarQuantidade={atualizarQuantidade} />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {!!itensCarrinho.length && (
              <div className="mt-2 pt-3" style={{ borderTop: "2px dashed var(--paper-margin)" }}>
                <div className="handwrite text-lg font-bold mb-1" style={{ color: "var(--ink-blue)" }}>🛒 Carrinho</div>
                {gruposCarrinho.map((grupo) => (
                  <div key={grupo.id} className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-stone-500 font-semibold mb-1">{grupo.icone} {grupo.nome}</div>
                    {grupo.itens.map((it) => (
                      <ItemLinha key={it.id} item={it} catalogo={catalogo} mediaRef={mediaRefPara(it)}
                        onAbrirEditor={abrirEditor} onToggleComprado={toggleComprado} onRemoverConfirmado={pedirRemocao} onAtualizarQuantidade={atualizarQuantidade} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => setModalAdd(true)} aria-label="Adicionar item" className="absolute right-4 bottom-4 w-14 h-14 rounded-full bg-emerald-800 text-white shadow-lg flex items-center justify-center text-2xl">+</button>
      </div>

      {!!itensCarrinhoParaTotal.length && (
        <div className="border-t border-stone-100 bg-white px-3 pt-1.5 shrink-0">
          <button onClick={() => setMostrarSubtotalCategoria((v) => !v)} className="text-xs text-stone-400 flex items-center gap-1 tap-target">
            🏷️ Gasto por categoria {mostrarSubtotalCategoria ? "▴" : "▾"}
          </button>
          {mostrarSubtotalCategoria && (
            <div className="text-xs text-stone-500 pb-1.5 pt-0.5">
              {Object.entries(subtotalPorCategoria(itensCarrinhoParaTotal, catalogo)).map(([nome, valor]) => `${nome}: ${brl(valor)}`).join(" · ")}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-stone-200 bg-white p-3 flex items-center justify-between shrink-0">
        <div className="flex gap-4">
          <div>
            <div className="text-xs text-stone-400 uppercase tracking-wide">No carrinho</div>
            <div className={`font-mono2 font-bold text-xl ${estourouOrcamento ? "text-red-600" : "text-stone-800"}`}>{brl(totalAgora)}</div>
            {estourouOrcamento && <div className="text-[10px] text-red-500 font-semibold">estourou em {brl(totalAgora - sessaoAtiva.orcamento)}</div>}
          </div>
          <div><div className="text-xs text-stone-400 uppercase tracking-wide">Previsto da lista</div><div className="font-mono2 font-semibold text-lg text-stone-500">{brl(totalPrev)}</div></div>
        </div>
        <button onClick={() => setModalPrevia(true)} className="relative bg-emerald-800 text-white font-semibold px-4 py-2.5 rounded-lg shrink-0 tap-target">
          Prévia →
          {arquivoCompartilhado && <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />}
        </button>
      </div>

      {modalAdd && (
        <ModalAdicionarItem catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} sessaoAtiva={sessaoAtiva} precoIaCache={precoIaCache} setPrecoIaCache={setPrecoIaCache} apiKey={apiKey}
          onAdd={(item) => { atualizarSessao({ itens: [...sessaoAtiva.itens, item] }); setModalAdd(false); }} onClose={() => setModalAdd(false)} />
      )}
      {modalPrevia && (
        <ModalPreviaCompra catalogo={catalogo} sessao={sessaoAtiva} sessoes={sessoes} setSessoes={setSessoes} onClose={() => setModalPrevia(false)} onFinalizado={onSessaoFinalizada} arquivoCompartilhado={arquivoCompartilhado} onUsarArquivoCompartilhado={onUsarArquivoCompartilhado} />
      )}
      {itemEditando && (
        <ModalEditarItem item={itemEditando.item} marcarComprado={itemEditando.marcarCompradoAoSalvar} catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} sessaoAtiva={sessaoAtiva} precoIaCache={precoIaCache} setPrecoIaCache={setPrecoIaCache} apiKey={apiKey}
          onChange={(patch) => atualizarItem(itemEditando.item.id, patch)} onRemoverConfirmado={pedirRemocao} onClose={() => setItemEditandoRaw(null)} />
      )}
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {modalOrcamento && (
        <ModalOrcamento orcamentoAtual={sessaoAtiva.orcamento} onSalvar={(valor) => setSessoes((ss) => ss.map((s) => (s.id === sessaoAtiva.id ? { ...s, orcamento: valor } : s)))} onFechar={() => setModalOrcamento(false)} />
      )}
      {modalNova && <ModalNovaSessao catalogo={catalogo} sessoes={sessoes} setSessoes={setSessoes} onCriada={setSessaoAbertaId} onClose={() => setModalNova(false)} />}
    </div>
  );
}

/* =========================================================
   DETALHE DE SESSÃO PASSADA (gráfico vem do instantâneo salvo — 22.4b)
========================================================= */
function SessaoDetalhe({ catalogo, sessao, sessoes, setSessoes, onClose, onReabriuParaCorrecao, arquivoCompartilhado, onUsarArquivoCompartilhado }) {
  useFecharComVoltar(true, onClose);
  const mercado = by(catalogo.mercados, sessao.mercado_id);
  const comprados = sessao.itens.filter((it) => it.comprado);
  const total = somarValores(...comprados.map((it) => it.subtotal || 0));
  const [confirmar, setConfirmar] = useState(null);
  const [nfeParaConferir, setNfeParaConferir] = useState(null);
  const [erroNfe, setErroNfe] = useState(null);
  const [lendoQr, setLendoQr] = useState(false);
  const [chaveDoQr, setChaveDoQr] = useState(null);
  const [digitandoChave, setDigitandoChave] = useState(false);
  const [maisOpcoesNfe, setMaisOpcoesNfe] = useState(false); // Etapa sobre simplificar anexar NF: 1 botão + escape hatch
  const [chaveDigitada, setChaveDigitada] = useState("");
  function usarChaveDigitada() {
    const limpa = chaveDigitada.replace(/\D/g, "");
    if (limpa.length !== 44) { alert("A chave de acesso tem que ter exatamente 44 números — confere se copiou tudo certo."); return; }
    const duplicada = sessaoComMesmaNfe(sessoes, limpa, sessao.id);
    if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
    setErroNfe(null);
    /* Etapa sobre pré-preencher a consulta oficial: não dá pra montar o link já preenchido pra
       chave digitada na mão (o site da Sefaz depende de token de sessão, e o formato do QR exige
       um hash que só o próprio QR carrega) — copiar pro clipboard é o substituto que garantidamente
       funciona: na página do governo, é só encostar no campo e colar, em vez de redigitar 44
       números. Falha em silêncio se o navegador negar a permissão (não é crítico pro fluxo). */
    navigator.clipboard?.writeText(limpa).catch(() => {});
    setChaveDoQr({ chave: limpa, url: null });
    setDigitandoChave(false);
    setChaveDigitada("");
  }
  const [lendoOcr, setLendoOcr] = useState(false);
  const [colandoTexto, setColandoTexto] = useState(false);
  const [textoColado, setTextoColado] = useState("");
  function processarTextoColado() {
    try {
      const nfeLida = parsearTextoConsultaNFCe(textoColado);
      const duplicada = sessaoComMesmaNfe(sessoes, nfeLida.chave_acesso, sessao.id);
      if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
      setErroNfe(null);
      /* Guarda o texto colado também, no mesmo formato que o PDF já usa (arquivo_base64 +
         mime_type + nome_arquivo) — antes disso era o único dos 4 caminhos de leitura de nota
         que processava e descartava, sem deixar nada salvo pra reconferir depois. */
      const arquivoBase64 = "data:text/plain;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(textoColado)));
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, endereco: nfeLida.endereco, dataEmissao: nfeLida.data_emissao,
        valorDesconto: nfeLida.valor_desconto, formaPagamento: nfeLida.forma_pagamento, numeroNota: nfeLida.numero_nota, serieNota: nfeLida.serie_nota,
        protocolo: nfeLida.protocolo_autorizacao, tributos: nfeLida.tributos,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do texto colado da consulta oficial — não é o documento oficial.",
      });
      setNfeParaConferir({ ...nfeLida, arquivo_base64: arquivoBase64, mime_type: "text/plain", nome_arquivo: "nfce-consulta.txt", html_reconstruido: htmlReconstruido });
      setColandoTexto(false);
      setTextoColado("");
    } catch (err) { setErroNfe(err.message); }
  }

  const entradasGrafico = sessao.grafico_categorias && sessao.grafico_categorias.length
    ? entradasGraficoDeSnapshot(sessao.grafico_categorias, catalogo)
    : entradasGraficoDe(subtotalPorCategoria(comprados, catalogo), catalogo);

  function reabrir() {
    const avisoNfe = sessao.nfe?.conferida ? " Essa compra já foi conferida por uma nota fiscal — reabrir pode deixar os dados diferentes do que a nota mostra." : "";
    const executar = () => {
      setSessoes((ss) => ss.map((s) => (s.id === sessao.id ? { ...s, status: "em_andamento", reaberta_para_correcao: true } : s)));
      onClose();
      onReabriuParaCorrecao();
    };
    setConfirmar({ titulo: "Reabrir pra correção", severo: !!sessao.nfe?.conferida, textoConfirmar: "Reabrir",
      mensagem: "Você vai direto pra tela da Lista pra corrigir. Enquanto durar a correção, as outras abas ficam bloqueadas — assim que finalizar de novo, tudo volta ao normal." + avisoNfe,
      acao: () => { setConfirmar(null); executar(); } });
  }
  function excluir() {
    setConfirmar({
      titulo: "Excluir do histórico", severo: true, textoConfirmar: "Excluir",
      mensagem: "Excluir essa compra do histórico definitivamente? Isso também afeta as médias e relatórios que dependiam dela. Não dá pra desfazer.",
      acao: () => { setSessoes((ss) => ss.filter((s) => s.id !== sessao.id)); setConfirmar(null); onClose(); },
    });
  }
  function aoDetectarQr(conteudo) {
    setLendoQr(false);
    const chave = extrairChaveDoQrNfce(conteudo);
    if (!chave) { setErroNfe("Não consegui identificar a chave da nota nesse QR Code."); return; }
    const duplicada = sessaoComMesmaNfe(sessoes, chave, sessao.id);
    if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
    setErroNfe(null);
    setChaveDoQr({ chave, url: conteudo });
  }
  async function processarArquivoNota(file) {
    if (!file) return;
    setErroNfe(null);
    const ehPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!ehPdf) { setErroNfe("Só aceito PDF da nota — XML precisa de certificado digital que consumidor comum não tem, não tem como ler."); return; }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const texto = await extrairTextoDePdf(arrayBuffer);
      const nfeLida = parsearDanfePdf(texto);
      const duplicada = sessaoComMesmaNfe(sessoes, nfeLida.chave_acesso, sessao.id);
      if (duplicada) { setErroNfe("Essa nota já foi anexada numa outra compra do histórico."); return; }
      /* Guarda o arquivo de verdade (não só os dados extraídos) — pedido do usuário: precisa dar
         pra ver a nota original com um toque no histórico depois. Fica temporariamente aqui até
         finalizar a compra, quando "muda de dono" pro repositório de Documentos do Finanças
         (mesma base, sem duplicar — ver integrarCompraMercado). */
      const arquivoBase64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const htmlReconstruido = montarHtmlRecibo({
        nomeEmit: nfeLida.nome_emit, cnpj: nfeLida.cnpj_emit, endereco: nfeLida.endereco, dataEmissao: nfeLida.data_emissao,
        valorDesconto: nfeLida.valor_desconto, formaPagamento: nfeLida.forma_pagamento, numeroNota: nfeLida.numero_nota, serieNota: nfeLida.serie_nota,
        protocolo: nfeLida.protocolo_autorizacao, tributos: nfeLida.tributos,
        valorTotal: nfeLida.valor_total, itens: nfeLida.itens, chaveAcesso: nfeLida.chave_acesso,
        avisoOrigem: "Reconstruído a partir do PDF da nota — não é o documento oficial.",
      });
      setNfeParaConferir({ ...nfeLida, arquivo_base64: arquivoBase64, mime_type: "application/pdf", nome_arquivo: file.name, html_reconstruido: htmlReconstruido });
    } catch (err) { setErroNfe(err.message); }
  }
  /* Compartilhamento nativo do Android: se chegou um arquivo pendente (PDF do DANFE, por
     exemplo) e essa é a compra ativa, processa igual a um anexo manual. */
  function aoEscolherArquivo(e) {
    const file = e.target.files[0];
    e.target.value = "";
    processarArquivoNota(file);
  }
  function usarArquivoCompartilhado() {
    if (!arquivoCompartilhado) return;
    processarArquivoNota(arquivoCompartilhado.arquivo);
    if (onUsarArquivoCompartilhado) onUsarArquivoCompartilhado();
  }
  function confirmarConferencia(nfeConferida) {
    setSessoes((ss) => ss.map((s) => {
      if (s.id !== sessao.id) return s;
      let itensAtualizados = s.itens;
      for (const linha of nfeConferida.itens) {
        if (linha.aceitarValorNota && linha.vinculado_item_id) {
          itensAtualizados = itensAtualizados.map((it) => it.id === linha.vinculado_item_id
            ? { ...it, preco_pago: linha.quantidade ? linha.valor_total / linha.quantidade : linha.valor_unitario, subtotal: linha.valor_total }
            : it);
        }
      }
      const ajustes = tentarExplicarDescontoClube(itensAtualizados, nfeConferida.valor_desconto, sessoes, catalogo, sessao.mercado_id);
      if (ajustes) {
        itensAtualizados = itensAtualizados.map((it) => {
          const ajuste = ajustes.find((a) => a.itemId === it.id);
          return ajuste ? { ...it, preco_pago: ajuste.precoNovo, subtotal: multiplicarValor(ajuste.precoNovo, it.quantidade || 1) } : it;
        });
      }
      return { ...s, itens: itensAtualizados, nfe: { ...nfeConferida, conferida: true, desconto_clube_ajustes: ajustes }, valor_nota_fiscal: nfeConferida.valor_total };
    }));
    setNfeParaConferir(null);
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-6 paper-sheet">
      <div className="paper-pad">
        <button onClick={onClose} aria-label="Voltar" className="flex items-center gap-1 text-stone-500 text-sm mb-3 tap-target">← Voltar</button>
        <div className="ticket bg-white/70 shadow-md p-4 mb-4">
          <div className="text-center font-bold handwrite text-lg">{mercado?.nome?.toUpperCase()}</div>
          <div className="text-center text-xs text-stone-500 mb-2">{new Date(sessao.data_hora).toLocaleDateString("pt-BR")}</div>
          <div className="border-t border-dashed border-stone-400 my-2" />
          {comprados.map((it) => {
            const v = by(catalogo.variantes, it.produto_variante_id);
            const p = v && by(catalogo.produtos, v.produto_id);
            const ajuste = sessao.nfe?.desconto_clube_ajustes?.find((a) => a.itemId === it.id);
            return (
              <div key={it.id} className="flex justify-between gap-2 text-xs font-mono2 mb-1">
                <span className="truncate">{p?.nome?.toUpperCase()}</span>
                <span className="whitespace-nowrap">
                  {ajuste ? <><span className="line-through text-stone-400">{brl(ajuste.precoAntigo * ajuste.quantidade)}</span> <span className="text-emerald-700 font-semibold">{brl(it.subtotal)}</span></> : brl(it.subtotal)}
                </span>
              </div>
            );
          })}
          <div className="border-t border-dashed border-stone-400 my-2" />
          <div className="flex justify-between font-mono2 font-bold"><span>TOTAL</span><span>{brl(total)}</span></div>
        </div>

        {!!sessao.nfe?.desconto_clube_ajustes?.length && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 text-xs text-emerald-800">
            🎟️ <strong>Desconto de clube identificado</strong> — {sessao.nfe.desconto_clube_ajustes.length} item(ns) tiveram o preço corrigido pro valor real pago nessa compra.
          </div>
        )}

        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-4">
          <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Gasto por categoria</div>
          <GraficoCategorias entradas={entradasGrafico} />
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">📄 Nota Fiscal</span>
            {sessao.nfe?.conferida && <span className="text-xs text-emerald-700 font-semibold">✓ Conferida</span>}
          </div>
          {sessao.nfe?.conferida ? (
            sessao.nfe.itens.length ? (
              <div className="text-xs text-stone-500">{sessao.nfe.nome_emit || "Emitente não identificado"} · {sessao.nfe.itens.filter((l) => !l.ignorado).length} itens · {brl(sessao.nfe.valor_total)}</div>
            ) : (
              <div className="text-xs text-stone-500">📷 Lido por foto (só o total, sem itens) · {brl(sessao.nfe.valor_total)}</div>
            )
          ) : (
            <>
              {!maisOpcoesNfe ? (
                <button onClick={() => setMaisOpcoesNfe(true)} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-3 text-sm text-stone-500 tap-target">
                  📎 Adicionar nota fiscal agora
                </button>
              ) : (
                <div>
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 rounded-xl py-3 text-sm text-stone-500 cursor-pointer tap-target">
                    📎 Anexar PDF da nota agora
                    <input type="file" accept=".pdf,application/pdf" onChange={aoEscolherArquivo} className="hidden" />
                  </label>
                  {erroNfe && <p className="text-xs text-red-600 mt-2">{erroNfe}</p>}
                  <button onClick={() => setLendoQr(true)} className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-xl py-2.5 text-sm text-stone-500 mt-1.5 tap-target">
                    📷 Ler QR Code da nota
                  </button>
                  {!colandoTexto && (
                    <button onClick={() => setColandoTexto(true)} className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-xl py-2.5 text-sm text-stone-500 mt-1.5 tap-target">
                      📋 Já copiei o texto da nota, colar aqui
                    </button>
                  )}
                  {!digitandoChave ? (
                    <button onClick={() => setDigitandoChave(true)} className="text-xs text-stone-400 underline mt-1.5 tap-target">QR não lê? Digitar a chave de acesso manualmente</button>
                  ) : (
                    <div className="mt-1.5 flex gap-1.5">
                      <input value={chaveDigitada} onChange={(e) => setChaveDigitada(e.target.value)} placeholder="os 44 números da chave (embaixo do QR)" className="flex-1 border border-stone-300 rounded-lg p-2 font-mono2 text-xs" aria-label="Chave de acesso da nota" />
                      <button onClick={usarChaveDigitada} className="bg-emerald-700 text-white text-xs font-semibold px-3 rounded-lg tap-target shrink-0">Usar</button>
                    </div>
                  )}
                  {chaveDoQr && !colandoTexto && (
                    <div className="bg-stone-50 rounded-lg p-2.5 mt-2 text-xs">
                      <div className="text-stone-500 mb-1.5">Chave identificada: ...{chaveDoQr.chave.slice(-8)}. Duas formas de trazer os dados: abre a consulta oficial, seleciona tudo (Ctrl+A) e copia — ou baixa o PDF pelo Meu Danfe.
                        {!chaveDoQr.url && " Já copiei a chave — é só colar no campo \"Chave de acesso\" da página."}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <button onClick={() => window.open(montarUrlConsultaOficial(chaveDoQr), "_blank")} className="text-emerald-700 font-semibold underline tap-target">Abrir consulta oficial →</button>
                        <button onClick={() => setColandoTexto(true)} className="text-emerald-700 font-semibold underline tap-target">Já copiei, colar aqui →</button>
                        <button onClick={() => window.open(montarUrlMeuDanfe(chaveDoQr.chave), "_blank")} className="text-stone-400 underline tap-target">Baixar PDF (Meu Danfe)</button>
                      </div>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-200">
                        <span className="font-mono2 text-[11px] text-stone-400 flex-1 truncate">{chaveDoQr.chave}</span>
                        <button onClick={() => navigator.clipboard?.writeText(chaveDoQr.chave)} className="text-emerald-700 font-semibold shrink-0 tap-target">Copiar chave</button>
                      </div>
                    </div>
                  )}
                  {colandoTexto && (
                    <div className="bg-stone-50 rounded-lg p-2.5 mt-2">
                      <p className="text-xs text-stone-500 mb-2">Cola aqui o texto inteiro que você copiou da página (do nome do mercado até a chave de acesso).</p>
                      <textarea value={textoColado} onChange={(e) => setTextoColado(e.target.value)} rows={4} placeholder="Cola aqui (Ctrl+V)..." className="w-full border border-stone-300 rounded-lg p-2 text-xs font-mono2" aria-label="Texto colado da consulta da nota" />
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => { setColandoTexto(false); setTextoColado(""); }} className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-semibold tap-target">Cancelar</button>
                        <button onClick={processarTextoColado} disabled={!textoColado.trim()} className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold tap-target disabled:opacity-40">Ler itens</button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-stone-400 mt-2">Sem QR nem XML? <button onClick={() => setLendoOcr(true)} className="text-emerald-700 font-semibold underline tap-target">Ler o total por foto</button>.</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="text-sm text-stone-600 mb-1">Valor da nota: <b className="font-mono2">{brl(sessao.valor_nota_fiscal)}</b></div>
        {sessao.nfe?.documento_id && (
          <button onClick={() => verNotaFiscalDoFinancas(sessao.nfe.documento_id)} className="w-full flex items-center justify-center gap-2 border border-stone-300 rounded-xl py-2.5 text-sm text-stone-600 mb-2 tap-target">
            📄 Ver nota fiscal
          </button>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={reabrir} className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold text-sm bg-white tap-target">Reabrir p/ correção</button>
          <button onClick={excluir} className="flex-1 py-2.5 rounded-lg border border-red-300 text-red-500 font-semibold text-sm bg-white tap-target">Excluir</button>
        </div>
      </div>
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
      {nfeParaConferir && (
        <ModalConferenciaNfe nfeInicial={nfeParaConferir} itens={sessao.itens} catalogo={catalogo}
          onConfirmar={confirmarConferencia} onFechar={() => setNfeParaConferir(null)} />
      )}
      {lendoQr && (
        <ScannerCodigoBarras formatos={["qr_code"]} titulo="Aponte pro QR Code da nota" onDetectado={aoDetectarQr} onFechar={() => setLendoQr(false)} />
      )}
      {lendoOcr && (
        <ModalLerCupomOcr
          onValorLido={({ valor, arquivoBase64, mimeType, htmlReconstruido }) => {
            setSessoes((ss) => ss.map((s) => (s.id === sessao.id
              ? { ...s, valor_nota_fiscal: valor, nfe: { chave_acesso: null, cnpj_emit: null, nome_emit: null, data_emissao: null, valor_total: valor, itens: [], arquivo_base64: arquivoBase64, mime_type: mimeType, nome_arquivo: "cupom-foto.jpg", conferida: true, html_reconstruido: htmlReconstruido } }
              : s)));
            setLendoOcr(false);
          }}
          onFechar={() => setLendoOcr(false)} />
      )}
    </div>
  );
}

/* =========================================================
   TELA: HISTÓRICO — reorganizada (seção 22.6):
   sub-aba "Compras" (lista + busca + filtros) primeiro,
   sub-aba "Resumo" (agregados em gráfico) separada.
========================================================= */
function TelaHistorico({ catalogo, sessoes, setSessoes, abrirSessaoId, onAbriuAutomatico, onReabriuParaCorrecao }) {
  const [subaba, setSubaba] = useState("compras");
  const [busca, setBusca] = useState("");
  const [filtroMercado, setFiltroMercado] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalheId, setDetalheId] = useState(null);
  const fechadas = sessoes.filter((s) => s.status === "fechada");

  useEffect(() => {
    if (abrirSessaoId) { setDetalheId(abrirSessaoId); onAbriuAutomatico(); }
  }, [abrirSessaoId]);

  if (detalheId) {
    const s = fechadas.find((x) => x.id === detalheId);
    if (s) return <SessaoDetalhe catalogo={catalogo} sessao={s} sessoes={sessoes} setSessoes={setSessoes} onClose={() => setDetalheId(null)} onReabriuParaCorrecao={onReabriuParaCorrecao} />;
  }

  const porMes = {}, porMercado = {}, porCategoria = {};
  for (const s of fechadas) {
    const valor = s.valor_nota_fiscal ?? somarValores(...s.itens.map((it) => it.subtotal || 0));
    porMes[mesAno(s.data_hora)] = (porMes[mesAno(s.data_hora)] || 0) + valor;
    porMercado[s.mercado_id] = (porMercado[s.mercado_id] || 0) + valor;
    for (const it of s.itens) {
      if (!it.comprado) continue;
      const v = by(catalogo.variantes, it.produto_variante_id);
      const p = v && by(catalogo.produtos, v.produto_id);
      const cat = p && by(catalogo.categorias, p.categoria_id);
      const nome = cat?.nome || "Outros";
      porCategoria[nome] = (porCategoria[nome] || 0) + (it.subtotal || 0);
    }
  }
  const maxMes = Math.max(1, ...Object.values(porMes));
  const entradasMercado = Object.entries(porMercado).map(([mid, valor]) => { const m = by(catalogo.mercados, mid); return { nome: m?.nome || mid, valor, cor: m?.cor || "#999" }; });
  const entradasCategoria = entradasGraficoDe(porCategoria, catalogo);

  const listaFiltrada = fechadas
    .filter((s) => !filtroMercado || s.mercado_id === filtroMercado)
    .filter((s) => {
      if (!busca.trim()) return true;
      const m = by(catalogo.mercados, s.mercado_id);
      const textoItens = s.itens.map((it) => { const v = by(catalogo.variantes, it.produto_variante_id); const p = v && by(catalogo.produtos, v.produto_id); return p?.nome || ""; }).join(" ");
      return normalizar(`${m?.nome || ""} ${textoItens}`).includes(normalizar(busca));
    })
    .filter((s) => !dataInicio || new Date(s.data_hora) >= new Date(dataInicio))
    .filter((s) => !dataFim || new Date(s.data_hora) <= new Date(dataFim + "T23:59:59"))
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

  return (
    <div className="h-full overflow-y-auto p-4 pb-6">
      <h2 className="text-2xl font-bold text-emerald-900 mb-3">Histórico</h2>
      <div className="flex gap-2 mb-4">
        <Chip selected={subaba === "compras"} onClick={() => setSubaba("compras")}>Compras</Chip>
        <Chip selected={subaba === "resumo"} onClick={() => setSubaba("resumo")}>Resumo</Chip>
      </div>

      {subaba === "compras" && (
        <div className="space-y-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar por mercado ou item..." className="w-full border border-stone-300 rounded-lg p-2.5 text-sm" aria-label="Buscar no histórico" />
          <div className="flex gap-2">
            <select value={filtroMercado} onChange={(e) => setFiltroMercado(e.target.value)} className="flex-1 text-sm border border-stone-300 rounded-lg px-2 py-2" aria-label="Filtrar por mercado">
              <option value="">Todos mercados</option>{catalogo.mercados.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center text-sm">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="flex-1 border border-stone-300 rounded-lg px-2 py-2 text-xs" aria-label="Data início" />
            <span className="text-stone-400">até</span>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="flex-1 border border-stone-300 rounded-lg px-2 py-2 text-xs" aria-label="Data fim" />
            {(dataInicio || dataFim) && <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="text-xs text-stone-400 tap-target">limpar</button>}
          </div>

          <div className="space-y-2">
            {listaFiltrada.map((s) => { const m = by(catalogo.mercados, s.mercado_id); const valor = s.valor_nota_fiscal ?? somarValores(...s.itens.map((it) => it.subtotal || 0)); return (
              <button key={s.id} onClick={() => setDetalheId(s.id)} className="w-full bg-white border border-stone-200 rounded-xl p-3 flex items-center justify-between text-left tap-target">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m?.cor }} /><div><div className="font-semibold text-sm text-stone-700">{m?.nome}</div><div className="text-xs text-stone-400">{dataCurta(s.data_hora)}</div></div></div>
                <span className="font-mono2 font-semibold">{brl(valor)}</span>
              </button>
            ); })}
            {!listaFiltrada.length && <p className="text-stone-400 text-sm text-center py-8">Nenhuma compra encontrada.</p>}
          </div>
        </div>
      )}

      {subaba === "resumo" && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Gasto por mês</div>
            <div className="space-y-2">
              {Object.entries(porMes).map(([mes, v]) => (
                <div key={mes}><div className="flex justify-between text-sm mb-0.5"><span className="text-stone-600">{mes}</span><span className="font-mono2 font-semibold">{brl(v)}</span></div><div className="h-2 bg-stone-100 rounded-full"><div className="h-2 bg-emerald-600 rounded-full" style={{ width: `${(v / maxMes) * 100}%` }} /></div></div>
              ))}
              {!Object.keys(porMes).length && <p className="text-stone-400 text-sm">Nenhuma compra fechada ainda.</p>}
            </div>
          </div>

          {!!entradasMercado.length && (
            <div className="bg-white border border-stone-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Gasto por mercado</div>
              <GraficoCategorias entradas={entradasMercado} />
            </div>
          )}

          {!!entradasCategoria.length && (
            <div className="bg-white border border-stone-200 rounded-xl p-3">
              <div className="text-xs font-semibold text-stone-400 uppercase mb-2">Gasto por categoria</div>
              <GraficoCategorias entradas={entradasCategoria} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   TELA: CONFIGURAÇÕES
========================================================= */
function TelaConfig({ catalogo, setCatalogo, sessoes, setSessoes, setPrecoIaCache, apiKey, setApiKey, onAbrirConfigGeral }) {
  const [apiKeyTexto, setApiKeyTexto] = useState(apiKey || "");
  const [confirmar, setConfirmar] = useState(null);

  async function exportarCatalogo(compartilhar) { await baixarOuCompartilharJSON(catalogo, "catalogo", compartilhar); }
  function importarCatalogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result);
        setCatalogo((c) => ({
          mercados: upsertBy(c.mercados, obj.mercados), categorias: upsertBy(c.categorias, obj.categorias),
          produtos: upsertBy(c.produtos, obj.produtos), marcas: upsertBy(c.marcas, obj.marcas), variantes: upsertBy(c.variantes, obj.variantes),
        }));
        if (obj.sessoes) setSessoes((s) => upsertBy(s, obj.sessoes));
        alert("Importado com sucesso!");
      } catch (err) { alert("Arquivo inválido: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function apagarTudo() {
    setConfirmar({
      titulo: "Apagar dados do Mercado", severo: true, textoConfirmar: "Apagar tudo",
      mensagem: "Apagar TODOS os dados do módulo Mercado (mercados, catálogo extra e histórico de compras)? Isso não pode ser desfeito. O Finanças não é afetado.",
      acao: () => { setCatalogo(SEED_CATALOGO); setSessoes([]); setPrecoIaCache({}); setConfirmar(null); },
    });
  }
  return (
    <div className="h-full overflow-y-auto p-4 pb-6 space-y-4">
      <h2 className="text-2xl font-bold text-emerald-900">Config — Mercado</h2>

      {onAbrirConfigGeral && (
        <button onClick={onAbrirConfigGeral} className="w-full flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 tap-target">
          <span className="text-sm text-emerald-800 text-left"><b>💾 Backup completo</b> (protege seu histórico de verdade) fica nas Configurações gerais</span>
          <span className="text-emerald-700 text-lg shrink-0 ml-2">→</span>
        </button>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="font-semibold text-stone-700 mb-1">Chave de API da Anthropic (opcional)</div>
        <p className="text-xs text-stone-500 mb-3">Só é necessária pro botão "Atualizar preço por IA". Fica salva apenas neste navegador. Gere a sua em console.anthropic.com.</p>
        <input type="password" value={apiKeyTexto} onChange={(e) => setApiKeyTexto(e.target.value)} placeholder="sk-ant-..." className="w-full border border-stone-300 rounded-lg p-2.5 mb-2 font-mono2 text-sm" aria-label="Chave de API" />
        <button onClick={() => setApiKey(apiKeyTexto)} className="bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-lg tap-target">Salvar chave</button>
        {apiKey && <span className="text-xs text-emerald-600 ml-2">✓ Chave salva</span>}
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="font-semibold text-stone-700 mb-1">Catálogo</div>
        <p className="text-xs text-stone-500 mb-3">Só os mercados/produtos/marcas cadastrados — <b>não leva o histórico de compras</b>. Isso não é backup; pra isso, use "Backup completo" acima. Isso aqui serve só pra levar o catálogo pra outro Nossa Casa.</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => exportarCatalogo(false)} className="w-full flex items-center justify-center gap-1.5 border border-stone-300 rounded-lg py-2.5 text-xs font-semibold text-stone-500 tap-target">⬇️ Baixar catálogo</button>
          <label className="flex items-center justify-center gap-1.5 border border-stone-300 rounded-lg py-2.5 text-xs font-semibold text-stone-500 cursor-pointer tap-target">⬆️ Importar catálogo<input type="file" accept="application/json" onChange={importarCatalogo} className="hidden" /></label>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="font-semibold text-stone-700 mb-1">Exportar planilha Excel</div>
        <p className="text-xs text-stone-500 mb-3">Gera um .xlsx com abas de Compras, Resumo por mês e Resumo por mercado. Não é reimportável, é só leitura.</p>
        <button onClick={() => exportarExcel(sessoes, catalogo)} className="w-full bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-lg tap-target">📊 Exportar .xlsx</button>
      </div>

      <button onClick={apagarTudo} className="text-xs text-red-400 underline block mx-auto pt-2 tap-target">Apagar dados do Mercado e recomeçar</button>
      {confirmar && <ModalConfirmar titulo={confirmar.titulo} mensagem={confirmar.mensagem} textoConfirmar={confirmar.textoConfirmar} severo={confirmar.severo} onConfirmar={confirmar.acao} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}

/* =========================================================
   NAVEGAÇÃO INFERIOR
========================================================= */
function TabBarInterna({ aba, setAba, temSessaoAtiva, restrito }) {
  const itens = [
    { id: "lista", label: "Lista", icon: "🛒" }, { id: "mercados", label: "Mercados", icon: "🏬" },
    { id: "produtos", label: "Produtos", icon: "📦" }, { id: "historico", label: "Histórico", icon: "🕓" }, { id: "config", label: "Config", icon: "⚙️" },
  ];
  return (
    <div className="flex border-t border-stone-200 bg-white shrink-0">
      {itens.map((it) => {
        const ativo = aba === it.id;
        const bloqueado = restrito && it.id !== "lista";
        return (
          <button key={it.id} onClick={() => setAba(it.id)} disabled={bloqueado} aria-label={bloqueado ? `${it.label} (bloqueado durante correção)` : it.label}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium tap-target ${bloqueado ? "text-stone-300" : ativo ? "text-emerald-700" : "text-stone-400"}`}>
            <span className="text-lg leading-none">{it.icon}</span>
            <span className="flex items-center gap-1">{it.label}{it.id === "lista" && temSessaoAtiva && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />}</span>
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   APP
========================================================= */
function loadAllMercado() {
  let catalogo = null, sessoes = [], precoIaCache = {};
  let houveErroCarregamento = false;
  try { const v = localStorage.getItem("nc_catalogo"); catalogo = v ? JSON.parse(v) : null; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("nc_sessoes"); sessoes = v ? JSON.parse(v) : []; } catch (e) { houveErroCarregamento = true; }
  try { const v = localStorage.getItem("nc_precoIaCache"); precoIaCache = migrarPrecoIaCache(v ? JSON.parse(v) : {}); } catch (e) { houveErroCarregamento = true; }
  if (!catalogo) catalogo = SEED_CATALOGO;
  return { catalogo, sessoes, precoIaCache, houveErroCarregamento };
}

/* AppMercado — o que antes era o App inteiro (seção 32 do mapa: divisão em módulos).
   Recebe apiKey/setApiKey de fora (agora é estado do app-shell, compartilhado entre módulos)
   e onVoltarHub pra voltar pro Hub. Todo o resto (catálogo, sessões, cache de IA, abas internas,
   modo correção) continua exatamente como era. */
function AppMercado({ apiKey, setApiKey, onVoltarHub, onAbrirConfigGeral, arquivoCompartilhado, onUsarArquivoCompartilhado, sessaoParaEditarExterno, onAbriuSessaoExterna }) {
  const [loading, setLoading] = useState(true);
  const [catalogo, setCatalogo] = useState(null);
  const [sessoes, setSessoes] = useState([]);
  const [precoIaCache, setPrecoIaCache] = useState({});
  const [aba, setAba] = useState("lista");
  const [sessaoParaAbrir, setSessaoParaAbrir] = useState(null);
  const [erroCarregamento, setErroCarregamento] = useState(false);
  const [erroSalvamento, setErroSalvamento] = useState(false);

  /* Mesmo motivo do App (index.html): sem isso, voltar de dentro de uma aba interna do Mercado
     (Catálogo, Histórico etc.) fechava o app inteiro em vez de voltar pra Lista. */
  useFecharComVoltar(aba !== "lista", () => setAba("lista"));

  /* Pedido do usuário: lançamento vindo do Mercado não pode ter valor/nota mexidos direto no
     Finanças — só dá pra corrigir voltando pro Mercado. Esse é o lado que recebe esse pedido de
     navegação (veio de fora, do App) e abre a compra certa direto no Histórico. */
  useEffect(() => {
    if (sessaoParaEditarExterno) {
      setAba("historico");
      setSessaoParaAbrir(sessaoParaEditarExterno);
      if (onAbriuSessaoExterna) onAbriuSessaoExterna();
    }
  }, [sessaoParaEditarExterno]);

  useEffect(() => {
    const d = loadAllMercado();
    setCatalogo(d.catalogo); setSessoes(d.sessoes); setPrecoIaCache(d.precoIaCache);
    setErroCarregamento(!!d.houveErroCarregamento);
    setLoading(false);
  }, []);

  useEffect(() => { if (!loading && catalogo) { const ok = persist("nc_catalogo", catalogo); if (!ok) setErroSalvamento(true); } }, [catalogo, loading]);
  useEffect(() => { if (!loading) { const ok = persist("nc_sessoes", sessoes); if (!ok) setErroSalvamento(true); } }, [sessoes, loading]);
  useEffect(() => { if (!loading) { const ok = persist("nc_precoIaCache", precoIaCache); if (!ok) setErroSalvamento(true); } }, [precoIaCache, loading]);

  function onSessaoFinalizada(sessaoId) { setAba("historico"); setSessaoParaAbrir(sessaoId); }

  const sessaoEmCorrecao = sessoes.find((s) => s.status === "em_andamento" && s.reaberta_para_correcao);
  const emModoCorrecao = !!sessaoEmCorrecao;

  useEffect(() => { if (emModoCorrecao && aba !== "lista") setAba("lista"); }, [emModoCorrecao]);

  function mudarAba(novaAba) {
    if (emModoCorrecao && novaAba !== "lista") return;
    setAba(novaAba);
  }

  if (loading || !catalogo) return (
    <div className="h-screen flex flex-col items-center justify-center bg-stone-100 text-stone-400 gap-2 max-w-md mx-auto">
      <div>Carregando…</div>
    </div>
  );

  const temSessaoAtiva = sessoes.some((s) => s.status === "em_andamento");

  return (
    <div className="h-screen flex flex-col bg-stone-100 max-w-md mx-auto">
      <div className="bg-emerald-800 text-white px-4 pt-4 pb-3 shrink-0 flex items-center gap-3">
        <button onClick={onVoltarHub} aria-label="Voltar ao início" className="tap-target text-emerald-200 text-xl">←</button>
        <div className="font-bold text-xl">🛒 Mercado</div>
      </div>

      {erroCarregamento && (
        <div className="bg-red-600 text-white text-xs p-2 flex items-center justify-between gap-2 shrink-0">
          <span>⚠️ Alguns dados salvos não puderam ser lidos (parecem corrompidos). Você tem um backup pra importar?</span>
          <button onClick={() => { setErroCarregamento(false); setAba("config"); }} className="underline font-semibold shrink-0 tap-target">Ir pra Config</button>
        </div>
      )}
      {erroSalvamento && (
        <div className="bg-red-600 text-white text-xs p-2 flex items-center justify-between gap-2 shrink-0">
          <span>⚠️ Sua última alteração não foi salva (armazenamento cheio). Exporte um backup e libere espaço.</span>
          <button onClick={() => setErroSalvamento(false)} className="underline font-semibold shrink-0 tap-target">Ok</button>
        </div>
      )}
      {emModoCorrecao && (
        <div className="bg-amber-600 text-white text-xs p-2 text-center shrink-0">
          🔧 Corrigindo uma compra já fechada — as outras abas ficam bloqueadas até você finalizar de novo.
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {aba === "lista" && <TelaLista catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} setSessoes={setSessoes} precoIaCache={precoIaCache} setPrecoIaCache={setPrecoIaCache} apiKey={apiKey} onSessaoFinalizada={onSessaoFinalizada} sessaoEmCorrecaoId={sessaoEmCorrecao?.id || null} arquivoCompartilhado={arquivoCompartilhado} onUsarArquivoCompartilhado={onUsarArquivoCompartilhado} />}
        {aba === "mercados" && <TelaMercados catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} />}
        {aba === "produtos" && <TelaProdutos catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} precoIaCache={precoIaCache} setPrecoIaCache={setPrecoIaCache} apiKey={apiKey} />}
        {aba === "historico" && <TelaHistorico catalogo={catalogo} sessoes={sessoes} setSessoes={setSessoes} abrirSessaoId={sessaoParaAbrir} onAbriuAutomatico={() => setSessaoParaAbrir(null)} onReabriuParaCorrecao={() => setAba("lista")} />}
        {aba === "config" && <TelaConfig catalogo={catalogo} setCatalogo={setCatalogo} sessoes={sessoes} setSessoes={setSessoes} setPrecoIaCache={setPrecoIaCache} apiKey={apiKey} setApiKey={setApiKey} onAbrirConfigGeral={onAbrirConfigGeral} />}
      </div>
      <TabBarInterna aba={aba} setAba={mudarAba} temSessaoAtiva={temSessaoAtiva} restrito={emModoCorrecao} />
    </div>
  );
}
