/**
 * Cartaz do portão — beta do Laboratório (`beta_cartaz_portao`, jornadas v2 · J2 04).
 *
 * O link do terreiro num cartaz para imprimir e deixar na entrada: faixa com o nome da casa,
 * "Pegue a sua *senha aqui.*", o QR, o picote e "Aponte a câmera do celular.". A prévia aparece
 * no diálogo de compartilhar; "Baixar o cartaz (PDF)" gera uma folha A4 com jsPDF, no navegador.
 * O QR do PDF sai do mesmo `qrcode.react` (canvas escondido), então é o mesmo link da prévia.
 */
import React, { useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CartazDoPortaoProps {
  /** Link do terreiro (sempre abre a próxima gira com senhas abertas). */
  link: string;
  tenantName: string;
}

/** "girahub.com.br/filhos-de-fe" — o link sem o protocolo, para ler no papel. */
export function linkLegivel(link: string): string {
  return link.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function corDaMarca(el: HTMLElement | null): [number, number, number] {
  const valor = el ? getComputedStyle(el).backgroundColor : '';
  const m = valor.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [46, 106, 78];
}

export function CartazDoPortao({ link, tenantName }: CartazDoPortaoProps) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const [gerando, setGerando] = useState(false);

  const baixar = async () => {
    setGerando(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const largura = 210;
      const [r, g, b] = corDaMarca(faixaRef.current);

      pdf.setFillColor(r, g, b);
      pdf.rect(0, 0, largura, 34, 'F');
      pdf.setTextColor(250, 246, 239);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.text(tenantName, 20, 21);

      pdf.setTextColor(42, 36, 32);
      pdf.setFont('times', 'normal');
      pdf.setFontSize(54);
      pdf.text('Pegue a sua', 20, 70);
      pdf.setTextColor(168, 84, 50);
      pdf.setFont('times', 'italic');
      pdf.text('senha aqui.', 20, 92);

      const canvas = qrRef.current?.querySelector('canvas');
      if (canvas) {
        const lado = 120;
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (largura - lado) / 2, 108, lado, lado);
      }

      // Picote: filete tracejado com os dois meios-círculos nas bordas.
      pdf.setDrawColor(214, 200, 180);
      pdf.setLineDashPattern([2, 2], 0);
      pdf.line(12, 244, largura - 12, 244);
      pdf.setLineDashPattern([], 0);
      pdf.setFillColor(255, 255, 255);
      pdf.circle(0, 244, 6, 'F');
      pdf.circle(largura, 244, 6, 'F');

      pdf.setTextColor(42, 36, 32);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('Aponte a câmera do celular.', 20, 262);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(13);
      pdf.setTextColor(107, 95, 85);
      pdf.text(linkLegivel(link), 20, 272);

      pdf.save('cartaz-do-portao.pdf');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="flex w-[260px] flex-col items-center gap-3" data-testid="cartaz-do-portao">
      <div className="w-full overflow-hidden rounded-md border border-border bg-background shadow-sm">
        <div ref={faixaRef} className="bg-primary px-[18px] py-3 text-[0.8125rem] font-semibold text-primary-foreground">
          {tenantName}
        </div>
        <div className="px-[18px] pt-[18px] pb-2.5 font-display text-[1.875rem] leading-none tracking-[-0.03em]">
          <p className="m-0 text-foreground">Pegue a sua</p>
          <p className="m-0 text-[color:var(--color-barro-600)] italic">senha aqui.</p>
        </div>
        <div className="flex justify-center py-1.5">
          <QRCodeSVG value={link} size={128} level="M" aria-label="QR com o link do terreiro" />
        </div>
        <div className="relative my-1 border-t border-dashed border-border" aria-hidden>
          <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-card" />
          <span className="absolute -top-1.5 -right-1.5 size-3 rounded-full bg-card" />
        </div>
        <div className="px-[18px] pt-2 pb-4">
          <p className="m-0 text-[0.8125rem] font-semibold text-foreground">Aponte a câmera do celular.</p>
          <p className="m-0 truncate text-xs text-muted-foreground">{linkLegivel(link)}</p>
        </div>
      </div>
      <p className="text-center text-[0.8125rem] font-medium text-muted-foreground">Cartaz com o link do terreiro, para o portão.</p>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={baixar} disabled={gerando}>
        {gerando ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} Baixar o cartaz (PDF)
      </Button>
      <span className="text-xs font-medium text-muted-foreground">Beta</span>
      <div ref={qrRef} className="hidden" aria-hidden>
        <QRCodeCanvas value={link} size={600} level="M" marginSize={2} />
      </div>
    </div>
  );
}

export default CartazDoPortao;
