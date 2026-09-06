/**
 * Route: /public/[tenant]
 * Página legada de emissão aposentada — a UI única de emissão é
 * /public/gira/[id]. Esta rota permanece como redirect (via
 * UnifiedGiraRedirect, mesmo componente de /public/[tenant]/senha)
 * para que links digitados ou favoritados continuem funcionando.
 */
'use client';

import UnifiedGiraRedirect from '@/components/shared/UnifiedGiraRedirect';

export default function PublicTenantPage() {
  return <UnifiedGiraRedirect tipo="comum" />;
}
