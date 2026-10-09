/**
 * Versão da interface (GiraHub v2 — migração MUI → shadcn).
 *
 * `NEXT_PUBLIC_UI_VERSION` é injetada pelo `next.config.js` a partir do `version` do
 * `package.json`, então basta subir a versão lá. O fallback cobre Jest e builds sem o env.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_UI_VERSION ?? '2.6.0';

/** "2.0" — para rótulos curtos (badge, título). */
export const APP_VERSION_SHORT: string = APP_VERSION.split('.').slice(0, 2).join('.');

/** "GiraHub v2.0.0" — rodapé da sidebar e menu do usuário. */
export const APP_VERSION_LABEL = `GiraHub v${APP_VERSION}`;
