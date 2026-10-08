/**
 * AM-08 — listas fechadas dos tipos de atividade. As chaves espelham o backend
 * (`backend/src/models/atividades.py`, conferido em `backend/tests/unit/test_am08_atividades.py`);
 * aqui: todo ícone tem desenho, a cor é a paleta AA dos grupos (ou a cor da casa) e a feature de
 * grupo `escalas` está no grupo "Corrente" da tela de perfis.
 */
import {
  CORES_TIPO,
  ICONES_ATIVIDADE,
  OPCOES_CONVOCACAO,
  OPCOES_ELEGIVEIS,
  OPCOES_MODO_ESCALA,
  OPCOES_VISIBILIDADE,
  corDoTipo,
  rotuloDe,
} from '@/constants/atividades';
import { CORES_GRUPO } from '@/constants/correnteGrupos';
import { FEATURE_LABELS } from '@/constants/permissionFeatures';
import { ICONES_DE_ATIVIDADE, iconeDaAtividade } from '@/lib/icons';

describe('constants/atividades', () => {
  it('todo ícone da lista tem desenho próprio e a chave desconhecida cai na estrela', () => {
    const chaves = ICONES_ATIVIDADE.map((i) => i.valor);
    expect(Object.keys(ICONES_DE_ATIVIDADE)).toEqual(chaves);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const chave of chaves) expect(iconeDaAtividade(chave)).toBe(ICONES_DE_ATIVIDADE[chave]);
    expect(iconeDaAtividade('foguete')).toBe(ICONES_DE_ATIVIDADE.estrela);
    expect(iconeDaAtividade(null)).toBe(ICONES_DE_ATIVIDADE.estrela);
  });

  it('cor do tipo: paleta dos grupos (AA com branco) ou null = cor da casa', () => {
    expect(CORES_TIPO).toBe(CORES_GRUPO);
    expect(corDoTipo('petroleo')).toBe('#0f766e');
    expect(corDoTipo(null)).toBeNull();
    expect(corDoTipo('#ff0000')).toBeNull();
  });

  it('opções na ordem do backend e com rótulo sem jargão', () => {
    expect(OPCOES_ELEGIVEIS.map((o) => o.valor)).toEqual(['todos', 'atendimento', 'cambones', 'grupos']);
    expect(OPCOES_CONVOCACAO.map((o) => o.valor)).toEqual(['todos_elegiveis', 'so_escalados']);
    expect(OPCOES_MODO_ESCALA.map((o) => o.valor)).toEqual(['nenhuma', 'grupos_por_dia', 'funcoes']);
    expect(OPCOES_VISIBILIDADE.map((o) => o.valor)).toEqual(['corrente', 'convocados']);
    // Glossário (D-17): na tela, "na escala" — nunca "convocado".
    const textos = [...OPCOES_CONVOCACAO, ...OPCOES_VISIBILIDADE].map((o) => `${o.rotulo} ${o.ajuda ?? ''}`).join(' ');
    expect(textos).not.toMatch(/convoca/i);
    expect(rotuloDe(OPCOES_ELEGIVEIS, 'cambones')).toBe('Só cambones');
    expect(rotuloDe(OPCOES_ELEGIVEIS, 'x')).toBe('');
  });

  it('feature de grupo "escalas" no grupo Corrente', () => {
    expect(FEATURE_LABELS.escalas).toEqual({ label: 'Atividades e escalas', group: 'Corrente' });
  });
});
