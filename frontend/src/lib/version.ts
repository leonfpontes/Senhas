/**
 * Versão exibida na interface (rodapé das sidebars). `NEXT_PUBLIC_UI_VERSION` é injetada no build
 * (compose/CI); sem ela, cai no padrão alinhado ao `version` do backend.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_UI_VERSION ?? '2.0.0';
