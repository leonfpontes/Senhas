/**
 * BirthdayProvider: só busca aniversariantes com plano (mediuns) E grupo (mediuns:view),
 * e espera assinatura/permissões carregarem.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ data: [{ id: 'm1' }, { id: 'm2' }] }) },
}));

const mockGroup = { loading: false, can: jest.fn((_f: string, _a: string) => true) };
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: mockGroup.can, loading: mockGroup.loading, permissions: null, refresh: jest.fn() }),
}));
const mockSub = { loading: false, can: jest.fn((_f: string) => true) };
jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ can: mockSub.can, loading: mockSub.loading }),
}));

function Count() {
  const { useBirthday } = require('@/providers/BirthdayProvider');
  return <span data-testid="count">{useBirthday().birthdayCount}</span>;
}

function renderProvider() {
  const { BirthdayProvider } = require('@/providers/BirthdayProvider');
  return render(
    <BirthdayProvider>
      <Count />
    </BirthdayProvider>,
  );
}

describe('BirthdayProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroup.loading = false;
    mockSub.loading = false;
    mockGroup.can.mockImplementation(() => true);
    mockSub.can.mockImplementation(() => true);
  });

  it('com plano e grupo, conta os aniversariantes de hoje', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });

  it('operador sem Médiuns:view não chama o endpoint', () => {
    mockGroup.can.mockImplementation((f: string) => f !== 'mediuns');
    renderProvider();
    const { apiClient } = require('@/services/api_client');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('enquanto as permissões carregam, não chama', () => {
    mockGroup.loading = true;
    renderProvider();
    const { apiClient } = require('@/services/api_client');
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
