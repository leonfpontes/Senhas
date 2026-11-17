/**
 * Biblioteca de blocos da gaveta "Adicionar" do estúdio do site (beta "Novo construtor do site").
 *
 * Um bloco é uma seção do catálogo já com um jeito escolhido (Fotos em mosaico, Contato em
 * botões…), como os "elementos prontos" do Wix e do Squarespace. A casa arrasta o bloco para a
 * prévia ou clica nele; o bloco vira uma seção com a config da variação por cima da config
 * padrão do catálogo. Nada aqui inventa conteúdo: só muda o arranjo.
 *
 * Puro (sem React) para teste.
 */
import type { SectionConfig, SectionType, SiteSection } from '../../types';
import { catalogEntry, isSectionHidden, sectionCatalog } from '../../lib';

export type BlockCategory = 'essencial' | 'apresentar' | 'fotos' | 'agenda' | 'contato' | 'apoio';

export const BLOCK_CATEGORIES: { id: BlockCategory; label: string }[] = [
  { id: 'essencial', label: 'Essencial' },
  { id: 'apresentar', label: 'Apresentar a casa' },
  { id: 'fotos', label: 'Fotos e vídeo' },
  { id: 'agenda', label: 'Giras e rotina' },
  { id: 'contato', label: 'Contato e redes' },
  { id: 'apoio', label: 'Apoio à casa' },
];

export interface Block {
  /** Único na gaveta: `GALLERY:mosaico`, `HERO`… */
  id: string;
  type: SectionType;
  /** Nome do tipo ("Fotos"). */
  label: string;
  /** Nome da variação ("Mosaico"); vazio quando o tipo tem um jeito só. */
  variant: string;
  /** Valor da variação para a miniatura (`mosaico`, `buttons`…). */
  variantId?: string;
  description: string;
  category: BlockCategory;
  /** Config da variação, aplicada por cima da padrão do catálogo. */
  config?: SectionConfig;
  /** Tipo que só pode existir uma vez no site. */
  single: boolean;
  /** Tipo novo desta beta. */
  isNew: boolean;
  /** Palavras extras para a busca. */
  keywords: string;
}

interface VariantDef {
  id: string;
  label: string;
  description: string;
  config: SectionConfig;
  keywords?: string;
}

interface TypeDef {
  type: SectionType;
  category: BlockCategory;
  keywords: string;
  variants?: VariantDef[];
}

/** Ordem da gaveta. Tipos fora do catálogo (beta desligada) somem sozinhos. */
const TYPE_DEFS: TypeDef[] = [
  { type: 'HERO', category: 'essencial', keywords: 'capa topo inicio nome boas-vindas banner logo senha' },
  { type: 'GIRAS_CALENDAR', category: 'essencial', keywords: 'giras agenda calendario datas senha eventos' },
  { type: 'LOCATION', category: 'essencial', keywords: 'endereco mapa localizacao chegar google maps onde fica' },
  {
    type: 'CONTACT',
    category: 'contato',
    keywords: 'contato whatsapp telefone email instagram falar',
    variants: [
      { id: 'cards', label: 'Cartões', description: 'Um cartão para cada canal, lado a lado.', config: { contact_layout: 'cards' } },
      { id: 'buttons', label: 'Botões', description: 'Botões grandes, bons para o celular.', config: { contact_layout: 'buttons' } },
      { id: 'list', label: 'Lista', description: 'Os canais um embaixo do outro, discretos.', config: { contact_layout: 'list' } },
    ],
  },
  { type: 'ABOUT', category: 'apresentar', keywords: 'sobre historia casa linha fundacao foto quem somos' },
  {
    type: 'LINHAS',
    category: 'apresentar',
    keywords: 'linhas trabalho orixas guias entidades caboclos pretos velhos exus',
    variants: [
      { id: 'cartoes', label: 'Cartões', description: 'Cada linha num cartão, com o texto da casa.', config: { layout: 'cartoes' } },
      { id: 'lista', label: 'Lista', description: 'As linhas em lista, uma embaixo da outra.', config: { layout: 'lista' } },
    ],
  },
  { type: 'FAQ', category: 'apresentar', keywords: 'perguntas duvidas primeira vez roupa branca faq respostas' },
  { type: 'CUSTOM_TEXT', category: 'apresentar', keywords: 'texto livre aviso bloco paragrafo recado' },
  {
    type: 'GALLERY',
    category: 'fotos',
    keywords: 'fotos imagens galeria festas album',
    variants: [
      { id: 'grade', label: 'Grade', description: 'Fotos do mesmo tamanho, em fileiras.', config: { layout: 'grade' } },
      { id: 'mosaico', label: 'Mosaico', description: 'Fotos em pé e deitadas, encaixadas.', config: { layout: 'mosaico' } },
      { id: 'faixa', label: 'Faixa', description: 'Uma fileira que se passa para o lado.', config: { layout: 'faixa' }, keywords: 'carrossel' },
    ],
  },
  {
    type: 'VIDEO_EMBED',
    category: 'fotos',
    keywords: 'video youtube canal filme',
    variants: [
      { id: 'video-only', label: 'Só o vídeo', description: 'O vídeo grande, sozinho.', config: { layout: 'video-only' } },
      { id: 'side-by-side', label: 'Vídeo e texto', description: 'O vídeo ao lado de um texto curto.', config: { layout: 'side-by-side' } },
    ],
  },
  { type: 'ROTINA', category: 'agenda', keywords: 'rotina horarios dias fixos semana atendimento desenvolvimento' },
  {
    type: 'SOCIAL',
    category: 'contato',
    keywords: 'redes sociais instagram facebook youtube tiktok whatsapp',
    variants: [
      { id: 'botoes', label: 'Botões', description: 'Botões com o nome de cada rede.', config: { layout: 'botoes' } },
      { id: 'icones', label: 'Ícones', description: 'Só os ícones, em linha.', config: { layout: 'icones' } },
    ],
  },
  { type: 'AJUDAR', category: 'apoio', keywords: 'ajudar doacao pix contribuir necessidades lista' },
  { type: 'SPONSOR', category: 'apoio', keywords: 'apoiadores parceiros agradecimento patrocinio' },
];

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todos os blocos que a casa pode usar (com a beta ligada ou não). */
export function buildBlocks(novoConstrutor: boolean): Block[] {
  const catalog = sectionCatalog(novoConstrutor);
  const out: Block[] = [];
  for (const def of TYPE_DEFS) {
    const entry = catalog.find((e) => e.type === def.type);
    if (!entry) continue;
    const base = {
      type: def.type,
      label: entry.label,
      category: def.category,
      single: Boolean(entry.single),
      isNew: Boolean(entry.beta),
    };
    if (!def.variants?.length) {
      out.push({ ...base, id: def.type, variant: '', description: entry.description, keywords: def.keywords });
      continue;
    }
    for (const v of def.variants) {
      out.push({
        ...base,
        id: `${def.type}:${v.id}`,
        variant: v.label,
        variantId: v.id,
        description: v.description,
        config: v.config,
        keywords: `${def.keywords} ${v.keywords ?? ''} ${entry.description}`,
      });
    }
  }
  return out;
}

