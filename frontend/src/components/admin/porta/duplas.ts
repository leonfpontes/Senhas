/**
 * Duplas da noite (Porta) — tipos de `GET /api/v1/admin/giras/{id}/door/duplas` e as regras do
 * rascunho da gaveta (funções puras, testadas em `__tests__/duplas.test.ts`).
 *
 * Regras (as mesmas do backend, `services/duplas_gira.py`): um cambone auxilia um médium por vez
 * e quem trabalha como médium na noite não é cambone. Na gaveta, em vez de recusar, a escolha
 * nova ganha e a anterior é desfeita com um aviso ("Ana saiu da dupla de Mãe Rita").
 */

export type SituacaoArea = 'vou' | 'nao_vou' | 'presente';

export interface PessoaDupla {
  id: string;
  nome: string;
  is_atendimento: boolean;
  situacao: SituacaoArea | null;
  escalado_cambone: boolean;
}

export interface Dupla {
  medium_id: string;
  medium_nome: string;
  cambone_id: string | null;
  cambone_nome: string | null;
}

export interface SugestaoDupla {
  medium_id: string;
  cambone_id: string;
  juntos: number;
  giras_do_medium: number;
}

export interface DuplasPainel {
  duplas: Dupla[];
  pessoas: PessoaDupla[];
  tem_confirmacoes: boolean;
  sugestoes: SugestaoDupla[];
  anterior: {
    gira_nome: string;
    data_inicio: string;
    duplas: { medium_id: string; cambone_id: string | null }[];
  } | null;
}

/** Médiuns trabalhando na ordem em que foram marcados, e o cambone de cada um. */
export interface Rascunho {
  ordem: string[];
  cambone: Record<string, string | null>;
}

export interface Mudanca {
  rascunho: Rascunho;
  /** Aviso para o porteiro quando a mudança desfez outra escolha. */
  aviso?: string;
}

export const rascunhoVazio = (): Rascunho => ({ ordem: [], cambone: {} });

export function rascunhoDe(pares: { medium_id: string; cambone_id: string | null }[]): Rascunho {
  const r = rascunhoVazio();
  for (const p of pares) {
    if (r.ordem.includes(p.medium_id)) continue;
    r.ordem.push(p.medium_id);
    r.cambone[p.medium_id] = p.cambone_id;
  }
  return r;
}

export function paraEnvio(r: Rascunho): { medium_id: string; cambone_id: string | null }[] {
  return r.ordem.map((id) => ({ medium_id: id, cambone_id: r.cambone[id] ?? null }));
}

export function mesmoRascunho(a: Rascunho, b: Rascunho): boolean {
  return JSON.stringify(paraEnvio(a)) === JSON.stringify(paraEnvio(b));
}

/** Médium de quem `camboneId` é cambone no rascunho (ou null). */
export function duplaDoCambone(r: Rascunho, camboneId: string): string | null {
  return r.ordem.find((m) => r.cambone[m] === camboneId) ?? null;
}

export function marcarMedium(r: Rascunho, id: string, nomes: Record<string, string>): Mudanca {
  if (r.ordem.includes(id)) return { rascunho: r };
  const cambone = { ...r.cambone, [id]: null };
  const de = duplaDoCambone(r, id);
  if (de) cambone[de] = null;
  return {
    rascunho: { ordem: [...r.ordem, id], cambone },
    aviso: de ? `${nomes[id]} saiu da dupla de ${nomes[de]} (agora trabalha como médium).` : undefined,
  };
}

export function desmarcarMedium(r: Rascunho, id: string): Rascunho {
  const cambone = { ...r.cambone };
  delete cambone[id];
  return { ordem: r.ordem.filter((m) => m !== id), cambone };
}

export function definirCambone(
  r: Rascunho,
  mediumId: string,
  camboneId: string | null,
  nomes: Record<string, string>,
): Mudanca {
  const cambone = { ...r.cambone, [mediumId]: camboneId };
  let aviso: string | undefined;
  if (camboneId) {
    const de = duplaDoCambone(r, camboneId);
    if (de && de !== mediumId) {
      cambone[de] = null;
      aviso = `${nomes[camboneId]} saiu da dupla de ${nomes[de]}.`;
    }
  }
  return { rascunho: { ...r, cambone }, aviso };
}

/** Cambone livre para a sugestão: não trabalha como médium e não está em outra dupla. */
function livre(r: Rascunho, camboneId: string): boolean {
  return !r.ordem.includes(camboneId) && duplaDoCambone(r, camboneId) === null;
}

/** Sugestões que dá para aplicar agora: médium marcado, sem cambone, e o cambone sugerido livre. */
export function sugestoesAplicaveis(r: Rascunho, sugestoes: SugestaoDupla[]): SugestaoDupla[] {
  const usados = new Set<string>();
  return sugestoes.filter((s) => {
    if (!r.ordem.includes(s.medium_id) || r.cambone[s.medium_id] || !livre(r, s.cambone_id) || usados.has(s.cambone_id)) {
      return false;
    }
    usados.add(s.cambone_id);
    return true;
  });
}

export function aplicarSugestoes(r: Rascunho, sugestoes: SugestaoDupla[]): Rascunho {
  const cambone = { ...r.cambone };
  for (const s of sugestoesAplicaveis(r, sugestoes)) cambone[s.medium_id] = s.cambone_id;
  return { ...r, cambone };
}

export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export interface AtendimentosDoMedium {
  total: number;
  ultimo: Date | null;
}

/** Senhas atendidas na noite por médium (pelo nome gravado na senha). */
export function atendimentosPorMedium(
  fila: { status: string; medium_nome: string | null; chamado_em: string | null }[],
): Map<string, AtendimentosDoMedium> {
  const mapa = new Map<string, AtendimentosDoMedium>();
  for (const t of fila) {
    if (t.status !== 'completed' || !t.medium_nome) continue;
    const chave = normalizarNome(t.medium_nome);
    const atual = mapa.get(chave) ?? { total: 0, ultimo: null };
    const quando = t.chamado_em ? new Date(t.chamado_em) : null;
    mapa.set(chave, {
      total: atual.total + 1,
      ultimo: quando && (!atual.ultimo || quando > atual.ultimo) ? quando : atual.ultimo,
    });
  }
  return mapa;
}

/** "1 atendimento · último há 4 min" / "Ainda não atendeu". */
export function resumoAtendimentos(a: AtendimentosDoMedium | undefined, agora: Date = new Date()): string {
  if (!a || a.total === 0) return 'Ainda não atendeu';
  const base = `${a.total} atendimento${a.total === 1 ? '' : 's'}`;
  if (!a.ultimo) return base;
  const min = Math.max(0, Math.round((agora.getTime() - a.ultimo.getTime()) / 60000));
  return `${base} · último ${min < 1 ? 'agora' : `há ${min} min`}`;
}
