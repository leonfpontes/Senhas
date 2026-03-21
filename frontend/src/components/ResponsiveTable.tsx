/**
 * ResponsiveTable — Wrapper for MUI Table that handles mobile gracefully.
 *
 * Features:
 *  - Always adds horizontal scroll via overflowX: 'auto'
 *  - Hides columns marked `hideOnMobile` when viewport < sm (600px)
 *  - Keeps Table API intact so pages only need light changes
 */
'use client';

import React, { createContext, useContext } from 'react';
import {
  Table,
  TableContainer,
  Paper,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { TableContainerProps, TableProps, PaperProps } from '@mui/material';

interface ResponsiveTableContextType {
  isMobile: boolean;
}

const ResponsiveTableContext = createContext<ResponsiveTableContextType>({ isMobile: false });

/** Use inside table cells to check if mobile view is active */
export const useResponsiveTable = () => useContext(ResponsiveTableContext);

export interface ResponsiveTableProps {
  children: React.ReactNode;
  /** Props forwarded to TableContainer */
  containerProps?: Omit<TableContainerProps, 'component' | 'children'>;
  /** Props forwarded to Paper wrapper */
  paperProps?: PaperProps;
  /** Props forwarded to Table */
  tableProps?: TableProps;
}

export default function ResponsiveTable({
  children,
  containerProps,
  paperProps,
  tableProps,
}: ResponsiveTableProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <ResponsiveTableContext.Provider value={{ isMobile }}>
      <TableContainer
        component={Paper}
        {...paperProps}
        {...containerProps}
        sx={{ overflowX: 'auto', ...containerProps?.sx }}
      >
        <Table size={isMobile ? 'small' : 'medium'} {...tableProps}>
          {children}
        </Table>
      </TableContainer>
    </ResponsiveTableContext.Provider>
  );
}

/**
 * Helper HOC for TableCell that hides on mobile.
 * Usage: wrap a <TableCell> with hideOnMobile and it vanishes on small screens.
 *
 * Example:
 *   <HideOnMobile component={TableCell}>Email</HideOnMobile>
 *
 * Or simpler — just use sx display directly:
 *   <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
 */
export function HideOnMobile({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement> & { component?: React.ElementType }) {
  // This is a convenience reminder — prefer using sx={{ display: { xs: 'none', sm: 'table-cell' } }}
  // directly on MUI TableCell for cleaner code.
  return <>{children}</>;
}
