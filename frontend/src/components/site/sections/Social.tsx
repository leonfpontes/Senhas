/**
 * Social — redes da casa (beta "Novo construtor do site"). O lucide-react não traz
 * ícones de marca: cada rede leva um ícone genérico e o nome escrito.
 */
import React from 'react';
import { Camera, MessageCircle, Music2, PlayCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import type { SectionConfig, SectionContext } from '../types';
import { toBrWhatsAppNumber } from '../lib';
import { SectionShell } from './SectionShell';
import { EmptyHint, TitleAndIntro } from './shared';

function handle(v: unknown): string {
  return String(v || '').trim().replace(/^@/, '');
}

/** Monta os links a partir do que a casa digitou (usuário ou link completo). */
export function socialLinks(config: SectionConfig) {
  const out: { key: string; label: string; href: string; icon: React.ReactNode }[] = [];
  const url = (v: string, base: string) => (/^https?:\/\//.test(v) ? v : `${base}${v}`);
  const ig = handle(config.instagram);
  if (ig) out.push({ key: 'instagram', label: 'Instagram', href: url(ig, 'https://instagram.com/'), icon: <Camera aria-hidden /> });
  const fb = handle(config.facebook);
  if (fb) out.push({ key: 'facebook', label: 'Facebook', href: url(fb, 'https://facebook.com/'), icon: <Users aria-hidden /> });
  const yt = handle(config.youtube);
  if (yt) out.push({ key: 'youtube', label: 'YouTube', href: url(yt, 'https://youtube.com/@'), icon: <PlayCircle aria-hidden /> });
  const tk = handle(config.tiktok);
  if (tk) out.push({ key: 'tiktok', label: 'TikTok', href: url(tk, 'https://tiktok.com/@'), icon: <Music2 aria-hidden /> });
  const wa = String(config.whatsapp || '').replace(/\D/g, '');
  if (wa) out.push({ key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${toBrWhatsAppNumber(wa)}`, icon: <MessageCircle aria-hidden /> });
  return out;
}

export function Social({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const links = socialLinks(config);
  const brand = ctx.brandColor || '#2E6A4E';
  const botoes = String(config.layout || 'botoes') === 'botoes';
  const isPreview = ctx.mode === 'preview';

  return (
    <SectionShell config={config} defaultBg="#ffffff" aria-label="Redes sociais" data-section="social" innerClassName="text-center">
      <TitleAndIntro config={config} ctx={ctx} titlePlaceholder="Acompanhe a casa" />
      {links.length === 0 ? (
        <EmptyHint ctx={ctx}>Coloque o Instagram, o YouTube ou o WhatsApp da casa no painel ao lado.</EmptyHint>
      ) : (
        <ul className={cn('m-0 flex list-none flex-wrap justify-center p-0', botoes ? 'gap-3' : 'gap-6')}>
          {links.map((l) => (
            <li key={l.key}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={isPreview ? -1 : undefined}
                onClick={isPreview ? (e) => e.preventDefault() : undefined}
                className={cn(
                  'inline-flex items-center gap-2 font-medium no-underline [&_svg]:size-5',
                  botoes ? 'min-h-11 rounded-full px-5 py-2.5 text-[var(--b-fg)] hover:opacity-90' : 'flex-col text-sm text-[var(--fg)]',
                )}
                style={botoes ? ({ background: brand, '--b-fg': pickForeground(brand) } as React.CSSProperties) : undefined}
              >
                {botoes ? l.icon : <span className="flex size-12 items-center justify-center rounded-full border border-[rgba(127,127,127,0.4)]">{l.icon}</span>}
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}

export default Social;
