/**
 * Roteiro de uso do painel Platform (Super Admin) — gestão da plataforma GiraHub.
 * Cada rota tem seus próprios steps com seletores `data-tour="..."`.
 */
import type { StepType } from '@reactour/tour';

type TourStepMap = Record<string, StepType[]>;

export const platformTourSteps: TourStepMap = {
  '/platform': [
    {
      selector: '[data-tour="platform-kpis"]',
      content:
        'Bem-vindo à tela Hoje. Os quatro números resumem o negócio: receita mensal, pagantes, terreiros em teste e quantos ativaram no último mês.',
    },
    {
      selector: '#contatar',
      content:
        'Contatar: trials acabando, ativação travada e risco de churn, por urgência. Cada linha tem WhatsApp, mensagem e "Entrar como admin".',
    },
    {
      selector: '#mudou',
      content: 'Venceu ou mudou: cancelamentos, suspensões, trials vencidos e bônus concedidos.',
    },
    {
      selector: '#quebrou',
      content: 'Quebrou: saúde dos serviços, erros por terreiro e conversas de suporte sem resposta.',
    },
  ],

  '/platform/tenants': [
    {
      selector: '[data-tour="tenants-header"]',
      content:
        'Gerencie todos os terreiros cadastrados na plataforma GiraHub.',
    },
    {
      selector: '[data-tour="tenants-novo"]',
      content:
        'Cadastre um novo terreiro informando o slug (identificador único), nome, e-mail do administrador e plano.',
    },
    {
      selector: '[data-tour="tenants-tabela"]',
      content:
        'Lista de todos os terreiros. Use o menu de ações para editar, ver detalhes ou remover um terreiro.',
    },
  ],

  '/platform/settings': [
    {
      selector: '[data-tour="settings-tabs"]',
      content:
        'Configurações em três abas: sua conta, os administradores da plataforma e a tabela de planos.',
    },
  ],

  '/platform/audit_consolidated': [
    {
      selector: '[data-tour="audit-cons-header"]',
      content:
        'Auditoria consolidada de toda a plataforma — veja o que todos os terreiros fizeram em um único lugar.',
    },
    {
      selector: '[data-tour="audit-cons-filtros"]',
      content:
        'Selecione o período de análise e clique em "Carregar" para buscar os logs.',
    },
    {
      selector: '[data-tour="audit-cons-tabs"]',
      content:
        'Navegue entre as abas: Resumo geral, distribuição por terreiro ou distribuição por tipo de ação.',
    },
  ],
};

/**
 * Retorna os steps para a rota actual do painel platform.
 */
export function getPlatformTourSteps(pathname: string): StepType[] {
  return platformTourSteps[pathname] ?? [];
}
