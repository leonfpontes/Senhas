/**
 * Beta "Bilhete sem internet" (Laboratório, jornadas v2).
 *
 * Depois de emitir, o bilhete fica guardado neste aparelho (localStorage). Quando a rede cai, o
 * service worker mostra a página `/offline`, que lê daqui e mostra a senha: no portão, sem sinal,
 * o número continua à mão. Só o que o próprio consulente já viu na tela; nada vai para o servidor.
 * Bilhetes de giras que já passaram são descartados na leitura.
 */
import type { PublicTicket } from '@/components/public/bilhete-utils';

const CHAVE = 'girahub:bilhetes-guardados';
const LIMITE = 5;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export interface BilheteGuardado {
  ticket: PublicTicket;
  guardadoEm: string;
}

function ler(): BilheteGuardado[] {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as BilheteGuardado[]) : [];
    return Array.isArray(lista) ? lista.filter((b) => b && b.ticket && b.ticket.ticket_number) : [];
  } catch {
    return [];
  }
}

function aindaVale(b: BilheteGuardado, agora: number): boolean {
  const iso = b.ticket.gira_date_iso;
  if (!iso) return true;
  const quando = new Date(iso).getTime();
  return Number.isNaN(quando) || quando + UM_DIA_MS >= agora;
}

export function guardarBilhete(ticket: PublicTicket, agora: Date = new Date()): void {
  try {
    const outros = ler().filter(
      (b) => !(b.ticket.ticket_number === ticket.ticket_number && b.ticket.gira_name === ticket.gira_name && b.ticket.tenant_slug === ticket.tenant_slug),
    );
    const lista = [{ ticket, guardadoEm: agora.toISOString() }, ...outros].slice(0, LIMITE);
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* navegação privada ou armazenamento cheio: a beta só não guarda */
  }
}

/** Bilhetes que ainda valem (gira de hoje em diante), do mais recente para o mais antigo. */
export function bilhetesGuardados(agora: Date = new Date()): BilheteGuardado[] {
  if (typeof window === 'undefined') return [];
  return ler().filter((b) => aindaVale(b, agora.getTime()));
}
