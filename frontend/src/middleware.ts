/**
 * CSP com nonce por requisição (pentest L3 — endurecimento).
 *
 * Antes a CSP vinha do nginx com `script-src 'unsafe-inline'`, o que enfraquece
 * a CSP contra XSS. Aqui o Next passa a ser dono do header: cada resposta HTML
 * ganha um `nonce` único, e o `script-src` troca `'unsafe-inline'` por
 * `'nonce-<n>'`. O `_document` aplica o nonce nos scripts do Next e o
 * `ClarityAnalytics` no `<Script>` inline do Clarity (ambos leem o nonce do
 * header `x-nonce` / da meta tag). gtag/Pixel são injetados por script com
 * `src` externo (já no allowlist de hosts), então não precisam de nonce.
 *
 * ⚠️ VALIDAR EM STAGING antes de mergear (não dá para validar no stack local,
 * que não tem nginx): abrir as telas e conferir ZERO violação de CSP no console
 * e que GA/Clarity/Pixel ainda disparam. Ver o PR para o checklist completo.
 *
 * style-src mantém 'unsafe-inline' de propósito: Next/Tailwind injetam estilos
 * inline (styled-jsx, CSS-in-JS do SSR) e cobri-los com nonce/hash é escopo à
 * parte e de risco maior — o achado do pentest era sobre script-src.
 */
import { NextRequest, NextResponse } from 'next/server';

function gerarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function middleware(request: NextRequest) {
  const nonce = gerarNonce();
  // Host da requisição para o wss do mesmo domínio (antes fixo em girahub.com.br).
  const host = request.headers.get('host') ?? request.nextUrl.host;

  const csp = [
    `default-src 'self'`,
    // 'unsafe-inline' removido: só scripts com o nonce desta resposta ou dos hosts abaixo.
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://cdnjs.cloudflare.com https://www.clarity.ms https://scripts.clarity.ms https://www.googleadservices.com https://googleads.g.doubleclick.net https://connect.facebook.net`,
    // style-src mantém unsafe-inline (Next/Tailwind SSR) — fora do escopo deste endurecimento.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' wss://${host} https://*.sentry.io https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://*.clarity.ms https://www.facebook.com https://connect.facebook.net https://nominatim.openstreetmap.org https://viacep.com.br`,
    `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.openstreetmap.org https://td.doubleclick.net https://www.googletagmanager.com`,
    `frame-ancestors 'none'`,
  ].join('; ');

  // Repassa o nonce para o render (o _document lê de x-nonce).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Só documentos HTML: exclui estáticos (_next/static, _next/image, favicon),
  // o proxy de API e qualquer caminho com extensão de arquivo.
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
    },
  ],
};
