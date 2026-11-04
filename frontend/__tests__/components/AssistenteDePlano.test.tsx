/** Assistente de plano (J1 v2 · 03): nada vem marcado e o plano só aparece com as três respostas. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistenteDePlano } from '@/components/landing/AssistenteDePlano';
import { PLANS } from '@/constants/plans';

// As respostas das três perguntas têm nomes únicos ("Até 2", "Até 15", "Agora não"…).
function responder(_pergunta: RegExp, opcao: string) {
  fireEvent.click(screen.getByRole('radio', { name: opcao }));
}

describe('<AssistenteDePlano />', () => {
  it('começa sem nenhuma resposta marcada e sem plano indicado', () => {
    render(<AssistenteDePlano />);
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
    expect(screen.getByText('Responda as três perguntas para ver o plano.')).toBeInTheDocument();
  });

  it('indica o plano e leva ao cadastro com ele, com o preço da tabela', () => {
    render(<AssistenteDePlano />);
    responder(/giras a casa faz/i, String(PLANS.pro.limits.girasPerMonth));
    responder(/médiuns tem a corrente/i, `Até ${PLANS.pro.limits.mediuns}`);
    responder(/financeiro, estoque/i, 'Agora não');
    expect(screen.getByText(PLANS.pro.label)).toBeInTheDocument();
    expect(screen.getByText(`R$ ${PLANS.pro.price}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Começar com 30 dias grátis/ })).toHaveAttribute('href', '/cadastro?plan=pro');
  });

  it('quando o Gratuito dá conta, indica o Gratuito', () => {
    render(<AssistenteDePlano />);
    responder(/giras a casa faz/i, `Até ${PLANS.free.limits.girasPerMonth}`);
    responder(/médiuns tem a corrente/i, 'Não vou cadastrar');
    responder(/financeiro, estoque/i, 'Agora não');
    expect(screen.getByText(PLANS.free.label)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Criar a conta da casa/ })).toHaveAttribute('href', '/cadastro');
  });
});
