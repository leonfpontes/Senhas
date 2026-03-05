"""
T048: Frontend Emit Form Tests
Jest/React Testing Library tests for EmitForm component
"""

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import EmitForm from '../../../pages/public/emit_form';
import * as apiClient from '../../../services/api_client';


// Mock API client
jest.mock('../../../services/api_client');

describe('EmitForm Component', () => {
  const defaultProps = {
    tenantSlug: 'espiritismo-sp',
    girReleaseStart: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    giraReleaseEnd: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    tenantColor: '#2E7D32',
    onSuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render form when emission is open', () => {
      render(<EmitForm {...defaultProps} />);

      expect(screen.getByLabelText(/Nome Completo/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Telefone/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Emitir Senha/i })).toBeInTheDocument();
    });

    it('should disable form when emission is not yet open', () => {
      const futureProps = {
        ...defaultProps,
        girReleaseStart: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
      };

      render(<EmitForm {...futureProps} />);

      const submitButton = screen.getByRole('button', { name: /Emitir Senha/i });
      expect(submitButton).toBeDisabled();
      expect(screen.getByText(/Aguarde o horário de abertura/i)).toBeInTheDocument();
    });

    it('should show success message after emission', async () => {
      const mockResponse = {
        data: {
          ticket_number: '0042',
          email_sent: true,
          rescue_link: 'https://example.com/ticket/1',
          message: 'Success',
        },
      };

      (apiClient.apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      // Fill form
      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');

      // Submit
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      // Wait for success
      await waitFor(() => {
        expect(screen.getByText('0042')).toBeInTheDocument(); // Ticket number displayed
        expect(screen.getByText(/Senha Emitida com Sucesso/i)).toBeInTheDocument();
      });
    });
  });

  describe('Validation', () => {
    it('should show error for missing name', async () => {
      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument();
      });
    });

    it('should show error for short name', async () => {
      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'Jo');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Nome deve ter pelo menos 3 caracteres/i)).toBeInTheDocument();
      });
    });

    it('should show error for invalid email', async () => {
      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'invalid-email');
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Email inválido/i)).toBeInTheDocument();
      });
    });

    it('should show error for invalid email format from API', async () => {
      (apiClient.apiClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 400,
          data: { detail: 'Invalid email format: example.com' },
        },
      });

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'example.com');
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('should send correct data to API', async () => {
      const mockResponse = {
        data: {
          ticket_number: '0042',
          email_sent: true,
          message: 'Success',
        },
      };

      (apiClient.apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');
      await user.type(screen.getByLabelText(/Telefone/i), '11987654321');

      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(apiClient.apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/emit-ticket'),
          {
            name: 'João da Silva',
            email: 'joao@example.com',
            phone: '11987654321',
          }
        );
      });
    });

    it('should handle duplicate ticket error (409)', async () => {
      (apiClient.apiClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 409,
          data: { detail: 'This email already has a ticket for this gira' },
        },
      });

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');

      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Você já possui uma senha para este evento/i)).toBeInTheDocument();
      });
    });

    it('should handle capacity exceeded error (429)', async () => {
      (apiClient.apiClient.post as jest.Mock).mockRejectedValue({
        response: {
          status: 429,
          data: { detail: 'All tickets for this gira have been emitted' },
        },
      });

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');

      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(screen.getByText(/Todas as senhas para este evento foram emitidas/i)).toBeInTheDocument();
      });
    });

    it('should call onSuccess callback', async () => {
      const onSuccess = jest.fn();
      const mockResponse = {
        data: {
          ticket_number: '0042',
          email_sent: true,
          message: 'Success',
        },
      };

      (apiClient.apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} onSuccess={onSuccess} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');

      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith('0042', 'joao@example.com');
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner during submission', async () => {
      (apiClient.apiClient.post as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: { ticket_number: '0042' } }), 100))
      );

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');

      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      // Button should show loading text
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Processando/i })).toBeDisabled();
      });
    });
  });

  describe('Form Reset', () => {
    it('should reset form after success', async () => {
      const mockResponse = {
        data: {
          ticket_number: '0042',
          email_sent: true,
          message: 'Success',
        },
      };

      (apiClient.apiClient.post as jest.Mock).mockResolvedValue(mockResponse);

      const user = userEvent.setup();
      render(<EmitForm {...defaultProps} />);

      // First submission
      await user.type(screen.getByLabelText(/Nome Completo/i), 'João da Silva');
      await user.type(screen.getByLabelText(/Email/i), 'joao@example.com');
      await user.click(screen.getByRole('button', { name: /Emitir Senha/i }));

      // Wait for success
      await waitFor(() => {
        expect(screen.getByText(/Senha Emitida com Sucesso/i)).toBeInTheDocument();
      });

      // Click "Emit Another"
      await user.click(screen.getByRole('button', { name: /Emitir Outra Senha/i }));

      // Form should be empty and shown again
      expect(screen.getByLabelText(/Nome Completo/i)).toHaveValue('');
      expect(screen.getByLabelText(/Email/i)).toHaveValue('');
    });
  });
});
