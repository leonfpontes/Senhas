/**
 * Estudos e documentos da casa (AM-21) — tipos e textos compartilhados pelo painel
 * (`/admin/materiais`) e pela Área do Médium (`/medium/estudos`).
 *
 * Sem upload de arquivo nesta versão (o banco tem limite de 8 GB): PDF entra como link do Drive.
 * O player do YouTube usa `youtube-nocookie` com o id de 11 caracteres validado no backend — o
 * `frame-src` do nginx já libera youtube.com e youtube-nocookie.com.
 */

export type MaterialTipo = 'link' | 'texto' | 'ponto';
export type MaterialFonte = 'youtube' | 'drive' | 'link';
export type MaterialPublico = 'todos' | 'atendimento' | 'cambones' | 'grupos';

export const MATERIAL_TITULO_MAX = 120;
export const MATERIAL_CATEGORIA_MAX = 60;
export const MATERIAL_URL_MAX = 500;
export const MATERIAL_TEXTO_MAX = 15000;

export const CATEGORIAS_SUGERIDAS = ['Estudos', 'Pontos cantados', 'Fundamentos', 'Rezas', 'Avisos gerais'] as const;

export const TIPO_LABEL: Record<MaterialTipo, string> = {
  link: 'Link',
  texto: 'Texto',
  ponto: 'Ponto cantado',
};

export const TIPO_AJUDA: Record<MaterialTipo, string> = {
  link: 'Drive, YouTube ou site',
  texto: 'Escrito aqui mesmo',
  ponto: 'Letra e, se quiser, o áudio ou vídeo',
};

export const FONTE_LABEL: Record<MaterialFonte, string> = {
  youtube: 'Vídeo no YouTube',
  drive: 'Google Drive',
  link: 'Site',
};

/** Aviso fixo no formulário: não há upload de PDF. */
export const PDF_USE_DRIVE = 'PDF: use um link do Drive (compartilhado como "qualquer pessoa com o link").';

/** Texto neutro da Área quando a casa não tem os estudos no plano (sem oferta de upgrade ao médium). */
export const ESTUDOS_INDISPONIVEIS = 'Os estudos não estão disponíveis na Área agora.';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Player `youtube-nocookie` a partir do id validado (null se o id não for válido). */
export function youtubeEmbedUrl(id: string | null | undefined): string | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** Só abre endereços http(s) (o backend já recusa o resto; aqui é a segunda trava). */
export function linkSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
