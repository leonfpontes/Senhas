/**
 * AM-17/AM-28 — constantes da presença: vocabulário da Área (D-17/D-18/D-19: nada de "convocado"
 * nem "check-in" para o médium), selos com contraste pela regra do §11.16 (fundo suave → texto
 * `-strong`; marca → `text-brand`) e os textos prontos da Área.
 */
import {
  AVISO_SAUDE,
  CLASSE_TOM,
  OPCOES_MODO_PRESENCA,
  ROTULO_SITUACAO,
  ROTULO_SITUACAO_MEDIUM,
  TOM_SITUACAO,
  acaoHref,
  textoOrigemPresenca,
} from '@/constants/presenca';
import {
  codigoDoQr,
  janelaTexto,
  prazoTexto,
  seloDaAgenda,
} from '@/components/medium/presenca/presencaApi';

describe('constants/presenca', () => {
  it('a Área nunca fala "convocado" nem "check-in"', () => {
    const textos = [...Object.values(ROTULO_SITUACAO_MEDIUM), AVISO_SAUDE];
    for (const t of textos) expect(t).not.toMatch(/convocad|check-?in/i);
    expect(AVISO_SAUDE).toMatch(/Não precisa detalhar questões de saúde/);
  });

  it('todo selo segue a regra de contraste (fundo suave → texto -strong ou da marca)', () => {
    for (const classe of Object.values(CLASSE_TOM)) {
      const fundo = classe.match(/bg-(success|warning|destructive|info|primary)\/\d+/);
      if (fundo) {
        const cor = fundo[1];
        expect(classe).toMatch(
          cor === 'primary' ? /text-brand\b/ : new RegExp(`text-${cor}-strong\\b`),
        );
      }
      expect(classe).not.toMatch(/text-primary\b|-foreground\b(?<!muted-foreground)/);
    }
    expect(Object.keys(TOM_SITUACAO).sort()).toEqual(Object.keys(ROTULO_SITUACAO).sort());
  });

  it('modos na ordem do servidor e textos prontos', () => {
    expect(OPCOES_MODO_PRESENCA.map((o) => o.valor)).toEqual(['confianca', 'app', 'qr']);
    expect(acaoHref('gira', 'g 1', 'checkin')).toBe('/api/v1/medium/atividades/gira/g%201/checkin');
    expect(
      textoOrigemPresenca({ presenca_origem: 'chamada', presenca_registrada_por: 'Dirigente' }),
    ).toBe('Marcado por Dirigente');
    expect(textoOrigemPresenca({ presenca_origem: 'checkin_medium' })).toBe('Marcou “Cheguei”');
  });

  it('código do QR: do link da Área ou digitado', () => {
    expect(codigoDoQr('https://girahub.com.br/medium/agenda/gira/g1?cheguei=k7p2qx')).toBe(
      'K7P2QX',
    );
    expect(codigoDoQr(' k7p 2qx ')).toBe('K7P2QX');
    expect(codigoDoQr('https://girahub.com.br/sem')).toBe('');
  });

  it('selo da Agenda e textos de janela/prazo', () => {
    const base = {
      convocado: true,
      situacao: 'convocado',
      resposta: 'sem_resposta',
      presenca: 'nao_registrada',
      pede_confirmacao: true,
      exige_justificativa: false,
      controla_presenca: true,
      modo_presenca: 'app',
      pode_responder: true,
      responder_ate: '2099-10-10T12:00:00Z',
      pode_checkin: false,
      pode_justificar: false,
      chamada_encerrada: false,
    } as const;
    expect(seloDaAgenda(base as any)).toEqual({ texto: 'Na escala', tom: 'brand' });
    expect(seloDaAgenda({ ...base, situacao: 'dispensado' } as any)).toBeNull();
    expect(seloDaAgenda(null)).toBeNull();
    expect(
      janelaTexto({
        checkin_abre_em: '2099-10-10T11:30:00Z',
        checkin_fecha_em: '2099-10-10T13:00:00Z',
      }),
    ).toBe('das 8h30 às 10h');
    expect(prazoTexto({ justificar_ate: '2099-10-14' })).toBe('até 14/10');
  });
});
