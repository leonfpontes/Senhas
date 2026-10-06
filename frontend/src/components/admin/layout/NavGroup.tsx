/**
 * NavGroup — um grupo da sidebar ("Hoje", "Giras e senhas", "Corrente", "Casa", "Conta").
 * Seções recolhíveis dentro do grupo (Financeiro, Estoque) abrem sozinhas quando a rota
 * atual está dentro delas.
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NavItem } from './NavItem';
import { isNavLinkActive, isSectionActive, type NavAction, type NavEntry, type NavLink, type NavSection } from './navConfig';

/** Compat com a API antiga (itens simples). */
export type NavGroupItem = NavLink;

export interface NavGroupProps {
  label: string;
  items: NavEntry[];
  activeHref: string;
  onAction?: (action: NavAction) => void;
}

function SectionItem({ section, pathname }: { section: NavSection; pathname: string }) {
  const active = isSectionActive(section, pathname);
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  const Icon = section.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={section.label} isActive={active && !open} aria-expanded={open}>
            <Icon aria-hidden />
            <span>{section.label}</span>
            <ChevronRight
              aria-hidden
              className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                text={item.label}
                icon={item.icon}
                active={isNavLinkActive(item, pathname)}
                indent
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export const NavGroup: React.FC<NavGroupProps> = ({ label, items, activeHref, onAction }) => {
  if (items.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label={label}>
          {items.map((entry) =>
            entry.kind === 'section' ? (
              <SectionItem key={entry.label} section={entry} pathname={activeHref} />
            ) : (
              <NavItem
                key={entry.href}
                href={entry.href}
                text={entry.label}
                icon={entry.icon}
                badge={entry.badge}
                active={isNavLinkActive(entry, activeHref)}
                onAction={entry.action && onAction ? () => onAction(entry.action as NavAction) : undefined}
              />
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export default NavGroup;
