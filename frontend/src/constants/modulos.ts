/**
 * Os módulos da casa (Jornada 1 v2 · 10/11 — barra lateral enxuta, aprovada em 01/11/2026).
 *
 * A barra mostra fixo o dia de gira (Início, Giras, Porta, Senhas); o resto da casa fica em "Da casa"
 * e na página `/admin/modulos` ("Ver os N módulos"). Cada módulo diz quais rotas do menu completo
 * (`useAdminNav`) são dele — o gate de plano e de permissão continua lá, num lugar só. Nada fica
 * inacessível: a busca (Ctrl K) e as rotas de sempre usam o menu completo.
 *
 * Plano mínimo: `FEATURE_MIN_PLAN` de `constants/plans.ts` (a mesma matriz do backend).
 * Módulos da Área do Médium (piloto, `area_medium`) não são oferecidos fora do piloto: sem a chave,
 * somem (como no menu de hoje).
 */
import type { PlanFeatureKey } from '@/constants/plans';

export type GrupoDeModulo = 'Dia de gira' | 'Corrente' | 'Casa';

export interface Modulo {
  key: string;
  nome: string;
  oque: string;
  grupo: GrupoDeModulo;
  /** Recurso de plano que libera o módulo (sem ele, aparece "No <plano>" com "Ver o plano"). */
  plano?: PlanFeatureKey;
  /** Piloto: sem a chave, o módulo some em vez de oferecer o plano. */
  piloto?: boolean;
  /** Rotas (sem query) do menu completo que pertencem ao módulo; a primeira é a de entrada. */
  rotas: string[];
  /** Sempre no menu (o dia de gira). */
  fixo?: boolean;
}

export const MODULOS: readonly Modulo[] = [
  {
    key: 'giras',
    nome: 'Giras, senhas e Porta',
    oque: 'Agenda, link no WhatsApp, chamada no portão e Modo TV',
    grupo: 'Dia de gira',
    rotas: ['/admin/giras', '/admin/tickets', '/admin/porta'],
    fixo: true,
  },
  {
    key: 'relatorio',
    nome: 'Relatório e analytics',
    oque: 'Relatório de cada gira; analytics do trimestre no Pro',
    grupo: 'Dia de gira',
    plano: 'relatorio_gira',
    rotas: ['/admin/relatorio-gira', '/admin/analytics'],
  },
  {
    key: 'mediuns',
    nome: 'Médiuns e grupos',
    oque: 'Cadastro, grupos e presença da corrente',
    grupo: 'Corrente',
    plano: 'mediuns',
    rotas: ['/admin/mediuns', '/admin/mediuns/grupos'],
  },
  {
    key: 'avisos',
    nome: 'Avisos',
    oque: 'Recados para a corrente, com quem já leu',
    grupo: 'Corrente',
    plano: 'area_medium',
    piloto: true,
    rotas: ['/admin/comunicados'],
  },
  {
    key: 'atividades',
    nome: 'Atividades e escalas',
    oque: 'Calendário da casa; escalas no Pro',
    grupo: 'Corrente',
    plano: 'area_medium',
    piloto: true,
    rotas: ['/admin/atividades'],
  },
  {
    key: 'estudos',
    nome: 'Estudos e documentos',
    oque: 'Pontos, apostilas e áudios para a corrente',
    grupo: 'Corrente',
    plano: 'area_medium',
    piloto: true,
    rotas: ['/admin/materiais'],
  },
  {
    key: 'mensalidades',
    nome: 'Mensalidades',
    oque: 'Mensalidade dos médiuns; baixa automática no Pro',
    grupo: 'Casa',
    plano: 'mensalidade_mediun',
    rotas: ['/admin/financeiro/mensalidades'],
  },
  {
    key: 'site',
    nome: 'Site e cursos',
    oque: 'Site da casa, agenda pública e inscrição em cursos',
    grupo: 'Casa',
    plano: 'site_builder',
    rotas: ['/admin/meu-site', '/admin/cursos-presenciais'],
  },
  {
    key: 'associados',
    nome: 'Associados',
    oque: 'Cadastro e mensalidade de associados',
    grupo: 'Casa',
    plano: 'associados',
    rotas: ['/admin/associados'],
  },
  {
    key: 'financeiro',
    nome: 'Financeiro',
    oque: 'Contas a pagar e a receber, e o caixa',
    grupo: 'Casa',
    plano: 'contas_financeiras',
    rotas: [
      '/admin/financeiro/lancamentos',
      '/admin/financeiro/fluxo-de-caixa',
      '/admin/financeiro/por-categoria',
      '/admin/financeiro/config',
    ],
  },
  {
    key: 'estoque',
    nome: 'Estoque',
    oque: 'Itens, entradas e saídas, e a lista de compras',
    grupo: 'Casa',
    plano: 'estoque_controle',
    rotas: ['/admin/estoque/itens', '/admin/estoque/grupos', '/admin/estoque/movimentacoes'],
  },
];

