/**
 * AM-04 — conta sem o painel (médium puro) nunca chama /api/v1/admin/*: o api_client cancela a
 * chamada no navegador (sem rede, sem 403 no console nem no Sentry).
 */
import axios from 'axios';
import { apiClient, isBlockedAdminCall } from '@/services/api_client';

describe('chamadas de admin para conta sem painel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('bloqueia só /api/v1/admin/* de quem sabidamente não tem o painel', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'm',
        role: 'medium',
        areas: { admin: false, medium: { medium_id: 'x', nome: 'A' } },
      }),
    );
    expect(isBlockedAdminCall('/api/v1/admin/subscription')).toBe(true);
    expect(isBlockedAdminCall('/api/v1/medium/me')).toBe(false);
    expect(isBlockedAdminCall('/api/v1/auth/profile')).toBe(false);

    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'o', role: 'operator', areas: { admin: true, medium: null } }),
    );
    expect(isBlockedAdminCall('/api/v1/admin/subscription')).toBe(false);

    // Sessão antiga sem `areas`: decide pelo papel; sem usuário guardado, não bloqueia.
    localStorage.setItem('user', JSON.stringify({ id: 'a', role: 'admin' }));
    expect(isBlockedAdminCall('/api/v1/admin/subscription')).toBe(false);
    localStorage.clear();
    expect(isBlockedAdminCall('/api/v1/admin/subscription')).toBe(false);
  });

  it('impersonando um médium (usuário da aba no sessionStorage) também bloqueia', () => {
    localStorage.setItem('user', JSON.stringify({ id: 's', role: 'super_admin' }));
    sessionStorage.setItem('user', JSON.stringify({ id: 'm', role: 'medium' }));
    expect(isBlockedAdminCall('/api/v1/admin/dashboard/summary')).toBe(true);
  });

  it('a chamada é cancelada antes de sair do navegador', async () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'm', role: 'medium', areas: { admin: false, medium: null } }),
    );
    const err = await apiClient.get('/api/v1/admin/subscription').catch((e: unknown) => e);
    expect(axios.isCancel(err)).toBe(true);
  });
});
