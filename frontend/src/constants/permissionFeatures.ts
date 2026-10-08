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
  | 'contas_financeiras'
  | 'comunicados'
  | 'escalas'
  | 'ficha_espiritual';

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
  comunicados: { label: 'Avisos da Área', group: 'Corrente' },
  escalas: { label: 'Atividades e escalas', group: 'Corrente' },
  ficha_espiritual: { label: 'Ficha espiritual', group: 'Corrente' },
};

/**
 * Módulos com dado sensível (LGPD art. 11 — dado religioso). Ficam fora do grupo padrão "Acesso
 * total" (F-05, exceção consciente) e os atalhos da matriz (Nada / Só ver / Operação do dia / Tudo)
 * não mexem neles: a casa marca à mão, para quem cuida da ficha.
 */
export const SENSITIVE_FEATURES: readonly PermissionFeature[] = ['ficha_espiritual'];

/** Aviso mostrado na linha do módulo sensível na matriz de permissões. */
export const SENSITIVE_FEATURE_HINT = 'Dado religioso: marque só para quem cuida da ficha dos médiuns.';
