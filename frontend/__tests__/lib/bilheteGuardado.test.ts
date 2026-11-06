import { bilhetesGuardados, guardarBilhete } from '@/lib/bilheteGuardado';
import type { PublicTicket } from '@/components/public/bilhete-utils';

const base: PublicTicket = {
  ticket_number: '0002', status: 'emitted', status_label: 'Emitida', waitlisted: false, cancellable: true,
  cancel_reason: null, gira_name: 'Gira de Caboclos', gira_date: 'Sábado, 8 de novembro às 19h',
  gira_date_iso: '2026-11-08T22:00:00Z', gira_local: null, horario: null, recados: null,
  tenant_name: 'Terreiro Teste', tenant_slug: 'terreiro-teste', tenant_address: null, maps_url: null,
  tenant_logo_url: null, primary_color: null, secondary_color: null, consulente_name: 'Maria', acompanhantes: [],
};

describe('bilhete guardado (beta Bilhete sem internet)', () => {
  beforeEach(() => window.localStorage.clear());

  it('guarda e devolve o bilhete mais recente primeiro, sem repetir', () => {
    guardarBilhete(base, new Date('2026-11-06T15:00:00Z'));
    guardarBilhete({ ...base, ticket_number: '0003' }, new Date('2026-11-06T16:00:00Z'));
    guardarBilhete(base, new Date('2026-11-06T17:00:00Z'));
    const lista = bilhetesGuardados(new Date('2026-11-07T12:00:00Z'));
    expect(lista.map((b) => b.ticket.ticket_number)).toEqual(['0002', '0003']);
    expect(lista[0].guardadoEm).toBe('2026-11-06T17:00:00.000Z');
  });

  it('descarta bilhete de gira que já passou', () => {
    guardarBilhete(base, new Date('2026-11-06T15:00:00Z'));
    expect(bilhetesGuardados(new Date('2026-11-12T12:00:00Z'))).toEqual([]);
  });

  it('armazenamento corrompido não quebra', () => {
    window.localStorage.setItem('girahub:bilhetes-guardados', '{x');
    expect(bilhetesGuardados()).toEqual([]);
  });
});
