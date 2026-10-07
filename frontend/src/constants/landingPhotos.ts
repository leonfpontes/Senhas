/**
 * Fotos das páginas de marketing (V-08). Origem: Pexels (licença gratuita para uso comercial,
 * https://www.pexels.com/pt-br/licenca/), baixadas com autorização do dono em 2026-10-06,
 * convertidas para WebP em /public/landing/fotos. Créditos exibidos no rodapé.
 * Regra (pedido do dono): a foto precisa mostrar o que o texto ao lado diz. Para funcionalidade do
 * sistema, use a tela real (constants/landingScreens.ts), não foto ilustrativa.
 *
 * Quando os terreiros clientes autorizarem fotos próprias (V-01, docs/marketing/kit-depoimentos.md),
 * troque `src` aqui — o resto do site acompanha.
 */
export interface LandingPhoto {
  src: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  sourceUrl: string;
}

const pexels = (id: number) => `https://www.pexels.com/pt-br/foto/${id}/`;

export const PHOTOS = {
  giraVelas: {
    src: '/landing/fotos/gira-velas.webp',
    alt: 'Médiuns vestidos de branco segurando velas acesas durante uma gira',
    width: 1920,
    height: 1280,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150418),
  },
  maeDeSantoVela: {
    src: '/landing/fotos/mae-de-santo-vela.webp',
    alt: 'Filha de santo de branco, com torço e guias, recebendo a vela na gira',
    width: 1400,
    height: 2100,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150439),
  },
  corrente: {
    src: '/landing/fotos/corrente.webp',
    alt: 'Três integrantes da corrente vestidos de branco, sorrindo, sentados no quintal do terreiro',
    width: 1600,
    height: 1067,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150460),
  },
  conga: {
    src: '/landing/fotos/conga.webp',
    alt: 'Congá com imagens de santos, caboclos e pretos velhos',
    width: 1400,
    height: 933,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150444),
  },
  assistencia: {
    src: '/landing/fotos/assistencia.webp',
    alt: 'Pessoas de pé acompanhando a gira no salão',
    width: 1600,
    height: 1347,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150443),
  },
  consulenteCelular: {
    src: '/landing/fotos/consulente-celular.webp',
    alt: 'Mulher sorrindo enquanto usa o celular',
    width: 1200,
    height: 1800,
    credit: 'Gustavo Fring',
    sourceUrl: pexels(7155740),
  },
  velasEstoque: {
    src: '/landing/fotos/velas-estoque.webp',
    alt: 'Cesto com maços de velas coloridas guardadas para uso',
    width: 1200,
    height: 800,
    credit: 'Mico Medel',
    sourceUrl: pexels(36857528),
  },
} satisfies Record<string, LandingPhoto>;

export type PhotoKey = keyof typeof PHOTOS;

/** Fotógrafos (sem repetição) para o crédito do rodapé. */
export const PHOTO_CREDITS = Array.from(new Set(Object.values(PHOTOS).map((p) => p.credit)));
