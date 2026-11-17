/**
 * Modelos prontos do estúdio do site (beta "Novo construtor do site"), como a galeria de
 * modelos do Squarespace e do Wix: cada um é uma ordem de seções + um estilo.
 *
 * Regra de conteúdo: o modelo só preenche o que a casa já cadastrou no GiraHub (nome, logo,
 * endereço, e-mail). Nenhum texto sobre entidades, Orixás ou fundamentos é escrito por nós;
 * o que falta aparece como dica na prévia e na conferência antes de publicar.
 */
import type { SiteSection } from '../../types';
import { SITE_STYLES, applySiteStyle, type SiteStyle } from '../../styles';
import type { SectionDraft, TenantFacts } from '../SetupWizard';
import { FAQ_SUGESTOES } from '../editors/NovasSecoesEditors';

export interface StudioTemplate {
  id: string;
  label: string;
  /** Para quem o modelo serve, em uma frase. */
  description: string;
  /** Nomes das seções, para o cartão. */
  highlights: string[];
  styleId: string;
  build: (facts: TenantFacts | null) => SectionDraft[];
}

function hero(facts: TenantFacts | null) {
  const c: Record<string, unknown> = {
    title: facts?.nome || 'Nosso terreiro',
    subtitle: 'Seja bem-vindo(a). Retire sua senha e participe das nossas giras.',
  };
  if (facts?.logoUrl) Object.assign(c, { logo_mode: 'logo', logo_position: 'left', logo_size: 'md', logo_image_url: facts.logoUrl });
  return { section_type: 'HERO' as const, config: c };
}

const sobre = { section_type: 'ABOUT' as const, config: { title: 'Sobre a casa', body: '' } };
const giras = { section_type: 'GIRAS_CALENDAR' as const, config: { title: 'Próximas giras', display_mode: 'calendar' } };
const rotina = { section_type: 'ROTINA' as const, config: { title: 'Rotina da casa', items: [] } };
const linhas = { section_type: 'LINHAS' as const, config: { title: 'Linhas de trabalho', layout: 'cartoes', items: [] } };
const fotos = { section_type: 'GALLERY' as const, config: { title: 'Fotos da casa', layout: 'grade', items: [] } };
const social = { section_type: 'SOCIAL' as const, config: { title: 'Acompanhe a casa', layout: 'botoes' } };
const ajudar = { section_type: 'AJUDAR' as const, config: { title: 'Como ajudar a casa' } };
const faq = {
  section_type: 'FAQ' as const,
  config: { title: 'Primeira vez na casa?', items: FAQ_SUGESTOES.slice(0, 4).map((p) => ({ pergunta: p, resposta: '' })) },
};
const local = (f: TenantFacts | null) => ({ section_type: 'LOCATION' as const, config: { title: 'Como chegar', ...(f?.endereco ? { address: f.endereco } : {}) } });
const contato = (f: TenantFacts | null) => ({
  section_type: 'CONTACT' as const,
  config: { title: 'Contato', contact_layout: 'cards', ...(f?.email ? { email: f.email } : {}) },
});

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'completo',
    label: 'Casa completa',
    description: 'Tudo o que um terreiro costuma mostrar, numa página só.',
    highlights: ['Capa', 'Sobre', 'Rotina', 'Próximas giras', 'Linhas', 'Fotos', 'Como chegar', 'Contato'],
    styleId: 'terra',
    build: (f) => [hero(f), sobre, rotina, giras, linhas, fotos, local(f), contato(f), social],
  },
  {
    id: 'essencial',
    label: 'Essencial',
    description: 'Só o necessário para quem quer a senha: giras, endereço e contato.',
    highlights: ['Capa', 'Próximas giras', 'Como chegar', 'Contato'],
    styleId: 'mata',
    build: (f) => [hero(f), giras, local(f), contato(f)],
  },
  {
    id: 'acolhida',
    label: 'Acolhida',
    description: 'Pensado para quem vem pela primeira vez: o que esperar, como chegar e como ajudar.',
    highlights: ['Capa', 'Sobre', 'Primeira vez na casa?', 'Rotina', 'Como chegar', 'Como ajudar'],
    styleId: 'clara',
    build: (f) => [hero(f), sobre, faq, rotina, giras, local(f), ajudar],
  },
  {
    id: 'vitrine',
    label: 'Fotos e redes',
    description: 'Para casas que gostam de mostrar as festas e estão ativas nas redes.',
    highlights: ['Capa', 'Fotos', 'Linhas', 'Próximas giras', 'Redes sociais', 'Contato'],
    styleId: 'noite',
    build: (f) => [hero(f), fotos, linhas, giras, social, contato(f)],
  },
];

/** Seções do modelo com o estilo aplicado (prontas para `replaceAll`). */
export function buildTemplate(template: StudioTemplate, facts: TenantFacts | null, style?: SiteStyle): SectionDraft[] {
  const chosen = style ?? SITE_STYLES.find((s) => s.id === template.styleId) ?? SITE_STYLES[0];
  const drafts = template.build(facts).map((d) => ({ ...d, config: { ...d.config } }));
  const asSections: SiteSection[] = drafts.map((d, i) => ({ id: `t-${i}`, section_type: d.section_type, order_index: i, config: d.config }));
  return applySiteStyle(asSections, chosen).map((s) => ({ section_type: s.section_type as SectionDraft['section_type'], config: s.config }));
}

/** Site "em branco": só a capa com o nome da casa, no estilo GiraHub. */
export function blankSite(facts: TenantFacts | null): SectionDraft[] {
  return buildTemplate({ ...STUDIO_TEMPLATES[0], build: (f) => [hero(f)] }, facts, SITE_STYLES[0]);
}
