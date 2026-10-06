import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import React from 'react';

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
        <div
          role="alert"
          data-slot="error-boundary"
          className="flex min-h-60 flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <TriangleAlert aria-hidden className="size-12 text-warning opacity-70" />
          <h2 className="text-lg font-bold">Algo deu errado</h2>
          <p className="max-w-90 text-sm text-muted-foreground">
            Ocorreu um erro inesperado nesta seção. Tente recarregar ou entre em contato com o suporte.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="max-w-full overflow-auto rounded-md border border-destructive/20 bg-destructive/10 p-3 text-left text-xs text-destructive">
              {this.state.error.message}
            </pre>
          )}
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
