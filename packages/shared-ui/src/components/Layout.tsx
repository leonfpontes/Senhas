/**
 * T085: Layout Component
 * Main layout wrapper combining AppBar, Drawer, and content area
 */

'use client';

import React, { useState } from 'react';
import { Box, Container, useMediaQuery, useTheme } from '@mui/material';
import AppBar, { AppBarProps } from './AppBar';
import Drawer, { DrawerProps } from './Drawer';

export interface LayoutProps {
  children: React.ReactNode;
  appBarProps: AppBarProps;
  drawerProps: Partial<DrawerProps>;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | false;
  containerPadding?: number;
}

/**
 * T085: Layout Component
 * Provides consistent layout with AppBar, Drawer, and content area
 */
export const Layout: React.FC<LayoutProps> = ({
  children,
  appBarProps,
  drawerProps,
  maxWidth = 'lg',
  containerPadding = 3,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleOpenDrawer = () => {
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  const drawerVariant = isMobile ? 'temporary' : 'persistent';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Drawer */}
      <Drawer
        {...drawerProps}
        open={drawerOpen}
        onClose={handleCloseDrawer}
        variant={drawerVariant}
        width={280}
        anchor="left"
      />

      {/* Main Content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        {/* AppBar */}
        <AppBar {...appBarProps} onMenuClick={handleOpenDrawer} />

        {/* Page Content */}
        <Container
          maxWidth={maxWidth}
          sx={{
            flex: 1,
            py: containerPadding,
            px: {
              xs: 2,
              sm: 3,
              md: containerPadding,
            },
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
  );
};

export default Layout;
