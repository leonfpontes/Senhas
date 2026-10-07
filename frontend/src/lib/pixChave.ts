/**
 * Chave PIX do terreiro (AM-10): máscara e validação no navegador, espelho de
 * `backend/src/services/pix_chave.py` (o servidor valida de novo e é quem manda).
 * Formatos do DICT: Manual de Padrões para Iniciação do Pix (BCB), §2.5.1.
 */
import { maskCpf, maskTelefone } from '@/components/fields';

export type PixTipo = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export const PIX_TIPOS: { value: PixTipo; label: string; placeholder: string }[] = [
  { value: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { value: 'email', label: 'E-mail', placeholder: 'tesouraria@exemplo.com' },
  { value: 'telefone', label: 'Telefone', placeholder: '(11) 91234-5678' },
  { value: 'aleatoria', label: 'Chave aleatória', placeholder: '123e4567-e89b-12d3-a456-426614174000' },
];

export const PIX_TIPO_LABEL: Record<PixTipo, string> = Object.fromEntries(
  PIX_TIPOS.map((t) => [t.value, t.label]),
) as Record<PixTipo, string>;

export const NOME_RECEBEDOR_MAX = 25;
export const CIDADE_MAX = 15;

/** "12.ABC.345/01DE-35" — CNPJ numérico ou alfanumérico (até 14 caracteres). */
export function maskCnpj(value: string): string {
  const c = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
  if (c.length <= 2) return c;
  if (c.length <= 5) return `${c.slice(0, 2)}.${c.slice(2)}`;
  if (c.length <= 8) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}`;
  if (c.length <= 12) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** Aplica a máscara do tipo ao que foi digitado (e-mail e aleatória ficam como estão). */
export function maskChavePix(tipo: PixTipo, value: string): string {
  if (tipo === 'cpf') return maskCpf(value);
  if (tipo === 'cnpj') return maskCnpj(value);
  if (tipo === 'telefone') return maskTelefone(value.replace(/^\+?55(?=\d{11}$)/, ''));
  return value;
}

/** Chave salva (formato do DICT) → como aparece no campo. */
export function chaveParaCampo(tipo: PixTipo, chave: string): string {
  if (tipo === 'telefone') return maskTelefone(chave.replace(/^\+55/, ''));
  return maskChavePix(tipo, chave);
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const n = cpf.split('').map(Number);
  for (const pos of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < pos; i += 1) soma += n[i] * (pos + 1 - i);
    if (((soma * 10) % 11) % 10 !== n[pos]) return false;
  }
  return true;
}

function cnpjDv(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const dv1 = cnpjDv(cnpj.slice(0, 12));
  const dv2 = cnpjDv(cnpj.slice(0, 12) + String(dv1));
  return cnpj.slice(12) === `${dv1}${dv2}`;
}

const EMAIL_RE = /^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mensagem de erro para a tela, ou null se a chave parece válida. */
export function validarChavePix(tipo: PixTipo, value: string): string | null {
  const bruto = value.trim();
  if (!bruto) return 'Informe a chave PIX.';
  if (tipo === 'cpf') return cpfValido(bruto.replace(/\D/g, '')) ? null : 'CPF inválido. Confira os números.';
  if (tipo === 'cnpj') {
    return cnpjValido(bruto.toUpperCase().replace(/[^0-9A-Z]/g, '')) ? null : 'CNPJ inválido. Confira os números.';
  }
  if (tipo === 'email') {
    const email = bruto.toLowerCase();
    return email.length <= 77 && EMAIL_RE.test(email) ? null : 'E-mail inválido.';
  }
  if (tipo === 'telefone') {
    const digitos = bruto.replace(/\D/g, '');
    const d = digitos.length === 13 && digitos.startsWith('55') ? digitos.slice(2) : digitos;
    return /^[1-9][1-9]9\d{8}$/.test(d) ? null : 'Use o celular com DDD, ex.: (61) 91234-5678.';
  }
  return EVP_RE.test(bruto.toLowerCase()) ? null : 'Chave aleatória inválida. Copie a chave do app do banco, com os hífens.';
}
