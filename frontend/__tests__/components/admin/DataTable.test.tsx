import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataTable, type ColumnDef, pageRangeLabel } from '@/components/admin/DataTable';

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

const columns: ColumnDef<User>[] = [
  { accessorKey: 'name', header: 'Nome', meta: { mobile: true } },
  { accessorKey: 'email', header: 'E-mail' },
  { accessorKey: 'age', header: 'Idade', meta: { align: 'right', mobile: true } },
];

const rows: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com', age: 31 },
  { id: '2', name: 'Bob', email: 'bob@example.com', age: 25 },
  { id: '3', name: 'Carla', email: 'carla@example.com', age: 40 },
];

const rowId = (u: User) => u.id;

/** Faz `useMediaQuery` responder como celular (< 640px). */
function mockMobile(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

afterEach(() => mockMobile(false));

describe('DataTable (TanStack Table v8)', () => {
  it('renders column headers and row data', () => {
    render(<DataTable columns={columns} data={rows} getRowId={rowId} />);
    expect(screen.getByRole('columnheader', { name: /Nome/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /E-mail/ })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the empty state (default and custom message)', () => {
    const { rerender } = render(<DataTable columns={columns} data={[]} getRowId={rowId} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum registro encontrado.');

    rerender(
      <DataTable columns={columns} data={[]} getRowId={rowId} emptyMessage="Sem usuários cadastrados." />
    );
    expect(screen.getByText('Sem usuários cadastrados.')).toBeInTheDocument();
  });

  it('renders skeleton rows when loading (and no empty state)', () => {
    render(<DataTable columns={columns} data={[]} getRowId={rowId} loading skeletonRows={3} />);
    expect(screen.queryByText('Nenhum registro encontrado.')).not.toBeInTheDocument();
    // 3 linhas × 3 colunas
    expect(screen.getAllByTestId('data-table-skeleton')).toHaveLength(9);
  });

  it('uses a custom cell renderer', () => {
    const custom: ColumnDef<User>[] = [
      { accessorKey: 'name', header: 'Nome' },
      {
        accessorKey: 'email',
        header: 'E-mail',
        cell: ({ row }) => <strong data-testid={`email-${row.original.id}`}>{row.original.email}</strong>,
      },
    ];
    render(<DataTable columns={custom} data={rows} getRowId={rowId} />);
    expect(screen.getByTestId('email-1')).toBeInTheDocument();
    expect(screen.getByTestId('email-2')).toBeInTheDocument();
  });

  it('sorts on header click (asc, desc) and exposes aria-sort', () => {
    render(<DataTable columns={columns} data={rows} getRowId={rowId} />);
    const header = screen.getByRole('columnheader', { name: /Idade/ });
    const bodyRows = () =>
      within(screen.getAllByRole('rowgroup')[1])
        .getAllByRole('row')
        .map((r) => within(r).getAllByRole('cell')[0].textContent);

    expect(bodyRows()).toEqual(['Alice', 'Bob', 'Carla']);

    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(bodyRows()).toEqual(['Bob', 'Alice', 'Carla']);

    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(bodyRows()).toEqual(['Carla', 'Alice', 'Bob']);
  });

  it('paginates on the client with pageSize', () => {
    render(<DataTable columns={columns} data={rows} getRowId={rowId} pageSize={2} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Carla')).not.toBeInTheDocument();
    expect(screen.getByText('1–2 de 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText('Carla')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('3–3 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('server-side pagination: controlled state, rowCount and onPaginationChange', () => {
    const onPaginationChange = jest.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={rowId}
        manualPagination
        rowCount={50}
        pagination={{ pageIndex: 0, pageSize: 20 }}
        onPaginationChange={onPaginationChange}
      />
    );
    // A data é a página atual, inteira
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('1–20 de 50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(onPaginationChange).toHaveBeenCalledTimes(1);
    const updater = onPaginationChange.mock.calls[0][0];
    const next = typeof updater === 'function' ? updater({ pageIndex: 0, pageSize: 20 }) : updater;
    expect(next).toEqual({ pageIndex: 1, pageSize: 20 });
  });

  it('does not render pagination when neither pageSize nor pagination are given', () => {
    render(<DataTable columns={columns} data={rows} getRowId={rowId} />);
    expect(screen.queryByRole('navigation', { name: 'Paginação da tabela' })).not.toBeInTheDocument();
  });

  it('row selection with checkboxes (controlled)', () => {
    const onRowSelectionChange = jest.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={rowId}
        enableRowSelection
        rowSelection={{}}
        onRowSelectionChange={onRowSelectionChange}
      />
    );
    const boxes = screen.getAllByRole('checkbox', { name: 'Selecionar linha' });
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[1]);
    expect(onRowSelectionChange).toHaveBeenCalled();
    const updater = onRowSelectionChange.mock.calls[0][0];
    const next = typeof updater === 'function' ? updater({}) : updater;
    expect(next).toEqual({ '2': true });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas' }));
    const all = onRowSelectionChange.mock.calls[1][0];
    expect(typeof all === 'function' ? all({}) : all).toEqual({ '1': true, '2': true, '3': true });
  });

  it('calls onRowClick with the row data', () => {
    const onRowClick = jest.fn();
    render(<DataTable columns={columns} data={rows} getRowId={rowId} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Bob'));
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  describe('modo cartão (< 640px)', () => {
    beforeEach(() => mockMobile(true));

    it('stacks only the columns flagged meta.mobile when renderCard is absent', () => {
      render(<DataTable columns={columns} data={rows} getRowId={rowId} data-testid="tbl" />);
      expect(screen.getByTestId('tbl')).toHaveAttribute('data-mode', 'cards');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
      expect(within(items[0]).getByText('Alice')).toBeInTheDocument();
      expect(within(items[0]).getByText('31')).toBeInTheDocument();
      // E-mail não está marcado como mobile → fica de fora do cartão
      expect(within(items[0]).queryByText('alice@example.com')).not.toBeInTheDocument();
    });

    it('uses renderCard when provided', () => {
      render(
        <DataTable
          columns={columns}
          data={rows}
          getRowId={rowId}
          renderCard={(u) => <div data-testid={`card-${u.id}`}>{u.email}</div>}
        />
      );
      expect(screen.getByTestId('card-2')).toHaveTextContent('bob@example.com');
    });

    it('shows empty state and loading in card mode too', () => {
      const { rerender } = render(<DataTable columns={columns} data={[]} getRowId={rowId} />);
      expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
      rerender(<DataTable columns={columns} data={[]} getRowId={rowId} loading />);
      expect(screen.getAllByTestId('data-table-skeleton').length).toBeGreaterThan(0);
    });
  });
});

describe('pageRangeLabel', () => {
  it('formats ranges', () => {
    expect(pageRangeLabel(0, 20, 50)).toBe('1–20 de 50');
    expect(pageRangeLabel(2, 20, 50)).toBe('41–50 de 50');
    expect(pageRangeLabel(0, 20, 0)).toBe('0 de 0');
  });
});
