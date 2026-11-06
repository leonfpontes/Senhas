/**
 * Clique para editar (decisão do Leonardo, 04/11/2026): a linha do DataTable e o CartaoClicavel abrem a
 * edição com clique, Enter ou Espaço, têm nome acessível, e o clique nas outras ações não abre a edição.
 * Sem permissão (sem aoAbrir/onRowClick), não há clique.
 */
import React from 'react';
import { createPortal } from 'react-dom';
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

  it('clique num menu aberto em portal (fora da linha) não abre a edição', () => {
    const abrir = jest.fn();
    const cols: ColumnDef<Linha>[] = [
      { accessorKey: 'nome', header: 'Nome' },
      { id: 'menu', header: '', cell: () => createPortal(<span role="menuitem">Cancelar lançamento</span>, document.body) },
    ];
    render(<DataTable columns={cols} data={DADOS} onRowClick={abrir} rowLabel={(l) => `Editar ${l.nome}`} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar lançamento' }));
    expect(abrir).not.toHaveBeenCalled();
  });

  it('isRowClickable: só as linhas permitidas abrem', () => {
    const abrir = jest.fn();
    render(
      <DataTable columns={COLS} data={[...DADOS, { id: '2', nome: 'Outro' }]} onRowClick={abrir} rowLabel={(l) => `Editar ${l.nome}`} isRowClickable={(l) => l.id === '1'} />,
    );
    expect(screen.getAllByRole('row', { name: /^Editar / })).toHaveLength(1);
  });

  it('sem onRowClick, a linha não recebe foco nem nome de edição', () => {
    render(<DataTable columns={COLS} data={DADOS} />);
    expect(screen.queryByRole('row', { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe('<CartaoClicavel />', () => {
  it('tem o botão "Editar grupo G1" (sem botão dentro de botão); arquivar não abre a edição', () => {
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
    // Um <button> de verdade esticado no cartão: Enter e Espaço são do próprio navegador, e não há botão
    // dentro de botão (arquivar fica fora dele).
    const editar = screen.getByRole('button', { name: 'Editar grupo G1' });
    expect(editar.tagName).toBe('BUTTON');
    fireEvent.click(editar);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar G1' }));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(arquivar).toHaveBeenCalledTimes(1);
    expect(editar.contains(screen.getByRole('button', { name: 'Arquivar G1' }))).toBe(false);
  });

  it('sem permissão (sem aoAbrir) não é clicável', () => {
    render(<CartaoClicavel rotulo="Editar grupo G1">G1</CartaoClicavel>);
    expect(screen.queryByRole('button', { name: 'Editar grupo G1' })).not.toBeInTheDocument();
  });
});
