/**
 * ContaAbas — as abas da conta (J10 v2 · 01 a 11): Plano e assinatura · Pessoas e acessos · Perfis de
 * acesso · Configurações · Auditoria · Ajuda. Saem do grupo "Conta" do menu (`useAdminNav`), então
 * cada aba segue a mesma permissão e o mesmo plano do menu, e o que a pessoa não pode ver não aparece.
 * Só aparece nas telas da conta.
 */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import { useProfile } from '@/hooks/useProfile';
import { isNavLinkActive, pathOf, useAdminNav, type NavLink } from '@/components/admin/layout/navConfig';

/** Rotas da conta que mostram as abas (sem a página de módulos, que é do menu). */
export const ROTAS_DA_CONTA = ['/admin/billing', '/admin/plano', '/admin/users', '/admin/permission-groups', '/admin/config', '/admin/audit-trail', '/admin/suporte'];

export function ehRotaDaConta(pathname: string): boolean {
  return ROTAS_DA_CONTA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function ContaAbas({ className }: { className?: string }) {
  const router = useRouter();
  const { profile } = useProfile();
  const groups = useAdminNav({ isOperator: profile?.role === 'operator', tenantId: profile?.tenant_id });
  const conta = groups.find((g) => g.key === 'conta');
  const links = (conta?.items ?? []).filter(
    (e): e is NavLink => e.kind === 'link' && !e.action && pathOf(e.href) !== '/admin/modulos',
  );
  if (links.length < 2) return null;
  return (
    // Só rola na horizontal; o filete fica na lista, dentro da caixa que rola (sem barra vertical).
    <nav aria-label="Conta" className={cn('-mt-2 mb-5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      <ul className="m-0 flex min-w-max list-none gap-5 border-b border-border p-0">
        {links.map((l) => {
          const ativo = isNavLinkActive(l, router?.pathname ?? '');
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-11 items-center border-b-2 text-[0.9375rem] whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  ativo ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {l.label}
                {typeof l.badge === 'number' && l.badge > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{l.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default ContaAbas;
