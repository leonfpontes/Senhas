/**
 * Escala de faxina (AM-25) — tipos da API e regras puras do planejador do mês.
 *
 * API: `/api/v1/admin/escala-planos/{tipo_id}/{AAAA-MM}` (`backend/src/api/v1/admin/escala_planos.py`).
 * A tela (`components/admin/atividades/EscalaFaxina.tsx`) mexe no rascunho localmente (tocar num
 * grupo e depois nos dias) e salva o rascunho inteiro com PUT. Datas são dias de Brasília
 * ("AAAA-MM-DD") e horários "HH:MM" — nada de fuso no navegador.
 */

export const API_ESCALA_PLANOS = '/api/v1/admin/escala-planos';

/** Dias da semana da grade (domingo primeiro, como o `getDay()`): 0 = domingo ... 6 = sábado. */
export const SIGLAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
export const NOMES_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;
export const NOMES_SEMANA_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'] as const;

export interface DiaRascunho {
  data: string; // AAAA-MM-DD
  grupo_id: string;
  hora_inicio: string; // HH:MM
  hora_fim: string | null;
}

export interface DiaPlano extends DiaRascunho {
  publicado: boolean;
}

export interface GrupoPlano {
  id: string;
  nome: string;
  cor: string;
  total_membros: number;
  arquivado: boolean;
}

export interface PendenciasPlano {
  criar: number;
  cancelar: number;
  trocar: number;
  reagendar: number;
  ignorados_passado: number;
  tem_mudancas: boolean;
}

export interface PlanoEscala {
  tipo: { id: string; nome: string; icone: string; cor: string | null };
  mes: string; // AAAA-MM
  hoje: string; // AAAA-MM-DD (Brasília)
  existe: boolean;
  status: 'rascunho' | 'publicado' | null;
  publicado_em: string | null;
  publicado_por: string | null;
  hora_inicio_padrao: string;
  hora_fim_padrao: string | null;
  grupos: GrupoPlano[];
  dias: DiaPlano[];
  pendencias: PendenciasPlano;
  mes_anterior_dias: number;
  proximas_publicadas: number;
  descartados?: number;
}

export interface ResultadoPublicacao {
  criadas: number;
  canceladas: number;
  trocadas: number;
  reagendadas: number;
  atividades: number;
  convocados: number;
  dispensados: number;
  ignorados_passado: number;
  fora_da_elegibilidade: number;
}

export interface PlanoPublicado extends PlanoEscala {
  resultado: ResultadoPublicacao;
}

