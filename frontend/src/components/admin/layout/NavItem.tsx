/**
 * NavItem — um destino da sidebar sobre o bloco `Sidebar` do shadcn.
 * `badge` mostra o contador (aniversariantes, suporte); `onAction` substitui a navegação
 * nos itens de ação (ex.: "Link e QR do terreiro" abre o ShareLinkDialog).
 */
import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';

export interface NavItemProps {
  href: string;
  text: string;
  icon: LucideIcon;
  active: boolean;
  /** Dentro de uma seção recolhível (Financeiro, Estoque). */
  indent?: boolean;
  badge?: number;
  onAction?: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ href, text, icon: Icon, active, indent, badge, onAction }) => {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const showBadge = typeof badge === 'number' && badge > 0;
  const badgeLabel = showBadge ? (badge > 9 ? '9+' : String(badge)) : null;

  if (indent) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={active}>
          <Link href={href} aria-current={active ? 'page' : undefined} onClick={closeOnMobile}>
            <Icon aria-hidden />
            <span>{text}</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    );
  }

  const content = (
    <>
      <Icon aria-hidden />
      <span>{text}</span>
      {showBadge && <span className="sr-only"> ({badge} pendentes)</span>}
    </>
  );

  return (
    <SidebarMenuItem>
      {onAction ? (
        <SidebarMenuButton
          type="button"
          tooltip={text}
          onClick={() => {
            closeOnMobile();
            onAction();
          }}
        >
          {content}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton asChild isActive={active} tooltip={text}>
          <Link href={href} aria-current={active ? 'page' : undefined} onClick={closeOnMobile}>
            {content}
          </Link>
        </SidebarMenuButton>
      )}
      {badgeLabel && (
        <SidebarMenuBadge aria-hidden className="rounded-full bg-destructive px-1.5 text-destructive-foreground">
          {badgeLabel}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
};

export default NavItem;
