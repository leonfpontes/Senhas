/**
 * AM-04 — para onde vai cada conta depois do login (plano §6.4; quem tem as duas áreas escolhe a
 * cada login — D-04 revisto) e "Trocar de área" (mesma sessão; evento de analytics).
 */
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));

import {
  chooseArea,
  hasAdminArea,
  knownWithoutAdminArea,
  routeAfterLogin,
  switchArea,
} from '@/lib/areas';
import { completeLogin, type SessionUser } from '@/services/authSession';

const MEDIUM = { medium_id: 'm1', nome: 'Ana' };

describe('routeAfterLogin (tabela do §6.4)', () => {
  beforeEach(() => localStorage.clear());

  it.each<[string, SessionUser, string]>([
    [
      'super admin → plataforma',
      { id: 's', role: 'super_admin', areas: { admin: false, medium: null } },
      '/platform',
    ],
    [
      'só painel → painel',
      { id: 'a', role: 'admin', areas: { admin: true, medium: null } },
      '/admin/dashboard',
    ],
    [
      'operador só painel → painel',
      { id: 'o', role: 'operator', areas: { admin: true, medium: null } },
      '/admin/dashboard',
    ],
    [
      'só médium → Área',
      { id: 'm', role: 'medium', areas: { admin: false, medium: MEDIUM } },
      '/medium',
    ],
    [
      'as duas sem escolha → escolher',
      { id: 'd', role: 'operator', areas: { admin: true, medium: MEDIUM } },
      '/escolher-area',
    ],
    [
      'nenhuma área → Área (aviso neutro)',
      { id: 'n', role: 'medium', areas: { admin: false, medium: null } },
      '/medium',
    ],
    ['sessão sem areas (admin antigo) → painel', { id: 'x', role: 'admin' }, '/admin/dashboard'],
  ])('%s', (_nome, user, rota) => {
    expect(routeAfterLogin(user)).toBe(rota);
  });

  it('as duas → escolher, mesmo com escolha antiga gravada no aparelho', () => {
    // D-04 revisto (23/10/2026): a chave antiga `girahub:area:{id}` não é mais lida.
    localStorage.setItem('girahub:area:d', 'medium');
    expect(
      routeAfterLogin({ id: 'd', role: 'admin', areas: { admin: true, medium: MEDIUM } }),
    ).toBe('/escolher-area');
  });
});

describe('quem tem o painel', () => {
  it('decide pelas areas e, sem elas, pelo papel', () => {
    expect(hasAdminArea({ role: 'medium', areas: { admin: false, medium: MEDIUM } })).toBe(false);
    expect(hasAdminArea({ role: 'operator' })).toBe(true);
    expect(knownWithoutAdminArea({ role: 'medium' })).toBe(true);
    expect(knownWithoutAdminArea({ role: 'admin', areas: { admin: false, medium: null } })).toBe(
      true,
    );
    expect(knownWithoutAdminArea({ role: 'admin' })).toBe(false);
    expect(
      knownWithoutAdminArea({ role: 'super_admin', areas: { admin: false, medium: null } }),
    ).toBe(false);
    expect(knownWithoutAdminArea(null)).toBe(false);
  });
});

describe('escolha e troca de área', () => {
  beforeEach(() => {
    localStorage.clear();
    mockTrack.mockClear();
  });

  it('escolher registra area_escolhida e não grava nada no aparelho', () => {
    expect(chooseArea('medium', 'escolha')).toBe('/medium');
    expect(localStorage.length).toBe(0);
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', { area: 'medium', origem: 'escolha' });
  });

  it('trocar de área só muda a rota', () => {
    expect(switchArea('admin')).toBe('/admin/dashboard');
    expect(localStorage.length).toBe(0);
    expect(mockTrack).toHaveBeenLastCalledWith('area_escolhida', { area: 'admin', origem: 'troca' });
  });
});

describe('completeLogin', () => {
  const originalLocation = window.location;
  let href = '';

  beforeEach(() => {
    localStorage.clear();
    href = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        set href(v: string) {
          href = v;
        },
        get href() {
          return href;
        },
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('guarda o user com as areas e vai para a rota da tabela', () => {
    completeLogin({ id: 'm', role: 'medium', areas: { admin: false, medium: MEDIUM } });
    expect(href).toBe('/medium');
    expect(JSON.parse(localStorage.getItem('user') as string).areas.medium).toEqual(MEDIUM);

    completeLogin({ id: 'd', role: 'operator', areas: { admin: true, medium: MEDIUM } });
    expect(href).toBe('/escolher-area');

    // Escolha antiga gravada não pula a pergunta: quem tem as duas escolhe a cada login.
    localStorage.setItem('girahub:area:d', 'medium');
    completeLogin({ id: 'd', role: 'operator', areas: { admin: true, medium: MEDIUM } });
    expect(href).toBe('/escolher-area');

    completeLogin({ id: 'a', role: 'admin', areas: { admin: true, medium: null } });
    expect(href).toBe('/admin/dashboard');

    completeLogin({ id: 's', role: 'super_admin', areas: { admin: false, medium: null } });
    expect(href).toBe('/platform');
  });
});
