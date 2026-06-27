import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FluxoMes {
  ano: number;
  mes: number;
  mes_label: string;
  receitas: number;
  despesas: number;
  saldo: number;
  saldo_acumulado: number;
  a_receber: number;
  a_pagar: number;
}

export interface ProjecaoMes {
  mes_label: string;
  valor: number;
}

export interface RelatorioProps {
  dados: FluxoMes[];
  projecoes: ProjecaoMes[];
  r2: number | null;
  periodo: { inicio: string; fim: string };
  tenantName: string;
  logoUrl?: string | null;
  logoBase64?: string | null;
  geradoPor: string;
  geradoEm: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function svgBars(
  data: { label: string; a: number; b: number }[],
  colorA: string,
  colorB: string,
  width: number,
  height: number,
  labelA: string,
  labelB: string,
): React.ReactElement {
  if (data.length === 0) return <svg width={width} height={height} />;

  const padL = 62, padR = 12, padT = 20, padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const maxVal = Math.max(...data.flatMap((d) => [d.a, d.b]), 1);
  const groupW = chartW / data.length;
  const barW = Math.min((groupW * 0.7) / 2, 18);

  const yScale = (v: number) => chartH - (v / maxVal) * chartH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => maxVal * f);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* grid lines */}
      {ticks.map((t, i) => {
        const y = padT + yScale(t);
        return (
          <g key={i}>
            <line x1={padL} x2={padL + chartW} y1={y} y2={y} stroke="#E5E9F0" strokeWidth={1} />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#999">
              {t >= 1000 ? `R$${(t / 1000).toFixed(0)}k` : `R$${t.toFixed(0)}`}
            </text>
          </g>
        );
      })}
      {/* bars */}
      {data.map((d, i) => {
        const cx = padL + i * groupW + groupW / 2;
        const hA = (d.a / maxVal) * chartH;
        const hB = (d.b / maxVal) * chartH;
        return (
          <g key={i}>
            <rect
              x={cx - barW - 1}
              y={padT + yScale(d.a)}
              width={barW}
              height={hA}
              fill={colorA}
              rx={2}
            />
            <rect
              x={cx + 1}
              y={padT + yScale(d.b)}
              width={barW}
              height={hB}
              fill={colorB}
              rx={2}
            />
            <text x={cx} y={padT + chartH + 14} textAnchor="middle" fontSize={8} fill="#777">
              {d.label}
            </text>
          </g>
        );
      })}
      {/* legend */}
      <rect x={padL} y={2} width={8} height={8} fill={colorA} rx={2} />
      <text x={padL + 11} y={9} fontSize={8} fill="#555">{labelA}</text>
      <rect x={padL + 80} y={2} width={8} height={8} fill={colorB} rx={2} />
      <text x={padL + 91} y={9} fontSize={8} fill="#555">{labelB}</text>
    </svg>
  );
}

