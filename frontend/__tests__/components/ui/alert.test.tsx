import React from 'react';
import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle, alertVariants } from '@/components/ui/alert';
import { PermissionDenied, ReadOnlyNotice, PERMISSION_DENIED_MESSAGE } from '@/components/gates';

describe('Alert — variantes do kit', () => {
  it.each([
    ['default', 'bg-card'],
    ['destructive', 'text-destructive'],
    ['success', 'text-success'],
    ['warning', 'text-warning'],
    ['info', 'text-info'],
  ] as const)('variante %s aplica as classes do token', (variant, expectedClass) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Título</AlertTitle>
        <AlertDescription>Descrição</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain(expectedClass);
    expect(alert).toHaveTextContent('Título');
    expect(alert).toHaveTextContent('Descrição');
  });

  it('alertVariants expõe as cinco variantes', () => {
    expect(alertVariants({ variant: 'success' })).toMatch(/success/);
    expect(alertVariants({ variant: 'warning' })).toMatch(/warning/);
    expect(alertVariants({ variant: 'info' })).toMatch(/info/);
    expect(alertVariants({ variant: 'destructive' })).toMatch(/destructive/);
    expect(alertVariants()).toMatch(/bg-card/);
  });
});

describe('gates', () => {
  it('PermissionDenied usa o Alert amarelo com a mensagem padrão do CLAUDE.md', () => {
    render(<PermissionDenied />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('text-warning');
    expect(alert).toHaveTextContent(PERMISSION_DENIED_MESSAGE);
    expect(alert).toHaveTextContent('Você não tem permissão para visualizar este módulo.');
  });

  it('ReadOnlyNotice usa o Alert info', () => {
    render(<ReadOnlyNotice message="Somente leitura aqui." />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('text-info');
    expect(alert).toHaveTextContent('Somente leitura aqui.');
  });
});
