export type PermissionFeature =
  | 'giras'
  | 'tickets'
  | 'porta'
  | 'mediuns'
  | 'associados'
  | 'usuarios'
  | 'cursos_presenciais'
  | 'estoque'
  | 'financeiro'
  | 'configuracoes'
  | 'auditoria'
  | 'analytics'
  | 'relatorio_gira'
  | 'contas_financeiras';

export interface FeatureMeta {
  label: string;
  group: string;
}

export const FEATURE_LABELS: Record<PermissionFeature, FeatureMeta> = {
  giras: { label: 'Giras', group: 'Operacional' },
  tickets: { label: 'Tickets', group: 'Operacional' },
  porta: { label: 'Visão da Porta', group: 'Operacional' },
  mediuns: { label: 'Médiuns e Cambones', group: 'Cadastros' },
  associados: { label: 'Associados', group: 'Cadastros' },
  usuarios: { label: 'Usuários', group: 'Cadastros' },
  cursos_presenciais: { label: 'Cursos Presenciais', group: 'Cadastros' },
  estoque: { label: 'Estoque', group: 'Operacional' },
  financeiro: { label: 'Financeiro', group: 'Financeiro' },
  configuracoes: { label: 'Configurações', group: 'Administração' },
  auditoria: { label: 'Auditoria', group: 'Administração' },
  analytics: { label: 'Analytics', group: 'Relatórios' },
  relatorio_gira: { label: 'Relatório de Gira', group: 'Relatórios' },
  contas_financeiras: { label: 'Contas a Pagar / Receber', group: 'Financeiro' },
};
