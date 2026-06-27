import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MaskedInput, { maskTelefone, maskCpf, unmask } from '../../components/shared/MaskedInput';

describe('MaskedInput / máscaras', () => {
  it('formata telefone corretamente', () => {
    expect(maskTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(maskTelefone('1198765')).toBe('(11) 98765');
    expect(maskTelefone('11')).toBe('(11');
  });

  it('formata CPF corretamente', () => {
    expect(maskCpf('12345678901')).toBe('123.456.789-01');
    expect(maskCpf('123456')).toBe('123.456');
  });

  it('unmask remove caracteres não numéricos', () => {
    expect(unmask('(11) 98765-4321')).toBe('11987654321');
  });

  it('aplica máscara de telefone no onChange do componente', () => {
    const handle = jest.fn();
    render(<MaskedInput mask="telefone" label="Telefone" value="" onChange={handle} />);
    const input = screen.getByLabelText('Telefone') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '11987654321' } });
    expect(handle).toHaveBeenCalledWith('(11) 98765-4321');
  });
});
