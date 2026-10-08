/**
 * Copiar texto e preparar o comprovante no celular (AM-11/AM-12).
 *
 * - `copiarTexto`: `navigator.clipboard` quando existe (contexto seguro); senão o truque do
 *   `<textarea>` + `execCommand('copy')`, que ainda funciona no navegador embutido do WhatsApp
 *   (princípio P7). Devolve false quando nada funcionou — a tela mostra o código selecionável
 *   e pede "toque e segure para copiar".
 * - `prepararComprovante`: foto ou PDF de até 2 MB (o mesmo limite do servidor). Foto grande
 *   ou num formato que o servidor não aceita (HEIC do iPhone, por exemplo) é redesenhada num
 *   canvas e vira JPEG antes de enviar — o banco de dados guarda o arquivo (BYTEA, limite de 8 GB).
 */

export const MAX_COMPROVANTE_BYTES = 2 * 1024 * 1024;
/** Foto acima disto é reduzida mesmo estando no limite (economiza dados do médium e o banco). */
const COMPRIMIR_ACIMA_DE = 900 * 1024;
const TIPOS_IMAGEM_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cai no plano B */
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    area.remove();
    return Boolean(ok);
  } catch {
    return false;
  }
}

export class ArquivoInvalido extends Error {}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function ehPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function ehImagem(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagem ilegível'));
    };
    img.src = url;
  });
}

export async function redesenharComoJpeg(
  file: File,
  ladoMax: number,
  qualidade: number,
): Promise<Blob | null> {
  const img = await carregarImagem(file);
  const escala = Math.min(
    1,
    ladoMax / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height),
  );
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * escala));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff'; // PNG transparente vira fundo branco, não preto
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', qualidade));
}

/**
 * Confere e, se preciso, reduz o comprovante. Lança `ArquivoInvalido` com a mensagem que a
 * tela mostra (o que fazer em seguida, princípio P8).
 */
export async function prepararComprovante(file: File): Promise<File> {
  if (ehPdf(file)) {
    if (file.size > MAX_COMPROVANTE_BYTES) {
      throw new ArquivoInvalido(
        'O PDF passa de 2 MB. Tire um print ou uma foto do comprovante e envie a imagem.',
      );
    }
    return file;
  }
  if (!ehImagem(file)) {
    throw new ArquivoInvalido(
      'Esse arquivo não serve. Envie uma foto do comprovante ou o PDF do banco.',
    );
  }
  if (TIPOS_IMAGEM_ACEITOS.has(file.type) && file.size <= COMPRIMIR_ACIMA_DE) return file;

  const tentativas: Array<[number, number]> = [
    [1600, 0.82],
    [1280, 0.7],
    [1024, 0.6],
  ];
  for (const [lado, qualidade] of tentativas) {
    let blob: Blob | null = null;
    try {
      blob = await redesenharComoJpeg(file, lado, qualidade);
    } catch {
      blob = null;
    }
    if (!blob) break;
    if (blob.size <= MAX_COMPROVANTE_BYTES) {
      const nome = (file.name.replace(/\.[^.]+$/, '') || 'comprovante') + '.jpg';
      return new File([blob], nome, { type: 'image/jpeg' });
    }
  }
  // Não deu para reduzir (navegador sem canvas ou formato que ele não abre).
  if (TIPOS_IMAGEM_ACEITOS.has(file.type) && file.size <= MAX_COMPROVANTE_BYTES) return file;
  throw new ArquivoInvalido(
    'Não conseguimos preparar essa foto. Tire um print do comprovante e envie, ou envie o PDF do banco.',
  );
}
