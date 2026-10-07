/**
 * Serifa Fraunces dos títulos de marketing (`font-display`), carregada uma vez via next/font e
 * usada pelo MarketingShell (landing, /planos) e pelo AuthShell (telas de conta). A classe
 * `fraunces.variable` define `--font-fraunces` no elemento — por isso o token `--font-display`
 * está no `@theme inline` de globals.css.
 */
import { Fraunces } from 'next/font/google';

export const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

/* Links, listas e títulos fora de componentes do kit ficam com o estilo do navegador (o reset de
   globals.css só vale dentro de [data-slot]); este reset tem especificidade 0,0,1 e perde para qualquer classe. */
export const MARKETING_RESET =
  '[:where(&)_a]:[color:inherit] [:where(&)_a]:[text-decoration:inherit] [:where(&)_:is(ul,ol)]:[list-style:none] [:where(&)_:is(ul,ol)]:[padding:0] [:where(&)_:is(ul,ol,h1,h2,h3,h4,p,figure,blockquote)]:[margin:0]';
