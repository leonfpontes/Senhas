/**
 * useRelatorioPDF — hook que orquestra a geração do PDF A4.
 *
 * jsPDF e html2canvas são carregados via CDN em runtime (script tag injection),
 * evitando qualquer dependência de resolução webpack/bundler.
 *
 * Fluxo:
 *  1. Injeta scripts CDN de jsPDF e html2canvas (se ainda não carregados)
 *  2. Monta RelatorioPDFLayout oculto no DOM
 *  3. Aguarda 700ms para Recharts finalizar animações
 *  4. Para cada data-pdf-page: html2canvas → canvas → jsPDF.addImage
 *  5. jsPDF.save(filename) e desmonta componente
 */

import { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import React from 'react';
import RelatorioPDFLayout, {
  type PdfTicket,
  type PdfDoorStats,
  type PdfTenant,
} from '../components/pdf/RelatorioPDFLayout';

const CDN_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CDN_HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

/** Injeta um script CDN e resolve quando estiver carregado. Idempotente. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Falha ao carregar script: ${src}`));
    document.head.appendChild(el);
  });
}

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
      try { rootRef.current.unmount(); } catch (_) { /* ignore */ }
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
        // 1. Carrega libs via CDN (idempotente — só injeta uma vez)
        await Promise.all([
          loadScript(CDN_JSPDF),
          loadScript(CDN_HTML2CANVAS),
        ]);

        // Acessa as libs expostas como UMD no window
        const jsPDFClass = (window as any).jspdf?.jsPDF ?? (window as any).jsPDF;
        const html2canvas = (window as any).html2canvas;

        if (!jsPDFClass || !html2canvas) {
          throw new Error('Bibliotecas PDF não carregaram. Verifique a conexão com a internet.');
        }

        // 2. Cria container oculto no body
        const mountNode = document.createElement('div');
        mountNode.style.cssText =
          'position:absolute;left:-9999px;top:0;z-index:-9999;pointer-events:none;';
        document.body.appendChild(mountNode);
        mountNodeRef.current = mountNode;

        // 3. Renderiza o layout no container
        const root = ReactDOM.createRoot(mountNode);
        rootRef.current = root;

        await new Promise<void>((resolve) => {
          root.render(
            React.createElement(RelatorioPDFLayout, {
              tickets,
              doorStats,
              gira,
              tenant,
            }),
          );
          // Aguarda React finalizar renderização (animações desativadas nos charts)
          setTimeout(resolve, 200);
        });

        // 4. Coleta todas as seções A4 na ordem correta
        const pages = Array.from(
          mountNode.querySelectorAll<HTMLElement>('[data-pdf-page]'),
        ).sort((a, b) => {
          const keyA = a.dataset.pdfPage ?? '';
          const keyB = b.dataset.pdfPage ?? '';
          if (keyA === 'dashboard') return -1;
          if (keyB === 'dashboard') return 1;
          const nA = parseInt(keyA.replace('table-', ''), 10);
          const nB = parseInt(keyB.replace('table-', ''), 10);
          return nA - nB;
        });

        if (pages.length === 0) {
          throw new Error('Nenhuma seção PDF encontrada para captura.');
        }

        // 5. Cria documento jsPDF A4
        const pdf = new jsPDFClass({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });

        const A4_W_MM = 210;
        const A4_H_MM = 297;

        for (let i = 0; i < pages.length; i++) {
          if (i > 0) pdf.addPage();

          const canvas = await html2canvas(pages[i], {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            logging: false,
            width: 794,
            windowWidth: 794,
          });

          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, A4_W_MM, A4_H_MM, undefined, 'FAST');
        }

        // 6. Salva o arquivo
        const giraSlug = gira.nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '');
        const dateSlug = new Date().toISOString().slice(0, 10);
        pdf.save(`relatorio-${giraSlug}-${dateSlug}.pdf`);
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
