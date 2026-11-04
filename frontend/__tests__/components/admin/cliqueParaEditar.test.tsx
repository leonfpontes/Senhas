/**
 * Clique para editar (decisão do Leonardo, 04/11/2026): a linha do DataTable e o CartaoClicavel abrem a
 * edição com clique, Enter ou Espaço, têm nome acessível, e o clique nas outras ações não abre a edição.
 * Sem permissão (sem aoAbrir/onRowClick), não há clique.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable, type ColumnDef } from '@/components/admin/DataTable';
import { CartaoClicavel } from '@/components/admin/CartaoClicavel';

type Linha = { id: string; nome: string };
const COLS: ColumnDef<Linha>[] = [
  { accessorKey: 'nome', header: 'Nome' },
  { id: 'acoes', header: '', cell: ({ row }) => <button type="button">Excluir {row.original.nome}</button> },
];
const DADOS = [{ id: '1', nome: 'Aviso da gira' }];

describe('linha clicável do DataTable', () => {
  it('abre com clique, Enter e Espaço, com o nome "Editar …"', () => {
    const abrir = jest.fn();
    render(<DataTable columns={COLS} data={DADOS} onRowClick={abrir} rowLabel={(l) => `Editar ${l.nome}`} />);
    const linha = screen.getByRole('row', { name: 'Editar Aviso da gira' });
    expect(linha).toHaveAttribute('tabindex', '0');
    fireEvent.click(linha);
    fireEvent.keyDown(linha, { key: 'Enter' });
    fireEvent.keyDown(linha, { key: ' ' });
    expect(abrir).toHaveBeenCalledTimes(3);
  });

  it('o clique no botão de outra ação não abre a edição', () => {
    const abrir = jest.fn();
    render(<DataTable columns={COLS} data={DADOS} onRowClick={abrir} rowLabel={(l) => `Editar ${l.nome}`} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Aviso da gira' }));
    expect(abrir).not.toHaveBeenCalled();
  });

  it('sem onRowClick, a linha não recebe foco nem nome de edição', () => {
    render(<DataTable columns={COLS} data={DADOS} />);
    expect(screen.queryByRole('row', { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe('<CartaoClicavel />', () => {
  it('é um botão "Editar grupo G1" que abre com clique e Enter; arquivar não abre', () => {
    const abrir = jest.fn();
    const arquivar = jest.fn();
    render(
      <CartaoClicavel aoAbrir={abrir} rotulo="Editar grupo G1">
        G1
        <button type="button" onClick={arquivar}>
          Arquivar G1
        </button>
      </CartaoClicavel>,
    );
    const cartao = screen.getByRole('button', { name: 'Editar grupo G1' });
    fireEvent.click(cartao);
    fireEvent.keyDown(cartao, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar G1' }));
    expect(abrir).toHaveBeenCalledTimes(2);
    expect(arquivar).toHaveBeenCalledTimes(1);
  });

  it('sem permissão (sem aoAbrir) não é clicável', () => {
    render(<CartaoClicavel rotulo="Editar grupo G1">G1</CartaoClicavel>);
    expect(screen.queryByRole('button', { name: 'Editar grupo G1' })).not.toBeInTheDocument();
  });
});
