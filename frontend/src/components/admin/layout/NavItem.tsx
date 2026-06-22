import React from 'react';
import Badge          from '@mui/material/Badge';
import ListItem       from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon   from '@mui/material/ListItemIcon';
import ListItemText   from '@mui/material/ListItemText';
import Link           from 'next/link';
import { useTenant }  from '@/providers/ThemeProvider';

interface NavItemProps {
  href:     string;
  text:     string;
  icon:     React.ReactNode;
  active:   boolean;
  indent?:  boolean;
  badge?:   number;
}

export const NavItem: React.FC<NavItemProps> = ({ href, text, icon, active, indent, badge }) => {
  const { config } = useTenant();
  const brandPrimary   = config?.colors?.primary   ?? '#6366F1';
  const brandSecondary = config?.colors?.secondary ?? '#EC4899';
  const brandFont      = config?.colors?.font      ?? '#FFFFFF';

  const selectedSx = active
    ? {
        background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
        color: brandFont,
        '& .MuiListItemIcon-root': { color: brandFont },
        '& .MuiListItemText-primary': { color: brandFont },
        '&:hover': {
          background: `linear-gradient(90deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
          filter: 'brightness(0.95)',
        },
      }
    : {
        '&:hover': { bgcolor: 'action.hover' },
      };

  return (
    <ListItem disablePadding>
      <Link href={href} passHref legacyBehavior>
        <ListItemButton
          selected={active}
          aria-current={active ? 'page' : undefined}
          sx={{
            borderRadius: 2,
            mx: 1,
            pl: indent ? 4 : undefined,
            '& .MuiListItemIcon-root': {
              color: 'text.secondary',
              minWidth: indent ? 36 : 40,
            },
            ...selectedSx,
          }}
        >
          <ListItemIcon>
            {badge && badge > 0 ? (
              <Badge badgeContent={badge} color="error" max={9}>
                {icon}
              </Badge>
            ) : icon}
          </ListItemIcon>
          <ListItemText
            primary={text}
            primaryTypographyProps={{ variant: 'body2', fontWeight: active ? 600 : 500 }}
          />
        </ListItemButton>
      </Link>
    </ListItem>
  );
};
