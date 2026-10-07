/**
 * WhatsApp comercial do GiraHub (V-06). O número vem de NEXT_PUBLIC_SUPPORT_WHATSAPP, que é
 * inlined no build (ARG do frontend/Dockerfile). Vazio = nenhum botão de WhatsApp aparece.
 */

/** Só dígitos; número brasileiro sem DDI ganha o 55. */
export function normalizeWhatsapp(raw: string | undefined | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 11 ? `55${digits}` : digits;
}

export const SUPPORT_WHATSAPP = normalizeWhatsapp(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP);

export const WHATSAPP_DEFAULT_MESSAGE =
  'Olá! Vim pelo site do GiraHub e quero saber como organizar as senhas da gira do meu terreiro.';

/** Link wa.me com mensagem pré-preenchida, ou '' quando o número não está configurado. */
export function supportWhatsappLink(message: string = WHATSAPP_DEFAULT_MESSAGE, number: string = SUPPORT_WHATSAPP): string {
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
