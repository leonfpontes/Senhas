/**
 * Unified public link for a tenant's regular senha emission.
 * Route: /public/[tenant]/senha
 * Always resolves and redirects to the next/active gira's page.
 */
'use client';

import UnifiedGiraRedirect from '@/components/shared/UnifiedGiraRedirect';

export default function PublicTenantSenhaPage() {
  return <UnifiedGiraRedirect tipo="comum" />;
}
