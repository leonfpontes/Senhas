/**
 * Estilos do site (beta "Novo construtor do site"): paleta + par de fontes aplicados ao
 * site inteiro de uma vez, como os temas do Squarespace. Aplicar um estilo só reescreve
 * cores e fontes na config de cada seção; textos, fotos e ordem ficam como estão, e o
 * desfazer volta o estilo anterior.
 *
 * "Cores da casa" vem primeiro e usa as cores que o terreiro escolheu (branding).
 * O padrão de quem nunca escolheu cor é o GiraHub: verde folha e ouro, títulos em Fraunces.
 */
import type { SiteSection } from './types';
import { heroForeground } from './lib';

export interface SiteStyle {
  id: string;
  label: string;
  description: string;
  heroFrom: string;
  heroTo: string;
  /** Fundo das seções, alternando entre `bg` e `bgAlt`. */
  bg: string;
  bgAlt: string;
  titleFont: string;
  bodyFont: string;
}

const FRAUNCES = "'Fraunces', serif";
const INTER = "'Inter', sans-serif";

export const SITE_STYLES: SiteStyle[] = [
  {
    id: 'terra',
    label: 'Terra',
    description: 'Café, areia e ouro, com títulos em Fraunces. O jeito GiraHub.',
    heroFrom: '#26170F',
    heroTo: '#86391A',
    bg: '#FCF8F2',
    bgAlt: '#F7EEE1',
    titleFont: FRAUNCES,
    bodyFont: INTER,
  },
  {
    id: 'mata',
    label: 'Mata',
    description: 'Verdes de folha, fundo branco e títulos clássicos.',
    heroFrom: '#24543D',
    heroTo: '#2E6A4E',
    bg: '#FFFFFF',
    bgAlt: '#F1F6F2',
    titleFont: "'Lora', serif",
    bodyFont: "'Nunito', sans-serif",
  },
  {
    id: 'clara',
    label: 'Clara',
    description: 'Fundo claro, pouco enfeite, letra elegante.',
    heroFrom: '#F7EEE1',
    heroTo: '#EEDFC8',
    bg: '#FFFFFF',
    bgAlt: '#FAFAF7',
    titleFont: "'Playfair Display', serif",
    bodyFont: INTER,
  },
  {
    id: 'noite',
    label: 'Noite',
    description: 'Azul da noite com detalhes claros, letra moderna.',
    heroFrom: '#0F172A',
    heroTo: '#334155',
    bg: '#FFFFFF',
    bgAlt: '#F1F5F9',
    titleFont: "'Montserrat', sans-serif",
    bodyFont: INTER,
  },
];

/** "Cores da casa": gradiente com as duas cores do branding, fundos neutros e Fraunces. */
export function houseStyle(primary: string, secondary: string): SiteStyle {
  return {
    id: 'casa',
    label: 'Cores da casa',
    description: 'As cores que a casa escolheu no GiraHub.',
    heroFrom: primary,
    heroTo: secondary,
    bg: '#FFFFFF',
    bgAlt: '#FAF7F2',
    titleFont: FRAUNCES,
    bodyFont: INTER,
  };
}

/** Estilo aplicado por último (guardado na capa); `null` se a casa mexeu à mão. */
export function activeStyleId(sections: SiteSection[]): string | null {
  const hero = sections.find((s) => s.section_type === 'HERO');
  return hero && typeof hero.config.site_style === 'string' ? hero.config.site_style : null;
}

/** Seções com o estilo aplicado. Não muda textos, fotos, ordem nem seções ocultas. */
export function applySiteStyle(sections: SiteSection[], style: SiteStyle): SiteSection[] {
  let n = 0;
  return sections.map((s) => {
    if (s.section_type === 'HERO') {
      const keepImage = String(s.config.bg_type || '') === 'image' && Boolean(s.config.bg_image_url);
      const config = {
        ...s.config,
        ...(keepImage ? {} : { bg_type: 'gradient', gradient_from: style.heroFrom, gradient_to: style.heroTo, gradient_dir: '135deg' }),
        font_family: style.titleFont,
        site_style: style.id,
      };
      return { ...s, config: { ...config, font_color: heroForeground({ ...config, font_color: undefined }) } };
    }
    const bg = n % 2 === 0 ? style.bg : style.bgAlt;
    n += 1;
    const { font_color: _fc, ...rest } = s.config;
    return { ...s, config: { ...rest, bg_color: bg, bg_opacity: 100, font_family: style.bodyFont, title_font_family: style.titleFont } };
  });
}

// ── Ajuste fino (painel Estilo do estúdio) ─────────────────────────────────────

/** Fontes de título e de texto atuais do site (lidas da capa e da primeira seção comum). */
export function siteFonts(sections: SiteSection[]): { title: string; body: string } {
  const hero = sections.find((s) => s.section_type === 'HERO');
  const other = sections.find((s) => s.section_type !== 'HERO');
  const title = String(hero?.config.font_family || other?.config.title_font_family || 'system-ui, sans-serif');
  const body = String(other?.config.font_family || 'system-ui, sans-serif');
  return { title, body };
}

/** Troca as fontes do site todo. Deixa de valer o "estilo pronto" (vira personalizado). */
export function setSiteFonts(sections: SiteSection[], fonts: { title?: string; body?: string }): SiteSection[] {
  return sections.map((s) => {
    const { site_style: _st, ...config } = s.config;
    if (s.section_type === 'HERO') return { ...s, config: fonts.title ? { ...config, font_family: fonts.title } : config };
    return {
      ...s,
      config: {
        ...config,
        ...(fonts.title ? { title_font_family: fonts.title } : {}),
        ...(fonts.body ? { font_family: fonts.body } : {}),
      },
    };
  });
}

/**
 * Troca a cor principal do site: fundo da capa (início do gradiente ou cor sólida), botões e
 * destaque do calendário. Capa com foto guarda a cor só para os botões. A cor do texto da capa é
 * recalculada para manter o contraste.
 */
export function setSiteColor(sections: SiteSection[], color: string): SiteSection[] {
  return sections.map((s) => {
    const { site_style: _st, ...config } = s.config;
    if (s.section_type === 'HERO') {
      const solid = String(config.bg_type || 'gradient') === 'solid';
      const next = solid ? { ...config, bg_color: color, gradient_from: color } : { ...config, gradient_from: color };
      return { ...s, config: { ...next, font_color: heroForeground({ ...next, font_color: undefined }) } };
    }
    if (s.section_type === 'GIRAS_CALENDAR') return { ...s, config: { ...config, calendar_highlight_color: color } };
    return s;
  });
}
