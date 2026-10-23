import BaseDocument, {
  Html,
  Head,
  Main,
  NextScript,
  type DocumentProps,
  type DocumentContext,
} from 'next/document';

type DocumentWithNonce = DocumentProps & { nonce?: string };

export default function Document(props: DocumentWithNonce) {
  // CSP com nonce (pentest L3): o middleware gera o nonce e o passa em x-nonce;
  // aqui ele vai nos scripts do Next (Head/NextScript) e numa meta que o
  // ClarityAnalytics lê para o <Script> inline do Clarity.
  const nonce = props.nonce ?? '';
  // Área do Médium (AM-06, D-23): o MediumLayout linka o próprio manifesto
  // (o da Área, que abre em /medium); o da Porta não pode vir antes dele.
  const page = props.__NEXT_DATA__?.page ?? '';
  const areaDoMedium = page === '/medium' || page.startsWith('/medium/');
  // A Área (e a escolha de área) é clara, com cabeçalho branco: a barra do navegador acompanha
  // (= `theme_color` do manifesto da Área). No resto, o índigo do GiraHub.
  const barraClara = areaDoMedium || page === '/escolher-area';
  return (
    <Html lang="pt-BR">
      <Head nonce={nonce}>
        {/* Nonce da CSP (pentest L3) — lido por componentes client (ClarityAnalytics). */}
        {nonce ? <meta name="x-nonce" content={nonce} /> : null}
        {/* Favicon — PNG/ICO gerados de favicon.svg por scripts/generate-icons.mjs */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <meta name="theme-color" content={barraClara ? '#ffffff' : '#4f46e5'} />
        {/* PWA (P-01): a Porta instalada na tela inicial. Service worker em public/sw.js,
            registrado por components/shared/ServiceWorkerRegistrar (só em produção). */}
        {!areaDoMedium && <link rel="manifest" href="/manifest.webmanifest" />}
        <meta name="application-name" content="GiraHub" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* iOS/iPadOS: Safari ignora boa parte do manifest — ícone, título e barra vêm daqui. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="GiraHub" />
        {/* Fonte da interface: pilha do sistema (--font-sans em globals.css). As fontes do
            site do terreiro são carregadas pela própria página. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </Head>
      <body>
        <Main />
        <NextScript nonce={nonce} />
      </body>
    </Html>
  );
}

// Lê o nonce que o middleware (src/middleware.ts) colocou em x-nonce e o
// repassa como prop para o render aplicar nos scripts/estilos do Next.
Document.getInitialProps = async (ctx: DocumentContext): Promise<DocumentWithNonce> => {
  const initialProps = await BaseDocument.getInitialProps(ctx);
  const header = ctx.req?.headers['x-nonce'];
  const nonce = (Array.isArray(header) ? header[0] : header) ?? '';
  return { ...initialProps, nonce } as DocumentWithNonce;
};
