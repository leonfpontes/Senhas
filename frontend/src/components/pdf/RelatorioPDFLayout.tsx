/**
 * RelatorioPDFLayout — componente oculto que renderiza o conteúdo A4 do PDF.
 *
 * Estrutura:
 *  - Seção "dashboard" (página 1): header + big numbers + 2 PieCharts + LineChart
 *  - Seções "table-N" (páginas 2+): header compacto + chunk de até ROWS_PER_PAGE linhas + footer
 *
 * Renderizado fora da viewport (left: -9999px). Capturado por useRelatorioPDF com html2canvas.
 * Largura fixa 794px = A4 @ 96dpi. html2canvas usa scale: 2 → 1588×2246px = ~190dpi.
 */

import React, { forwardRef } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

// ── Constantes A4 ──────────────────────────────────────────────────────────────
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123; // 297mm @ 96dpi (≈ 1122.5)
const PAGE_PADDING_H = 36; // ~10mm
const PAGE_PADDING_V = 28; // ~7.5mm
const ROWS_PER_PAGE = 16; // linhas de tabela por página. Medido no navegador (altura real de
// linha ≈57px com fonte 14 e clamp de 2 linhas) para garantir espaço mesmo se TODAS as
// linhas tiverem 2 linhas de texto em Nome/Médium/Cambone/Observações — ver clamp2Style
// abaixo. Essas colunas quebram linha em vez de truncar com "...", para não perder
// informação impressa; por isso o orçamento de altura da linha assume o pior caso (2
// linhas) em qualquer uma delas. Sem essa margem, o
// `overflow: hidden` da página cortaria linhas da tabela silenciosamente.

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface PdfTicket {
  id: string;
  numero: number;
  status: string;
  consulente_nome?: string;
  preferencial?: boolean;
  is_sponsor?: boolean;
  is_walk_in?: boolean;
  medium_nome?: string;
  cambone_nome?: string;
  atendimento_descricao?: string;
  observacoes?: string;
  checkin_em?: string | null;
}

export interface PdfDoorStats {
  total: number;
  checked_in: number;
  awaiting: number;
  in_progress: number;
  completed: number;
  no_show: number;
  walk_in: number;
  preferenciais: number;
  patrocinados: number;
}

