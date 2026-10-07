/**
 * Textos da landing (V-07, V-08). Linguagem de terreiro, sem jargão de software.
 * Funcionalidades citadas aqui precisam existir no produto (R-02).
 */
import type { PlanFeatureKey } from '@/constants/plans';
import type { PhotoKey } from '@/constants/landingPhotos';
import type { ScreenKey } from '@/constants/landingScreens';

export const HERO = {
  eyebrow: 'Para terreiros de Umbanda, Candomblé e casas de axé',
  title: 'A senha da gira no celular. A fila em paz no portão.',
  subtitle:
    'O consulente pega a senha pelo link no WhatsApp, a corrente se prepara sem tumulto e quem está na porta chama na ordem — até na TV do salão.',
  proof: ['Grátis para começar', '30 dias de Premium sem cartão', 'Sem app para o consulente'],
};

export interface AudienceCard {
  title: string;
  who: string;
  desc: string;
}

/** "Para quem é" — deixa claro o nicho e quem usa o sistema dentro da casa. */
export const AUDIENCE: readonly AudienceCard[] = [
  {
    title: 'Quem dirige a casa',
    who: 'Pai e mãe de santo, dirigentes',
    desc: 'Vê quantas senhas saíram, quem compareceu e como foi cada gira, sem planilha e sem caderno.',
  },
  {
    title: 'Quem cuida da porta',
    who: 'Cambones, porteiros, filhos da casa',
    desc: 'Recebe o consulente, confere a senha e chama na ordem pelo celular ou tablet. Quem chega sem senha entra na hora.',
  },
  {
    title: 'Quem vem buscar ajuda',
    who: 'Consulentes e assistência',
    desc: 'Pega a senha de casa, sabe a hora de sair e não precisa chegar de madrugada para garantir lugar.',
  },
];

export const TERREIRO_WORDS = ['gira', 'corrente', 'consulente', 'cambone', 'congá', 'assistência', 'médium', 'casa de axé'];

export interface Step {
  title: string;
  desc: string;
}

export const STEPS: readonly Step[] = [
  {
    title: 'Crie a gira',
    desc: 'Nome da gira, data e quantas senhas. Em um minuto sai o link — e o QR Code para imprimir na porta.',
  },
  {
    title: 'Mande o link no WhatsApp',
    desc: 'O consulente abre no celular, informa nome e contato e recebe a senha. Sem aplicativo e sem cadastro complicado.',
  },
  {
    title: 'Chame pela Porta',
    desc: 'No dia, a Porta mostra quem chegou e chama na ordem. Espelhe na TV do salão e todo mundo acompanha.',
  },
];

/** V-07 — antes × depois. */
export const BEFORE: readonly string[] = [
  'Fila no portão desde cedo, no sol ou na chuva',
  'Papelzinho de senha que some, rasga ou é copiado',
  '“Quem chegou primeiro?” — discussão na porta',
  'Consulente indo embora sem saber se vai ser atendido',
  'No fim da noite, ninguém sabe quantos foram atendidos',
];

export const AFTER: readonly string[] = [
  'Senha pelo celular, pelo link do grupo do WhatsApp',
  'Número único para cada pessoa, sem papel',
  'A Porta chama na ordem certa — e mostra na TV',
  'Gira lotou? Fila de espera que anda sozinha (no Premium)',
  'Relatório da gira pronto: senhas, presença e horários',
];

/** Perguntas que a casa faz toda gira (V-07). */
export const TERREIRO_QUESTIONS: readonly { q: string; a: string }[] = [
  { q: 'Quantas pessoas cabem hoje?', a: 'Você define o limite de senhas de cada gira.' },
  { q: 'Quem é o próximo?', a: 'A Porta mostra, em ordem, quem já chegou.' },
  { q: 'Quantos foram atendidos?', a: 'O relatório da gira conta tudo sozinho.' },
];

/**
 * Mídia de cada módulo: precisa mostrar o que o texto diz. Funcionalidade do sistema → tela real
 * (`screen`); só usa foto (`photo`) quando ela retrata literalmente o assunto (a corrente, as velas).
 */
export type ModuleMedia = { photo: PhotoKey } | { screen: ScreenKey };

export interface ModuleItem {
  title: string;
  desc: string;
  feature: PlanFeatureKey;
  media: ModuleMedia;
}

export const MODULES: readonly ModuleItem[] = [
  {
    title: 'Corrente e cambones',
    desc: 'Cadastro dos médiuns, quem atende em cada gira e os aniversariantes da semana.',
    feature: 'mediuns',
    media: { photo: 'corrente' },
  },
  {
    title: 'Relatório da gira',
    desc: 'Quantas senhas saíram, quem compareceu e os horários de maior movimento — em PDF.',
    feature: 'relatorio_gira',
    media: { screen: 'relatorio' },
  },
  {
    title: 'Site do terreiro e cursos',
    desc: 'Página da casa com endereço, próximas giras e inscrição em cursos e desenvolvimentos.',
    feature: 'site_builder',
    media: { screen: 'site' },
  },
  {
    title: 'Mensalidades e financeiro',
    desc: 'Mensalidade da corrente e dos associados, contas a pagar e a receber e o caixa da casa.',
    feature: 'contas_financeiras',
    media: { screen: 'mensalidades' },
  },
  {
    title: 'Estoque de materiais',
    desc: 'Velas, ervas, pemba, bebidas: entradas, saídas e aviso quando está acabando.',
    feature: 'estoque_controle',
    media: { photo: 'velasEstoque' },
  },
  {
    title: 'Fila de espera e horário marcado',
    desc: 'Gira lotou? Quem chega entra na espera e sobe sozinho. Ou cada consulente escolhe o horário.',
    feature: 'fila_espera',
    media: { screen: 'senhas' },
  },
];
