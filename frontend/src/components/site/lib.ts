/**
 * Helpers compartilhados entre o site público (`/[tenantSlug]`), a prévia do
 * editor e os editores de seção (`/admin/meu-site`).
 *
 * Tudo aqui é puro (sem React) para poder rodar no SSR e nos testes.
 */
import { contrastRatio, parseColor, pickForeground } from '@/lib/brand';
import { HERO_FONTS } from '@/constants/heroFonts';
import type { SectionConfig, SectionType, SiteGira, SiteSection } from './types';

export const SP_TIMEZONE = 'America/Sao_Paulo';

// ── Datas ─────────────────────────────────────────────────────────────────────

/** `{ year, month (0-based), day }` do ISO em America/Sao_Paulo (SSR em UTC e navegador). */
export function parseSPDate(iso: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

/** "sexta-feira, 10 de outubro, 20:00" */
export function formatGiraDateLong(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SP_TIMEZONE,
  });
}

/** "sex., 10 de out., 20:00" */
export function formatGiraDateShort(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SP_TIMEZONE,
  });
}

/** "qui 12h" / "qui 12h30" — texto curto da janela de senhas. */
export function formatReleaseMoment(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d
    .toLocaleString('pt-BR', { weekday: 'short', timeZone: SP_TIMEZONE })
    .replace('.', '')
    .toLowerCase();
  const hour = d.toLocaleString('pt-BR', { hour: 'numeric', hour12: false, timeZone: SP_TIMEZONE }).replace(/^0/, '');
  const minute = d.toLocaleString('pt-BR', { minute: '2-digit', timeZone: SP_TIMEZONE }).padStart(2, '0');
  return `${weekday} ${hour}h${minute === '00' ? '' : minute}`;
}

/**
 * Texto da janela de senhas de uma gira, quando o backend expõe
 * `release_start_at`: "Senhas abrem qui 12h" antes da abertura, "Senhas abertas"
 * durante a janela e `null` quando não há janela ou ela já fechou.
 */
export function releaseWindowLabel(gira: SiteGira, now: Date = new Date()): string | null {
  if (!gira.release_start_at) return null;
  const start = new Date(gira.release_start_at);
  if (Number.isNaN(start.getTime())) return null;
  if (start.getTime() > now.getTime()) return `Senhas abrem ${formatReleaseMoment(gira.release_start_at)}`;
  if (gira.release_end_at) {
    const end = new Date(gira.release_end_at);
    if (!Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) return null;
  }
  return 'Senhas abertas';
}

/** Próxima gira (menor `data_hora` futura, ou a primeira se não houver data). */
export function nextGira(giras: SiteGira[]): SiteGira | null {
  const sorted = sortGiras(giras);
  return sorted[0] ?? null;
}

