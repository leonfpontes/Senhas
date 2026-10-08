/**
 * Regras de uso de cor nas classes (ver globals.css):
 * - texto na cor da marca é `text-brand`, nunca `text-primary` (a primária crua pode não ter
 *   contraste: amarelo no claro, índigo no escuro);
 * - `text-{success,warning,info}-foreground` só em cima do fundo sólido da mesma cor (é branco
 *   no claro e preto no escuro — em fundo suave ou transparente some).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '../../src');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

const lines = files(SRC).flatMap((f) =>
  fs.readFileSync(f, 'utf8').split('\n').map((text, i) => ({ where: `${path.relative(SRC, f)}:${i + 1}`, text })),
);

// O botão "Encerrar" fica dentro da faixa sólida de impersonação (bg-warning no elemento pai).
const FOREGROUND_ALLOW = ['components/admin/layout/ImpersonationBanner.tsx'];

it('ninguém usa text-primary para texto (use text-brand)', () => {
  const offenders = lines.filter((l) => /(?<![\w-])text-primary(?=[/\s'"`]|$)/.test(l.text) && !l.text.trim().startsWith('*'));
  expect(offenders.map((l) => l.where)).toEqual([]);
});

it('text-*-foreground semântico só aparece com o fundo sólido da mesma cor', () => {
  const offenders = lines.filter((l) => {
    const m = l.text.match(/text-(success|warning|info)-foreground/);
    if (!m || FOREGROUND_ALLOW.some((a) => l.where.startsWith(a))) return false;
    return !new RegExp(`(^|[\\s'"\`:])bg-${m[1]}(?![-/\\w])`).test(l.text);
  });
  expect(offenders.map((l) => l.where)).toEqual([]);
});

// A Área do Médium é clara, no tom da landing (out/2026 — o dono achou a faixa café "muito
// escura"): nada de fundo café, texto areia/branco fixo nem variante `dark:` nas telas da Área.
// Faixa de abertura = `components/medium/MediumFaixa`. A câmera do "Cheguei" (vídeo) fica preta.
const AREA = ['pages/medium/', 'components/medium/', 'pages/escolher-area.tsx'];
const AREA_ALLOW = ['components/medium/presenca/ChegueiSheet.tsx'];

it('a Área do Médium não usa fundo café nem texto claro fixo (é clara, como a landing)', () => {
  const offenders = lines.filter((l) => {
    if (!AREA.some((a) => l.where.startsWith(a)) || AREA_ALLOW.some((a) => l.where.startsWith(a))) return false;
    if (l.text.trim().startsWith('*') || l.text.trim().startsWith('//')) return false;
    return /(?<![\w-])(?:bg|from|via|to)-cafe-|(?<![\w-])text-(?:areia-|white(?![\w-]))|(?<![\w-])dark:/.test(l.text);
  });
  expect(offenders.map((l) => l.where)).toEqual([]);
});
