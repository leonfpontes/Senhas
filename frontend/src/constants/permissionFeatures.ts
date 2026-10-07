export type PermissionFeature =
  | 'giras'
  | 'tickets'
  | 'porta'
  | 'mediuns'
  | 'associados'
  | 'usuarios'
  | 'cursos_presenciais'
  | 'site'
  | 'estoque'
  | 'financeiro'
  | 'configuracoes'
  | 'auditoria'
  | 'analytics'
  | 'relatorio_gira'
  | 'contas_financeiras';

/** Rótulos dos módulos na tela de grupos (português, sem jargão). */
export interface FeatureMeta {
  label: string;
  group: string;
}

export const FEATURE_LABELS: Record<PermissionFeature, FeatureMeta> = {
  giras: { label: 'Giras', group: 'Operacional' },
  tickets: { label: 'Senhas', group: 'Operacional' },
  porta: { label: 'Porta', group: 'Operacional' },
  mediuns: { label: 'Médiuns e Cambones', group: 'Cadastros' },
  associados: { label: 'Associados', group: 'Cadastros' },
  usuarios: { label: 'Pessoas e acessos', group: 'Cadastros' },
  cursos_presenciais: { label: 'Cursos Presenciais', group: 'Cadastros' },
  site: { label: 'Site do terreiro', group: 'Cadastros' },
  estoque: { label: 'Estoque', group: 'Operacional' },
  financeiro: { label: 'Mensalidades', group: 'Financeiro' },
  configuracoes: { label: 'Configurações', group: 'Administração' },
  auditoria: { label: 'Auditoria', group: 'Administração' },
  analytics: { label: 'Indicadores', group: 'Relatórios' },
  relatorio_gira: { label: 'Relatório de Gira', group: 'Relatórios' },
  contas_financeiras: { label: 'Contas a Pagar / Receber', group: 'Financeiro' },
};