/** Busca sem acento e sem caixa no nome, na variação, na descrição e nas palavras extras. */
export function filterBlocks(blocks: Block[], query: string, category: BlockCategory | 'todos' = 'todos'): Block[] {
  const q = norm(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  return blocks.filter((b) => {
    if (category !== 'todos' && b.category !== category) return false;
    if (words.length === 0) return true;
    const hay = norm(`${b.label} ${b.variant} ${b.description} ${b.keywords}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Seção única que já está no site (o bloco leva até ela em vez de duplicar). */
export function existingFor(block: Block, sections: SiteSection[]): SiteSection | undefined {
  return block.single ? sections.find((s) => s.section_type === block.type) : undefined;
}

/**
 * Sugestões para a casa: o que costuma faltar num site de terreiro e ainda não está nele
 * (ou está oculto). No máximo 4, na ordem de importância. Só o primeiro jeito de cada tipo.
 */
const SUGGESTION_ORDER: SectionType[] = ['HERO', 'GIRAS_CALENDAR', 'ABOUT', 'LOCATION', 'CONTACT', 'GALLERY', 'ROTINA', 'FAQ', 'SOCIAL'];

export function suggestedBlocks(blocks: Block[], sections: SiteSection[], max = 4): Block[] {
  const present = new Set(sections.filter((s) => !isSectionHidden(s)).map((s) => s.section_type));
  const out: Block[] = [];
  for (const type of SUGGESTION_ORDER) {
    if (out.length >= max) break;
    if (present.has(type)) continue;
    // Seção única que existe oculta: não sugerir outra.
    if (catalogEntry(type)?.single && sections.some((s) => s.section_type === type)) continue;
    const first = blocks.find((b) => b.type === type);
    if (first) out.push(first);
  }
  return out;
}

// ── Arrastar e soltar ────────────────────────────────────────────────────────

/** Tipo do dado no arrastar (o navegador só deixa ler o tipo durante o `dragover`). */
export const BLOCK_DRAG_MIME = 'application/x-girahub-bloco';

export function encodeBlockDrag(block: Block): string {
  return JSON.stringify({ id: block.id });
}

export function decodeBlockDrag(raw: string, blocks: Block[]): Block | null {
  try {
    const data = JSON.parse(raw) as { id?: unknown };
    return typeof data.id === 'string' ? (blocks.find((b) => b.id === data.id) ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Onde o bloco entra, pela altura do ponteiro: antes da primeira seção cujo meio está abaixo
 * dele. `mids` são os meios (em y de tela) das seções, em ordem.
 */
export function dropIndexFor(pointerY: number, mids: number[]): number {
  let i = 0;
  while (i < mids.length && pointerY > mids[i]) i += 1;
  return i;
}
