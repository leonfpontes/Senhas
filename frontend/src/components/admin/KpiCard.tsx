import React from 'react';
import Box       from '@mui/material/Box';
import Card      from '@mui/material/Card';
import Skeleton  from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

interface KpiCardProps {
  label:     string;
  value:     string | number;
  icon:      React.ReactNode;
  color:     string;
  loading?:  boolean;
  subtitle?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label, value, icon, color, loading, subtitle,
}) => (
  <Card sx={{ p: 2.5, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width={80} height={40} />
        ) : (
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, lineHeight: 1 }}>
            {value}
          </Typography>
        )}
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 44, height: 44,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: `${color}22`,
          color,
          flexShrink: 0,
          '& svg': { fontSize: '1.4rem' },
        }}
      >
        {icon}
      </Box>
    </Box>
  </Card>
);