export interface PdfTenant {
  nome: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface RelatorioPDFLayoutProps {
  tickets: PdfTicket[];
  doorStats: PdfDoorStats;
  gira: { nome: string; data?: string };
  tenant: PdfTenant;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTag(t: PdfTicket): { label: string; color: string; bg: string } {
  if (t.is_sponsor)   return { label: 'Associado',    color: '#b8860b', bg: '#fef9e7' };
  if (t.preferencial) return { label: 'Preferencial', color: '#e65100', bg: '#fff3e0' };
  if (t.is_walk_in)   return { label: 'Walk-in',      color: '#1565c0', bg: '#e3f2fd' };
  return                       { label: 'Comum',       color: '#546e7a', bg: '#f5f5f5' };
}

/** Agrupa checkins por slot de 30min e retorna array para LineChart */
function buildCheckinTimeline(tickets: PdfTicket[]): { slot: string; qtd: number }[] {
  const counts: Record<string, number> = {};
  tickets.forEach((t) => {
    if (!t.checkin_em) return;
    const d = new Date(t.checkin_em);
    const h = d.getHours();
    const m = d.getMinutes() < 30 ? '00' : '30';
    const key = `${String(h).padStart(2, '0')}:${m}`;
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, qtd]) => ({ slot, qtd }));
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function now(): string {
  return new Date().toLocaleString('pt-BR');
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  width: A4_WIDTH_PX,
  minHeight: A4_HEIGHT_PX,
  maxHeight: A4_HEIGHT_PX,
  overflow: 'hidden',
  boxSizing: 'border-box',
  paddingLeft: PAGE_PADDING_H,
  paddingRight: PAGE_PADDING_H,
  paddingTop: PAGE_PADDING_V,
  paddingBottom: PAGE_PADDING_V,
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', Arial, sans-serif",
  fontSize: 13,
  color: '#212121',
  display: 'flex',
  flexDirection: 'column',
};

const dividerStyle: React.CSSProperties = {
  borderBottom: '1.5px solid #e0e0e0',
  marginBottom: 12,
  marginTop: 4,
};

/** Header completo — logo + nome do terreiro + nome da gira */
function Header({ tenant, gira }: { tenant: PdfTenant; gira: { nome: string; data?: string } }) {
  const initial = (tenant.nome || 'T')[0].toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 10,
      }}
    >
      {/* Logo ou avatar */}
      {tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logoUrl}
          alt="logo"
          crossOrigin="anonymous"
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            objectFit: 'cover',
            border: `2px solid ${tenant.primaryColor}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            backgroundColor: tenant.primaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 24,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}

      {/* Textos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: tenant.primaryColor, lineHeight: 1.2 }}>
          {tenant.nome}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#333', lineHeight: 1.2 }}>
          {gira.nome}
          {gira.data ? (
            <span style={{ fontWeight: 400, color: '#666', marginLeft: 6 }}>
              — {formatDate(gira.data)}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>Relatório de Gira</div>
      </div>
    </div>
  );
}

/** Header compacto para páginas de tabela */
function HeaderCompact({
  tenant,
  gira,
}: {
  tenant: PdfTenant;
  gira: { nome: string; data?: string };
}) {
  const initial = (tenant.nome || 'T')[0].toUpperCase();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}
    >
      {tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logoUrl}
          alt="logo"
          crossOrigin="anonymous"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            objectFit: 'cover',
            border: `2px solid ${tenant.primaryColor}`,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: tenant.primaryColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: tenant.primaryColor }}>
          {tenant.nome}
        </span>
        <span style={{ fontSize: 12, color: '#666' }}>
          {gira.nome}
          {gira.data ? ` — ${formatDate(gira.data)}` : ''}
        </span>
      </div>
    </div>
  );
}

/** Footer da página 1 (dashboard) */
function FooterDashboard() {
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 10,
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11,
        color: '#9e9e9e',
      }}
    >
      <span>Gerado em {now()}</span>
      <span>Senhas Admin — girahub.com.br</span>
    </div>
  );
}

/** Footer das páginas de tabela com numeração */
function FooterTable({
  gira,
  page,
  total,
}: {
  gira: { nome: string };
  page: number;
  total: number;
}) {
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 8,
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        color: '#9e9e9e',
      }}
    >
      <span>{gira.nome}</span>
      <span>
        Página {page} de {total}
      </span>
    </div>
  );
}

/** Card de big number */
function BigNumberCard({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: '8px 6px',
        borderRadius: 6,
        backgroundColor: bg,
        border: `1px solid ${color}30`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <div style={{ fontSize: 25, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#555', textAlign: 'center', lineHeight: 1.2 }}>{label}</div>
    </div>
  );
}

// ── Página 1: Dashboard ────────────────────────────────────────────────────────

function DashboardPage({
  tickets,
  doorStats,
  gira,
  tenant,
}: RelatorioPDFLayoutProps) {
  const timelineData = buildCheckinTimeline(tickets);

  const pieAtend = [
    { name: 'Atendidos', value: doorStats.completed },
    { name: 'Não compareceram', value: doorStats.no_show },
  ];
  const pieTipos = [
    { name: 'Preferenciais', value: doorStats.preferenciais },
    { name: 'Comuns', value: Math.max(0, doorStats.total - doorStats.preferenciais) },
  ];

  const PIE_COLORS_ATEND = ['#4caf50', '#ef5350'];
  const PIE_COLORS_TIPOS = ['#ff9800', '#90a4ae'];

  const emptyTimeline = timelineData.length === 0;

  const innerW = A4_WIDTH_PX - PAGE_PADDING_H * 2;
  const halfW = (innerW - 16) / 2; // espaço entre os pies

  return (
    <div data-pdf-page="dashboard" style={pageStyle}>
      <Header tenant={tenant} gira={gira} />
      <div style={dividerStyle} />

      {/* Big Numbers */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Resumo da Gira
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <BigNumberCard label="Total" value={doorStats.total} color="#455a64" bg="#f5f5f5" />
          <BigNumberCard label="Atendidos" value={doorStats.completed} color="#2e7d32" bg="#f1f8e9" />
          <BigNumberCard label="Ausentes" value={doorStats.no_show} color="#c62828" bg="#ffebee" />
          <BigNumberCard label="Preferenciais" value={doorStats.preferenciais} color="#e65100" bg="#fff3e0" />
          <BigNumberCard label="Walk-in" value={doorStats.walk_in} color="#0277bd" bg="#e1f5fe" />
          <BigNumberCard label="Patrocinados" value={doorStats.patrocinados} color="#b8860b" bg="#fef9e7" />
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Gráficos de Pizza (lado a lado) */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Distribuição de Senhas
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Pie 1 — Atendidas vs Ausentes */}
          <div
            style={{
              width: halfW,
              background: '#fafafa',
              borderRadius: 6,
              border: '1px solid #eeeeee',
              padding: '10px 8px 4px',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#333',
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              Atendidas vs Não Comparecidas
            </div>
            <PieChart width={halfW - 16} height={180}>
              <Pie
                data={pieAtend}
                cx="50%"
                cy="50%"
                outerRadius={62}
                dataKey="value"
                isAnimationActive={false}
                label={({ percent }) =>
                  percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
                fontSize={10}
              >
                {pieAtend.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS_ATEND[i % PIE_COLORS_ATEND.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, '']} />
              <Legend
                iconSize={10}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#444' }}>{value}</span>
                )}
              />
            </PieChart>
          </div>

          {/* Pie 2 — Preferenciais vs Comuns */}
          <div
            style={{
              width: halfW,
              background: '#fafafa',
              borderRadius: 6,
              border: '1px solid #eeeeee',
              padding: '10px 8px 4px',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#333',
                textAlign: 'center',
                marginBottom: 6,
              }}
            >
              Preferenciais vs Comuns
            </div>
            <PieChart width={halfW - 16} height={180}>
              <Pie
                data={pieTipos}
                cx="50%"
                cy="50%"
                outerRadius={62}
                dataKey="value"
                isAnimationActive={false}
                label={({ percent }) =>
                  percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
                fontSize={10}
              >
                {pieTipos.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS_TIPOS[i % PIE_COLORS_TIPOS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, '']} />
              <Legend
                iconSize={10}
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#444' }}>{value}</span>
                )}
              />
            </PieChart>
          </div>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Timeline de Check-ins */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Timeline de Check-ins (por intervalo de 30min)
        </div>

        {emptyTimeline ? (
          <div
            style={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fafafa',
              borderRadius: 6,
              border: '1px solid #eeeeee',
              color: '#bdbdbd',
              fontSize: 11,
            }}
          >
            Nenhum check-in registrado nesta gira.
          </div>
        ) : (
          <div
            style={{
              background: '#fafafa',
              borderRadius: 6,
              border: '1px solid #eeeeee',
              padding: '10px 8px 4px',
            }}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timelineData} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeeeee" />
                <XAxis
                  dataKey="slot"
                  tick={{ fontSize: 11, fill: '#666' }}
                  tickLine={false}
                  axisLine={{ stroke: '#ddd' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#666' }}
                  tickLine={false}
                  axisLine={{ stroke: '#ddd' }}
                  width={28}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} check-ins`, '']}
                  labelFormatter={(l) => `Horário: ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="qtd"
                  stroke={tenant.primaryColor}
                  strokeWidth={2}
                  dot={{ r: 3, fill: tenant.primaryColor }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  name="Check-ins"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <FooterDashboard />
    </div>
  );
}

// ── Páginas de Tabela ──────────────────────────────────────────────────────────

function TablePage({
  tickets,
  gira,
  tenant,
  pageIndex,
  totalPages,
}: {
  tickets: PdfTicket[];
  gira: { nome: string; data?: string };
  tenant: PdfTenant;
  pageIndex: number;    // 0-based index desta página de tabela
  totalPages: number;   // total geral incluindo dashboard
}) {
  const thStyle: React.CSSProperties = {
    padding: '7px 7px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderBottom: '1.5px solid #e0e0e0',
    whiteSpace: 'nowrap',
    backgroundColor: '#f5f5f5',
  };

  const tdStyle: React.CSSProperties = {
    padding: '7px 7px',
    fontSize: 14,
    borderBottom: '1px solid #f0f0f0',
    verticalAlign: 'top',
  };

  // Colunas que priorizam quebra de linha sobre truncamento: em vez de cortar o texto
  // com "..." em 1 linha, deixa quebrar em até 2 linhas. Mantém o mesmo orçamento de
  // altura (2 linhas) usado pela coluna Observações, para não desalinhar ROWS_PER_PAGE.
  // O clamp fica numa <div> interna, não no <td> diretamente: aplicar `display:
  // -webkit-box` num <td> tira a célula do algoritmo de table-layout e quebra o
  // alinhamento das colunas quando mais de uma célula da mesma linha usa o hack.
  const clamp2Style: React.CSSProperties = {
    wordBreak: 'break-word',
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  } as React.CSSProperties;

  const currentPage = pageIndex + 2; // +1 para 1-based, +1 pelo dashboard

  return (
    <div data-pdf-page={`table-${pageIndex}`} style={pageStyle}>
      <HeaderCompact tenant={tenant} gira={gira} />
      <div style={dividerStyle} />

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
        }}
      >
        <colgroup>
          <col style={{ width: '7%' }} />   {/* Senha */}
          <col style={{ width: '20%' }} />  {/* Nome */}
          <col style={{ width: '11%' }} />  {/* Tag */}
          <col style={{ width: '14%' }} />  {/* Médium */}
          <col style={{ width: '14%' }} />  {/* Cambone */}
          <col style={{ width: '34%' }} />  {/* Observações */}
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>Senha</th>
            <th style={thStyle}>Nome</th>
            <th style={thStyle}>Tag</th>
            <th style={thStyle}>Médium</th>
            <th style={thStyle}>Cambone</th>
            <th style={thStyle}>Observações</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t, i) => {
            const tag = getTag(t);
            const isEven = i % 2 === 0;
            return (
              <tr key={t.id} style={{ backgroundColor: isEven ? '#ffffff' : '#fafafa' }}>
                <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap', color: '#333' }}>
                  #{String(t.numero).padStart(4, '0')}
                </td>
                <td style={tdStyle}>
                  <div style={clamp2Style}>{t.consulente_nome || '—'}</div>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: 10,
                      backgroundColor: tag.bg,
                      color: tag.color,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag.label}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: '#555' }}>
                  <div style={clamp2Style}>{t.medium_nome || '—'}</div>
                </td>
                <td style={{ ...tdStyle, color: '#555' }}>
                  <div style={clamp2Style}>{t.cambone_nome || '—'}</div>
                </td>
                <td style={{ ...tdStyle, color: '#555' }}>
                  <div style={clamp2Style}>{t.atendimento_descricao || '—'}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <FooterTable gira={gira} page={currentPage} total={totalPages} />
    </div>
  );
}

