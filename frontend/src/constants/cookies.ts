/**
 * Inventário de cookies e armazenamento local do GiraHub — fonte única da página /cookies e do
 * painel de preferências do banner (components/shared/CookieConsent). Cookie novo no código →
 * acrescente aqui, na categoria certa (R-02: documentação divergente do código é bug).
 *
 * Os padrões de nome das categorias opcionais também estão em `COOKIES_DA_CATEGORIA`
 * (lib/consent.ts), que apaga os cookies quando a pessoa revoga a categoria.
 */
import type { CategoriaDeCookie } from '@/lib/consent';

export interface ItemDeCookie {
  nome: string;
  fornecedor: string;
  finalidade: string;
  duracao: string;
  /** cookie (vai junto em cada requisição) ou armazenamento local do navegador. */
  tipo: 'Cookie' | 'Armazenamento local';
}

export interface CategoriaInfo {
  id: CategoriaDeCookie;
  titulo: string;
  resumo: string;
  baseLegal: string;
  obrigatoria: boolean;
  itens: ItemDeCookie[];
}

export const CATEGORIAS_DE_COOKIES: CategoriaInfo[] = [
  {
    id: 'necessarios',
    titulo: 'Necessários',
    resumo:
      'Mantêm você conectado ao painel, protegem a conta e lembram as escolhas de tela e a própria decisão sobre cookies. Sem eles o sistema não funciona, por isso ficam sempre ativos.',
    baseLegal: 'Execução de contrato e legítimo interesse (LGPD, art. 7º, V e IX)',
    obrigatoria: true,
    itens: [
      {
        nome: 'access_token',
        fornecedor: 'GiraHub',
        finalidade: 'Sessão de acesso ao painel (HttpOnly — o JavaScript da página não consegue ler).',
        duracao: '24 horas, ou até fechar o navegador sem "Manter conectado"',
        tipo: 'Cookie',
      },
      {
        nome: 'refresh_token',
        fornecedor: 'GiraHub',
        finalidade: 'Renova a sessão sem pedir a senha de novo (HttpOnly).',
        duracao: '30 dias, ou até fechar o navegador sem "Manter conectado"',
        tipo: 'Cookie',
      },
      {
        nome: 'auth_state',
        fornecedor: 'GiraHub',
        finalidade: 'Diz à página que há uma sessão aberta (não guarda nenhum dado pessoal).',
        duracao: '24 horas',
        tipo: 'Cookie',
      },
      {
        nome: 'girahub_consent',
        fornecedor: 'GiraHub',
        finalidade: 'Guarda a sua escolha neste aviso de cookies e a data em que ela foi feita.',
        duracao: '180 dias',
        tipo: 'Cookie',
      },
      {
        nome: 'sidebar_state',
        fornecedor: 'GiraHub',
        finalidade: 'Lembra se o menu lateral do painel está aberto ou recolhido.',
        duracao: '7 dias',
        tipo: 'Cookie',
      },
      {
        nome: 'user, admin_theme_mode, girahub:*',
        fornecedor: 'GiraHub',
        finalidade:
          'Dados básicos do usuário logado, tema claro/escuro, som da Porta, avisos já dispensados e o andamento do tour de boas-vindas.',
        duracao: 'Até você sair da conta ou limpar os dados do navegador',
        tipo: 'Armazenamento local',
      },
      {
        nome: 'girahub:cadastro:rascunho, girahub:gira-selecionada',
        fornecedor: 'GiraHub',
        finalidade:
          'Rascunho do cadastro (nunca a senha nem o CPF/CNPJ), para não perder o que foi digitado, e a gira escolhida no painel.',
        duracao: 'Até fechar a aba',
        tipo: 'Armazenamento local',
      },
    ],
  },
  {
    id: 'estatisticas',
    titulo: 'Estatísticas',
    resumo:
      'Mostram, de forma agregada, quais páginas são visitadas, onde as pessoas travam no cadastro e o que pode melhorar. Campos de formulário (nome, e-mail, CPF, telefone) são mascarados e nunca chegam a essas ferramentas.',
    baseLegal: 'Consentimento (LGPD, art. 7º, I)',
    obrigatoria: false,
    itens: [
      {
        nome: '_ga, _ga_*',
        fornecedor: 'Google Analytics 4',
        finalidade: 'Distingue visitantes e sessões para contar acessos, origem das visitas e conversões.',
        duracao: '2 anos',
        tipo: 'Cookie',
      },
      {
        nome: '_clck, _clsk, CLID, MUID',
        fornecedor: 'Microsoft Clarity',
        finalidade: 'Mapas de calor e gravações anônimas da navegação para encontrar telas confusas.',
        duracao: 'De 1 dia (_clsk) a 1 ano (_clck, CLID, MUID)',
        tipo: 'Cookie',
      },
    ],
  },
  {
    id: 'marketing',
    titulo: 'Marketing',
    resumo:
      'Medem se os anúncios do GiraHub trazem novos terreiros e permitem mostrar o GiraHub de novo a quem já visitou o site, no Google e nas redes da Meta (Instagram e Facebook).',
    baseLegal: 'Consentimento (LGPD, art. 7º, I)',
    obrigatoria: false,
    itens: [
      {
        nome: '_gcl_au, _gcl_aw',
        fornecedor: 'Google Ads',
        finalidade: 'Liga o clique num anúncio do GiraHub ao cadastro, para medir o resultado da campanha.',
        duracao: '90 dias',
        tipo: 'Cookie',
      },
      {
        nome: '_fbp, _fbc',
        fornecedor: 'Meta Pixel (Instagram/Facebook)',
        finalidade: 'Mede visitas e cadastros vindos de anúncios e monta públicos de quem já conhece o GiraHub.',
        duracao: '90 dias',
        tipo: 'Cookie',
      },
    ],
  },
];
