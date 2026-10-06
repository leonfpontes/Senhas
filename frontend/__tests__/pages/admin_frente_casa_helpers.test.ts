/**
 * Regras puras das telas da frente D (relatório da gira, participantes, auditoria, analytics).
 */
jest.mock('@/pages/admin/admin_layout', () => ({ __esModule: true, default: () => null }));
jest.mock('next/router', () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn(), replace: jest.fn() }) }));

import { getTag, pickUltimaGira, STATUS_LABELS } from '@/pages/admin/relatorio-gira';
import { formToPayload, mensalidadeToCobranca, toNum, turmaLotada } from '@/pages/admin/cursos-presenciais/[id]/participantes';
import { auditLogsToCsv, resourceLabel, RESOURCE_TYPES } from '@/pages/admin/audit-trail';
import { analyticsPresetRange } from '@/pages/admin/analytics';

describe('relatório da gira', () => {
  const giras = [
    { id: 'futura', nome: 'Gira de Exu', is_active: true, data_inicio: '2026-10-20T22:00:00Z' },
    { id: 'ultima', nome: 'Gira de Caboclo', is_active: true, data_inicio: '2026-10-01T22:00:00Z' },
    { id: 'antiga', nome: 'Gira de Preto Velho', is_active: false, data_inicio: '2026-09-01T22:00:00Z' },
  ];

  it('pré-seleciona a gira mais recente que já começou', () => {
    expect(pickUltimaGira(giras, new Date('2026-10-06T12:00:00Z'))).toBe('ultima');
    expect(pickUltimaGira(giras.slice(0, 1), new Date('2026-10-06T12:00:00Z'))).toBe('futura');
    expect(pickUltimaGira([])).toBeNull();
  });

  it('rótulos: Sem senha / Não veio', () => {
    expect(getTag({ is_walk_in: true })).toBe('Sem senha');
    expect(getTag({ is_sponsor: true, is_walk_in: true })).toBe('Associado');
    expect(getTag({})).toBe('Comum');
    expect(STATUS_LABELS.no_show).toBe('Não veio');
  });
});

describe('participantes do curso', () => {
  it('turma lotada só com limite definido', () => {
    expect(turmaLotada(10, 10)).toBe(true);
    expect(turmaLotada(10, 9)).toBe(false);
    expect(turmaLotada(null, 500)).toBe(false);
    expect(turmaLotada(0, 3)).toBe(false);
  });

  it('converte a linha de mensalidade (Decimal em string) para CobrancaItem', () => {
    const item = mensalidadeToCobranca({
      participante_id: 'p1',
      participante_nome: 'Ana',
      status: null,
      valor_mensalidade: '120.00',
      valor_vigente: null,
      valor_pago: null,
      data_pagamento: null,
      observacao: null,
      comprovante_filename: null,
    });
    expect(item).toMatchObject({ id: 'p1', nome: 'Ana', valor_vigente: 120, valor_pago: null });
    expect(toNum('abc')).toBeNull();
  });

  it('payload: mensalidade 0 herda o padrão (null) e pagamento só na edição', () => {
    const form = {
      nome: ' Ana ', data_nascimento: null, celular: '', email: '', valor_mensalidade: 0, observacoes: '',
      pago: true, valor_pago: 80, data_pagamento: '2026-10-05', genero: '', emergencia_contato: '', emergencia_fone: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', tem_plano_saude: false,
      plano_saude_nome: 'X', toma_medicamento: false, medicamentos_nome: '', tem_doenca_tratamento: false,
      doenca_tratamento_nome: '', tem_diabetes: false, outras_doencas: '', cpf: '', rg: '', estado_civil: '',
      profissao: '', experiencia_umbanda: '', contato_contexto_espiritual: '', motivo_busca_desenvolvimento: '',
      interesse_aprendizado: '', ja_conhece_terreiro: null, como_conheceu_terreiro: '', tratamento_psiquiatrico: false,
      tratamento_psiquiatrico_detalhes: '', restricoes_saude: '', aceita_uso_dados: true, aceita_uso_imagem: false,
      comprovante_inscricao_filename: null,
    };
    const create = formToPayload(form, 'create');
    expect(create).toMatchObject({ nome: 'Ana', valor_mensalidade: null, plano_saude_nome: null, aceita_uso_dados: true });
    expect(create).not.toHaveProperty('pago');
    expect(formToPayload(form, 'edit')).toMatchObject({ pago: true, valor_pago: 80 });
  });
});

describe('auditoria', () => {
  it('tem rótulo para todos os tipos de recurso conhecidos e cai no valor cru se desconhecido', () => {
    expect(RESOURCE_TYPES.length).toBeGreaterThan(30);
    expect(resourceLabel('Medium')).toBe('Médium');
    expect(resourceLabel('conta_pagar')).toBe('Conta a pagar');
    expect(resourceLabel('novo_tipo')).toBe('novo_tipo');
  });

  it('CSV com BOM, separador ; e aspas escapadas', () => {
    const csv = auditLogsToCsv([
      { id: '1', action: 'update', resource_type: 'Gira', user_name: 'Leo; Admin', details: { nome: 'a"b' }, created_at: '2026-10-05T12:00:00Z' },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, linha] = csv.slice(1).split('\r\n');
    expect(header).toBe('Data;Usuário;Ação;Recurso;ID do recurso;Detalhes');
    expect(linha).toContain('"Leo; Admin"');
    expect(linha).toContain('Alteração;Gira');
    expect(linha).toContain('"{""nome"":""a\\""b""}"');
  });
});

describe('analytics', () => {
  it('presets terminam hoje e incluem o dia atual', () => {
    expect(analyticsPresetRange(7, '2026-10-06')).toEqual({ from: '2026-09-30', to: '2026-10-06' });
    expect(analyticsPresetRange(30, '2026-10-06')).toEqual({ from: '2026-09-07', to: '2026-10-06' });
  });
});
