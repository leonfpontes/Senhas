/**
 * CEP: máscara "00000-000" e busca do endereço no ViaCEP (o mesmo serviço do cadastro de
 * médiuns, dos cursos e do editor do site; liberado no `connect-src` da CSP e citado na
 * Política de Privacidade). O backend grava o CEP só com dígitos.
 */

export function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export interface EnderecoDoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
}

export class CepInvalido extends Error {}

/**
 * Endereço do CEP (8 dígitos). Lança `CepInvalido` com a mensagem que a tela mostra:
 * CEP incompleto, não encontrado ou sem conexão.
 */
export async function buscarCep(cep: string): Promise<EnderecoDoCep> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) throw new CepInvalido('CEP deve ter 8 dígitos');
  let json: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string };
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    json = await resp.json();
  } catch {
    throw new CepInvalido('Não deu para consultar o CEP agora. Preencha o endereço à mão.');
  }
  if (json.erro) throw new CepInvalido('CEP não encontrado. Confira os números ou preencha à mão.');
  return {
    logradouro: json.logradouro || '',
    bairro: json.bairro || '',
    cidade: json.localidade || '',
  };
}
