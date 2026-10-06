/**
 * Helpers das jornadas de operação: número/status da senha, nome na TV, gira de hoje em
 * andamento, data do gráfico do dashboard e texto do WhatsApp por gira.
 */
import { nomeParaTv, normalizeLegacyStatus, numeroDaSenha, senhaStatusLabel } from '@/components/admin/senhaFormat';
import { pickTodayGira, type GiraSummary } from '@/components/admin/GiraContext';
import { buildWhatsAppShareUrl } from '@/components/admin/ShareLinkDialog';

jest.mock('@/services/api_client', () => ({ apiClient: { get: jest.fn() } }));

describe('senhaFormat', () => {
  it('monta P001 para associado quando a API não manda numero_formatado', () => {
    expect(numeroDaSenha({ numero: 1, is_sponsor: true })).toBe('P001');
    expect(numeroDaSenha({ numero: 1 })).toBe('0001');
    expect(numeroDaSenha({ numero: 1, numero_formatado: '#P001' })).toBe('P001');
  });

  it('"called" antigo vira aguardando', () => {
    expect(senhaStatusLabel('called')).toBe('Aguardando');
    expect(normalizeLegacyStatus({ id: 'x', status: 'called' }).status).toBe('emitted');
    expect(normalizeLegacyStatus({ id: 'x', status: 'completed' }).status).toBe('completed');
  });

  it('na TV aparece só o primeiro nome e a inicial do sobrenome', () => {
    expect(nomeParaTv('Maria da Silva Souza')).toBe('Maria S.');
    expect(nomeParaTv('  joão  ')).toBe('joão');
    expect(nomeParaTv(null)).toBe('');
  });
});

describe('pickTodayGira', () => {
  const g = (id: string, inicio: Date): GiraSummary => ({ id, nome: id, data_inicio: inicio.toISOString(), is_active: true });

  it('gira que começou ontem à noite e ainda está em andamento vence a próxima da semana', () => {
    const now = new Date(2026, 2, 10, 1, 0); // 01h do dia 10
    const ontem = g('ontem-22h', new Date(2026, 2, 9, 22, 0));
    const semanaQueVem = g('dia-17', new Date(2026, 2, 17, 20, 0));
    expect(pickTodayGira([semanaQueVem, ontem], now)?.id).toBe('ontem-22h');
  });

  it('passadas 12h do início, a próxima gira assume', () => {
    const now = new Date(2026, 2, 10, 11, 0);
    const ontem = g('ontem-22h', new Date(2026, 2, 9, 22, 0));
    const semanaQueVem = g('dia-17', new Date(2026, 2, 17, 20, 0));
    expect(pickTodayGira([semanaQueVem, ontem], now)?.id).toBe('dia-17');
  });
});

describe('dashboard formatChartDate', () => {
  it('"YYYY-MM-DD" mostra o próprio dia, sem voltar um dia pelo fuso', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { formatChartDate } = require('@/pages/admin/dashboard');
    expect(formatChartDate('2026-03-09')).toBe('09/03');
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('link de uma gira não diz que vale para todas as giras', () => {
    const url = decodeURIComponent(buildWhatsAppShareUrl('https://x/public/gira/1', 'Casa', 'Gira de Ogum'));
    expect(url).toContain('para a Gira de Ogum do Casa');
    expect(url).not.toContain('todas as giras');
    expect(decodeURIComponent(buildWhatsAppShareUrl('https://x/s', 'Casa'))).toContain('todas as giras');
  });
});
