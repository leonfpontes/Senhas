/**
 * Presença na Área do Médium (AM-17/AM-28) — chamadas e textos prontos.
 *
 * Só chama `/api/v1/medium/atividades/{origem}/{id}/{resposta|checkin|justificativa}`. Os textos
 * seguem o vocabulário decidido (D-17/D-18/D-19): "Você está na escala", "Vou"/"Não vou",
 * "Cheguei", "Conte o motivo" — nunca "convocado" nem "check-in".
 */
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import {
  acaoHref,
  type ItemPresenca,
  type MinhaParticipacao,
  type TomSituacao,
} from '@/constants/presenca';
import { diaMesCurto, horaBr } from '@/components/medium/format';

export type AlvoPresenca = Pick<ItemPresenca, 'origem' | 'id'>;

export async function responder(
  alvo: AlvoPresenca,
  resposta: 'vou' | 'nao_vou',
  justificativa?: string,
): Promise<MinhaParticipacao> {
  const res = await apiClient.post<MinhaParticipacao>(acaoHref(alvo.origem, alvo.id, 'resposta'), {
    resposta,
    ...(justificativa !== undefined ? { justificativa } : {}),
  });
  return res.data;
}

export async function cheguei(alvo: AlvoPresenca, codigo?: string): Promise<MinhaParticipacao> {
  const res = await apiClient.post<MinhaParticipacao>(acaoHref(alvo.origem, alvo.id, 'checkin'), {
    codigo: codigo ?? null,
  });
  return res.data;
}

export async function contarMotivo(
  alvo: AlvoPresenca,
  justificativa: string,
): Promise<MinhaParticipacao> {
  const res = await apiClient.post<MinhaParticipacao>(
    acaoHref(alvo.origem, alvo.id, 'justificativa'),
    {
      justificativa,
    },
  );
  return res.data;
}

/** Código do erro da API (`details.error_code`), ex.: `QR_INVALIDO`, `FORA_DA_JANELA`. */
export function codigoDoErro(err: unknown): string | null {
  const data = (err as { response?: { data?: { details?: { error_code?: unknown } } } })?.response
    ?.data;
  const codigo = data?.details?.error_code;
  return typeof codigo === 'string' ? codigo : null;
}

export function mensagemDoErro(err: unknown, padrao: string): string {
  return extractApiErrorMessage(err, padrao);
}

/** Impersonando (suporte): a Área é só leitura — as ações somem (o servidor também recusa). */
export function estaImpersonando(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem('impersonating'));
  } catch {
    return false;
  }
}

/** Selo curto da Agenda para quem está na escala (null = não mostra). */
export function seloDaAgenda(
  p: MinhaParticipacao | null | undefined,
): { texto: string; tom: TomSituacao } | null {
  if (!p) return null;
  switch (p.situacao) {
    case 'presente':
      return { texto: 'Presente', tom: 'ok' };
    case 'ausente':
      return { texto: 'Ausente', tom: 'bad' };
    case 'ausente_justificado':
      return { texto: 'Ausência com motivo', tom: 'warn' };
    case 'confirmado':
      return { texto: 'Vou', tom: 'ok' };
    case 'ausencia_avisada':
      return { texto: 'Não vou', tom: 'warn' };
    case 'dispensado':
    case 'substituido':
      return null;
    default:
      return p.pode_responder ? { texto: 'Na escala', tom: 'brand' } : null;
  }
}

/** "das 8h30 às 10h" — janela do "Cheguei". */
export function janelaTexto(
  p: Pick<MinhaParticipacao, 'checkin_abre_em' | 'checkin_fecha_em'>,
): string | null {
  if (!p.checkin_abre_em || !p.checkin_fecha_em) return null;
  return `das ${horaBr(p.checkin_abre_em)} às ${horaBr(p.checkin_fecha_em)}`;
}

/** "até 14/10" — prazo para contar o motivo. */
export function prazoTexto(p: Pick<MinhaParticipacao, 'justificar_ate'>): string | null {
  return p.justificar_ate ? `até ${diaMesCurto(p.justificar_ate)}` : null;
}

/** Extrai o código de um QR lido (link da Área com `?cheguei=` ou o código puro). */
export function codigoDoQr(lido: string): string {
  const texto = (lido || '').trim();
  try {
    if (/^https?:\/\//i.test(texto) || texto.startsWith('/')) {
      const url = new URL(texto, 'https://girahub.local');
      return (url.searchParams.get('cheguei') || '').toUpperCase();
    }
  } catch {
    /* não é link: usa como veio */
  }
  return texto.replace(/[^0-9a-z]/gi, '').toUpperCase();
}
