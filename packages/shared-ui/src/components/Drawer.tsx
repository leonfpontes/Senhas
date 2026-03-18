/**
 * T084: Drawer Component
 * Navigation drawer with collapse/expand functionality
 */

'use client';

import React, { useState } from 'react';
import {
  Drawer as MuiDrawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Box,
  Typography,
  IconButton,
  Divider,
} from '@mui/material';
import {
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';

export interface DrawerItem {
  id: string;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  children?: DrawerItem[];
  disabled?: boolean;
}

export interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  items: DrawerItem[];
  width?: number;
  variant?: 'temporary' | 'permanent' | 'persistent';
  anchor?: 'left' | 'right';
}

/**
 * T084: Drawer Component
 * Collapsible navigation drawer with nested menu support
 */
export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  items,
  width = 280,
  variant = 'persistent',
  anchor = 'left',
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const handleToggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const renderDrawerItems = (itemsList: DrawerItem[], depth = 0) => {
    return itemsList.map((item) => (
      <React.Fragment key={item.id}>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            onClick={() => {
              if (item.children && item.children.length > 0) {
                handleToggleExpand(item.id);
              } else {
                item.onClick?.();
              }
            }}
            disabled={item.disabled}
            sx={{
              pl: 2 + depth * 2,
              pr: 2,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            {item.icon && (
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: 'inherit',
                }}
              >
                {item.icon}
              </ListItemIcon>
            )}
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                fontSize: depth === 0 ? '1rem' : '0.875rem',
                fontWeight: depth === 0 ? 600 : 500,
              }}
            />
            {item.children && item.children.length > 0 && (
              expandedItems.has(item.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />
            )}
          </ListItemButton>
        </ListItem>

        {/* Nested items */}
        {item.children && item.children.length > 0 && (
          <Collapse in={expandedItems.has(item.id)} timeout="auto" unmountOnExit>
            {renderDrawerItems(item.children, depth + 1)}
          </Collapse>
        )}
      </React.Fragment>
    ));
  };

  const drawerContent = (
    <Box sx={{ width, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with close button */}
      {variant === 'temporary' && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            p: 1,
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <IconButton onClick={onClose} size="small" aria-label="close drawer">
            <ChevronLeftIcon />
          </IconButton>
        </Box>
      )}

      {/* Navigation items */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List component="nav" sx={{ p: 1 }}>
          {renderDrawerItems(items)}
        </List>
      </Box>

      {/* Footer divider */}
      <Divider sx={{ mt: 'auto' }} />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="textSecondary">
          Senhas v0.5
        </Typography>
      </Box>
    </Box>
  );

  return (
    <MuiDrawer
      anchor={anchor}
      open={open}
      onClose={onClose}
      variant={variant}
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
        },
      }}
    >
      {drawerContent}
    </MuiDrawer>
  );
};

export default Drawer;
