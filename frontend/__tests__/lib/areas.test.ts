/**
 * AM-04 — para onde vai cada conta depois do login (plano §6.4), escolha lembrada neste aparelho
 * (D-04) e "Trocar de área" (mesma sessão; atualiza a escolha lembrada; evento de analytics).
 */
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ trackEvent: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('@/providers/ThemeProvider', () => ({ dispatchTenantBrandingUpdated: jest.fn() }));

import {
  areaStorageKey,
  chooseArea,
  hasAdminArea,
  knownWithoutAdminArea,
  readRememberedArea,
  rememberArea,
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

  it('as duas com escolha lembrada → a área lembrada', () => {
    const user: SessionUser = { id: 'd', role: 'admin', areas: { admin: true, medium: MEDIUM } };
    rememberArea('d', 'medium');
    expect(routeAfterLogin(user)).toBe('/medium');
    rememberArea('d', 'admin');
    expect(routeAfterLogin(user)).toBe('/admin/dashboard');
    // A escolha é por usuário: outra conta no mesmo aparelho continua escolhendo.
    expect(routeAfterLogin({ ...user, id: 'outro' })).toBe('/escolher-area');
  });

  it('storage bloqueado não quebra: sem escolha lembrada', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      expect(readRememberedArea('d')).toBeNull();
      expect(
        routeAfterLogin({ id: 'd', role: 'admin', areas: { admin: true, medium: MEDIUM } }),
      ).toBe('/escolher-area');
    } finally {
      spy.mockRestore();
    }
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

  it('escolher com "lembrar" grava girahub:area:{userId} e registra area_escolhida', () => {
    expect(chooseArea('u1', 'medium', { lembrar: true, origem: 'escolha' })).toBe('/medium');
    expect(localStorage.getItem(areaStorageKey('u1'))).toBe('medium');
    expect(localStorage.getItem('girahub:area:u1')).toBe('medium');
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'medium',
      lembrada: true,
      origem: 'escolha',
    });
  });

  it('escolher sem "lembrar" esquece a escolha anterior', () => {
    rememberArea('u1', 'admin');
    expect(chooseArea('u1', 'medium', { lembrar: false, origem: 'escolha' })).toBe('/medium');
    expect(localStorage.getItem('girahub:area:u1')).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('area_escolhida', {
      area: 'medium',
      lembrada: false,
      origem: 'escolha',
    });
  });

  it('trocar de área atualiza a escolha lembrada (se houver) e não cria uma do nada', () => {
    rememberArea('u1', 'admin');
    expect(switchArea('u1', 'medium')).toBe('/medium');
    expect(localStorage.getItem('girahub:area:u1')).toBe('medium');

    expect(switchArea('u2', 'admin')).toBe('/admin/dashboard');
    expect(localStorage.getItem('girahub:area:u2')).toBeNull();
    expect(mockTrack).toHaveBeenLastCalledWith('area_escolhida', {
      area: 'admin',
      lembrada: false,
      origem: 'troca',
    });
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

    rememberArea('d', 'medium');
    completeLogin({ id: 'd', role: 'operator', areas: { admin: true, medium: MEDIUM } });
    expect(href).toBe('/medium');

    completeLogin({ id: 'a', role: 'admin', areas: { admin: true, medium: null } });
    expect(href).toBe('/admin/dashboard');

    completeLogin({ id: 's', role: 'super_admin', areas: { admin: false, medium: null } });
    expect(href).toBe('/platform');
  });
});
