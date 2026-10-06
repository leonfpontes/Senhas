/**
 * Mapeamento de segmentos de rota para labels legíveis, usado pelos
 * breadcrumbs da topbar administrativa.
 */
export const ROUTE_LABELS: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Início',
  giras: 'Giras',
  tickets: 'Senhas',
  porta: 'Porta',
  kiosk: 'Modo TV',
  mediuns: 'Médiuns',
  associados: 'Associados',
  usuarios: 'Usuários',
  users: 'Pessoas e acessos',
  billing: 'Plano e assinatura',
  'meu-site': 'Site do terreiro',
  suporte: 'Ajuda',
  itens: 'Itens',
  'permission-groups': 'Perfis de acesso',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
  mensalidades: 'Mensalidades',
  lancamentos: 'Lançamentos',
  'fluxo-de-caixa': 'Fluxo de Caixa',
  config: 'Configuração',
  configuracoes: 'Configurações',
  auditoria: 'Auditoria',
  analytics: 'Indicadores',
  relatorio: 'Relatório',
  'relatorio-gira': 'Relatório de Gira',
  cursos: 'Cursos Presenciais',
  'cursos-presenciais': 'Cursos Presenciais',
  profile: 'Perfil',
  email: 'E-mail',
  grupos: 'Grupos',
  movimentacoes: 'Movimentações',
};

/** Converte um segmento de rota em um label legível. */
export function routeLabel(segment: string): string {
  if (ROUTE_LABELS[segment]) return ROUTE_LABELS[segment];
  // ids dinâmicos ([id]) ou slugs — capitaliza como fallback
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
