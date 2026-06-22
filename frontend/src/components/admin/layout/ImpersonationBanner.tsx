import React from 'react';
import Box       from '@mui/material/Box';
import Button    from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { endImpersonation } from '@/services/api_client';

interface ImpersonationBannerProps {
  userLabel:   string;
  tenantLabel: string;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({
  userLabel,
  tenantLabel,
}) => (
  <Box
    sx={{
      bgcolor: 'warning.main',
      color: 'warning.contrastText',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      py: 0.5,
      px: 2,
      flexWrap: 'wrap',
    }}
  >
    <Typography variant="body2" fontWeight={600}>
      Visualizando como: {userLabel} — Terreiro: {tenantLabel}
    </Typography>
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      onClick={endImpersonation}
      sx={{ borderColor: 'inherit', fontWeight: 600 }}
    >
      Encerrar
    </Button>
  </Box>
);
