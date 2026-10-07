/**
 * Agenda da Área do Médium (AM-07) — tipos da API e textos prontos.
 *
 * Formato unificado (`GET /api/v1/medium/agenda`): `{origem, id, tipo{nome, icone, cor}, titulo,
 * inicio, fim, local, minha_participacao}`. Hoje só giras; o AM-08 soma as atividades da casa e o
 * AM-17 preenche `minha_participacao` sem mudar o formato.
 */
import { BR_TIME_ZONE, monthLabelLong } from '@/lib/dateBr';
import { whatsappShareUrl } from '@/components/public/bilhete-utils';
import { horaBr, quandoBr } from './format';

export type AgendaOrigem = 'gira' | 'atividade';

export interface AgendaItem {
  origem: AgendaOrigem;
  id: string;
  tipo: { nome: string; icone: string; cor?: string | null };
  titulo: string;
  inicio: string;
  fim?: string | null;
  local?: string | null;
  minha_participacao?: Record<string, unknown> | null;
}

export interface AgendaResponse {
  inicio: string;
  fim: string;
  itens: AgendaItem[];
}

export type SituacaoSenhas = 'abertas' | 'esgotadas' | 'abrem_em' | 'encerradas' | 'sem_senhas';

export interface GiraDetalhe extends AgendaItem {
  descricao?: string | null;
  orientacoes_corrente?: string | null;
  endereco?: string | null;
  mapa_url?: string | null;
  senhas: { situacao: SituacaoSenhas; abrem_em?: string | null };
  link_publico: string;
  agenda_celular: { ics_path: string; google_url: string };
}

/** Rótulo do filtro por origem (só aparecem as origens que existem na agenda). */
export const ROTULO_ORIGEM: Record<AgendaOrigem, string> = {
  gira: 'Giras',
  atividade: 'Atividades',
};

/** Rota do detalhe na Área. */
export function detalheHref(item: Pick<AgendaItem, 'origem' | 'id'>): string {
  return `/medium/agenda/${item.origem}/${encodeURIComponent(item.id)}`;
}

/** Chave e rótulo do mês em Brasília: { chave: "2026-10", rotulo: "Outubro de 2026" }. */
export function mesDoItem(iso: string): { chave: string; rotulo: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const chave = `${get('year')}-${get('month')}`;
  const rotulo = monthLabelLong(chave);
  return { chave, rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1) };
}

/** Agrupa os itens (já em ordem) por mês de Brasília. */
export function agruparPorMes(itens: AgendaItem[]): { chave: string; rotulo: string; itens: AgendaItem[] }[] {
  const grupos: { chave: string; rotulo: string; itens: AgendaItem[] }[] = [];
  for (const item of itens) {
    const mes = mesDoItem(item.inicio);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.chave === mes.chave) ultimo.itens.push(item);
    else grupos.push({ ...mes, itens: [item] });
  }
  return grupos;
}

/** Já terminou (fim, ou início + 6 h quando não há fim — mesma folga do Início). */
export function jaPassou(item: Pick<AgendaItem, 'inicio' | 'fim'>, agora: Date = new Date()): boolean {
  const fim = item.fim ? new Date(item.fim) : new Date(new Date(item.inicio).getTime() + 6 * 3600 * 1000);
  return fim.getTime() < agora.getTime();
}

/** "sexta, 9 de outubro · 20h30 às 23h30". */
export function horarioCompleto(item: Pick<AgendaItem, 'inicio' | 'fim'>): string {
  const base = quandoBr(item.inicio);
  if (!item.fim) return base;
  const mesmoDia = quandoBr(item.fim).split(' · ')[0] === base.split(' · ')[0];
  return mesmoDia ? `${base} às ${horaBr(item.fim)}` : base;
}

/** Situação das senhas para o público, em linguagem da casa (null = não mostrar). */
export function textoSenhas(senhas: GiraDetalhe['senhas']): string | null {
  switch (senhas.situacao) {
    case 'abertas':
      return 'Senhas abertas para o público';
    case 'esgotadas':
      return 'As senhas para o público acabaram';
    case 'abrem_em':
      return senhas.abrem_em
        ? `Senhas para o público abrem ${quandoBr(senhas.abrem_em)}`
        : 'As senhas para o público ainda vão abrir';
    case 'encerradas':
      return 'As senhas para o público já fecharam';
    default:
      return null;
  }
}

/** Mensagem pronta para divulgar a gira (o médium escolhe o grupo ou o contato no WhatsApp). */
export function textoDivulgar(gira: GiraDetalhe, terreiro?: string | null): string {
  // "Título · Casa" em vez de "na <casa>": o artigo (do/da) depende do nome de cada terreiro.
  const linhas = [terreiro ? `${gira.titulo} · ${terreiro}` : gira.titulo, `Quando: ${quandoBr(gira.inicio)}`];
  if (gira.senhas.situacao === 'abertas') {
    linhas.push(`Pegue sua senha para o atendimento: ${gira.link_publico}`);
  } else if (gira.senhas.situacao === 'abrem_em' && gira.senhas.abrem_em) {
    linhas.push(`As senhas abrem ${quandoBr(gira.senhas.abrem_em)}: ${gira.link_publico}`);
  } else {
    linhas.push(`Veja a agenda da casa: ${gira.link_publico}`);
  }
  linhas.push('Axé!');
  return linhas.join('\n');
}

export function divulgarUrl(gira: GiraDetalhe, terreiro?: string | null): string {
  return whatsappShareUrl(textoDivulgar(gira, terreiro));
}

/** Navegador embutido de app (WhatsApp, Instagram, Facebook): baixar arquivo pode não funcionar. */
export function isInAppBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /WhatsApp|FBAN|FBAV|Instagram/i.test(ua);
}
