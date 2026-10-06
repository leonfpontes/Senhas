/**
 * Contact — WhatsApp, e-mail e Instagram em cartões, lista ou botões.
 * Na prévia sem contatos preenchidos mostra exemplos.
 */
import React from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import type { SectionConfig, SectionContext } from '../types';
import { sectionForeground, toBrWhatsAppNumber } from '../lib';
import { SectionShell, SectionTitle } from './SectionShell';

/** O lucide-react não traz ícones de marca; o do Instagram é desenhado aqui. */
function Instagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface ContactItem {
  icon: React.ReactNode;
  label: string;
  href: string;
  kind: 'whatsapp' | 'email' | 'instagram';
}

function buildContacts(config: SectionConfig, isPreview: boolean): ContactItem[] {
  const phone = String(config.phone || '').trim();
  const email = String(config.email || '').trim();
  const instagram = String(config.instagram || '').trim().replace(/^@/, '');
  const items: ContactItem[] = [];
  if (phone) items.push({ kind: 'whatsapp', icon: <MessageCircle aria-hidden />, label: phone, href: `https://wa.me/${toBrWhatsAppNumber(phone)}` });
  if (email) items.push({ kind: 'email', icon: <Mail aria-hidden />, label: email, href: `mailto:${email}` });
  if (instagram) items.push({ kind: 'instagram', icon: <Instagram aria-hidden />, label: `@${instagram}`, href: `https://instagram.com/${instagram}` });
  if (items.length === 0 && isPreview) {
    return [
      { kind: 'whatsapp', icon: <MessageCircle aria-hidden />, label: '(11) 99999-9999', href: '#' },
      { kind: 'email', icon: <Mail aria-hidden />, label: 'contato@terreiro.com', href: '#' },
      { kind: 'instagram', icon: <Instagram aria-hidden />, label: '@terreiro', href: '#' },
    ];
  }
  return items;
}

const KIND_LABEL: Record<ContactItem['kind'], string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
};

export function Contact({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const isPreview = ctx.mode === 'preview';
  const contacts = buildContacts(config, isPreview);
  if (contacts.length === 0) return null;

  const layout = String(config.contact_layout || 'cards');
  const title = String(config.title || 'Contato');
  const fg = sectionForeground(config, '#ffffff');
  const buttonFg = pickForeground(fg);

  const linkProps = (href: string) => ({
    href,
    target: href.startsWith('#') ? undefined : '_blank',
    rel: href.startsWith('#') ? undefined : 'noopener noreferrer',
    tabIndex: isPreview ? -1 : undefined,
    onClick: isPreview ? (e: React.MouseEvent) => e.preventDefault() : undefined,
  });

  return (
    <SectionShell config={config} defaultBg="#ffffff" innerClassName="text-center" aria-label="Contato" data-section="contact">
      <SectionTitle config={config} defaultSize={30} className="mb-6">
        {title}
      </SectionTitle>

      {layout === 'cards' && (
        <ul className="flex list-none flex-wrap justify-center gap-4 p-0">
          {contacts.map((c) => (
            <li key={c.kind}>
              <a
                {...linkProps(c.href)}
                aria-label={`${KIND_LABEL[c.kind]}: ${c.label}`}
                className="flex min-h-12 min-w-[140px] flex-col items-center gap-3 rounded-2xl border border-black/10 bg-black/[0.03] px-6 py-5 text-[var(--fg)] no-underline transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-[var(--fg)]/40 focus-visible:outline-none [&_svg]:size-8"
              >
                {c.icon}
                <span className="text-sm font-medium break-all">{c.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {layout === 'list' && (
        <ul className="flex list-none flex-col items-center gap-4 p-0">
          {contacts.map((c) => (
            <li key={c.kind}>
              <a
                {...linkProps(c.href)}
                aria-label={`${KIND_LABEL[c.kind]}: ${c.label}`}
                className="flex min-h-12 items-center gap-3 text-[var(--fg)] no-underline hover:opacity-75 focus-visible:ring-[3px] focus-visible:ring-[var(--fg)]/40 focus-visible:outline-none [&_svg]:size-7"
              >
                {c.icon}
                <span className="text-base font-medium">{c.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {layout === 'buttons' && (
        <ul className="flex list-none flex-wrap justify-center gap-3 p-0">
          {contacts.map((c) => (
            <li key={c.kind}>
              <a
                {...linkProps(c.href)}
                aria-label={`${KIND_LABEL[c.kind]}: ${c.label}`}
                className={cn(
                  'inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--fg)] px-5 py-3 text-sm font-semibold text-[var(--btn-fg)] no-underline transition-opacity hover:opacity-85 focus-visible:ring-[3px] focus-visible:ring-[var(--fg)]/40 focus-visible:outline-none [&_svg]:size-5',
                )}
                style={{ '--btn-fg': buttonFg } as React.CSSProperties}
              >
                {c.icon}
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

export default Contact;
