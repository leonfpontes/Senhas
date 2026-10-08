/**
 * Troca na escala pela Área do Médium (AM-27) — só chama `/api/v1/medium/*`.
 */
import { apiClient } from '@/services/api_client';
import {
  acaoTrocaHref,
  trocaDaAtividadeHref,
  type TrocaDaAtividade,
  type TrocaMedium,
} from '@/constants/trocas';

export async function trocaDaAtividade(origem: string, id: string): Promise<TrocaDaAtividade> {
  return (await apiClient.get<TrocaDaAtividade>(trocaDaAtividadeHref(origem, id))).data;
}

export async function pedirTroca(
  origem: string,
  id: string,
  colegaId: string | null,
  recado: string,
): Promise<TrocaDaAtividade> {
  const body: { colega_id?: string; recado?: string } = {};
  if (colegaId) body.colega_id = colegaId;
  if (recado.trim()) body.recado = recado.trim();
  return (await apiClient.post<TrocaDaAtividade>(trocaDaAtividadeHref(origem, id), body)).data;
}

export async function acaoTroca(
  trocaId: string,
  acao: 'aceitar' | 'recusar' | 'cancelar',
): Promise<TrocaMedium> {
  return (await apiClient.post<TrocaMedium>(acaoTrocaHref(trocaId, acao))).data;
}
