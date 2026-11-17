/**
 * Gaveta "Adicionar" do estúdio do site (beta "Novo construtor do site"): blocos com variação,
 * busca, sugestões e a posição de soltar na prévia.
 */
import {
  BLOCK_DRAG_MIME,
  buildBlocks,
  decodeBlockDrag,
  dropIndexFor,
  encodeBlockDrag,
  existingFor,
  filterBlocks,
  suggestedBlocks,
} from '@/components/site/editor/studio/blocks';
import type { SiteSection } from '@/components/site/types';

const sec = (id: string, section_type: SiteSection['section_type'], config: Record<string, unknown> = {}): SiteSection =>
  ({ id, section_type, order_index: 0, config }) as SiteSection;

describe('blocos da gaveta Adicionar', () => {
  const blocks = buildBlocks(true);

  it('tem uma variação por jeito de mostrar, com a config do jeito', () => {
    const fotos = blocks.filter((b) => b.type === 'GALLERY');
    expect(fotos.map((b) => b.variant)).toEqual(['Grade', 'Mosaico', 'Faixa']);
    expect(fotos[1].config).toEqual({ layout: 'mosaico' });
    expect(blocks.find((b) => b.id === 'CONTACT:buttons')?.config).toEqual({ contact_layout: 'buttons' });
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it('sem a beta, não mostra as seções novas', () => {
    const old = buildBlocks(false);
    expect(old.some((b) => b.type === 'GALLERY' || b.type === 'FAQ')).toBe(false);
    expect(old.some((b) => b.type === 'HERO')).toBe(true);
  });

  it('busca sem acento, por palavra extra e por categoria', () => {
    expect(filterBlocks(blocks, 'endereco').map((b) => b.type)).toContain('LOCATION');
    expect(filterBlocks(blocks, 'PIX').map((b) => b.type)).toEqual(['AJUDAR']);
    expect(filterBlocks(blocks, 'carrossel').map((b) => b.id)).toEqual(['GALLERY:faixa']);
    expect(filterBlocks(blocks, '', 'apoio').every((b) => b.category === 'apoio')).toBe(true);
    expect(filterBlocks(blocks, 'xyzzy')).toEqual([]);
  });

  it('seção única que já existe leva até ela', () => {
    const sections = [sec('h', 'HERO'), sec('g', 'GALLERY')];
    expect(existingFor(blocks.find((b) => b.type === 'HERO')!, sections)?.id).toBe('h');
    // Fotos pode repetir.
    expect(existingFor(blocks.find((b) => b.type === 'GALLERY')!, sections)).toBeUndefined();
  });

  it('sugere o que falta, na ordem de importância, sem repetir única oculta', () => {
    const sections = [sec('h', 'HERO'), sec('a', 'ABOUT'), sec('l', 'LOCATION', { hidden: true })];
    const sug = suggestedBlocks(blocks, sections);
    expect(sug.map((b) => b.type)).toEqual(['GIRAS_CALENDAR', 'CONTACT', 'GALLERY', 'ROTINA']);
  });

  it('o dado do arrastar ida e volta, e lixo vira null', () => {
    const b = blocks.find((x) => x.id === 'SOCIAL:icones')!;
    expect(decodeBlockDrag(encodeBlockDrag(b), blocks)).toBe(b);
    expect(decodeBlockDrag('não é json', blocks)).toBeNull();
    expect(decodeBlockDrag('{"id":"NADA"}', blocks)).toBeNull();
    expect(BLOCK_DRAG_MIME).toMatch(/^application\//);
  });

  it('solta antes da primeira seção cujo meio está abaixo do ponteiro', () => {
    const mids = [100, 300, 500];
    expect(dropIndexFor(50, mids)).toBe(0);
    expect(dropIndexFor(150, mids)).toBe(1);
    expect(dropIndexFor(499, mids)).toBe(2);
    expect(dropIndexFor(900, mids)).toBe(3);
    expect(dropIndexFor(10, [])).toBe(0);
  });
});
