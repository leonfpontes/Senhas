/**
 * Roteiro de uso do painel Platform (Super Admin) — gestão da plataforma GiraHub.
 * Cada rota tem seus próprios steps com seletores `data-tour="..."`.
 */
import type { StepType } from '@reactour/tour';

type TourStepMap = Record<string, StepType[]>;

export const platformTourSteps: TourStepMap = {
  '/platform': [
    {
      selector: '[data-tour="platform-header"]',
      content:
        'Bem-vindo ao painel da plataforma GiraHub! Aqui você tem uma visão geral de todos os terreiros cadastrados.',
    },
    {
      selector: '[data-tour="platform-stats"]',
      content:
        'Acompanhe os números gerais: total de terreiros, terreiros ativos e receita da plataforma.',
    },
    {
      selector: '[data-tour="platform-quick-links"]',
      content:
        'Atalhos rápidos para as principais seções: gerenciar terreiros, usuários globais, auditoria e faturamento.',
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

  '/platform/users_global': [
    {
      selector: '[data-tour="global-users-header"]',
      content:
        'Gerencie os super administradores da plataforma GiraHub.',
    },
    {
      selector: '[data-tour="global-users-novo"]',
      content:
        'Crie um novo super administrador informando e-mail, nome de usuário e senha.',
    },
    {
      selector: '[data-tour="global-users-tabela"]',
      content:
        'Lista de todos os super admins. Você pode editar ou remover um usuário por aqui.',
    },
  ],

  '/platform/billing': [
    {
      selector: '[data-tour="billing-header"]',
      content:
        'Gerencie o faturamento de todos os terreiros da plataforma.',
    },
    {
      selector: '[data-tour="billing-stats"]',
      content:
        'Resumo financeiro: total de faturas, faturas pagas, receita total e valor médio por fatura.',
    },
    {
      selector: '[data-tour="billing-tenant-select"]',
      content:
        'Selecione um terreiro para visualizar suas faturas específicas.',
    },
    {
      selector: '[data-tour="billing-tabela"]',
      content:
        'Histórico de faturas com número, período, valor, status (pago, pendente, atrasado) e data de pagamento.',
    },
  ],

  '/platform/settings': [
    {
      selector: '[data-tour="settings-header"]',
      content:
        'Gerencie as configurações de plano e funcionalidades de cada terreiro.',
    },
    {
      selector: '[data-tour="settings-tenant-select"]',
      content:
        'Selecione o terreiro que deseja configurar.',
    },
    {
      selector: '[data-tour="settings-subscription"]',
      content:
        'Veja e altere o plano do terreiro selecionado, ajustando limites de usuários, giras e médiuns.',
    },
    {
      selector: '[data-tour="settings-flags"]',
      content:
        'Gerencie as feature flags deste terreiro — habilite ou desabilite funcionalidades individualmente.',
    },
    {
      selector: '[data-tour="settings-add-flag"]',
      content:
        'Adicione uma nova feature flag para liberar uma funcionalidade específica para este terreiro.',
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
