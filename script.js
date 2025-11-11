// ==============================
// Cafecionado — Script (Home + Ecommerce)
// Compatível com páginas separadas e com/sem JSON/template
// ==============================

// ===== CONFIG DEFAULTS (podem ser sobrescritos via planilha "Config")
let CONFIG = {
  whatsapp_numero: "555197240550",          // 55DDDNUMERO (ajuste aqui ou via planilha)
  brand: "Cafecionado",
  cta_text: "Pedir pelo WhatsApp",
  locale: "pt-BR",
  currency: "BRL",
  chip_all: "Todos",
  chip_available: "Em estoque",
  chip_preorder: "Sob encomenda",
  search_ph: "Buscar por nome, origem ou notas…",
  cat_all_label: "Todas as categorias",
  sort_relevance: "Ordenar por: relevância",
  sort_price_asc: "Preço: menor → maior",
  sort_price_desc: "Preço: maior → menor",
  sort_name_asc: "Nome: A → Z",
  footer_note: "Catálogo demonstrativo. Imagens e preços podem ser ilustrativos."
};

// ===== CONFIG DE FONTE DE DADOS
const DATA_SOURCE = "json"; // "json" (produtos.json) | "sheets" (Apps Script) | "none" (somente cards estáticos)
const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbz0eKsGj4z0lY6avhCSi0ZyysSUANFy7wrxwPcSUH6xJfdIuX4Ywn35Eqac-Tnh82FkUA/exec";

// ===== ESTADO
let PRODUTOS = [];
let SCOPE = "todos";   // disponibilidade: "todos" | "disponivel" | "encomenda"
let QUERY = "";
let CATEGORIA = "";
let ORDENAR = "relevancia";
let CHIP_TXT = "";     // texto do chip para filtro rápido

