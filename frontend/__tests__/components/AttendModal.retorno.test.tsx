/**
 * AttendModal com a beta "Retorno do consulente na porta": "Precisa voltar" começa desmarcada,
 * sugere o médium do atendimento e manda o retorno; os retornos de giras anteriores aparecem no
 * topo com "Marcar como resolvido". Sem a beta, nada disso aparece nem é enviado.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttendModal from '@/components/AttendModal';

const duplas = [{ medium_nome: 'Ana', cambone_nome: 'Bia' }];
const retornoAberto = {
  id: 'r1',
  medium_nome: 'Ana',
  entidade: 'Pai Joaquim',
  recado: 'Trazer vela branca',
  criado_em: '2026-10-30T22:00:00Z',
  gira_nome: 'Gira de Pretos Velhos',
  gira_data: '2026-10-30T22:00:00Z',
};

function renderModal(props: Partial<React.ComponentProps<typeof AttendModal>> = {}) {
  const onConfirm = jest.fn();
  render(
    <AttendModal open ticketNumero={7} consulenteNome="Maria" onConfirm={onConfirm} onClose={jest.fn()} duplas={duplas} {...props} />,
  );
  return onConfirm;
}

describe('AttendModal — retorno do consulente', () => {
  it('sem a beta não mostra nem envia o retorno', async () => {
    const onConfirm = renderModal();
    expect(screen.queryByText('Precisa voltar')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Ana/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Atendido' }));
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('retorno');
  });

  it('"Precisa voltar" desmarcada; marcar sugere o médium e envia o retorno', async () => {
    const onConfirm = renderModal({ retornoHabilitado: true });
    const caixa = screen.getByRole('checkbox', { name: /Precisa voltar/ });
    expect(caixa).not.toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Ana/ }));
    await userEvent.click(caixa);
    await userEvent.type(screen.getByLabelText(/Com a entidade/), 'Pai Joaquim');
    await userEvent.click(screen.getByRole('button', { name: 'Atendido' }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ medium_nome: 'Ana', retorno: { medium_nome: 'Ana', entidade: 'Pai Joaquim', recado: undefined } }),
    );
  });

  it('mostra o retorno de gira anterior e resolve', async () => {
    const onResolver = jest.fn();
    renderModal({ retornoHabilitado: true, retornos: [retornoAberto], canResolverRetorno: true, onResolverRetorno: onResolver });
    expect(screen.getByText('Esta pessoa tem retorno')).toBeInTheDocument();
    expect(screen.getByText('Voltar com Ana · Pai Joaquim')).toBeInTheDocument();
    expect(screen.getByText('Trazer vela branca')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Marcar como resolvido/ }));
    expect(onResolver).toHaveBeenCalledWith(retornoAberto);
  });

  it('no Editar, desmarcar tira o retorno anotado (null)', async () => {
    const onConfirm = renderModal({
      retornoHabilitado: true,
      editMode: true,
      initialValues: { medium_nome: 'Ana' },
      retornoMarcado: { id: 'r2', medium_nome: 'Ana', entidade: null, recado: null, resolvido: false },
    });
    const caixa = screen.getByRole('checkbox', { name: /Precisa voltar/ });
    expect(caixa).toBeChecked();
    await userEvent.click(caixa);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ retorno: null }));
  });
});
