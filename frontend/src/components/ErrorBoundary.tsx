import React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 240,
            gap: 2,
            p: 4,
            textAlign: 'center',
          }}
        >
          <WarningAmberRoundedIcon sx={{ fontSize: 48, color: 'warning.main', opacity: 0.7 }} />
          <Typography variant="h6" fontWeight={700}>
            Algo deu errado
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
            Ocorreu um erro inesperado nesta seção. Tente recarregar ou entre em contato com o suporte.
          </Typography>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Typography
              variant="caption"
              component="pre"
              sx={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 2,
                p: 1.5,
                maxWidth: '100%',
                overflow: 'auto',
                textAlign: 'left',
                color: 'error.main',
                fontSize: '0.7rem',
              }}
            >
              {this.state.error.message}
            </Typography>
          )}
          <Button variant="outlined" size="small" onClick={this.handleRetry}>
            Tentar novamente
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}