export const chaveDia = (data: string, grupoId: string) => `${data}|${grupoId}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Número do dia ("2026-11-07" → 7). */
export const diaDoMes = (data: string) => Number(data.slice(8, 10));

/** "AAAA-MM" + dia → "AAAA-MM-DD". */
export const dataDoDia = (ym: string, dia: number) => `${ym}-${pad(dia)}`;

/** Dia da semana (0 = domingo) de uma data "AAAA-MM-DD", sem fuso. */
export function diaDaSemana(data: string): number {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diasNoMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Células da grade (7 colunas, domingo primeiro): `null` antes do dia 1 e no fim da última semana. */
export function gradeDoMes(ym: string): (number | null)[] {
  const inicio = diaDaSemana(dataDoDia(ym, 1));
  const total = diasNoMes(ym);
  const celulas: (number | null)[] = Array.from({ length: inicio }, () => null);
  for (let d = 1; d <= total; d++) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

/** Só os campos do rascunho, ordenados por data e grupo (para comparar e enviar). */
export function normalizar(dias: readonly DiaRascunho[]): DiaRascunho[] {
  const vistos = new Map<string, DiaRascunho>();
  for (const d of dias) {
    const k = chaveDia(d.data, d.grupo_id);
    if (!vistos.has(k)) vistos.set(k, { data: d.data, grupo_id: d.grupo_id, hora_inicio: d.hora_inicio, hora_fim: d.hora_fim ?? null });
  }
  return [...vistos.values()].sort((a, b) => (a.data === b.data ? a.grupo_id.localeCompare(b.grupo_id) : a.data.localeCompare(b.data)));
}

export function mesmoRascunho(a: readonly DiaRascunho[], b: readonly DiaRascunho[]): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
}

/**
 * Tocar num dia com um grupo escolhido: o dia ganha o grupo (com o horário que o dia já tem, ou o
 * padrão do tipo); tocar de novo tira. Um dia pode ter mais de um grupo.
 */
export function alternarGrupo(
  dias: readonly DiaRascunho[],
  data: string,
  grupoId: string,
  padrao: { hora_inicio: string; hora_fim: string | null },
): DiaRascunho[] {
  const existe = dias.some((d) => d.data === data && d.grupo_id === grupoId);
  if (existe) return dias.filter((d) => !(d.data === data && d.grupo_id === grupoId));
  const doDia = dias.find((d) => d.data === data);
  const horario = doDia ? { hora_inicio: doDia.hora_inicio, hora_fim: doDia.hora_fim } : padrao;
  return normalizar([...dias, { data, grupo_id: grupoId, ...horario }]);
}

/** Muda o horário de todos os grupos de um dia. */
export function mudarHorario(
  dias: readonly DiaRascunho[],
  data: string,
  horaInicio: string,
  horaFim: string | null,
): DiaRascunho[] {
  return dias.map((d) => (d.data === data ? { ...d, hora_inicio: horaInicio, hora_fim: horaFim } : d));
}

/** "dia 3" · "dias 5 e 19" · "dias 1, 8 e 15". */
export function listaDeDias(numeros: readonly number[]): string {
  const ns = [...new Set(numeros)].sort((a, b) => a - b);
  if (ns.length === 0) return 'nenhum dia';
  if (ns.length === 1) return `dia ${ns[0]}`;
  return `dias ${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`;
}

/** Dias de cada grupo, na ordem das fichas. */
export function diasPorGrupo(dias: readonly DiaRascunho[], grupos: readonly { id: string }[]): Map<string, number[]> {
  const out = new Map<string, number[]>(grupos.map((g) => [g.id, []]));
  for (const d of dias) {
    if (!out.has(d.grupo_id)) out.set(d.grupo_id, []);
    out.get(d.grupo_id)!.push(diaDoMes(d.data));
  }
  return out;
}

/** "G1: dias 5 e 19 · G2: dias 12 e 26 · G3: dia 3" (só os grupos com dia). */
export function resumoTexto(dias: readonly DiaRascunho[], grupos: readonly { id: string; nome: string }[]): string {
  const nomes = new Map(grupos.map((g) => [g.id, g.nome]));
  const partes: string[] = [];
  for (const [id, ns] of diasPorGrupo(dias, grupos)) {
    if (ns.length) partes.push(`${nomes.get(id) ?? 'Grupo'}: ${listaDeDias(ns)}`);
  }
  return partes.length ? partes.join(' · ') : 'Nenhum dia escolhido ainda.';
}

/** "9h" · "8h30" a partir de "HH:MM". */
export function horaCurta(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

/** "9h às 12h" · "9h". */
export function horarioTexto(inicio: string, fim: string | null | undefined): string {
  return fim ? `${horaCurta(inicio)} às ${horaCurta(fim)}` : horaCurta(inicio);
}

/** Convocações que a publicação vai gerar (membros ativos de cada grupo × dias). */
export function convocacoesPrevistas(dias: readonly DiaRascunho[], grupos: readonly GrupoPlano[]): number {
  const total = new Map(grupos.map((g) => [g.id, g.total_membros]));
  return dias.reduce((soma, d) => soma + (total.get(d.grupo_id) ?? 0), 0);
}

/** Quantos dias diferentes têm algum grupo. */
export const quantosDias = (dias: readonly DiaRascunho[]) => new Set(dias.map((d) => d.data)).size;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Frase do toast depois de publicar ou atualizar as convocações. */
export function textoResultado(r: ResultadoPublicacao, atualizacao = false): string {
  const partes: string[] = [];
  if (atualizacao) partes.push(plural(r.atividades, 'faxina conferida', 'faxinas conferidas'));
  if (r.criadas) partes.push(plural(r.criadas, 'faxina criada', 'faxinas criadas'));
  if (r.trocadas) partes.push(plural(r.trocadas, 'dia com grupo trocado', 'dias com grupo trocado'));
  if (r.reagendadas) partes.push(plural(r.reagendadas, 'horário mudado', 'horários mudados'));
  if (r.canceladas) partes.push(plural(r.canceladas, 'faxina cancelada', 'faxinas canceladas'));
  if (r.convocados) partes.push(plural(r.convocados, 'pessoa posta na escala', 'pessoas postas na escala'));
  if (r.dispensados) partes.push(plural(r.dispensados, 'pessoa tirada da escala', 'pessoas tiradas da escala'));
  if (!partes.length || (atualizacao && partes.length === 1)) partes.push('nada mudou');
  return `${partes.join(' · ')}.`.replace(/^./, (c) => c.toUpperCase());
}
