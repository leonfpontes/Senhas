/**
 * T083: AppBar Component
 * Responsive Material-UI AppBar with tenant logo and navigation
 */

'use client';

import React, { useState } from 'react';
import {
  AppBar as MuiAppBar,
  Toolbar,
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

export interface AppBarProps {
  title: string;
  logoUrl?: string;
  tenantName?: string;
  onLogout?: () => void;
  onMenuClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onSettingsClick?: () => void;
  variant?: 'regular' | 'outlined';
}

/**
 * T083: AppBar Component
 * Responsive app bar with tenant logo, title, and user menu
 */
export const AppBar: React.FC<AppBarProps> = ({
  title,
  logoUrl,
  tenantName,
  onLogout,
  onMenuClick,
  onSettingsClick,
  variant = 'regular',
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    onMenuClick?.(event);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    onLogout?.();
  };

  return (
    <>
      <MuiAppBar position="sticky" variant={variant}>
        <Toolbar>
          {/* Logo and Title */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flex: 1,
            }}
          >
            {logoUrl && (
              <Avatar
                src={logoUrl}
                alt={tenantName || 'Tenant Logo'}
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                }}
              />
            )}
            <Box>
              <Typography
                variant="h6"
                component="span"
                sx={{
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {title}
              </Typography>
              {tenantName && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    opacity: 0.9,
                  }}
                >
                  {tenantName}
                </Typography>
              )}
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onSettingsClick && (
              <IconButton
                color="inherit"
                onClick={onSettingsClick}
                aria-label="settings"
                title="Settings"
              >
                <SettingsIcon />
              </IconButton>
            )}

            <IconButton
              color="inherit"
              onClick={handleMenu}
              aria-label="user menu"
              aria-controls="user-menu"
              aria-haspopup="true"
              title="User options"
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </MuiAppBar>

      {/* User Menu */}
      <Menu
        id="user-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handleLogout}>
          <LogoutIcon sx={{ mr: 1 }} />
          Logout
        </MenuItem>
      </Menu>
    </>
  );
};

export default AppBar;
