import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DataTable, Column } from '@/components/admin/DataTable';

const theme = createTheme();

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

interface User {
  id: string;
  name: string;
  email: string;
}

const columns: Column<User>[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
];

const rows: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    wrap(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
  });

  it('renders row data', () => {
    wrap(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows empty message when rows is empty', () => {
    wrap(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('uses custom emptyMessage', () => {
    wrap(
      <DataTable
        columns={columns} rows={[]} rowKey={(r) => r.id}
        emptyMessage="Sem usuários cadastrados."
      />
    );
    expect(screen.getByText('Sem usuários cadastrados.')).toBeInTheDocument();
  });

  it('renders skeleton rows when loading', () => {
    const { container } = wrap(
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading skeletonRows={3} />
    );
    // Should not show empty message
    expect(screen.queryByText('Nenhum registro encontrado.')).not.toBeInTheDocument();
    // Skeleton elements rendered
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    // 3 skeleton rows × 2 columns = 6 skeletons
    expect(skeletons.length).toBe(6);
  });

  it('uses custom render function for column', () => {
    const customColumns: Column<User>[] = [
      { key: 'name', label: 'Nome' },
      { key: 'email', label: 'E-mail', render: (row) => <strong data-testid={`email-${row.id}`}>{row.email}</strong> },
    ];
    wrap(<DataTable columns={customColumns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByTestId('email-1')).toBeInTheDocument();
    expect(screen.getByTestId('email-2')).toBeInTheDocument();
  });

  it('renders pagination when total and onPageChange are provided', () => {
    const onPageChange = jest.fn();
    wrap(
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        total={50} page={0} rowsPerPage={20} onPageChange={onPageChange}
      />
    );
    // MUI TablePagination renders "1–20 de 50" via labelDisplayedRows
    expect(screen.getByText('1–20 de 50')).toBeInTheDocument();
  });

  it('calls onPageChange when navigating', () => {
    const onPageChange = jest.fn();
    wrap(
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        total={50} page={0} rowsPerPage={20} onPageChange={onPageChange}
      />
    );
    const nextBtn = screen.getByTitle('Go to next page');
    fireEvent.click(nextBtn);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('does not render pagination when total is absent', () => {
    const { container } = wrap(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    );
    expect(container.querySelector('.MuiTablePagination-root')).toBeNull();
  });
});
