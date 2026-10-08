/**
 * Manifest do PWA (P-01): campos que o Chrome/Android e o Lighthouse exigem para instalar, e
 * ícones que existem de verdade em public/ com o tamanho declarado.
 */
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'manifest.webmanifest'), 'utf8'));

/** Largura/altura de um PNG (cabeçalho IHDR). */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function publicFile(url: string): string {
  return path.join(PUBLIC_DIR, url.replace(/^\//, ''));
}

describe('manifest.webmanifest', () => {
  it('tem os campos obrigatórios da instalação', () => {
    expect(manifest.name).toBe('GiraHub');
    expect(manifest.short_name).toBe('GiraHub');
    expect(manifest.start_url).toBe('/admin/porta?source=pwa');
    expect(manifest.scope).toBe('/');
    expect(['standalone', 'fullscreen']).toContain(manifest.display);
    expect(manifest.orientation).toBe('any');
    expect(manifest.theme_color).toBe('#4f46e5');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.lang).toBe('pt-BR');
    expect(typeof manifest.description).toBe('string');
    expect(manifest.description.length).toBeGreaterThan(10);
  });

  it('declara ícones 192 e 512 (any) e um maskable 512, todos existentes com o tamanho certo', () => {
    const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> = manifest.icons;
    const has = (sizes: string, purpose: string) =>
      icons.some((i) => i.sizes === sizes && (i.purpose ?? 'any').split(' ').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const icon of icons) {
      const file = publicFile(icon.src);
      expect(fs.existsSync(file)).toBe(true);
      expect(icon.type).toBe('image/png');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
  });

  it('tem atalhos para Porta, Giras e Senhas dentro do escopo, com ícones existentes', () => {
    const names = manifest.shortcuts.map((s: { name: string }) => s.name);
    expect(names).toEqual(['Porta', 'Giras', 'Senhas']);
    for (const s of manifest.shortcuts) {
      expect(s.url.startsWith('/admin/')).toBe(true);
      for (const icon of s.icons ?? []) expect(fs.existsSync(publicFile(icon.src))).toBe(true);
    }
  });

  it('favicon.ico e apple-touch-icon existem e não estão vazios', () => {
    const ico = fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.ico'));
    expect(ico.length).toBeGreaterThan(0);
    expect(ico.readUInt16LE(2)).toBe(1); // tipo ícone
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(3); // 16/32/48
    expect(pngSize(path.join(PUBLIC_DIR, 'apple-touch-icon.png'))).toEqual({ width: 180, height: 180 });
  });

  it('o _document linka o manifest e as meta tags do iOS', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', '_document.tsx'), 'utf8');
    expect(doc).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(doc).toContain('rel="apple-touch-icon"');
    expect(doc).toContain('name="apple-mobile-web-app-capable"');
    expect(doc).toContain('name="apple-mobile-web-app-status-bar-style"');
    expect(doc).toContain('name="apple-mobile-web-app-title"');
  });
});

// Área do Médium (AM-06, D-23): o ícone na tela inicial abre a Área, não a Porta.
describe('manifest-medium.webmanifest', () => {
  const medium = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'manifest-medium.webmanifest'), 'utf8'));

  it('tem id e start_url da Área, instalável, com os ícones do GiraHub', () => {
    expect(medium.id).toBe('/medium');
    expect(medium.start_url).toBe('/medium?source=pwa');
    expect(medium.id).not.toBe(manifest.id);
    expect(['standalone', 'fullscreen']).toContain(medium.display);
    expect(medium.lang).toBe('pt-BR');
    expect(medium.name).toMatch(/Área do Médium/);
    expect(medium.icons).toEqual(manifest.icons);
    for (const s of medium.shortcuts ?? []) expect(s.url.startsWith('/medium/')).toBe(true);
  });

  it('só o MediumLayout linka o manifesto da Área; o _document não põe o da Porta nas rotas /medium', () => {
    const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'medium', 'MediumLayout.tsx'), 'utf8');
    expect(layout).toContain('rel="manifest" href="/manifest-medium.webmanifest"');
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'pages', '_document.tsx'), 'utf8');
    expect(doc).not.toContain('manifest-medium');
    expect(doc).toMatch(/!areaDoMedium && <link rel="manifest" href="\/manifest.webmanifest" \/>/);
  });
});
