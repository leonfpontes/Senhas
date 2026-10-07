/**
 * RelatorioPDFLayout — componente oculto que renderiza o conteúdo A4 do PDF.
 *
 * Só a página 1 (seção "dashboard": header + big numbers + 2 PieCharts + LineChart).
 * A tabela de senhas (páginas 2+) é desenhada como texto pelo jspdf-autotable em
 * useRelatorioPDF — antes era HTML capturado aqui e o html2canvas cortava o texto
 * das células (bug de out/2026).
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

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface PdfTicket {
  id: string;
  numero: number;
  numero_formatado?: string | null;
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

// ── Componente Principal Exportado ─────────────────────────────────────────────

const RelatorioPDFLayout = forwardRef<HTMLDivElement, RelatorioPDFLayoutProps>(
  function RelatorioPDFLayout({ tickets, doorStats, gira, tenant }, ref) {
    return (
      <div
        ref={ref}
        style={{ position: 'fixed', top: 0, left: 0, zIndex: -9999, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <DashboardPage tickets={tickets} doorStats={doorStats} gira={gira} tenant={tenant} />
      </div>
    );
  },
);

export default RelatorioPDFLayout;
