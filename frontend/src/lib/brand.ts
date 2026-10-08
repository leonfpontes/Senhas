/**
 * Cores do terreiro → tokens CSS do shadcn/Tailwind.
 *
 * O tema MUI recebe as cores do tenant via createTheme; aqui as mesmas cores viram
 * variáveis CSS em <html> (`--primary`, `--secondary`, ...) para que `bg-primary`,
 * `text-primary-foreground` etc. mostrem a marca do terreiro nos componentes shadcn.
 * Para texto na cor da marca use `text-brand`, nunca `text-primary`: a primária crua pode
 * não ter contraste com o fundo (amarelo no claro, índigo no escuro).
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

const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

/** Superfícies de cada modo (globals.css: --card e --background). */
const SURFACES = {
  light: ['#ffffff', '#f8fafc'],
  dark: ['#1e293b', '#0f172a'],
} as const;

/**
 * Cor da marca para TEXTO num modo: escurece (claro) ou clareia (escuro) a primária em passos
 * de 5% até ler com contraste AA no fundo do modo e também no fundo suave da própria marca
 * (`bg-primary/15`). Primária amarela no claro ou índigo escuro no escuro somem sem isso.
 */
export function brandTextColor(primary: string, mode: 'light' | 'dark'): string {
  const surfaces = SURFACES[mode];
  return brandTextColorOn(primary, mode, surfaces, [surfaces[0]]);
}

/**
 * Mesma busca de `brandTextColor` para um conjunto qualquer de superfícies (`surfaces`) e de
 * bases do fundo suave da marca (`softBases`, onde a marca entra a 15%). Usada pela Área do
 * Médium, cujas superfícies são as da paleta terra (areia no claro, café no escuro).
 */
export function brandTextColorOn(
  primary: string,
  mode: 'light' | 'dark',
  surfaces: readonly string[],
  softBases: readonly string[] = surfaces,
): string {
  const rgb = parseColor(primary);
  if (!rgb) return mode === 'light' ? '#4f46e5' : '#a5b4fc';
  const target: Rgb = mode === 'light' ? [0, 0, 0] : [255, 255, 255];
  const softs = softBases.map((base) => toHex(mixRgb(parseColor(base) as Rgb, rgb, 0.15)));
  for (let step = 0; step <= 20; step += 1) {
    const candidate = toHex(mixRgb(rgb, target, step * 0.05));
    // Margem no fundo suave: o Tailwind mistura `bg-primary/15` em oklab, que dá um tom um
    // pouco diferente da mistura em sRGB calculada aqui (medido: 4,44 onde a conta dava 5,0).
    if (
      surfaces.every((bg) => contrastRatio(candidate, bg) >= WCAG_AA_CONTRAST) &&
      softs.every((soft) => contrastRatio(candidate, soft) >= 5.2)
    ) {
      return candidate;
    }
  }
  return toHex(target);
}

/**
 * Superfícies da Área do Médium (paleta terra, `.medium-terra` em globals.css — sempre clara
 * desde out/2026): cartão branco, fundo areia-50 e caixa/faixa de abertura areia-100.
 * Espelhadas em __tests__/styles/marketingContrast.test.ts.
 */
export const TERRA_SURFACES = {
  light: ['#ffffff', '#fcf8f2', '#f7eee1'],
} as const;

/**
 * Cor do terreiro para texto na Área do Médium: escreve `--terra-brand-text-light` (lida por
 * `.medium-terra` em `--primary-text`, ou seja, `text-brand`). As cores de fundo da marca
 * (`--primary`, `--primary-foreground`) continuam vindo do `applyBrand`.
 */
export function applyTerraBrandText(root: HTMLElement, primary: string): void {
  root.style.setProperty('--terra-brand-text-light', brandTextColorOn(primary, 'light', TERRA_SURFACES.light));
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
  // `text-brand` (globals.css: --primary-text) escolhe uma das duas conforme o modo.
  root.style.setProperty('--brand-text-light', brandTextColor(colors.primary, 'light'));
  root.style.setProperty('--brand-text-dark', brandTextColor(colors.primary, 'dark'));
}
