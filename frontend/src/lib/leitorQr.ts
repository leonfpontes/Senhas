/**
 * Leitor de QR dentro da Área do Médium (AM-28; leitor do iPhone no AM-29).
 *
 * Escolhe o leitor do aparelho:
 * 1. `BarcodeDetector` nativo (Chrome/Edge no Android) — sem baixar nada;
 * 2. sem ele (Safari do iPhone, inclusive o app instalado na tela inicial): o `jsqr`, carregado
 *    SÓ NESSA HORA por `import()` dinâmico (chunk próprio; nunca entra no bundle das telas).
 *    Cada quadro da câmera vai para um canvas reduzido e o jsQR decodifica.
 * Sem câmera, sem os dois leitores ou sem rede para baixar o jsqr → `null`: a folha mostra a
 * câmera do próprio celular (o QR é um link da Área) e o código digitado.
 */

export interface LeitorQr {
  tipo: 'nativo' | 'jsqr';
  /** Um quadro do vídeo → o texto do QR, ou `null` se não achou nada. */
  ler: (video: HTMLVideoElement) => Promise<string | null>;
}

interface DetectorDeCodigo {
  detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (opcoes?: { formats?: string[] }): DetectorDeCodigo;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Só a assinatura usada do `jsqr` (o módulo é carregado sob demanda). */
export type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' },
) => { data: string } | null;

/** Maior lado do quadro decodificado pelo jsQR: o QR na tela da casa cabe folgado e o celular não esquenta. */
export const LADO_MAX_JSQR = 640;

export function temCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function detectorNativo(): DetectorCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

async function leitorNativo(): Promise<LeitorQr | null> {
  const Ctor = detectorNativo();
  if (!Ctor) return null;
  try {
    // Há navegador com BarcodeDetector sem QR (desktop): aí vai de jsQR.
    if (Ctor.getSupportedFormats) {
      const formatos = await Ctor.getSupportedFormats();
      if (!formatos.includes('qr_code')) return null;
    }
    const detector = new Ctor({ formats: ['qr_code'] });
    return {
      tipo: 'nativo',
      ler: async (video) => {
        const achados = await detector.detect(video);
        return achados[0]?.rawValue || null;
      },
    };
  } catch {
    return null;
  }
}

const carregarJsQrPadrao = async (): Promise<JsQrFn> =>
  (await import(/* webpackChunkName: "jsqr" */ 'jsqr')).default as unknown as JsQrFn;

function leitorJsQr(jsQR: JsQrFn): LeitorQr | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  return {
    tipo: 'jsqr',
    ler: async (video) => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      const escala = Math.min(1, LADO_MAX_JSQR / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * escala));
      canvas.height = Math.max(1, Math.round(h * escala));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const quadro = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(quadro.data, quadro.width, quadro.height, { inversionAttempts: 'dontInvert' })?.data || null;
    },
  };
}

/**
 * O leitor deste aparelho: nativo quando dá, senão o jsQR baixado agora. `carregarJsQr` só
 * existe para o teste trocar o `import()`.
 */
export async function criarLeitorQr(
  carregarJsQr: () => Promise<JsQrFn> = carregarJsQrPadrao,
): Promise<LeitorQr | null> {
  const nativo = await leitorNativo();
  if (nativo) return nativo;
  try {
    return leitorJsQr(await carregarJsQr());
  } catch {
    return null; // sem rede para o chunk: fica a câmera do celular e o código digitado
  }
}
