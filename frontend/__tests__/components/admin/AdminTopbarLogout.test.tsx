/**
 * "Sair" do topo do admin: durante a impersonação NÃO pode chamar /auth/logout
 * (os cookies do navegador são do super-admin — revogaria a sessão dele).
 */
const mockPost = jest.fn();
const mockEndImpersonation = jest.fn();

jest.mock('@/services/api_client', () => ({
  apiClient: { get: jest.fn(), post: (...args: unknown[]) => mockPost(...args), put: jest.fn(), delete: jest.fn() },
  endImpersonation: () => mockEndImpersonation(),
}));
jest.mock('@reactour/tour', () => ({ useTour: () => ({}) }));

import { adminLogout } from '@/components/admin/layout/AdminTopbar';

describe('adminLogout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    mockPost.mockResolvedValue({ data: {} });
  });

  it('impersonando: encerra só a impersonação, sem /auth/logout nem mexer no localStorage', async () => {
    sessionStorage.setItem('impersonating', 'true');
    localStorage.setItem('user', JSON.stringify({ role: 'super_admin' }));
    const push = jest.fn();

    await adminLogout(push, 'u-1');

    expect(mockEndImpersonation).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).toContain('super_admin');
  });

  it('sessão normal: chama /auth/logout, limpa o user e vai para /login', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }));
    const push = jest.fn();

    await adminLogout(push, 'u-1');

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout');
    expect(mockEndImpersonation).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).toBeNull();
    expect(push).toHaveBeenCalledWith('/login');
  });
});
