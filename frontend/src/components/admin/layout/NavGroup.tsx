import React from 'react';
import Collapse       from '@mui/material/Collapse';
import List           from '@mui/material/List';
import ListItem       from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon   from '@mui/material/ListItemIcon';
import ListItemText   from '@mui/material/ListItemText';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { NavItem }    from './NavItem';
import { useTenant }  from '@/providers/ThemeProvider';

export interface NavGroupItem {
  href:   string;
  text:   string;
  icon:   React.ReactNode;
  badge?: number;
}

interface NavGroupProps {
  label:       string;
  icon:        React.ReactNode;
  items:       NavGroupItem[];
  open:        boolean;
  onToggle:    () => void;
  activeHref:  string;
}

export const NavGroup: React.FC<NavGroupProps> = ({
  label, icon, items, open, onToggle, activeHref,
}) => {
  const { config } = useTenant();
  const brandPrimary   = config?.colors?.primary   ?? '#6366F1';
  const brandSecondary = config?.colors?.secondary ?? '#EC4899';
  const brandFont      = config?.colors?.font      ?? '#FFFFFF';

  const isGroupActive = items.some((i) => i.href === activeHref);
  const showGroupSelected = isGroupActive && !open;

  return (
    <>
      <ListItem disablePadding>
        <ListItemButton
          onClick={onToggle}
          sx={{
            borderRadius: 2,
            mx: 1,
            '& .MuiListItemIcon-root': { color: 'text.secondary' },
            ...(showGroupSelected && {
              background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
              color: brandFont,
              '& .MuiListItemIcon-root': { color: brandFont },
              '& .MuiListItemText-primary': { color: brandFont },
            }),
          }}
        >
          <ListItemIcon>{icon}</ListItemIcon>
          <ListItemText
            primary={label}
            primaryTypographyProps={{ variant: 'body2', fontWeight: isGroupActive ? 600 : 500 }}
          />
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </ListItemButton>
      </ListItem>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {items.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              text={item.text}
              icon={item.icon}
              active={activeHref === item.href}
              indent
              badge={item.badge}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};
