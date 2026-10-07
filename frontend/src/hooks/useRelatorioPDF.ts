/**
 * useRelatorioPDF — gera o PDF A4 do Relatório da gira.
 *
 * Fluxo:
 *  1. Monta RelatorioPDFLayout (só a página de resumo: big numbers + gráficos) oculto no DOM
 *  2. html2canvas → imagem da página 1
 *  3. Tabela de senhas (páginas 2+) desenhada como texto pelo jspdf-autotable — cabeçalho
 *     do terreiro e rodapé "Página X de Y" em cada página, quebra de página automática.
 *     Antes a tabela também era foto do HTML e o html2canvas cortava a parte de baixo do
 *     texto das células (bug de out/2026, ver lib/pdf/pdfDoc.ts).
 *  4. Salva e desmonta o layout
 */

import { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import React from 'react';
import RelatorioPDFLayout, {
  type PdfTicket,
  type PdfDoorStats,
  type PdfTenant,
} from '../components/pdf/RelatorioPDFLayout';
import { loadPdfLibs, loadRoundLogo, slugify } from '@/lib/pdf/pdfDoc';
import { desenharTabelaRelatorio } from '@/lib/pdf/relatorioTabelaPdf';

interface GenerateParams {
  tickets: PdfTicket[];
  doorStats: PdfDoorStats;
  gira: { nome: string; data?: string };
  tenant: PdfTenant;
}

export function useRelatorioPDF() {
  const [loading, setLoading] = useState(false);
  const mountNodeRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ReturnType<typeof ReactDOM.createRoot> | null>(null);

  const cleanup = useCallback(() => {
    if (rootRef.current) {
      try { rootRef.current.unmount(); } catch { /* ignore */ }
      rootRef.current = null;
    }
    if (mountNodeRef.current && document.body.contains(mountNodeRef.current)) {
      document.body.removeChild(mountNodeRef.current);
      mountNodeRef.current = null;
    }
  }, []);

  const generate = useCallback(
    async ({ tickets, doorStats, gira, tenant }: GenerateParams) => {
      if (loading) return;
      setLoading(true);

      try {
        const [{ jsPDF, autoTable }, html2canvas, logo] = await Promise.all([
          loadPdfLibs(),
          import('html2canvas').then((m) => m.default),
          loadRoundLogo(tenant.logoUrl),
        ]);

        // 1. Página de resumo renderizada fora da tela
        const mountNode = document.createElement('div');
        mountNode.style.cssText =
          'position:absolute;left:-9999px;top:0;z-index:-9999;pointer-events:none;';
        document.body.appendChild(mountNode);
        mountNodeRef.current = mountNode;

        const root = ReactDOM.createRoot(mountNode);
        rootRef.current = root;
        await new Promise<void>((resolve) => {
          root.render(React.createElement(RelatorioPDFLayout, { tickets, doorStats, gira, tenant }));
          // Aguarda React finalizar renderização (animações desativadas nos charts)
          setTimeout(resolve, 200);
        });

        const dashboard = mountNode.querySelector<HTMLElement>('[data-pdf-page="dashboard"]');
        if (!dashboard) throw new Error('Página de resumo do PDF não encontrada.');

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

        // 2. Página 1 — imagem do resumo
        const canvas = await html2canvas(dashboard, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          width: 794,
          windowWidth: 794,
        });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');

        // 3. Páginas 2+ — tabela de senhas (texto, não foto)
        pdf.addPage();
        desenharTabelaRelatorio(pdf, autoTable, {
          tickets,
          gira,
          brand: { nome: tenant.nome, logoUrl: tenant.logoUrl, primaryColor: tenant.primaryColor },
          logo,
        });

        // 4. Salva o arquivo
        pdf.save(`relatorio-${slugify(gira.nome)}-${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (err) {
        console.error('[useRelatorioPDF] Erro ao gerar PDF:', err);
        throw err;
      } finally {
        cleanup();
        setLoading(false);
      }
    },
    [loading, cleanup],
  );

  return { generate, loading };
}
