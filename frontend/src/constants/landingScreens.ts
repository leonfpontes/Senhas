/**
 * Telas reais do GiraHub para o marketing (V-05). Capturadas em 2026-10-06 do tenant de
 * demonstração "Terreiro Modelo" (seed backend/scripts/seed_terreiro_modelo.py — nomes, telefones
 * e e-mails fictícios), com as cores do terreiro em terracota. Arquivos em /public/landing/telas.
 *
 * Para recapturar depois de mudar uma tela: rode o seed no ambiente local, abra a tela com o
 * terreiro demo e salve em 1280 px (painel) ou 600 px de largura (celular), WebP ~80.
 */
export interface LandingScreen {
  src: string;
  alt: string;
  title: string;
  caption: string;
  width: number;
  height: number;
  device: 'desktop' | 'mobile' | 'tv';
  /** Recorte 800×500 só da área de conteúdo (sem a barra lateral), para os cartões de módulo. */
  cardSrc?: string;
}

export const SCREENS = {
  porta: {
    src: '/landing/telas/porta.webp',
    alt: 'Tela da Porta: fila da Gira de Iansã com quem já chegou e o botão Chamar próximo',
    title: 'Porta',
    caption: 'Quem chegou, na ordem certa. Um toque chama o próximo.',
    width: 1280,
    height: 800,
    device: 'desktop',
  },
  kiosk: {
    src: '/landing/telas/kiosk.webp',
    alt: 'Modo TV: senha P001 em destaque e as próximas senhas da fila',
    title: 'Modo TV',
    caption: 'Na TV do salão, todo mundo vê a senha da vez e as próximas.',
    width: 1280,
    height: 720,
    device: 'tv',
  },
  emissao: {
    src: '/landing/telas/emissao.webp',
    alt: 'Página da gira no celular, onde o consulente informa nome e contato para pegar a senha',
    title: 'Senha pelo celular',
    caption: 'O consulente abre o link do WhatsApp e pega a senha em segundos.',
    width: 600,
    height: 1298,
    device: 'mobile',
  },
  bilhete: {
    src: '/landing/telas/bilhete.webp',
    alt: 'Bilhete da senha 0017 no celular, com data, endereço e botão para enviar no WhatsApp',
    title: 'Bilhete do consulente',
    caption: 'A senha fica no celular, com endereço e lembrete na agenda.',
    width: 600,
    height: 1298,
    device: 'mobile',
  },
  relatorio: {
    src: '/landing/telas/relatorio.webp',
    cardSrc: '/landing/telas/relatorio-card.webp',
    alt: 'Relatório da gira com totais de senhas, atendidos, faltas e a lista por médium e cambone',
    title: 'Relatório da gira',
    caption: 'Quantos vieram, quem atendeu e quem faltou — pronto em PDF.',
    width: 1280,
    height: 800,
    device: 'desktop',
  },
  senhas: {
    src: '/landing/telas/senhas.webp',
    cardSrc: '/landing/telas/senhas-card.webp',
    alt: 'Lista de senhas da gira com fila de espera, prioridade e status de cada consulente',
    title: 'Senhas e fila de espera',
    caption: 'Todas as senhas da gira, com prioridade e fila de espera.',
    width: 1280,
    height: 800,
    device: 'desktop',
  },
  mensalidades: {
    src: '/landing/telas/mensalidades.webp',
    cardSrc: '/landing/telas/mensalidades-card.webp',
    alt: 'Mensalidades da corrente no mês, com valores esperados, pagos e em aberto',
    title: 'Mensalidades',
    caption: 'A mensalidade da corrente e dos associados, mês a mês.',
    width: 1280,
    height: 800,
    device: 'desktop',
  },
  site: {
    src: '/landing/telas/site.webp',
    cardSrc: '/landing/telas/site-card.webp',
    alt: 'Página pública do terreiro com as próximas giras e o botão Retire sua senha',
    title: 'Página do terreiro',
    caption: 'As próximas giras da casa num endereço só seu.',
    width: 1280,
    height: 800,
    device: 'desktop',
  },
} satisfies Record<string, LandingScreen>;

export type ScreenKey = keyof typeof SCREENS;

/** Ordem do carrossel "Veja por dentro". */
export const SCREEN_TOUR: readonly ScreenKey[] = ['emissao', 'porta', 'kiosk', 'bilhete', 'senhas', 'relatorio', 'mensalidades', 'site'];