// ── Componente Principal Exportado ─────────────────────────────────────────────

const RelatorioPDFLayout = forwardRef<HTMLDivElement, RelatorioPDFLayoutProps>(
  function RelatorioPDFLayout({ tickets, doorStats, gira, tenant }, ref) {
    const chunks: PdfTicket[][] = [];
    for (let i = 0; i < tickets.length; i += ROWS_PER_PAGE) {
      chunks.push(tickets.slice(i, i + ROWS_PER_PAGE));
    }
    if (chunks.length === 0) chunks.push([]); // garante ao menos 1 página de tabela

    const totalTablePages = chunks.length;
    const totalPages = 1 + totalTablePages; // 1 dashboard + N tabelas

    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: -9999,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
        aria-hidden="true"
      >
        {/* Página 1 — Dashboard */}
        <DashboardPage
          tickets={tickets}
          doorStats={doorStats}
          gira={gira}
          tenant={tenant}
        />

        {/* Páginas 2+ — Tabela */}
        {chunks.map((chunk, i) => (
          <TablePage
            key={i}
            tickets={chunk}
            gira={gira}
            tenant={tenant}
            pageIndex={i}
            totalPages={totalPages}
          />
        ))}
      </div>
    );
  },
);

export default RelatorioPDFLayout;
export { ROWS_PER_PAGE };