// ===== HELPERS GERAIS
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function waLink(text) {
  const raw = (CONFIG.whatsapp_numero || "").replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${raw}?text=${msg}`;
}

function parsePreco(p) {
  if (typeof p === "number") return p;
  let s = String(p ?? "").trim().replace(/[^\d.,-]/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  const decIdx = Math.max(lastComma, lastDot);
  if (decIdx !== -1) {
    const inteiro = s.slice(0, decIdx).replace(/[.,]/g, "");
    const frac = s.slice(decIdx + 1);
    s = `${inteiro}.${frac}`;
  } else {
    s = s.replace(/[.,]/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const fmtMoeda = (n) =>
  new Intl.NumberFormat(CONFIG.locale || "pt-BR", {
    style: "currency",
    currency: CONFIG.currency || "BRL",
    maximumFractionDigits: 2
  }).format(n);

// ====== BOOT GERAL (HOME + ECOMMERCE)
document.addEventListener("DOMContentLoaded", () => {
  // Rodapé com ano (home e ecommerce usam ids distintos; tratamos ambos)
  $("#year") && ($("#year").textContent = new Date().getFullYear());
  $("#ano") && ($("#ano").textContent = new Date().getFullYear());

  const page = document.body.dataset.page || "home";
  if (page === "ecommerce") bootEcommerce();
  // na home não há catálogo para montar; nada além do ano é necessário por enquanto
});

// ==============================
// ECOMMERCE
// ==============================
async function bootEcommerce() {
  // Ajustes de UI de acordo com os IDs do ecommerce.html novo
  const q = $("#q");
  if (q) q.placeholder = CONFIG.search_ph;

  // Popular categorias (modo estático: a partir dos cards; modo dinâmico: do JSON)
  const temTemplate = !!$("#product-card-template");
  const temGrid = !!$("#grid");

  // Eventos de UI (em qualquer modo)
  bindUIEcommerce();

  // Se for dinâmico (template + JSON/sheets)
  if (DATA_SOURCE !== "none" && temGrid && $("#product-card-template")) {
    await carregarDadosDinamico();   // carrega PRODUTOS (JSON/Sheets)
    popularCategoriasDinamico(PRODUTOS); // preenche <select id="cat">
    renderDinamico();               // monta cards via template
    return;
  }

  // Caso contrário, modo estático: opera sobre os cards já existentes no HTML
  popularCategoriasEstatico();      // monta categorias com base nos cards existentes
  aplicarFiltroOrdenacaoEstatico(); // aplica busca/filtros/ordenação
}

// ===== Carregar dados (dinâmico)
async function carregarDadosDinamico() {
  try {
    let data;
    if (DATA_SOURCE === "sheets") {
      const resp = await fetch(`${SHEETS_API_URL}?t=${Date.now()}`);
      const payload = await resp.json(); // { produtos, config }
      if (payload.config && typeof payload.config === "object") {
        CONFIG = { ...CONFIG, ...payload.config };
      }
      data = payload.produtos || [];
    } else {
      const resp = await fetch("produtos.json", { cache: "no-store" });
      data = await resp.json(); // array
    }

    // normaliza produtos
    PRODUTOS = data.map((p) => ({
      status: (p.status || "disponivel").toLowerCase(), // "disponivel" | "encomenda"
      categoria: p.categoria || "Geral",
      nome: p.nome || "Sem nome",
      preco: p.preco ?? 0,
      descricao: p.descricao || "",
      imagem: p.imagem || "img/placeholder.jpg",
      sku: p.sku || "",
      tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(","))
              .map(s => s.trim().toLowerCase()).filter(Boolean)
    }));
  } catch (e) {
    console.error("Erro ao carregar (dinâmico):", e);
    PRODUTOS = [];
  }
}

// ===== UI bindings (comuns ao ecommerce)
function bindUIEcommerce() {
  // chips (usam texto do chip como filtro livre; "Todos" limpa)
  $$(".chips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      $$(".chips .chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const txt = chip.textContent.trim().toLowerCase();
      CHIP_TXT = (txt === "todos") ? "" : txt;
      SCOPE = "todos"; // chips são filtro livre; escopo volta a "todos"
      aplicarFiltroOrdenacaoUniversal();
    });
  });

  // busca
  $("#q")?.addEventListener("input", (e) => {
    QUERY = e.target.value.trim();
    aplicarFiltroOrdenacaoUniversal();
  });

  // categoria
  $("#cat")?.addEventListener("change", (e) => {
    CATEGORIA = e.target.value;
    aplicarFiltroOrdenacaoUniversal();
  });

  // ordenar
  $("#ord")?.addEventListener("change", (e) => {
    ORDENAR = e.target.value;
    aplicarFiltroOrdenacaoUniversal();
  });
}

// ===== Decide o modo e aplica
function aplicarFiltroOrdenacaoUniversal() {
  if ($("#product-card-template")) {
    renderDinamico();
  } else {
    aplicarFiltroOrdenacaoEstatico();
  }
}

// ==============================
// MODO DINÂMICO (template + JSON/Sheets)
// ==============================
function popularCategoriasDinamico(data) {
  const sel = $("#cat");
  if (!sel) return;
  // zera mantendo a primeira opção
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = CONFIG.cat_all_label;
  sel.appendChild(optAll);

  const cats = Array.from(new Set(data.map(p => p.categoria))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
}

function renderDinamico() {
  const grid = $("#grid");
  const template = $("#product-card-template");
  if (!grid || !template) return;

  grid.innerHTML = "";
  grid.setAttribute("aria-busy", "true");

  let lista = PRODUTOS.slice();

  // Filtro por disponibilidade (se algum dia usarmos SCOPE dedicado)
  if (SCOPE !== "todos") lista = lista.filter(p => p.status === SCOPE);

  // Busca livre
  if (QUERY) {
    const q = QUERY.toLowerCase();
    lista = lista.filter(p => `${p.nome} ${p.descricao} ${p.categoria}`.toLowerCase().includes(q));
  }

  // Chip-text (busca rápida: torra clara, moído, etc.)
  if (CHIP_TXT) {
    const k = CHIP_TXT;
    lista = lista.filter(p =>
      `${p.nome} ${p.descricao} ${p.categoria} ${(p.tags || []).join(" ")}`
      .toLowerCase()
      .includes(k)
    );
  }

  // Categoria
  if (CATEGORIA) lista = lista.filter(p => p.categoria === CATEGORIA);

  // Ordenação
  if (ORDENAR === "preco-asc")  lista.sort((a,b) => parsePreco(a.preco) - parsePreco(b.preco));
  if (ORDENAR === "preco-desc") lista.sort((a,b) => parsePreco(b.preco) - parsePreco(a.preco));
  if (ORDENAR === "nome-asc")   lista.sort((a,b) => a.nome.localeCompare(b.nome,"pt-BR"));

  // Render
  for (const p of lista) {
    const node = document.importNode(template.content, true);
    const img   = $("[data-img]", node);
    const badge = $("[data-badge]", node);
    const nome  = $("[data-nome]", node);
    const desc  = $("[data-desc]", node);
    const preco = $("[data-preco]", node);
    const sku   = $("[data-sku]", node);
    const cta   = $("[data-wa]", node);

    if (img)   { img.src = p.imagem; img.alt = p.nome; }
    if (badge) {
      if (p.status === "disponivel") { badge.textContent = CONFIG.chip_available; badge.classList.add("in"); }
      else                           { badge.textContent = CONFIG.chip_preorder;  badge.classList.add("pre"); }
    }
    if (nome)  nome.textContent = p.nome;
    if (desc)  desc.textContent = p.descricao;
    if (preco) preco.textContent = fmtMoeda(parsePreco(p.preco));
    if (sku)   sku.textContent = p.sku || "";

    if (cta) {
      const msg = `Olá! Quero o produto ${p.nome} (${p.sku || "sem SKU"}) por ${fmtMoeda(parsePreco(p.preco))}.`;
      cta.href = waLink(msg);
    }

    grid.appendChild(node);
  }

  grid.setAttribute("aria-busy", "false");
}

// ==============================
// MODO ESTÁTICO (usa os cards já presentes no HTML)
// ==============================
function popularCategoriasEstatico() {
  const sel = $("#cat");
  if (!sel) return;

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = CONFIG.cat_all_label;
  sel.innerHTML = "";
  sel.appendChild(optAll);

  const cards = $$(".grid .card");
  const cats = new Set();
  cards.forEach(card => {
    const c = (card.getAttribute("data-cat") || "").trim();
    if (c) cats.add(c);
  });
  [...cats].sort((a,b) => a.localeCompare(b, "pt-BR")).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c[0].toUpperCase() + c.slice(1);
    sel.appendChild(opt);
  });
}

function aplicarFiltroOrdenacaoEstatico() {
  const cards = $$(".grid .card");
  if (!cards.length) return;

  // Prepara: também enriquecemos o botão "Comprar" com link de WhatsApp
  cards.forEach(card => {
    const nome = $("h3", card)?.textContent?.trim() || "Produto";
    const precoTxt = $(".price", card)?.textContent?.trim() || "";
    const cta = $(".cta", card);
    if (cta && !cta.dataset.waBound) {
      const msg = `Olá! Quero o produto ${nome} por ${precoTxt}.`;
      cta.href = waLink(msg);
      cta.dataset.waBound = "1";
    }
  });

  // Aplica filtros
  let lista = cards.slice();

  // Busca (#q)
  if (QUERY) {
    const q = QUERY.toLowerCase();
    lista = lista.filter(card =>
      card.textContent.toLowerCase().includes(q)
    );
  }

  // Chip (texto livre)
  if (CHIP_TXT) {
    const k = CHIP_TXT;
    lista = lista.filter(card => card.textContent.toLowerCase().includes(k));
  }

  // Categoria (#cat -> data-cat)
  if (CATEGORIA) {
    lista = lista.filter(card => (card.getAttribute("data-cat") || "") === CATEGORIA);
  }

  // Ordenação (reorganiza no DOM)
  if (ORDENAR && ORDENAR !== "relevancia") {
    lista.sort((a, b) => {
      const nomeA = $("h3", a)?.textContent?.trim() || "";
      const nomeB = $("h3", b)?.textContent?.trim() || "";
      const precoA = parsePreco($(".price", a)?.textContent || "");
      const precoB = parsePreco($(".price", b)?.textContent || "");
      if (ORDENAR === "preco-asc")  return precoA - precoB;
      if (ORDENAR === "preco-desc") return precoB - precoA;
      if (ORDENAR === "nome-asc")   return nomeA.localeCompare(nomeB, "pt-BR");
      return 0;
    });
  }

  // Mostra/esconde conforme filtros
  const setVisible = new Set(lista);
  cards.forEach(card => {
    card.style.display = setVisible.has(card) ? "" : "none";
  });

  // Reordena no DOM conforme lista ordenada (mantendo apenas os visíveis)
  if (ORDENAR !== "relevancia") {
    const grid = $("#grid");
    if (grid) {
      // Anexa na nova ordem apenas os visíveis
      lista.forEach(card => grid.appendChild(card));
    }
  }
}