function svgSaldoBars(
  data: { label: string; v: number }[],
  width: number,
  height: number,
): React.ReactElement {
  if (data.length === 0) return <svg width={width} height={height} />;

  const padL = 62, padR = 12, padT = 16, padB = 30;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const min = Math.min(...data.map((d) => d.v), 0);
  const max = Math.max(...data.map((d) => d.v), 0);
  const range = max - min || 1;

  const yZero = padT + ((max / range) * chartH);
  const barW = Math.min((chartW / data.length) * 0.6, 24);

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* zero line */}
      <line x1={padL} x2={padL + chartW} y1={yZero} y2={yZero} stroke="#CCC" strokeWidth={1} strokeDasharray="4 2" />
      {/* ticks */}
      {[min, min / 2, 0, max / 2, max].filter((v, i, a) => a.indexOf(v) === i).map((t, i) => {
        const y = padT + ((max - t) / range) * chartH;
        return (
          <g key={i}>
            <line x1={padL} x2={padL + chartW} y1={y} y2={y} stroke="#E5E9F0" strokeWidth={1} />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#999">
              {Math.abs(t) >= 1000 ? `R$${(t / 1000).toFixed(0)}k` : `R$${t.toFixed(0)}`}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = padL + (i / data.length) * chartW + chartW / data.length / 2;
        const pos = d.v >= 0;
        const barH = (Math.abs(d.v) / range) * chartH;
        const y = pos ? yZero - barH : yZero;
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={barH}
              fill={pos ? '#1B7A4E' : '#C0392B'}
              rx={2}
            />
            <text x={cx} y={padT + chartH + 14} textAnchor="middle" fontSize={8} fill="#777">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RelatorioFluxoCaixaPDF = React.forwardRef<HTMLDivElement, RelatorioProps>(
  function RelatorioFluxoCaixaPDF(
    { dados, projecoes, r2, periodo, tenantName, logoUrl, logoBase64, geradoPor, geradoEm },
    ref,
  ) {
    const totalReceitas = dados.reduce((s, d) => s + d.receitas, 0);
    const totalDespesas = dados.reduce((s, d) => s + d.despesas, 0);
    const saldoFinal = dados[dados.length - 1]?.saldo_acumulado ?? 0;
    const aReceber = dados.reduce((s, d) => s + d.a_receber, 0);
    const aPagar = dados.reduce((s, d) => s + d.a_pagar, 0);

    const barData = dados.map((d) => ({ label: d.mes_label, a: d.receitas, b: d.despesas }));
    const saldoData = dados.map((d) => ({ label: d.mes_label, v: d.saldo_acumulado }));

    const periodoLabel = `${periodo.inicio} – ${periodo.fim}`;
    const mesesLabel = dados.length === 1 ? '1 mês' : `${dados.length} meses`;

    const logoSrc = logoBase64 ?? logoUrl ?? null;

    return (
      <div
        ref={ref}
        style={{
          width: 794,
          minHeight: 1123,
          backgroundColor: '#FFFFFF',
          padding: '48px',
          fontFamily: 'Arial, sans-serif',
          fontSize: 11,
          color: '#1A1A1A',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 20, borderBottom: '3px solid #2C3E7A', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {logoSrc ? (
              <img
                src={logoSrc}
                alt="Logo"
                style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8 }}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{ width: 56, height: 56, background: '#2C3E7A', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontSize: 24, fontWeight: 700 }}>
                {(tenantName || 'T').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2C3E7A' }}>{tenantName}</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Sistema de Gestão para Terreiros</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C3E7A' }}>Relatório de Fluxo de Caixa</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.7 }}>
              Período: <strong>{periodoLabel}</strong><br />
              Gerado em: {geradoEm}<br />
              Gerado por: {geradoPor}
            </div>
            <div style={{ display: 'inline-block', background: '#E8EBF5', color: '#2C3E7A', padding: '2px 10px', borderRadius: 12, fontSize: 9, fontWeight: 700, marginTop: 4 }}>
              {mesesLabel}
            </div>
          </div>
        </div>

        {/* ── KPI CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            {
              label: 'Saldo Acumulado',
              value: fmtBRL(saldoFinal),
              sub: 'ao final do período',
              borderColor: saldoFinal >= 0 ? '#1B7A4E' : '#C0392B',
              bg: saldoFinal >= 0 ? '#F0FAF5' : '#FFF5F5',
              color: saldoFinal >= 0 ? '#1B7A4E' : '#C0392B',
            },
            { label: 'Total Recebido', value: fmtBRL(totalReceitas), sub: 'receitas pagas', borderColor: '#2C3E7A', bg: '#F5F7FF', color: '#1A1A1A' },
            { label: 'Total Pago', value: fmtBRL(totalDespesas), sub: 'despesas pagas', borderColor: '#C0392B', bg: '#FFF5F5', color: '#C0392B' },
            {
              label: 'Pendentes',
              value: fmtBRL(aReceber - aPagar),
              sub: `rec. R$${(aReceber / 1000).toFixed(1)}k / pag. R$${(aPagar / 1000).toFixed(1)}k`,
              borderColor: '#B7770D',
              bg: '#FFFBF0',
              color: '#7A5C00',
            },
          ].map((k) => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 8, padding: 12, borderLeft: `3px solid ${k.borderColor}` }}>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── RECEITAS VS DESPESAS ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2C3E7A', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #DDE1F0' }}>
            Receitas vs Despesas por Mês
          </div>
          <div style={{ background: '#F8F9FE', border: '1px solid #DDE1F0', borderRadius: 6, padding: '12px 8px 8px' }}>
            {svgBars(barData, '#1B7A4E', '#C0392B', 698, 140, 'Recebido', 'Pago')}
          </div>
        </div>

        {/* ── SALDO ACUMULADO + PROJEÇÕES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: projecoes.length > 0 ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#2C3E7A', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #DDE1F0' }}>
              Saldo Acumulado
            </div>
            <div style={{ background: '#F8F9FE', border: '1px solid #DDE1F0', borderRadius: 6, padding: '8px 8px 4px' }}>
              {svgSaldoBars(saldoData, projecoes.length > 0 ? 330 : 698, 110)}
            </div>
          </div>

          {projecoes.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#2C3E7A', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #DDE1F0' }}>
                Projeção — Próximos {projecoes.length} Meses
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {projecoes.map((p) => (
                  <div key={p.mes_label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: p.valor >= 0 ? '#F0FAF5' : '#FFF5F5', border: `1px solid ${p.valor >= 0 ? '#B7E0CB' : '#F5B7B1'}`, borderRadius: 6, padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, color: '#555' }}>{p.mes_label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: p.valor >= 0 ? '#1B7A4E' : '#C0392B' }}>{fmtBRL(p.valor)}</span>
                  </div>
                ))}
                {r2 !== null && (
                  <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                    Regressão linear — R² = {(r2 * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── TABELA MENSAL ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2C3E7A', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #DDE1F0' }}>
            Detalhamento Mensal
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#2C3E7A', color: '#FFF' }}>
                {['Mês', 'Recebido', 'Pago', 'Saldo do Mês', 'Saldo Acumulado', 'A Receber', 'A Pagar'].map((h, i) => (
                  <th key={h} style={{ padding: '7px 8px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: 9.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.map((d, i) => {
                const isCurrentMonth = d.ano === new Date().getFullYear() && d.mes === new Date().getMonth() + 1;
                const evenBg = i % 2 === 0 ? '#F8F9FE' : '#FFFFFF';
                const bg = isCurrentMonth ? '#EBF0FF' : evenBg;
                return (
                  <tr key={`${d.ano}-${d.mes}`} style={{ background: bg, borderBottom: '1px solid #EAEDF5' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <span>{d.mes_label}</span>
                      {isCurrentMonth && (
                        <span style={{ marginLeft: 6, background: '#2C3E7A', color: '#FFF', padding: '1px 6px', borderRadius: 10, fontSize: 8, fontWeight: 700 }}>atual</span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1B7A4E', fontWeight: 600 }}>{fmtBRL(d.receitas)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#C0392B', fontWeight: 600 }}>{fmtBRL(d.despesas)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: d.saldo >= 0 ? '#1B7A4E' : '#C0392B' }}>
                      {d.saldo >= 0 ? '+' : ''}{fmtBRL(d.saldo)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: d.saldo_acumulado >= 0 ? '#1A1A1A' : '#C0392B' }}>
                      {fmtBRL(d.saldo_acumulado)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#555' }}>{d.a_receber > 0 ? fmtBRL(d.a_receber) : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#555' }}>{d.a_pagar > 0 ? fmtBRL(d.a_pagar) : '—'}</td>
                  </tr>
                );
              })}
              {/* linhas de projeção */}
              {projecoes.map((p) => (
                <tr key={`proj-${p.mes_label}`} style={{ background: '#FFFBF0', borderBottom: '1px solid #EAEDF5', fontStyle: 'italic', color: '#888' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <span>{p.mes_label}</span>
                    <span style={{ marginLeft: 6, background: '#F0DC8A', color: '#7A5C00', padding: '1px 6px', borderRadius: 10, fontSize: 8, fontWeight: 700 }}>projeção</span>
                  </td>
                  <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'right' }}>—</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: p.valor >= 0 ? '#1B7A4E' : '#C0392B' }}>{fmtBRL(p.valor)}</td>
                  <td colSpan={2} style={{ padding: '6px 8px' }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── NOTA PROJEÇÃO ── */}
        {projecoes.length > 0 && r2 !== null && (
          <div style={{ background: '#FFFBEE', border: '1px solid #F0DC8A', borderRadius: 6, padding: '8px 12px', marginBottom: 24, fontSize: 9.5, color: '#7A5C00' }}>
            <strong>Nota sobre projeções:</strong> Os valores projetados são estimativas calculadas por regressão
            linear com base no histórico do período (R² = {(r2 * 100).toFixed(1)}%). Quanto mais próximo de 100%
            o R², mais consistente é o histórico com a tendência linear. Não consideram sazonalidade, eventos
            futuros ou lançamentos já cadastrados. Use como referência indicativa.
          </div>
        )}

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid #DDE1F0', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#AAA' }}>
          <span>Senhas — Sistema de Gestão para Terreiros</span>
          <span>Gerado em {geradoEm} · Página 1 de 1</span>
        </div>
      </div>
    );
  },
);
