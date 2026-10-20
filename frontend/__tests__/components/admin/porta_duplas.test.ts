/**
 * Duplas da noite — regras do rascunho da gaveta (`components/admin/porta/duplas.ts`).
 */
import {
  aplicarSugestoes,
  atendimentosPorMedium,
  definirCambone,
  desmarcarMedium,
  marcarMedium,
  mesmoRascunho,
  paraEnvio,
  rascunhoDe,
  rascunhoVazio,
  resumoAtendimentos,
  sugestoesAplicaveis,
} from '@/components/admin/porta/duplas';

const NOMES = { rita: 'Mãe Rita', carlos: 'Pai Carlos', ana: 'Ana', beto: 'Beto' };

describe('rascunho das duplas', () => {
  it('marca, escolhe cambone e desmarca na ordem em que o porteiro montou', () => {
    let r = marcarMedium(rascunhoVazio(), 'rita', NOMES).rascunho;
    r = marcarMedium(r, 'carlos', NOMES).rascunho;
    r = definirCambone(r, 'rita', 'ana', NOMES).rascunho;
    expect(paraEnvio(r)).toEqual([
      { medium_id: 'rita', cambone_id: 'ana' },
      { medium_id: 'carlos', cambone_id: null },
    ]);
    r = desmarcarMedium(r, 'rita');
    expect(paraEnvio(r)).toEqual([{ medium_id: 'carlos', cambone_id: null }]);
  });

  it('um cambone por médium: escolher quem já tem dupla tira ele de lá, com aviso', () => {
    let r = rascunhoDe([
      { medium_id: 'rita', cambone_id: 'ana' },
      { medium_id: 'carlos', cambone_id: null },
    ]);
    const m = definirCambone(r, 'carlos', 'ana', NOMES);
    r = m.rascunho;
    expect(m.aviso).toBe('Ana saiu da dupla de Mãe Rita.');
    expect(paraEnvio(r)).toEqual([
      { medium_id: 'rita', cambone_id: null },
      { medium_id: 'carlos', cambone_id: 'ana' },
    ]);
  });

  it('quem passa a trabalhar como médium sai da dupla em que era cambone', () => {
    const r = rascunhoDe([{ medium_id: 'rita', cambone_id: 'carlos' }]);
    const m = marcarMedium(r, 'carlos', NOMES);
    expect(m.aviso).toMatch('Pai Carlos saiu da dupla de Mãe Rita');
    expect(paraEnvio(m.rascunho)).toEqual([
      { medium_id: 'rita', cambone_id: null },
      { medium_id: 'carlos', cambone_id: null },
    ]);
  });

  it('sugestões só para médium marcado, sem cambone e com o cambone livre', () => {
    const r = rascunhoDe([
      { medium_id: 'rita', cambone_id: null },
      { medium_id: 'carlos', cambone_id: 'beto' },
    ]);
    const sugestoes = [
      { medium_id: 'rita', cambone_id: 'ana', juntos: 8, giras_do_medium: 10 },
      { medium_id: 'carlos', cambone_id: 'ana', juntos: 3, giras_do_medium: 4 }, // já tem cambone
      { medium_id: 'outro', cambone_id: 'beto', juntos: 2, giras_do_medium: 2 }, // não marcado
    ];
    expect(sugestoesAplicaveis(r, sugestoes).map((s) => s.medium_id)).toEqual(['rita']);
    expect(paraEnvio(aplicarSugestoes(r, sugestoes))).toEqual([
      { medium_id: 'rita', cambone_id: 'ana' },
      { medium_id: 'carlos', cambone_id: 'beto' },
    ]);
  });

  it('compara rascunhos pelo que vai para o servidor', () => {
    const a = rascunhoDe([{ medium_id: 'rita', cambone_id: 'ana' }]);
    expect(mesmoRascunho(a, rascunhoDe([{ medium_id: 'rita', cambone_id: 'ana' }]))).toBe(true);
    expect(mesmoRascunho(a, rascunhoDe([{ medium_id: 'rita', cambone_id: null }]))).toBe(false);
  });
});

describe('atendimentos da noite por médium', () => {
  it('conta as senhas atendidas pelo nome gravado, sem diferenciar grafia', () => {
    const mapa = atendimentosPorMedium([
      { status: 'completed', medium_nome: 'Mãe Rita', chamado_em: '2026-10-20T22:00:00Z' },
      { status: 'completed', medium_nome: ' mãe  rita', chamado_em: '2026-10-20T22:10:00Z' },
      { status: 'emitted', medium_nome: null, chamado_em: null },
      { status: 'no_show', medium_nome: 'Mãe Rita', chamado_em: null },
    ]);
    const rita = mapa.get('mãe rita');
    expect(rita?.total).toBe(2);
    expect(resumoAtendimentos(rita, new Date('2026-10-20T22:14:00Z'))).toBe('2 atendimentos · último há 4 min');
    expect(resumoAtendimentos(undefined)).toBe('Ainda não atendeu');
  });
});
