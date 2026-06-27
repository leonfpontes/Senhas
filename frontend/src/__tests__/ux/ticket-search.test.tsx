/**
 * Verifica a lógica de busca livre de tickets (número, nome, email),
 * espelhando o filtro client-side aplicado em pages/admin/tickets/index.tsx.
 */
interface T { numero: number; consulente_nome?: string; consulente_email?: string; }

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function filterTickets(tickets: T[], search: string): T[] {
  const q = search.trim();
  if (!q) return tickets;
  const needle = normalize(q.replace(/^#/, ''));
  return tickets.filter((t) => {
    const numStr = String(t.numero);
    const numPadded = String(t.numero).padStart(4, '0');
    return (
      numStr.includes(needle) ||
      numPadded.includes(needle) ||
      normalize(t.consulente_nome ?? '').includes(needle) ||
      normalize(t.consulente_email ?? '').includes(needle)
    );
  });
}

const data: T[] = [
  { numero: 42, consulente_nome: 'João Silva', consulente_email: 'joao@ex.com' },
  { numero: 7, consulente_nome: 'Maria Souza', consulente_email: 'maria@ex.com' },
  { numero: 130, consulente_nome: 'Ana', consulente_email: 'ana@teste.com' },
];

describe('Busca de tickets', () => {
  it('filtra por número (com e sem padding/#)', () => {
    expect(filterTickets(data, '42').map((t) => t.numero)).toEqual([42]);
    expect(filterTickets(data, '#42').map((t) => t.numero)).toEqual([42]);
    expect(filterTickets(data, '0042').map((t) => t.numero)).toEqual([42]);
  });

  it('filtra por nome (case e acento insensível)', () => {
    expect(filterTickets(data, 'joao').map((t) => t.numero)).toEqual([42]);
    expect(filterTickets(data, 'MARIA').map((t) => t.numero)).toEqual([7]);
  });

  it('filtra por email', () => {
    expect(filterTickets(data, 'teste.com').map((t) => t.numero)).toEqual([130]);
  });

  it('retorna tudo quando busca vazia', () => {
    expect(filterTickets(data, '').length).toBe(3);
  });
});
