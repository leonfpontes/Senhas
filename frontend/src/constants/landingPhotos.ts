/**
 * Fotos das páginas de marketing (V-08). Origem: Pexels (licença gratuita para uso comercial,
 * https://www.pexels.com/pt-br/licenca/), baixadas com autorização do dono em 2026-10-06,
 * convertidas para WebP em /public/landing/fotos. Créditos exibidos no rodapé.
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
  congaPretoVelho: {
    src: '/landing/fotos/conga-preto-velho.webp',
    alt: 'Imagens de pretos velhos e caboclos no congá, com cestos de palha na parede',
    width: 1400,
    height: 933,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150445),
  },
  altarIemanja: {
    src: '/landing/fotos/altar-iemanja.webp',
    alt: 'Altar com imagem de Iemanjá e santos sobre parede amarela',
    width: 1400,
    height: 933,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150462),
  },
  velasCosmeDamiao: {
    src: '/landing/fotos/velas-cosme-damiao.webp',
    alt: 'Velas coloridas acesas diante da mesa de doces de Cosme e Damião',
    width: 1400,
    height: 933,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150457),
  },
  mulheresDeBranco: {
    src: '/landing/fotos/mulheres-de-branco.webp',
    alt: 'Mulheres da casa vestidas de branco, com torço e saias rodadas',
    width: 1200,
    height: 1800,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150463),
  },
  assistencia: {
    src: '/landing/fotos/assistencia.webp',
    alt: 'Pessoas de pé acompanhando a gira no salão',
    width: 1600,
    height: 1347,
    credit: 'Reginaldo Lustosa',
    sourceUrl: pexels(9150443),
  },
  pretoVelho: {
    src: '/landing/fotos/preto-velho.webp',
    alt: 'Imagens de preto velho sobre toalha xadrez',
    width: 1200,
    height: 1200,
    credit: 'Giulia Botan',
    sourceUrl: pexels(27556611),
  },
  atabaqueMaos: {
    src: '/landing/fotos/atabaque-maos.webp',
    alt: 'Mãos tocando o couro de um atabaque',
    width: 1400,
    height: 933,
    credit: 'Mauricio Gomes',
    sourceUrl: pexels(13029700),
  },
  consulenteCelular: {
    src: '/landing/fotos/consulente-celular.webp',
    alt: 'Mulher sorrindo enquanto usa o celular',
    width: 1200,
    height: 1800,
    credit: 'Gustavo Fring',
    sourceUrl: pexels(7155740),
  },
  floresMar: {
    src: '/landing/fotos/flores-mar.webp',
    alt: 'Mulher de turbante azul segurando flores à beira-mar',
    width: 1200,
    height: 1755,
    credit: 'Alexandre Saraiva Carniato',
    sourceUrl: pexels(3751280),
  },
  atabaques: {
    src: '/landing/fotos/atabaques.webp',
    alt: 'Atabaques de madeira enfileirados',
    width: 1200,
    height: 1800,
    credit: 'Vinícius Vieira',
    sourceUrl: pexels(30146816),
  },
} satisfies Record<string, LandingPhoto>;

export type PhotoKey = keyof typeof PHOTOS;

/** Fotógrafos (sem repetição) para o crédito do rodapé. */
export const PHOTO_CREDITS = Array.from(new Set(Object.values(PHOTOS).map((p) => p.credit)));
