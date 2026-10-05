/**
 * Tests for utils/giraSenhaDefaults — sugestões da configuração de senhas.
 */
import {
  DEFAULT_MAX_TICKETS,
  formatWindowDuration,
  isShortWindow,
  releaseWindowHours,
  suggestMaxTickets,
  suggestReleaseWindow,
  toLocalDatetimeInput,
} from '@/utils/giraSenhaDefaults';

describe('suggestMaxTickets', () => {
  it('sem histórico usa o padrão', () => {
    expect(suggestMaxTickets([])).toBe(DEFAULT_MAX_TICKETS);
    expect(suggestMaxTickets([{ id: 'a', max_tickets: null }, { id: 'b', max_tickets: 0 }])).toBe(DEFAULT_MAX_TICKETS);
  });

  it('usa a mediana das giras configuradas, ignorando a própria', () => {
    const giras = [
      { id: 'a', max_tickets: 10 },
      { id: 'b', max_tickets: 50 },
      { id: 'c', max_tickets: 16 },
      { id: 'nova', max_tickets: 999 },
    ];
    expect(suggestMaxTickets(giras, 'nova')).toBe(16);
  });

  it('mediana de quantidade par arredonda', () => {
    expect(suggestMaxTickets([{ id: 'a', max_tickets: 10 }, { id: 'b', max_tickets: 15 }])).toBe(13);
  });
});

describe('suggestReleaseWindow', () => {
  const now = new Date(2026, 9, 5, 14, 2, 30); // 05/10 14:02:30 local

  it('vai de agora (próximos 5 min) até o início da gira', () => {
    const gira = new Date(2026, 9, 8, 19, 30);
    expect(suggestReleaseWindow(gira.toISOString(), now)).toEqual({
      start: '2026-10-05T14:05',
      end: '2026-10-08T19:30',
    });
  });

  it('horário já múltiplo de 5 não avança', () => {
    const exact = new Date(2026, 9, 5, 14, 10, 0);
    expect(suggestReleaseWindow(new Date(2026, 9, 6, 20, 0).toISOString(), exact)?.start).toBe('2026-10-05T14:10');
  });

  it('gira que já começou (ou começa em menos de 5 min) não tem sugestão', () => {
    expect(suggestReleaseWindow(new Date(2026, 9, 5, 13, 0).toISOString(), now)).toBeNull();
    expect(suggestReleaseWindow(new Date(2026, 9, 5, 14, 4).toISOString(), now)).toBeNull();
    expect(suggestReleaseWindow('lixo', now)).toBeNull();
  });
});

describe('janela curta', () => {
  it('calcula a duração e marca abaixo de 3 horas', () => {
    expect(releaseWindowHours('2026-10-06T19:00', '2026-10-06T20:00')).toBe(1);
    expect(isShortWindow('2026-10-06T19:00', '2026-10-06T20:00')).toBe(true);
    expect(isShortWindow('2026-10-06T12:00', '2026-10-06T15:00')).toBe(false);
    expect(isShortWindow('2026-10-05T12:00', '2026-10-06T19:00')).toBe(false);
  });

  it('janela inválida ou vazia não dispara aviso', () => {
    expect(releaseWindowHours('', '2026-10-06T20:00')).toBeNull();
    expect(isShortWindow('2026-10-06T20:00', '2026-10-06T19:00')).toBe(false);
  });

  it('formata a duração em português', () => {
    expect(formatWindowDuration(0.75)).toBe('45 minutos');
    expect(formatWindowDuration(1)).toBe('1 hora');
    expect(formatWindowDuration(2.5)).toBe('2,5 horas');
  });

  it('toLocalDatetimeInput preenche com zeros', () => {
    expect(toLocalDatetimeInput(new Date(2026, 0, 3, 4, 5))).toBe('2026-01-03T04:05');
  });
});
