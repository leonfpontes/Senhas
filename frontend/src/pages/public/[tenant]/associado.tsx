/**
 * Unified public link for a tenant's senha associado emission.
 * Route: /public/[tenant]/associado
 * Always resolves and redirects to the next/active gira's page.
 */
'use client';

import UnifiedGiraRedirect from '@/components/shared/UnifiedGiraRedirect';

export default function PublicTenantAssociadoPage() {
  return <UnifiedGiraRedirect tipo="associado" />;
}
