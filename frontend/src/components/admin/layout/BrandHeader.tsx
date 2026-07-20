import React from 'react';
import Avatar    from '@mui/material/Avatar';
import Box       from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { useTenant } from '@/providers/ThemeProvider';

interface BrandHeaderProps {
  showClose?: boolean;
  onClose?:   () => void;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({ showClose, onClose }) => {
  const { tenantName, logoUrl, config } = useTenant();
  const brandPrimary   = config?.colors?.primary   ?? '#6366F1';
  const brandSecondary = config?.colors?.secondary ?? '#EC4899';
  const brandFont      = config?.colors?.font      ?? '#FFFFFF';

  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => { setLogoFailed(false); }, [logoUrl]);

  return (
    <Box
      sx={(theme) => ({
        ...theme.mixins.toolbar,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        // 'to left' places brandPrimary at the right edge, where this block
        // meets AdminTopbar's own gradient (which starts at brandPrimary on
        // its left edge) — keeps the color continuous across the seam.
        background: `linear-gradient(to left, ${brandPrimary} 0%, ${brandSecondary} 100%)`,
        position: 'relative',
        flexShrink: 0,
      })}
    >
      {showClose && (
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Fechar menu"
          sx={{
            position: 'absolute',
            top: 8, right: 8,
            color: brandFont, opacity: 0.8,
            '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.15)' },
          }}
        >
          <ChevronLeftIcon />
        </IconButton>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {logoUrl && !logoFailed ? (
          <Box
            component="img"
            src={logoUrl}
            alt="Logo do terreiro"
            onError={() => setLogoFailed(true)}
            sx={{
              width: 48, height: 48,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid rgba(255,255,255,0.5)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              flexShrink: 0,
            }}
          />
        ) : (
          <Avatar
            sx={{
              width: 48, height: 48,
              bgcolor: 'rgba(255,255,255,0.2)',
              color: brandFont,
              fontWeight: 700,
              fontSize: '1.2rem',
              border: '2px solid rgba(255,255,255,0.5)',
            }}
          >
            {(tenantName || 'T').charAt(0).toUpperCase()}
          </Avatar>
        )}

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            sx={{
              fontWeight: 700,
              color: brandFont,
              fontSize: '0.9rem',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {tenantName || 'Meu Terreiro'}
          </Typography>
          <Typography sx={{ color: brandFont, opacity: 0.75, fontSize: '0.72rem', fontWeight: 500 }}>
            Senhas Admin
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};
