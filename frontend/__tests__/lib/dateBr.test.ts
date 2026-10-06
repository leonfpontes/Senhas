import {
  addDaysIso,
  addMonthsYm,
  currentMonthBr,
  formatBRL,
  formatDateBr,
  formatDateTimeBr,
  monthLabelLong,
  monthLabelShort,
  monthRangeIso,
  todayBr,
} from '@/lib/dateBr';

describe('lib/dateBr', () => {
  it('todayBr usa o fuso de Brasília, não UTC', () => {
    // 01:30 UTC de 06/10 = 22:30 de 05/10 em Brasília.
    const instante = new Date('2026-10-06T01:30:00Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(todayBr(instante)).toBe('2026-10-05');
    expect(currentMonthBr(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
  });

  it('soma dias e meses sem deslocar o fuso', () => {
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonthsYm('2026-01', -1)).toBe('2025-12');
    expect(addMonthsYm('2026-11', 3)).toBe('2027-02');
  });

  it('monthRangeIso devolve o primeiro e o último dia', () => {
    expect(monthRangeIso('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRangeIso('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('rótulos de mês em pt-BR', () => {
    expect(monthLabelShort('2026-03')).toBe('mar/26');
    expect(monthLabelLong('2026-10')).toBe('outubro de 2026');
  });

  it('formatação de data e moeda', () => {
    expect(formatDateBr('2026-10-05')).toBe('05/10/2026');
    expect(formatDateBr('2026-10-05T23:00:00Z')).toBe('05/10/2026');
    expect(formatDateBr(null)).toBe('—');
    expect(formatDateBr('lixo')).toBe('—');
    expect(formatDateTimeBr('2026-10-06T01:30:00Z')).toMatch(/05\/10\/2026.*22:30/);
    expect(formatBRL(1234.56)).toMatch(/R\$\s1\.234,56/);
    expect(formatBRL(null)).toBe('—');
  });
});
