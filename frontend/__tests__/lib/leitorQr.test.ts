/**
 * AM-29 — escolha do leitor de QR da Área (`lib/leitorQr`): BarcodeDetector nativo quando o
 * navegador tem (e lê QR); senão o jsQR carregado sob demanda (iPhone); sem rede para o chunk →
 * null (a folha cai na câmera do celular e no código digitado).
 */
import { LADO_MAX_JSQR, criarLeitorQr, temCamera, type JsQrFn } from '@/lib/leitorQr';

const LINK = 'https://girahub.com.br/medium/agenda/atividade/f1?cheguei=ABC234';

function videoFalso(w = 1280, h = 720): HTMLVideoElement {
  return { videoWidth: w, videoHeight: h } as unknown as HTMLVideoElement;
}

let ctx: { drawImage: jest.Mock; getImageData: jest.Mock };

beforeEach(() => {
  delete (window as any).BarcodeDetector;
  ctx = {
    drawImage: jest.fn(),
    getImageData: jest.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
  };
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (window as any).BarcodeDetector;
});

describe('criarLeitorQr', () => {
  it('com BarcodeDetector que lê QR: usa o nativo e não baixa o jsQR', async () => {
    const detect = jest.fn(() => Promise.resolve([{ rawValue: LINK }]));
    (window as any).BarcodeDetector = class {
      static getSupportedFormats = () => Promise.resolve(['ean_13', 'qr_code']);
      detect = detect;
    };
    const carregar = jest.fn();
    const leitor = await criarLeitorQr(carregar);
    expect(leitor?.tipo).toBe('nativo');
    expect(carregar).not.toHaveBeenCalled();
    await expect(leitor!.ler(videoFalso())).resolves.toBe(LINK);
  });

  it('sem BarcodeDetector (iPhone): baixa o jsQR e decodifica o quadro reduzido', async () => {
    const jsQR = jest.fn(() => ({ data: LINK })) as unknown as jest.MockedFunction<JsQrFn>;
    const carregar = jest.fn(() => Promise.resolve(jsQR as JsQrFn));
    const leitor = await criarLeitorQr(carregar);
    expect(carregar).toHaveBeenCalledTimes(1);
    expect(leitor?.tipo).toBe('jsqr');

    await expect(leitor!.ler(videoFalso(1280, 720))).resolves.toBe(LINK);
    // O quadro vai reduzido (maior lado = LADO_MAX_JSQR), mantendo a proporção.
    const [, largura, altura, opcoes] = jsQR.mock.calls[0];
    expect([largura, altura]).toEqual([LADO_MAX_JSQR, 360]);
    expect(opcoes).toEqual({ inversionAttempts: 'dontInvert' });
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, LADO_MAX_JSQR, 360);
  });

  it('BarcodeDetector sem QR (desktop): também vai de jsQR', async () => {
    (window as any).BarcodeDetector = class {
      static getSupportedFormats = () => Promise.resolve(['ean_13']);
      detect = jest.fn();
    };
    const carregar = jest.fn(() => Promise.resolve((() => null) as JsQrFn));
    const leitor = await criarLeitorQr(carregar);
    expect(leitor?.tipo).toBe('jsqr');
    await expect(leitor!.ler(videoFalso())).resolves.toBeNull(); // nada no quadro
    await expect(leitor!.ler(videoFalso(0, 0))).resolves.toBeNull(); // vídeo ainda sem tamanho
  });

  it('sem rede para baixar o jsQR: null (fica a câmera do celular e o código)', async () => {
    const leitor = await criarLeitorQr(() => Promise.reject(new Error('ChunkLoadError')));
    expect(leitor).toBeNull();
  });

  it('o carregador padrão usa o import() do pacote jsqr', async () => {
    const leitor = await criarLeitorQr();
    expect(leitor?.tipo).toBe('jsqr');
  });
});

describe('temCamera', () => {
  it('depende do getUserMedia', () => {
    const antes = (navigator as any).mediaDevices;
    (navigator as any).mediaDevices = undefined;
    expect(temCamera()).toBe(false);
    (navigator as any).mediaDevices = { getUserMedia: jest.fn() };
    expect(temCamera()).toBe(true);
    (navigator as any).mediaDevices = antes;
  });
});
