/**
 * AM-18 — a função do médium na Área (D-17): "Você é Cambone na gira de sábado" no cartão da
 * escala (Início/Agenda), o selo da Agenda com a função ("Cambone · Vou") e nada de função quando a
 * casa tirou o médium da escala.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({ children, href, ...rest }: any) => (
  <a href={href} {...rest}>
    {children}
  </a>
));
jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  extractApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));
jest.mock('@/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSuccess: jest.fn(), showError: jest.fn() }),
}));

import { EscalaCard } from '@/components/medium/presenca/EscalaCard';
import { fraseDaFuncao, seloDaAgenda } from '@/components/medium/presenca/presencaApi';
import type { ItemPresenca, MinhaParticipacao } from '@/constants/presenca';

// Sábado, 7/11/2026, 20h em Brasília.
const SABADO = '2026-11-07T23:00:00Z';
const QUARTA = new Date('2026-11-04T15:00:00Z');

function participacao(over: Partial<MinhaParticipacao> = {}): MinhaParticipacao {
  return {
    convocado: true,
    situacao: 'convocado',
    resposta: 'sem_resposta',
    presenca: 'nao_registrada',
    grupo: null,
    funcao: 'Cambone',
    pede_confirmacao: true,
    exige_justificativa: true,
    controla_presenca: true,
    modo_presenca: 'confianca',
    pode_responder: true,
    responder_ate: SABADO,
    pode_checkin: false,
    pode_justificar: false,
    chamada_encerrada: false,
    ...over,
  };
}

function item(over: Partial<MinhaParticipacao> = {}, extra: Partial<ItemPresenca> = {}): ItemPresenca {
  return {
    origem: 'gira',
    id: 'g1',
    tipo: { nome: 'Gira', icone: 'gira', cor: null },
    titulo: 'Gira de Caboclos',
    inicio: SABADO,
    fim: null,
    local: null,
    cancelada: false,
    minha_participacao: participacao(over),
    ...extra,
  };
}

describe('fraseDaFuncao', () => {
  it('"Você é Cambone na gira de sábado", de hoje e de amanhã', () => {
    expect(fraseDaFuncao(item(), QUARTA)).toBe('Você é Cambone na gira de sábado');
    expect(fraseDaFuncao(item(), new Date('2026-11-07T12:00:00Z'))).toBe('Você é Cambone na gira de hoje');
    expect(fraseDaFuncao(item(), new Date('2026-11-06T12:00:00Z'))).toBe('Você é Cambone na gira de amanhã');
  });

  it('atividade com escala por função usa o título; sem função ou fora da escala, nada', () => {
    expect(fraseDaFuncao(item({ funcao: 'Cozinha' }, { origem: 'atividade', titulo: 'Reunião' }), QUARTA)).toBe(
      'Você é Cozinha em Reunião de sábado',
    );
    expect(fraseDaFuncao(item({ funcao: null }), QUARTA)).toBeNull();
    expect(fraseDaFuncao(item({ situacao: 'dispensado' }), QUARTA)).toBeNull();
  });
});

describe('seloDaAgenda com a função', () => {
  it('a função vem na frente da situação', () => {
    expect(seloDaAgenda(participacao({ situacao: 'confirmado', resposta: 'vou' }))).toEqual({
      texto: 'Cambone · Vou',
      tom: 'ok',
    });
    expect(seloDaAgenda(participacao())).toEqual({ texto: 'Cambone · Na escala', tom: 'brand' });
    expect(seloDaAgenda(participacao({ pode_responder: false }))).toEqual({ texto: 'Cambone', tom: 'brand' });
    expect(seloDaAgenda(participacao({ funcao: null, situacao: 'confirmado' }))).toEqual({ texto: 'Vou', tom: 'ok' });
    expect(seloDaAgenda(participacao({ situacao: 'dispensado' }))).toBeNull();
  });
});

describe('EscalaCard com função', () => {
  it('cabeçalho "Você é Cambone na gira de …" e o grupo ao lado', () => {
    render(<EscalaCard item={item({ grupo: 'G2' })} compacto />);
    const card = screen.getByTestId('escala-card');
    expect(card).toHaveTextContent(/Você é Cambone na gira de \w+/);
    expect(card).toHaveTextContent('· grupo G2');
    expect(card).not.toHaveTextContent('Você está na escala');
  });

  it('no detalhe (sem cabeçalho): "Você é Cambone"', () => {
    render(<EscalaCard item={item()} semCabecalho />);
    expect(screen.getByTestId('escala-card')).toHaveTextContent('Você é Cambone');
  });

  it('sem função continua "Você está na escala"', () => {
    render(<EscalaCard item={item({ funcao: null })} compacto />);
    expect(screen.getByTestId('escala-card')).toHaveTextContent('Você está na escala');
  });
});
