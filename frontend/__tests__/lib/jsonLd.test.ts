import { jsonLd } from '@/lib/jsonLd';

describe('jsonLd', () => {
  it('escapa < para um texto não fechar o <script>', () => {
    const out = jsonLd({ name: 'Casa </script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out).name).toBe('Casa </script><script>alert(1)</script>');
  });
});
