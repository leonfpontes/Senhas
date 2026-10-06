/**
 * Tipos do "Meu Site" (construtor) e do site público do terreiro.
 *
 * Espelham os contratos de `backend/src/api/v1/admin/sites.py` e
 * `backend/src/api/v1/public/sites.py` — não mudar sem mudar o backend.
 */

export type SectionType =
  | 'HERO'
  | 'ABOUT'
  | 'VIDEO_EMBED'
  | 'GIRAS_CALENDAR'
  | 'LOCATION'
  | 'CONTACT'
  | 'SPONSOR'
  | 'CUSTOM_TEXT';

/** `config` é um dicionário livre no backend (JSONB). */
export type SectionConfig = Record<string, unknown>;

export interface SiteSection {
  /** UUID real do banco ou `temp-*` antes do primeiro salvamento. */
  id: string;
  section_type: string;
  order_index: number;
  config: SectionConfig;
  /** Marcador local de rascunho (seção ainda não sincronizada). */
  _tempId?: string;
}

/** Gira como o endpoint público entrega (`upcoming_giras`). */
export interface SiteGira {
  id: string;
  nome: string;
  data_hora: string | null;
  descricao: string | null;
  has_tickets: boolean;
  has_sponsor_tickets: boolean;
  /**
   * Janela de senhas. O endpoint público ainda não expõe esses campos; o
   * editor (API admin) tem. Quando presentes, o cartão mostra "Senhas abrem…".
   */
  release_start_at?: string | null;
  release_end_at?: string | null;
  /** Dado de exemplo da prévia (não existe no backend). */
  _sample?: boolean;
}

export interface SiteInfo {
  id: string;
  tenant_id?: string;
  slug: string;
  status: string;
  template: string;
  meta_title: string | null;
  meta_description: string | null;
  updated_at: string;
}

export interface SiteVersion {
  id: string;
  label: string | null;
  snapshot: unknown[];
  created_by: string | null;
  created_at: string;
}

export interface SiteImage {
  id: string;
  filename: string;
  mimetype: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  url: string;
  created_at: string;
}

/** Resposta de `GET /api/v1/public/sites/{slug}` (SSR do site público). */
export interface PublicSiteData {
  id: string;
  slug: string;
  status: string;
  template: string;
  meta_title: string | null;
  meta_description: string | null;
  sections: SiteSection[];
  upcoming_giras: SiteGira[];
}

/**
 * `public`: site de verdade (links navegam, iframes carregam, mapa geocodifica).
 * `preview`: prévia do editor (links inertes, vídeo/mapa viram placeholder).
 */
export type RenderMode = 'public' | 'preview';

export interface SectionContext {
  mode: RenderMode;
  /** Slug do site — monta `/public/{slug}/senha`. */
  slug: string;
  giras: SiteGira[];
  /** Cor de marca do site (vinda do Hero) — CTAs e destaque do calendário. */
  brandColor?: string;
}
