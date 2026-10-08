/**
 * Perfil do médium (AM-13): tipos de `GET /api/v1/medium/perfil`, textos da tela, leitura dos
 * erros da API e a foto reduzida no navegador antes do envio.
 */
import { maskTelefone } from '@/components/fields';
import { maskCep } from '@/lib/cep';
import { isoToBrDate } from '@/lib/dateIso';
import { ArquivoInvalido, ehImagem, redesenharComoJpeg } from '@/components/medium/mensalidade/arquivos';

export const PERFIL_URL = '/api/v1/medium/perfil';

export interface DadosDaCasa {
  nome: string;
  data_entrada?: string | null;
  tipo: 'atendimento' | 'cambone' | string;
  isento_mensalidade: boolean;
}

export interface MediumPerfil {
  casa: DadosDaCasa;
  telefone?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  foto_url?: string | null;
  email: string;
  email_pendente?: string | null;
  email_pendente_expira_em?: string | null;
  /** AM-20: "Mostrar meu aniversário para a corrente" (dia e mês, nunca o ano). */
  mostrar_aniversario?: boolean;
}

export const MSG_EMAIL_ENVIADO =
  'Enviamos um link para o novo e-mail. O e-mail só muda depois que você confirmar.';

export const NAO_INFORMADO = 'Não informado';

export function tipoLegivel(tipo: string): string {
  return tipo === 'atendimento' ? 'Médium de atendimento' : 'Cambone';
}

export function telefoneLegivel(p: Pick<MediumPerfil, 'telefone'>): string {
  return p.telefone ? maskTelefone(p.telefone) : NAO_INFORMADO;
}

export function nascimentoLegivel(p: Pick<MediumPerfil, 'data_nascimento'>): string {
  return p.data_nascimento ? isoToBrDate(p.data_nascimento) : NAO_INFORMADO;
}

/** "Rua X, 100 · Bairro · Cidade · 01310-100" (só o que existe). */
export function enderecoLegivel(p: MediumPerfil): string {
  const rua = [p.logradouro, p.numero].filter(Boolean).join(', ');
  const partes = [rua, p.bairro, p.cidade, p.cep ? maskCep(p.cep) : ''].filter(Boolean);
  return partes.length ? partes.join(' · ') : NAO_INFORMADO;
}

/**
 * Erro da API como {status, code, message}. Lê os dois formatos do backend:
 * `{error_code, message}` (APIException) e `{detail: {error_code, message}}` (HTTPException).
 * 422 de validação do Pydantic vira uma frase genérica.
 */
export function erroDaApi(err: unknown, fallback: string): { status?: number; code?: string; message: string } {
  const e = err as { status?: number; response?: { status?: number; data?: Record<string, unknown> } } | undefined;
  const status = e?.status ?? e?.response?.status;
  const data = e?.response?.data;
  if (status === 429) return { status, code: 'RATE_LIMIT', message: 'Muitas tentativas. Espere um pouco e tente de novo.' };
  const detail = data?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as { error_code?: string; message?: string };
    return { status, code: d.error_code, message: d.message || fallback };
  }
  if (typeof detail === 'string') return { status, message: detail };
  if (data && typeof data.message === 'string') {
    const code = typeof data.error_code === 'string' ? data.error_code : undefined;
    if (code === 'VALIDATION_ERROR' && Array.isArray(data.details)) {
      return { status, code, message: 'Confira os dados preenchidos.' };
    }
    return { status, code, message: data.message };
  }
  if (status === 403) return { status, message: 'Não dá para alterar seus dados agora.' };
  return { status, message: fallback };
}

// ── Foto ─────────────────────────────────────────────────────────────────────

/** Limite do servidor (o mesmo do perfil do painel). */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Foto de perfil aparece pequena: acima disto, reduz para economizar dados e banco. */
const REDUZIR_ACIMA_DE = 400 * 1024;

/**
 * Confere e reduz a foto no navegador (JPEG de até 800 px). HEIC do iPhone e fotos grandes
 * são redesenhadas num canvas. Lança `ArquivoInvalido` com a mensagem da tela.
 */
export async function prepararFotoPerfil(file: File): Promise<File> {
  if (!ehImagem(file)) throw new ArquivoInvalido('Escolha uma foto (JPG, PNG ou WEBP).');
  if (TIPOS_FOTO.has(file.type) && file.size <= REDUZIR_ACIMA_DE) return file;
  for (const [lado, qualidade] of [
    [800, 0.85],
    [640, 0.75],
  ] as Array<[number, number]>) {
    let blob: Blob | null = null;
    try {
      blob = await redesenharComoJpeg(file, lado, qualidade);
    } catch {
      blob = null;
    }
    if (!blob) break;
    if (blob.size <= MAX_FOTO_BYTES) {
      const nome = (file.name.replace(/\.[^.]+$/, '') || 'foto') + '.jpg';
      return new File([blob], nome, { type: 'image/jpeg' });
    }
  }
  if (TIPOS_FOTO.has(file.type) && file.size <= MAX_FOTO_BYTES) return file;
  throw new ArquivoInvalido('Não conseguimos preparar essa foto. Tente outra, em JPG ou PNG.');
}

export { ArquivoInvalido };
