import React from 'react';
import Box               from '@mui/material/Box';
import Skeleton          from '@mui/material/Skeleton';
import Table             from '@mui/material/Table';
import TableBody         from '@mui/material/TableBody';
import TableCell         from '@mui/material/TableCell';
import TableContainer    from '@mui/material/TableContainer';
import TableHead         from '@mui/material/TableHead';
import TablePagination   from '@mui/material/TablePagination';
import TableRow          from '@mui/material/TableRow';
import Typography        from '@mui/material/Typography';

export interface Column<T> {
  key:      string;
  label:    string;
  render?:  (row: T) => React.ReactNode;
  align?:   'left' | 'center' | 'right';
  width?:   string | number;
}

interface DataTableProps<T> {
  columns:       Column<T>[];
  rows:          T[];
  rowKey:        (row: T) => string | number;
  loading?:      boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  total?:        number;
  page?:         number;
  rowsPerPage?:  number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  skeletonRows = 6,
  emptyMessage = 'Nenhum registro encontrado.',
  total,
  page,
  rowsPerPage = 20,
  onPageChange,
}: DataTableProps<T>) {
  const hasPagination = typeof total === 'number' && typeof page === 'number' && onPageChange;

  return (
    <Box sx={{ width: '100%' }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell key={col.key} align={col.align ?? 'left'} width={col.width}>
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton variant="text" height={20} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.length === 0
              ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} sx={{ py: 6, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        {emptyMessage}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )
              : rows.map((row) => (
                  <TableRow key={rowKey(row)}>
                    {columns.map((col) => (
                      <TableCell key={col.key} align={col.align ?? 'left'}>
                        {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </TableContainer>

      {hasPagination && (
        <TablePagination
          component="div"
          count={total!}
          page={page!}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[]}
          onPageChange={(_, newPage) => onPageChange!(newPage)}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      )}
    </Box>
  );
}
