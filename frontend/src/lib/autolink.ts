/**
 * autolink — quebra um texto simples em pedaços de texto e de link (Avisos da casa, AM-09).
 *
 * O aviso é texto simples: nada aqui vira HTML. Quem renderiza (`AvisoTexto`) põe cada pedaço
 * como nó de texto do React (escapado) e só os links como `<a>`. Só vira link o que começa com
 * `http://`, `https://` ou `www.` — `javascript:`, `data:` e afins continuam texto. Pontuação
 * no fim ("veja https://x.com.br.") fica fora do link.
 */
export type TextoPedaco = { tipo: 'texto'; texto: string } | { tipo: 'link'; texto: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const PONTUACAO_FINAL = /[.,;:!?)\]}'"»”]+$/;

/** Endereço seguro para o `href` (só http/https), ou null. */
export function hrefSeguro(bruto: string): string | null {
  const candidato = /^www\./i.test(bruto) ? `https://${bruto}` : bruto;
  try {
    const url = new URL(candidato);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function autolink(texto: string): TextoPedaco[] {
  const out: TextoPedaco[] = [];
  let ultimo = 0;
  const pushTexto = (t: string) => {
    if (!t) return;
    const anterior = out[out.length - 1];
    if (anterior?.tipo === 'texto') anterior.texto += t;
    else out.push({ tipo: 'texto', texto: t });
  };
  for (const m of texto.matchAll(URL_RE)) {
    const inicio = m.index ?? 0;
    let bruto = m[0];
    const sobra = bruto.match(PONTUACAO_FINAL)?.[0] ?? '';
    // Mantém o ")" quando o link tem "(" (ex.: wikipedia).
    if (sobra && !(sobra.startsWith(')') && bruto.includes('('))) bruto = bruto.slice(0, -sobra.length);
    const href = hrefSeguro(bruto);
    pushTexto(texto.slice(ultimo, inicio));
    if (href) out.push({ tipo: 'link', texto: bruto, href });
    else pushTexto(bruto);
    ultimo = inicio + bruto.length;
  }
  pushTexto(texto.slice(ultimo));
  return out;
}
