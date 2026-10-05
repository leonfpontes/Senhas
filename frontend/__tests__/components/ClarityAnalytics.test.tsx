/**
 * Tests for ClarityAnalytics — só injeta o script com Project ID configurado
 * e classifica rotas em superfícies (admin/public/signup...).
 */
import React from 'react';
import { render } from '@testing-library/react';
import ClarityAnalytics, { clarityScope, CLARITY_PROJECT_ID } from '@/components/shared/ClarityAnalytics';

jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/giras', query: {}, asPath: '/admin/giras' }),
}));

jest.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: null, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ subscription: null, loading: false }),
}));

describe('ClarityAnalytics', () => {
  it('não renderiza nada sem NEXT_PUBLIC_CLARITY_PROJECT_ID', () => {
    expect(CLARITY_PROJECT_ID).toBe('');
    const { container } = render(<ClarityAnalytics />);
    expect(container).toBeEmptyDOMElement();
  });

  it('classifica rotas em superfícies', () => {
    expect(clarityScope('/admin/giras')).toBe('admin');
    expect(clarityScope('/platform/tenants')).toBe('platform');
    expect(clarityScope('/public/ticket/abc')).toBe('public');
    expect(clarityScope('/cadastro')).toBe('signup');
    expect(clarityScope('/login')).toBe('auth');
    expect(clarityScope('/reset-password')).toBe('auth');
    expect(clarityScope('/')).toBe('marketing');
    expect(clarityScope('/meu-terreiro')).toBe('tenant-site');
  });
});