export function sortGiras(giras: SiteGira[]): SiteGira[] {
  return [...giras].sort((a, b) => {
    const ta = a.data_hora ? new Date(a.data_hora).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.data_hora ? new Date(b.data_hora).getTime() : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

// ── Cores ─────────────────────────────────────────────────────────────────────

/** `#rrggbb`/`#rgb` + opacidade (0–100) → `rgba()`. Cor não reconhecida volta como está. */
export function hexToRgba(hex: string, opacity: number): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const alpha = Math.min(100, Math.max(0, Number.isFinite(opacity) ? opacity : 100)) / 100;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Fundo da seção (cor + transparência) a partir da config. */
export function sectionBackground(config: SectionConfig, defaultBg: string): string {
  const bg = String(config.bg_color || defaultBg);
  const opacity = Number(config.bg_opacity ?? 100);
  return hexToRgba(parseColor(bg) ? bg : defaultBg, opacity);
}

/**
 * Cor de texto garantida sobre a cor de fundo de uma seção: usa a cor configurada se
 * contrastar (AA), senão preto/branco. Fundo muito transparente assume a página clara.
 */
export function sectionForeground(config: SectionConfig, defaultBg: string, defaultFg = '#111111'): string {
  const preferred = String(config.font_color || defaultFg);
  const opacity = Number(config.bg_opacity ?? 100);
  const bg = String(config.bg_color || defaultBg);
  // Página pública é clara (#ffffff) — com o fundo quase transparente, mede contra ela.
  const effectiveBg = opacity < 40 ? '#ffffff' : parseColor(bg) ? bg : defaultBg;
  return pickForeground(effectiveBg, preferred);
}

export interface HeroBackground {
  /** Valor CSS de `background`. */
  background: string;
  /** Cor "de marca" dominante — usada no CTA e na barra inferior. */
  brandColor: string;
  bgType: 'gradient' | 'solid' | 'image';
}

export function heroBackground(config: SectionConfig): HeroBackground {
  const bgType = String(config.bg_type || 'gradient');
  const bgUrl = config.bg_image_url ? String(config.bg_image_url) : '';
  const solid = String(config.bg_color || '#6366f1');
  const from = String(config.gradient_from || '#6366f1');
  const to = String(config.gradient_to || '#ec4899');
  const dir = String(config.gradient_dir || '135deg');

  if (bgType === 'image' && bgUrl) {
    const x = Number(config.bg_position_x ?? 50);
    const y = Number(config.bg_position_y ?? 50);
    return {
      bgType: 'image',
      background: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${bgUrl}) ${x}% ${y}% / cover no-repeat`,
      brandColor: parseColor(from) ? from : '#6366f1',
    };
  }
  if (bgType === 'solid') {
    return { bgType: 'solid', background: solid, brandColor: parseColor(solid) ? solid : '#6366f1' };
  }
  return {
    bgType: 'gradient',
    background:
      dir === 'radial'
        ? `radial-gradient(circle, ${from} 0%, ${to} 100%)`
        : `linear-gradient(${dir}, ${from} 0%, ${to} 100%)`,
    brandColor: parseColor(from) ? from : '#6366f1',
  };
}

/**
 * Cor de texto do Hero por contraste: a configurada se contrastar com as cores do
 * fundo; senão preto ou branco, o que contrastar melhor com a pior delas.
 * Imagem tem véu escuro de 45%, então o texto configurado (padrão branco) vale.
 */
export function heroForeground(config: SectionConfig): string {
  const preferred = String(config.font_color || '#ffffff');
  const bgType = String(config.bg_type || 'gradient');
  if (bgType === 'image' && config.bg_image_url) {
    return contrastRatio('#333333', preferred) >= 3 ? preferred : '#ffffff';
  }
  const stops =
    bgType === 'solid'
      ? [String(config.bg_color || '#6366f1')]
      : [String(config.gradient_from || '#6366f1'), String(config.gradient_to || '#ec4899')];
  const valid = stops.filter((s) => parseColor(s));
  if (valid.length === 0) return preferred;
  const minContrast = (fg: string) => Math.min(...valid.map((bg) => contrastRatio(bg, fg)));
  if (minContrast(preferred) >= 4.5) return preferred;
  return minContrast('#000000') >= minContrast('#ffffff') ? '#000000' : '#ffffff';
}

/** Cor de marca do site: a do Hero (primeira seção HERO) ou o índigo padrão. */
export function siteBrandColor(sections: SiteSection[]): string {
  const hero = sections.find((s) => s.section_type === 'HERO');
  return hero ? heroBackground(hero.config).brandColor : '#4f46e5';
}

// ── Fontes / layout ───────────────────────────────────────────────────────────

export function fontImportUrl(fontFamily: string | undefined): string | null {
  if (!fontFamily) return null;
  return HERO_FONTS.find((f) => f.value === fontFamily)?.importUrl ?? null;
}

export type MarginPreset = 'wide' | 'medium' | 'contained';

export function marginPreset(config: SectionConfig): MarginPreset {
  const v = String(config.margin_preset || 'contained');
  return v === 'wide' || v === 'medium' ? v : 'contained';
}

/**
 * Container de cada seção por "margem lateral". Usa container queries (`@min-[…]`)
 * em vez de `md:` para que a mesma seção responda ao tamanho do quadro da prévia,
 * não ao da janela.
 */
export const MARGIN_CONTAINER_CLASS: Record<MarginPreset, string> = {
  wide: 'w-full px-[15px] @min-[900px]:px-[30px]',
  medium: 'mx-auto w-full max-w-[1200px] px-[15px] @min-[900px]:px-[30px]',
  contained: 'mx-auto w-full max-w-[900px] px-4 @min-[900px]:px-6',
};

// ── Links ─────────────────────────────────────────────────────────────────────

/** Link único de senha do terreiro (resolve a próxima gira). */
export function senhaUrl(slug: string): string {
  return `/public/${encodeURIComponent(slug)}/senha`;
}

export function giraTicketUrl(giraId: string, tipo?: 'associado'): string {
  return `/public/gira/${encodeURIComponent(giraId)}${tipo ? `?tipo=${tipo}` : ''}`;
}

/** Número BR para wa.me: 10–11 dígitos ganham o 55. */
export function toBrWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** URL de watch/short/embed do YouTube → embed `youtube-nocookie`. */
export function toYoutubeEmbedUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  const videoId = watchMatch?.[1] || shortMatch?.[1];
  if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
  if (url.includes('youtube.com/embed/')) return url.replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');
  if (url.includes('youtube-nocookie.com/embed/')) return url;
  return null;
}

// ── Seções ────────────────────────────────────────────────────────────────────

/** Seção desligada no editor (convenção do frontend em `config.hidden`). */
export function isSectionHidden(section: SiteSection): boolean {
  return section.config?.hidden === true;
}

export function visibleSections(sections: SiteSection[]): SiteSection[] {
  return [...sections].filter((s) => !isSectionHidden(s)).sort((a, b) => a.order_index - b.order_index);
}

const YOUTUBE_PREFIXES = [
  'https://www.youtube.com/embed/',
  'https://www.youtube-nocookie.com/embed/',
  'https://youtu.be/',
  'https://www.youtube.com/watch',
];

/** Mesmas regras de `_validate_section` do backend. */
export function validateSection(section: Pick<SiteSection, 'section_type' | 'config'>): string[] {
  const errors: string[] = [];
  const { section_type, config } = section;
  if (section_type === 'HERO' && !String(config.title || '').trim()) {
    errors.push('A capa precisa de um título.');
  }
  if (section_type === 'VIDEO_EMBED') {
    const url = String(config.youtube_url || '');
    if (url && !YOUTUBE_PREFIXES.some((p) => url.startsWith(p))) {
      errors.push('URL do YouTube inválida. Use o link de compartilhamento ou o embed do YouTube.');
    }
  }
  return errors;
}

export interface SectionCatalogEntry {
  type: SectionType;
  label: string;
  /** Uma frase para a galeria. */
  description: string;
  defaultConfig: SectionConfig;
  /** Só faz sentido uma por site. */
  single?: boolean;
}

export const SECTION_CATALOG: SectionCatalogEntry[] = [
  {
    type: 'HERO',
    label: 'Capa',
    description: 'Nome do terreiro, frase de boas-vindas e o botão "Retirar senha".',
    defaultConfig: { title: '', subtitle: '' },
    single: true,
  },
  {
    type: 'ABOUT',
    label: 'Sobre o terreiro',
    description: 'História, linha de trabalho e uma foto.',
    defaultConfig: { title: 'Sobre o terreiro', body: '' },
  },
  {
    type: 'GIRAS_CALENDAR',
    label: 'Próximas giras',
    description: 'Calendário no computador, lista no celular, com link para a senha.',
    defaultConfig: { title: 'Próximas giras', display_mode: 'calendar' },
    single: true,
  },
  {
    type: 'LOCATION',
    label: 'Como chegar',
    description: 'Endereço com mapa e botão para o Google Maps.',
    defaultConfig: { title: 'Como chegar' },
    single: true,
  },
  {
    type: 'CONTACT',
    label: 'Contato',
    description: 'WhatsApp, e-mail e Instagram.',
    defaultConfig: { title: 'Contato', contact_layout: 'cards' },
    single: true,
  },
  {
    type: 'VIDEO_EMBED',
    label: 'Vídeo do YouTube',
    description: 'Um vídeo do canal, sozinho ou ao lado de um texto.',
    defaultConfig: { youtube_url: '', layout: 'video-only' },
  },
  {
    type: 'SPONSOR',
    label: 'Apoiadores',
    description: 'Agradecimento a quem apoia o terreiro.',
    defaultConfig: { title: 'Apoiadores', intro: '' },
  },
  {
    type: 'CUSTOM_TEXT',
    label: 'Texto livre',
    description: 'Um bloco de título e texto para o que você quiser.',
    defaultConfig: { title: '', body: '' },
  },
];

export function sectionLabel(type: string): string {
  return SECTION_CATALOG.find((e) => e.type === type)?.label ?? type;
}

export function catalogEntry(type: string): SectionCatalogEntry | undefined {
  return SECTION_CATALOG.find((e) => e.type === type);
}

// ── Paletas prontas do Hero ───────────────────────────────────────────────────

export interface HeroPalette {
  id: string;
  label: string;
  from: string;
  to: string;
}

export const HERO_PALETTES: HeroPalette[] = [
  { id: 'indigo-rosa', label: 'Índigo e rosa', from: '#6366f1', to: '#ec4899' },
  { id: 'noite', label: 'Noite', from: '#0f172a', to: '#334155' },
  { id: 'mata', label: 'Mata', from: '#14532d', to: '#16a34a' },
  { id: 'por-do-sol', label: 'Pôr do sol', from: '#f97316', to: '#db2777' },
  { id: 'mar', label: 'Mar', from: '#0ea5e9', to: '#1e3a8a' },
  { id: 'terra', label: 'Terra', from: '#78350f', to: '#b45309' },
];

/** Config do Hero com a paleta aplicada (gradiente + cor de texto por contraste). */
export function applyHeroPalette(config: SectionConfig, palette: HeroPalette): SectionConfig {
  const next: SectionConfig = {
    ...config,
    bg_type: 'gradient',
    gradient_from: palette.from,
    gradient_to: palette.to,
    gradient_dir: String(config.gradient_dir || '135deg') === 'radial' ? 'radial' : String(config.gradient_dir || '135deg'),
  };
  next.font_color = heroForeground({ ...next, font_color: undefined });
  return next;
}

export function activeHeroPalette(config: SectionConfig): HeroPalette | null {
  if (String(config.bg_type || 'gradient') !== 'gradient') return null;
  const from = String(config.gradient_from || '#6366f1').toLowerCase();
  const to = String(config.gradient_to || '#ec4899').toLowerCase();
  return HERO_PALETTES.find((p) => p.from === from && p.to === to) ?? null;
}

// ── Prévia ────────────────────────────────────────────────────────────────────

function daysFromNow(days: number, hour = 20): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** Giras de exemplo para a prévia quando o terreiro ainda não tem giras futuras. */
export function sampleGiras(): SiteGira[] {
  return [
    {
      id: 'exemplo-1',
      nome: 'Gira de Caboclos',
      data_hora: daysFromNow(3),
      descricao: 'Aberta ao público. Traga uma vela branca.',
      has_tickets: true,
      has_sponsor_tickets: false,
      release_start_at: daysFromNow(1, 12),
      _sample: true,
    },
    {
      id: 'exemplo-2',
      nome: 'Gira de Pretos-Velhos',
      data_hora: daysFromNow(10),
      descricao: null,
      has_tickets: true,
      has_sponsor_tickets: true,
      _sample: true,
    },
    {
      id: 'exemplo-3',
      nome: 'Desenvolvimento mediúnico',
      data_hora: daysFromNow(17),
      descricao: 'Somente médiuns da casa.',
      has_tickets: false,
      has_sponsor_tickets: false,
      _sample: true,
    },
  ];
}
