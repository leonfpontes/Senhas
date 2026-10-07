/**
 * lib/pixChave — espelho no navegador de backend/src/services/pix_chave.py (AM-10).
 * Mesmos exemplos dos testes do backend; nenhuma chave real.
 */
import { chaveParaCampo, cnpjValido, cpfValido, maskChavePix, maskCnpj, validarChavePix } from '@/lib/pixChave';

describe('pixChave', () => {
  it('CPF com dígito verificador', () => {
    expect(cpfValido('12345678909')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('12345678900')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
  });

  it('CNPJ numérico e alfanumérico (exemplos do manual do BCB)', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('00038166000105')).toBe(true);
    expect(cnpjValido('12ABC34501DE35')).toBe(true);
    expect(cnpjValido('12ABC34501DE36')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('máscaras por tipo', () => {
    expect(maskChavePix('cpf', '12345678909')).toBe('123.456.789-09');
    expect(maskCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(maskChavePix('telefone', '61912345678')).toBe('(61) 91234-5678');
    expect(maskChavePix('email', 'Fulano@Example.com')).toBe('Fulano@Example.com');
    expect(chaveParaCampo('telefone', '+5561912345678')).toBe('(61) 91234-5678');
    expect(chaveParaCampo('cnpj', '11222333000181')).toBe('11.222.333/0001-81');
  });

  it.each([
    ['cpf', '123.456.789-09'],
    ['cnpj', '11.222.333/0001-81'],
    ['email', 'Tesouraria@Example.com'],
    ['telefone', '(61) 91234-5678'],
    ['aleatoria', '123e4567-e12b-12d1-a456-426655440000'],
  ] as const)('%s válido: %s', (tipo, valor) => {
    expect(validarChavePix(tipo, valor)).toBeNull();
  });

  it.each([
    ['cpf', '123.456.789-00'],
    ['cnpj', '11.222.333/0001-82'],
    ['email', 'sem-arroba.example.com'],
    ['telefone', '(61) 3123-4567'],
    ['aleatoria', '123e4567e12b12d1a456426655440000'],
    ['cpf', '   '],
  ] as const)('%s inválido: %s', (tipo, valor) => {
    expect(validarChavePix(tipo, valor)).toEqual(expect.any(String));
  });
});
