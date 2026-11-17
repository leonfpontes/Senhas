/**
 * Elementos de cada seção que a casa pode mostrar ou esconder (beta "Novo construtor do site").
 *
 * Cada elemento é uma chave `show_<elemento>` na config da seção. O padrão é ligado: chave
 * ausente = aparece, então os sites que já existem não mudam. Só `false` esconde.
 * As seções leem com `shows()`, no site público e na prévia (o que está desligado some dos
 * dois). O painel da seção mostra um interruptor por elemento.
 *
 * Puro (sem React) para teste.
 */
import type { SectionConfig, SectionType } from './types';

export interface SectionElement {
  /** Chave na config (`show_title`…). */
  key: string;
  label: string;
  /** Explicação curta abaixo do nome (opcional). */
  hint?: string;
  /** Só faz sentido em certas condições (ex.: texto ao lado só no layout vídeo + texto). */
  when?: (config: SectionConfig) => boolean;
  /** Estado quando depende de mais de uma chave (o logo da capa). Padrão: `shows(config, key)`. */
  isOn?: (config: SectionConfig) => boolean;
  /** Patch ao ligar/desligar quando não é só a chave. */
  toggle?: (on: boolean) => SectionConfig;
}

const TITLE: SectionElement = { key: 'show_title', label: 'Título' };
const INTRO: SectionElement = { key: 'show_intro', label: 'Introdução' };

export const SECTION_ELEMENTS: Record<SectionType, SectionElement[]> = {
  HERO: [
    {
      key: 'show_logo',
      label: 'Logo',
      hint: 'A imagem do logo, ao lado do nome.',
      // O logo já tinha "Sem logo / Com logo" (`logo_mode`); o interruptor fala pelos dois.
      isOn: (c) => String(c.logo_mode || 'none') === 'logo' && c.show_logo !== false,
      toggle: (on) => (on ? { logo_mode: 'logo', show_logo: true } : { show_logo: false }),
    },
    { key: 'show_title', label: 'Nome da casa' },
    { key: 'show_subtitle', label: 'Frase de boas-vindas' },
    { key: 'show_cta', label: 'Botão "Retirar senha"' },
    { key: 'show_mobile_cta', label: 'Barra "Retirar senha" no celular', hint: 'Fica presa no pé da tela do celular, em todo o site.' },
  ],
  ABOUT: [TITLE, { key: 'show_body', label: 'Texto' }, { key: 'show_image', label: 'Foto' }],
  GIRAS_CALENDAR: [
    TITLE,
    { key: 'show_highlight', label: 'Destaque da próxima gira', hint: 'O cartão em cima do calendário, no computador.' },
    { key: 'show_description', label: 'Descrição de cada gira' },
    { key: 'show_ticket_button', label: 'Botão "Retire sua senha"' },
    { key: 'show_sponsor_button', label: 'Botão "Senha de associado"' },
    { key: 'show_calendar_note', label: 'Explicação do calendário', when: (c) => String(c.display_mode || 'calendar') === 'calendar' },
  ],
  LOCATION: [
    TITLE,
    { key: 'show_address', label: 'Endereço escrito' },
    { key: 'show_instructions', label: 'Como chegar (texto)' },
    { key: 'show_map', label: 'Mapa' },
    { key: 'show_maps_button', label: 'Botão "Abrir no Google Maps"' },
  ],
  CONTACT: [TITLE, { key: 'show_whatsapp', label: 'WhatsApp' }, { key: 'show_email', label: 'E-mail' }, { key: 'show_instagram', label: 'Instagram' }],
  VIDEO_EMBED: [
    { key: 'show_title', label: 'Título' },
    { key: 'show_side_text', label: 'Texto ao lado do vídeo', when: (c) => String(c.layout || 'video-only') === 'side-by-side' },
  ],
  SPONSOR: [TITLE, { key: 'show_intro', label: 'Texto' }],
  CUSTOM_TEXT: [TITLE, { key: 'show_body', label: 'Texto' }],
  GALLERY: [TITLE, INTRO, { key: 'show_captions', label: 'Legendas das fotos' }],
  LINHAS: [TITLE, INTRO, { key: 'show_item_text', label: 'Texto de cada linha' }],
  ROTINA: [TITLE, INTRO, { key: 'show_hour', label: 'Horários' }, { key: 'show_observacao', label: 'Observação' }],
  FAQ: [TITLE],
  SOCIAL: [
    TITLE,
    { key: 'show_instagram', label: 'Instagram' },
    { key: 'show_facebook', label: 'Facebook' },
    { key: 'show_youtube', label: 'YouTube' },
    { key: 'show_tiktok', label: 'TikTok' },
    { key: 'show_whatsapp', label: 'WhatsApp' },
  ],
  AJUDAR: [
    TITLE,
    INTRO,
    { key: 'show_pix', label: 'Chave PIX' },
    { key: 'show_copy_button', label: 'Botão "Copiar chave PIX"' },
    { key: 'show_necessidades', label: 'O que a casa precisa' },
  ],
};

/** O elemento aparece? Padrão ligado: só `false` esconde. */
export function shows(config: SectionConfig, key: string): boolean {
  return config[key] !== false;
}

/** Elementos da seção que fazem sentido agora (respeita `when`). */
export function elementsFor(type: string, config: SectionConfig): SectionElement[] {
  const list = SECTION_ELEMENTS[type as SectionType] ?? [];
  return list.filter((e) => !e.when || e.when(config));
}

/** O elemento está ligado nesta config? */
export function isElementOn(el: SectionElement, config: SectionConfig): boolean {
  return el.isOn ? el.isOn(config) : shows(config, el.key);
}

/** Patch que liga ou desliga um elemento. */
export function elementPatch(el: SectionElement, on: boolean): SectionConfig {
  return el.toggle ? el.toggle(on) : { [el.key]: on };
}

/** Quantos elementos estão escondidos (para o resumo "2 escondidos"). */
export function hiddenCount(type: string, config: SectionConfig): number {
  return elementsFor(type, config).filter((e) => !isElementOn(e, config)).length;
}

/**
 * Barra "Retirar senha" do celular: a escolha fica na capa (`show_mobile_cta`, padrão ligado)
 * e o texto acompanha o do botão da capa (`cta_label`). Sem capa, a barra aparece como sempre.
 */
export function mobileCta(sections: { section_type: string; config: SectionConfig }[]): { show: boolean; label: string } {
  const hero = sections.find((s) => s.section_type === 'HERO');
  const label = String(hero?.config.cta_label || '').trim() || 'Retirar senha';
  return { show: hero ? shows(hero.config, 'show_mobile_cta') : true, label };
}
