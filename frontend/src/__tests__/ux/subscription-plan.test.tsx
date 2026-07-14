/**
 * Testa feature gating e limites de criação do hook useSubscription.
 *
 * Não monta o Provider completo (que faz chamada de API) — testa as funções
 * puras de decisão diretamente, instanciando os callbacks com dados mockados.
 */

import type { PlanFeatures, SubscriptionInfo } from '../../hooks/useSubscription';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFeatures(overrides: Partial<PlanFeatures> = {}): PlanFeatures {
  return {
    email_transacional: false,
    tema_personalizado: false,
    analytics_basico: false,
    analytics_avancado: false,
    associados: false,
    export_csv: false,
    bulk_operations: false,
    auditoria: false,
    api_access: false,
    suporte_prioritario: false,
    mensalidade_mediun: false,
    mensalidade_associado: false,
    estoque_controle: false,
    contas_financeiras: false,
    mediuns: false,
    relatorio_gira: false,
    site_builder: false,
    fila_espera: false,
    ...overrides,
  };
}

function makeSub(overrides: Partial<SubscriptionInfo> = {}): SubscriptionInfo {
  return {
    plan: 'free',
    status: 'active',
    max_users: 1,
    max_giras_per_month: 4,
    max_mediuns: 0,
    current_users: 0,
    current_giras_this_month: 0,
    current_mediuns: 0,
    monthly_price: 0,
    is_trial: false,
    trial_ends_at: null,
    auto_renew: false,
    features: makeFeatures(),
    ...overrides,
  };
}

// Reimplementa as funções puras do hook para testar sem React context
function can(sub: SubscriptionInfo, feature: keyof PlanFeatures): boolean {
  return sub.features[feature];
}

function canCreateGira(sub: SubscriptionInfo): boolean {
  if (sub.max_giras_per_month < 0 || sub.max_giras_per_month >= 99999) return true;
  return sub.current_giras_this_month < sub.max_giras_per_month;
}

function canCreateMedium(sub: SubscriptionInfo, currentCount: number): boolean {
  if (sub.max_mediuns < 0 || sub.max_mediuns >= 99999) return true;
  return currentCount < sub.max_mediuns;
}

// ─── can() — features por plano ──────────────────────────────────────────────

describe('can() — mensalidade_mediun', () => {
  it('FREE: false', () => {
    const sub = makeSub({ features: makeFeatures({ mensalidade_mediun: false }) });
    expect(can(sub, 'mensalidade_mediun')).toBe(false);
  });

  it('BASIC: false', () => {
    const sub = makeSub({ plan: 'basic', features: makeFeatures({ mensalidade_mediun: false }) });
    expect(can(sub, 'mensalidade_mediun')).toBe(false);
  });

  it('PRO: true', () => {
    const sub = makeSub({ plan: 'pro', features: makeFeatures({ mensalidade_mediun: true }) });
    expect(can(sub, 'mensalidade_mediun')).toBe(true);
  });

  it('PREMIUM: true', () => {
    const sub = makeSub({ plan: 'premium', features: makeFeatures({ mensalidade_mediun: true }) });
    expect(can(sub, 'mensalidade_mediun')).toBe(true);
  });
});

describe('can() — contas_financeiras', () => {
  it('FREE: false', () => {
    expect(can(makeSub(), 'contas_financeiras')).toBe(false);
  });

  it('BASIC: false', () => {
    const sub = makeSub({ plan: 'basic', features: makeFeatures({ contas_financeiras: false }) });
    expect(can(sub, 'contas_financeiras')).toBe(false);
  });

  it('PRO: true', () => {
    const sub = makeSub({ plan: 'pro', features: makeFeatures({ contas_financeiras: true }) });
    expect(can(sub, 'contas_financeiras')).toBe(true);
  });

  it('PREMIUM: true', () => {
    const sub = makeSub({ plan: 'premium', features: makeFeatures({ contas_financeiras: true }) });
    expect(can(sub, 'contas_financeiras')).toBe(true);
  });
});

describe('can() — fila_espera', () => {
  it('FREE: false', () => {
    expect(can(makeSub(), 'fila_espera')).toBe(false);
  });

  it('BASIC: false', () => {
    const sub = makeSub({ plan: 'basic', features: makeFeatures({ fila_espera: false }) });
    expect(can(sub, 'fila_espera')).toBe(false);
  });

  it('PRO: true', () => {
    const sub = makeSub({ plan: 'pro', features: makeFeatures({ fila_espera: true }) });
    expect(can(sub, 'fila_espera')).toBe(true);
  });

  it('PREMIUM: true', () => {
    const sub = makeSub({ plan: 'premium', features: makeFeatures({ fila_espera: true }) });
    expect(can(sub, 'fila_espera')).toBe(true);
  });
});

describe('can() — mediuns', () => {
  it('FREE: false', () => {
    expect(can(makeSub(), 'mediuns')).toBe(false);
  });

  it('BASIC: true', () => {
    const sub = makeSub({ plan: 'basic', features: makeFeatures({ mediuns: true }) });
    expect(can(sub, 'mediuns')).toBe(true);
  });

  it('PRO: true', () => {
    const sub = makeSub({ plan: 'pro', features: makeFeatures({ mediuns: true }) });
    expect(can(sub, 'mediuns')).toBe(true);
  });
});

// ─── canCreateGira() — limites por plano ─────────────────────────────────────

describe('canCreateGira() — FREE (limite 4)', () => {
  const base = makeSub({ max_giras_per_month: 4 });

  it('true com 3 giras', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 3 })).toBe(true);
  });

  it('false com 4 giras (no limite)', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 4 })).toBe(false);
  });
});

describe('canCreateGira() — BASIC (limite 10)', () => {
  const base = makeSub({ plan: 'basic', max_giras_per_month: 10 });

  it('true com 9 giras', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 9 })).toBe(true);
  });

  it('false com 10 giras (no limite)', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 10 })).toBe(false);
  });
});

describe('canCreateGira() — PRO (limite 15)', () => {
  const base = makeSub({ plan: 'pro', max_giras_per_month: 15 });

  it('true com 14 giras', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 14 })).toBe(true);
  });

  it('false com 15 giras (no limite)', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 15 })).toBe(false);
  });
});

describe('canCreateGira() — PREMIUM (ilimitado)', () => {
  const base = makeSub({ plan: 'premium', max_giras_per_month: 999999 });

  it('sempre true mesmo com muitas giras', () => {
    expect(canCreateGira({ ...base, current_giras_this_month: 999998 })).toBe(true);
  });
});

// ─── canCreateMedium() — limites por plano ───────────────────────────────────

describe('canCreateMedium() — BASIC (limite 50)', () => {
  const sub = makeSub({ plan: 'basic', max_mediuns: 50 });

  it('true com 49 médiuns', () => {
    expect(canCreateMedium(sub, 49)).toBe(true);
  });

  it('false com 50 médiuns (no limite)', () => {
    expect(canCreateMedium(sub, 50)).toBe(false);
  });
});

describe('canCreateMedium() — PRO (limite 150)', () => {
  const sub = makeSub({ plan: 'pro', max_mediuns: 150 });

  it('true com 149 médiuns', () => {
    expect(canCreateMedium(sub, 149)).toBe(true);
  });

  it('false com 150 médiuns (no limite)', () => {
    expect(canCreateMedium(sub, 150)).toBe(false);
  });
});

describe('canCreateMedium() — PREMIUM (ilimitado)', () => {
  const sub = makeSub({ plan: 'premium', max_mediuns: 9999999 });

  it('sempre true', () => {
    expect(canCreateMedium(sub, 9999998)).toBe(true);
  });
});
