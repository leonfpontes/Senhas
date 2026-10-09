/**
 * Regressão (09/10): o TextField com `multiline` não repassava o `ref` do `register` do
 * react-hook-form ao textarea — o formulário não lia o valor e acusava "Required" mesmo com o
 * campo preenchido (inscrição em curso: motivo, medicamentos, restrições de saúde…).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TextField } from '@/components/fields';

const schema = z.object({ motivo: z.string().min(1, 'Obrigatório.') });

function Formulario({ onValido }: { onValido: (v: { motivo: string }) => void }) {
  const { register, handleSubmit, formState } = useForm<{ motivo: string }>({
    resolver: zodResolver(schema),
    defaultValues: { motivo: '' },
  });
  return (
    <form onSubmit={handleSubmit(onValido)}>
      <TextField
        id="motivo"
        label="O que te fez buscar o desenvolvimento?"
        multiline
        rows={3}
        error={formState.errors.motivo?.message}
        {...register('motivo')}
      />
      <button type="submit">Enviar</button>
    </form>
  );
}

it('textarea multiline ligado ao register entrega o valor digitado ao formulário', async () => {
  const onValido = jest.fn();
  render(<Formulario onValido={onValido} />);
  await userEvent.type(screen.getByLabelText(/buscar o desenvolvimento/), 'Autoconhecimento');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  await waitFor(() => expect(onValido).toHaveBeenCalledWith({ motivo: 'Autoconhecimento' }, expect.anything()));
  expect(screen.queryByText('Obrigatório.')).not.toBeInTheDocument();
  expect(screen.queryByText('Required')).not.toBeInTheDocument();
});

it('textarea vazio continua acusando o campo obrigatório', async () => {
  render(<Formulario onValido={jest.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
  expect(await screen.findByText('Obrigatório.')).toBeInTheDocument();
});
