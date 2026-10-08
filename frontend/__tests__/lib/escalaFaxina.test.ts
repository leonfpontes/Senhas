/**
 * AM-25 — regras puras do planejador da faxina (`lib/escalaFaxina.ts`).
 */
import {
  alternarGrupo,
  convocacoesPrevistas,
  diaDaSemana,
  diasNoMes,
  gradeDoMes,
  horarioTexto,
  listaDeDias,
  mesmoRascunho,
  mudarHorario,
  quantosDias,
  resumoTexto,
  textoResultado,
  type DiaRascunho,
} from '@/lib/escalaFaxina';

const PADRAO = { hora_inicio: '09:00', hora_fim: '12:00' };
const GRUPOS = [
  { id: 'g1', nome: 'G1', cor: 'ambar', total_membros: 3, arquivado: false },
  { id: 'g2', nome: 'G2', cor: 'petroleo', total_membros: 2, arquivado: false },
  { id: 'g3', nome: 'G3', cor: 'violeta', total_membros: 4, arquivado: false },
];
const dia = (data: string, grupo_id: string, hora_inicio = '09:00', hora_fim: string | null = '12:00'): DiaRascunho => ({
  data,
  grupo_id,
  hora_inicio,
  hora_fim,
});

describe('grade do mês', () => {
  it('começa no domingo e completa as semanas (novembro/2026 começa num domingo)', () => {
    const nov = gradeDoMes('2026-11');
    expect(nov.slice(0, 2)).toEqual([1, 2]);
    expect(nov.length % 7).toBe(0);
    expect(nov.filter((d) => d !== null)).toHaveLength(30);
  });

  it('põe células vazias antes do dia 1 (outubro/2026 começa numa quinta)', () => {
    const out = gradeDoMes('2026-10');
    expect(out.slice(0, 5)).toEqual([null, null, null, null, 1]);
    expect(diasNoMes('2026-02')).toBe(28);
    expect(diasNoMes('2028-02')).toBe(29);
    expect(diaDaSemana('2026-11-07')).toBe(6);
  });
});

describe('tocar nos dias', () => {
  it('põe o grupo, tira no segundo toque e aceita dois grupos no mesmo dia com o horário do dia', () => {
    let dias = alternarGrupo([], '2026-11-07', 'g1', PADRAO);
    expect(dias).toEqual([dia('2026-11-07', 'g1')]);
    dias = mudarHorario(dias, '2026-11-07', '08:00', '11:00');
    dias = alternarGrupo(dias, '2026-11-07', 'g2', PADRAO);
    expect(dias).toEqual([dia('2026-11-07', 'g1', '08:00', '11:00'), dia('2026-11-07', 'g2', '08:00', '11:00')]);
    dias = alternarGrupo(dias, '2026-11-07', 'g1', PADRAO);
    expect(dias).toEqual([dia('2026-11-07', 'g2', '08:00', '11:00')]);
  });

  it('compara rascunhos sem depender da ordem', () => {
    const a = [dia('2026-11-14', 'g2'), dia('2026-11-07', 'g1')];
    const b = [dia('2026-11-07', 'g1'), dia('2026-11-14', 'g2')];
    expect(mesmoRascunho(a, b)).toBe(true);
    expect(mesmoRascunho(a, [dia('2026-11-07', 'g1')])).toBe(false);
  });
});

describe('resumo em texto', () => {
  it('"G1: dias 5 e 19 · G2: dias 12 e 26 · G3: dia 3"', () => {
    const dias = [
      dia('2026-11-19', 'g1'),
      dia('2026-11-05', 'g1'),
      dia('2026-11-12', 'g2'),
      dia('2026-11-26', 'g2'),
      dia('2026-11-03', 'g3'),
    ];
    expect(resumoTexto(dias, GRUPOS)).toBe('G1: dias 5 e 19 · G2: dias 12 e 26 · G3: dia 3');
    expect(resumoTexto([], GRUPOS)).toBe('Nenhum dia escolhido ainda.');
    expect(listaDeDias([15, 1, 8])).toBe('dias 1, 8 e 15');
  });

  it('horário curto e convocações previstas', () => {
    expect(horarioTexto('09:00', '12:00')).toBe('9h às 12h');
    expect(horarioTexto('08:30', null)).toBe('8h30');
    const dias = [dia('2026-11-07', 'g1'), dia('2026-11-07', 'g2'), dia('2026-11-14', 'g3')];
    expect(convocacoesPrevistas(dias, GRUPOS)).toBe(3 + 2 + 4);
    expect(quantosDias(dias)).toBe(2);
  });

  it('frase do resultado da publicação', () => {
    const base = { criadas: 0, canceladas: 0, trocadas: 0, reagendadas: 0, atividades: 0, convocados: 0, dispensados: 0, ignorados_passado: 0, fora_da_elegibilidade: 0 };
    expect(textoResultado({ ...base, criadas: 4, convocados: 9 })).toBe('4 faxinas criadas · 9 pessoas postas na escala.');
    expect(textoResultado(base)).toBe('Nada mudou.');
    expect(textoResultado({ ...base, atividades: 2, dispensados: 1 }, true)).toBe(
      '2 faxinas conferidas · 1 pessoa tirada da escala.',
    );
  });
});
