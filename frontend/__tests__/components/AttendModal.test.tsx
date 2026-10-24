/**
 * AttendModal com uma noite cheia de duplas: os cartões ficam no meio que rola e os botões
 * ficam fora dele — no iPad em pé o "Atendido" saía da tela e não dava para concluir.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttendModal from '@/components/AttendModal';

const nomes = ['Gustavo', 'Tchuca', 'Gabrielle', 'Edson', 'Felipe', 'Isadora', 'André', 'Bárbara', 'Feh', 'Rayanne', 'Leonardo', 'Franciele'];

function renderModal(onConfirm = jest.fn()) {
  render(
    <AttendModal
      open
      ticketNumero={42}
      consulenteNome="Consulente"
      onConfirm={onConfirm}
      onClose={jest.fn()}
      duplas={nomes.map((n) => ({ medium_nome: n, cambone_nome: `Cambone de ${n}` }))}
    />,
  );
  return onConfirm;
}

describe('AttendModal — muitas duplas', () => {
  it('cartões no meio que rola; botões fora dele, fixos', () => {
    renderModal();
    const body = screen.getByTestId('attend-modal-body');
    expect(body).toHaveClass('overflow-y-auto');
    expect(within(body).getAllByTestId('attend-dupla')).toHaveLength(nomes.length);
    expect(within(body).queryByRole('button', { name: 'Atendido' })).not.toBeInTheDocument();
    expect(screen.getByTestId('attend-modal')).toHaveClass('flex-col');
  });

  it('tocar no cartão e em Atendido registra a dupla', async () => {
    const onConfirm = renderModal();
    await userEvent.click(screen.getByRole('radio', { name: /Franciele/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Atendido' }));
    expect(onConfirm).toHaveBeenCalledWith({
      medium_nome: 'Franciele',
      cambone_nome: 'Cambone de Franciele',
      atendimento_descricao: undefined,
    });
  });
});
