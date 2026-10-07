import React from 'react';
import { MessageCircle } from 'lucide-react';
import { supportWhatsappLink } from '@/lib/whatsapp';
import { trackEvent } from '@/services/analytics';

/**
 * Botão flutuante de WhatsApp das páginas de marketing (V-06). Só existe com o número configurado.
 * Fica acima da área segura do iPhone e abaixo de overlays do Radix (z-40 < z-50).
 */
export function WhatsAppFab({ href = supportWhatsappLink() }: { href?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com o GiraHub no WhatsApp"
      onClick={() => trackEvent('whatsapp_click', { origem: 'flutuante' })}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-40 flex items-center gap-2 rounded-full bg-folha-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cafe-950/25 outline-none transition hover:bg-folha-700 focus-visible:ring-[3px] focus-visible:ring-ouro-300 sm:right-6"
    >
      <MessageCircle className="size-5" aria-hidden />
      <span className="hidden sm:inline">Fale com a gente</span>
    </a>
  );
}

export default WhatsAppFab;
