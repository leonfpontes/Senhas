/**
 * Cores do terreiro → tokens CSS do shadcn/Tailwind.
 *
 * O tema MUI recebe as cores do tenant via createTheme; aqui as mesmas cores viram
 * variáveis CSS em <html> (`--primary`, `--secondary`, ...) para que `bg-primary`,
 * `text-primary-foreground` etc. mostrem a marca do terreiro nos componentes shadcn.
 * Chamado pelo TenantAwareThemeProvider sempre que as cores do tenant mudam.
 */

export interface BrandColors {
  /** Cor primária do terreiro (`primary_color`). */
  primary: string;
  /** Cor secundária do terreiro (`secondary_color`). */
  secondary: string;
  /** Cor de texto configurada para a primária (`font_color`). */
  font: string;
}

/** Contraste mínimo WCAG 2.x AA para texto normal. */
export const WCAG_AA_CONTRAST = 4.5;

type Rgb = [number, number, number];

/**
 * Converte `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` em [r, g, b] (0–255).
 * Retorna null para valores que não reconhece (nomes de cor, hsl, vazio).
 */
export function parseColor(input: string): Rgb | null {
  const value = (input || '').trim();
  if (!value) return null;

  const hex = value.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as Rgb;
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
    }
    return null;
  }

  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n))) as Rgb;
  }

  return null;
}

/** Luminância relativa (WCAG 2.x), 0 = preto, 1 = branco. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Razão de contraste WCAG entre duas cores (1 a 21).
 * Cor não reconhecida conta como contraste zero — faz o chamador cair no fallback.
 */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 0;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Cor de texto para um fundo: usa `preferred` se contrastar ≥ 4,5 com `background`;
 * senão, `#000000` ou `#ffffff`, o que contrastar mais.
 */
export function pickForeground(background: string, preferred?: string): string {
  // Fundo não reconhecido: não dá para medir contraste — branco, como o MUI faz por padrão.
  if (!parseColor(background)) return '#ffffff';
  if (preferred && contrastRatio(background, preferred) >= WCAG_AA_CONTRAST) {
    return preferred;
  }
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff';
}

/**
 * Escreve as cores do terreiro como variáveis CSS em `root` (normalmente
 * `document.documentElement`). Só toca nos tokens de marca — os estruturais
 * (fundo, borda, texto) continuam vindo de globals.css e do modo escuro.
 */
export function applyBrand(root: HTMLElement, colors: BrandColors): void {
  const primaryForeground = pickForeground(colors.primary, colors.font);
  // A secundária não tem cor de fonte configurada: aplica a mesma regra sem preferência.
  const secondaryForeground = pickForeground(colors.secondary);

  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-foreground', primaryForeground);
  root.style.setProperty('--secondary', colors.secondary);
  root.style.setProperty('--secondary-foreground', secondaryForeground);
  root.style.setProperty('--ring', colors.primary);
  root.style.setProperty('--sidebar-primary', colors.primary);
  root.style.setProperty('--sidebar-primary-foreground', primaryForeground);
}