/**
 * Como o módulo aparece para esta pessoa, nesta casa — a mesma regra da página /admin/modulos e do
 * "Ver os N módulos" da barra (o número conta só o que a página mostra: contador com dado real).
 * - `fixo`: o dia de gira, sempre;
 * - `liberado`: o plano e o perfil liberam (`entrada` é a rota do menu completo que abre o módulo);
 * - `plano`: fora do plano — aparece apagado, com o plano que precisa;
 * - `null`: não aparece (sem permissão, ou piloto sem a chave).
 */
export type SituacaoDoModulo =
  | { tipo: 'fixo'; entrada: string }
  | { tipo: 'liberado'; entrada: string }
  | { tipo: 'plano'; entrada: null }
  | null;

export function situacaoDoModulo(
  m: Modulo,
  rotasLiberadas: ReadonlySet<string>,
  temRecurso: (recurso: PlanFeatureKey) => boolean,
): SituacaoDoModulo {
  if (m.fixo) return { tipo: 'fixo', entrada: m.rotas[0] };
  const entrada = m.rotas.find((r) => rotasLiberadas.has(r));
  if (entrada) return { tipo: 'liberado', entrada };
  if (m.piloto) return null;
  if (m.plano && !temRecurso(m.plano)) return { tipo: 'plano', entrada: null };
  return null;
}

/** Quantos módulos a página /admin/modulos mostra para esta pessoa. */
export function contarModulosVisiveis(
  rotasLiberadas: ReadonlySet<string>,
  temRecurso: (recurso: PlanFeatureKey) => boolean,
): number {
  return MODULOS.filter((m) => situacaoDoModulo(m, rotasLiberadas, temRecurso) !== null).length;
}

export const GRUPOS_DE_MODULO: readonly GrupoDeModulo[] = ['Dia de gira', 'Corrente', 'Casa'];

/** Rotas que ficam fixas na barra (o dia de gira), além do Início. */
export const ROTAS_FIXAS = ['/admin/dashboard', '/admin/giras', '/admin/porta', '/admin/tickets'];

/** Módulo dono da rota (por prefixo), ou undefined. */
export function moduloDaRota(pathname: string): Modulo | undefined {
  return MODULOS.find((m) => !m.fixo && m.rotas.some((r) => pathname === r || pathname.startsWith(`${r}/`)));
}

// ─── Beta "Menu que se ajusta ao uso" (beta_menu_ajustavel) ────────────────
// O que a casa usa sobe sozinho para "Da casa" (módulo aberto neste aparelho) e cada pessoa põe
// ou tira módulos em /admin/modulos. Guardado por casa neste navegador; sem a beta, "Da casa"
// mostra todos os módulos que o plano e o perfil liberam.

export interface PreferenciaDoMenu {
  /** Módulos que a pessoa abriu (sobem sozinhos). */
  usados: string[];
  /** Pôr no menu à mão. */
  postos: string[];
  /** Tirar do menu à mão (vence o uso). */
  tirados: string[];
}

const VAZIA: PreferenciaDoMenu = { usados: [], postos: [], tirados: [] };

function chave(tenantId: string | null | undefined): string {
  return `girahub:menu:${tenantId ?? 'casa'}`;
}

export function lerPreferencia(tenantId: string | null | undefined): PreferenciaDoMenu {
  if (typeof window === 'undefined') return VAZIA;
  try {
    const bruto = window.localStorage.getItem(chave(tenantId));
    const p = bruto ? (JSON.parse(bruto) as Partial<PreferenciaDoMenu>) : {};
    return {
      usados: Array.isArray(p.usados) ? p.usados : [],
      postos: Array.isArray(p.postos) ? p.postos : [],
      tirados: Array.isArray(p.tirados) ? p.tirados : [],
    };
  } catch {
    return VAZIA;
  }
}

export function gravarPreferencia(tenantId: string | null | undefined, p: PreferenciaDoMenu): void {
  try {
    window.localStorage.setItem(chave(tenantId), JSON.stringify(p));
    window.dispatchEvent(new Event('girahub:menu'));
  } catch {
    /* sem armazenamento: o menu só não lembra */
  }
}

/** Está no menu ("Da casa"): posto à mão, aberto neste aparelho ou com dado na casa — e não tirado. */
export function estaNoMenu(p: PreferenciaDoMenu, key: string, comDado: readonly string[] = []): boolean {
  if (p.tirados.includes(key)) return false;
  return p.postos.includes(key) || p.usados.includes(key) || comDado.includes(key);
}

export function marcarUso(p: PreferenciaDoMenu, key: string): PreferenciaDoMenu {
  return p.usados.includes(key) ? p : { ...p, usados: [...p.usados, key] };
}

export function porNoMenu(p: PreferenciaDoMenu, key: string): PreferenciaDoMenu {
  return { ...p, postos: [...new Set([...p.postos, key])], tirados: p.tirados.filter((k) => k !== key) };
}

export function tirarDoMenu(p: PreferenciaDoMenu, key: string): PreferenciaDoMenu {
  return { ...p, tirados: [...new Set([...p.tirados, key])], postos: p.postos.filter((k) => k !== key) };
}
