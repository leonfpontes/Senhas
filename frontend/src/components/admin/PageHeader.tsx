import React from 'react';
import Box       from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  actions?:  React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: { xs: 'flex-start', sm: 'center' },
      justifyContent: 'space-between',
      flexDirection: { xs: 'column', sm: 'row' },
      gap: 2,
      mb: 3,
    }}
  >
    <Box>
      <Typography variant="h5">{title}</Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
  </Box>
);
