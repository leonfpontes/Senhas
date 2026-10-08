/**
 * Notificação no celular da Área do Médium (AM-16) — Web Push no navegador.
 *
 * - O service worker (`public/sw.js`, registrado em produção pelo `ServiceWorkerRegistrar`) recebe o
 *   `push` e mostra a notificação; aqui ficam só a detecção de suporte, o pedido de permissão (sempre
 *   num toque da pessoa) e a inscrição/desinscrição no `PushManager`.
 * - iPhone: só funciona com a Área na tela inicial (iOS 16.4+). No Safari comum o `PushManager` nem
 *   existe — a tela mostra o passo "Deixe a Área na tela inicial".
 * - Nada aqui fala com a API: quem chama manda a inscrição para `/api/v1/medium/push/inscricao`.
 */
import { isIos, isStandalone } from '@/lib/pwa';

export type SuportePush = 'ok' | 'iphone-sem-instalar' | 'sem-suporte';

const ESPERA_SW_MS = 8000;

export function suportePush(): SuportePush {
  if (typeof window === 'undefined') return 'sem-suporte';
  if (isIos() && !isStandalone()) return 'iphone-sem-instalar';
  const temTudo =
    'serviceWorker' in navigator && typeof window.PushManager !== 'undefined' && typeof window.Notification !== 'undefined';
  return temTudo ? 'ok' : 'sem-suporte';
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'indisponivel';
  return window.Notification.permission;
}

/** Chave VAPID em base64url → bytes (`applicationServerKey`). */
export function chaveParaBytes(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const pronto = navigator.serviceWorker.ready;
  const espera = new Promise<null>((resolve) => setTimeout(() => resolve(null), ESPERA_SW_MS));
  try {
    return await Promise.race([pronto, espera]);
  } catch {
    return null;
  }
}

/** A inscrição deste aparelho, se já existir. Nunca lança. */
export async function inscricaoAtual(): Promise<PushSubscription | null> {
  try {
    if (suportePush() !== 'ok') return null;
    const regs = await navigator.serviceWorker.getRegistration();
    if (!regs) return null;
    return await regs.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export class PushNegado extends Error {
  constructor() {
    super('negado');
    this.name = 'PushNegado';
  }
}

/**
 * Pede permissão (se ainda não decidiu) e inscreve o aparelho. Chamar SÓ a partir de um toque.
 * Lança `PushNegado` se a pessoa recusou; `Error` se o navegador não deixou.
 */
export async function inscrever(chavePublica: string): Promise<PushSubscription> {
  const permissao = await window.Notification.requestPermission();
  if (permissao !== 'granted') throw new PushNegado();
  const reg = await registro();
  if (!reg) throw new Error('sem service worker');
  const existente = await reg.pushManager.getSubscription();
  if (existente) return existente;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chaveParaBytes(chavePublica) as BufferSource,
  });
}

/** Desfaz a inscrição deste aparelho no navegador. Nunca lança. */
export async function desinscrever(sub: PushSubscription | null): Promise<void> {
  try {
    await sub?.unsubscribe();
  } catch {
    /* o navegador já tinha desfeito */
  }
}

/** O corpo que a API espera (`PushSubscription.toJSON()`). */
export function corpoDaInscricao(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: json.endpoint || sub.endpoint,
    keys: { p256dh: json.keys?.p256dh || '', auth: json.keys?.auth || '' },
  };
}
