/**
 * T042: Emit Ticket Form - Input form for public ticket emission
 * Validates name, email, phone before submission
 * Handles loading state, errors, and success
 */

'use client';

import React, { useState } from 'react';
import styles from './emit_form.module.css';
import { apiClient } from '@/services/api_client';
import { useGiraCountdown } from '@/hooks/useGiraCountdown';


interface EmitFormProps {
  tenantSlug: string;
  girReleaseStart: string;
  giraReleaseEnd: string;
  tenantColor?: string;
  onSuccess?: (ticketNumber: string, email: string) => void;
}


interface FormData {
  name: string;
  email: string;
  phone: string;
}


export default function EmitForm({
  tenantSlug,
  girReleaseStart,
  giraReleaseEnd,
  tenantColor = '#2E7D32',
  onSuccess,
}: EmitFormProps) {
  if (!tenantSlug) return null;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successTicket, setSuccessTicket] = useState<string>('');
  const [successEmail, setSuccessEmail] = useState<string>('');

  const { isOpen: emissionOpen } = useGiraCountdown(
    girReleaseStart,
    giraReleaseEnd,
  );

  // Form validation
  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'Nome é obrigatório';
    }
    if (formData.name.trim().length < 3) {
      return 'Nome deve ter pelo menos 3 caracteres';
    }
    if (!formData.email.trim()) {
      return 'Email é obrigatório';
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return 'Email inválido';
    }

    if (formData.phone && formData.phone.length < 10) {
      return 'Telefone deve ter pelo menos 10 dígitos';
    }

    return null;
  };

  // Handle input change
  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null); // Clear error on input change
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!emissionOpen) {
      setError('A emissão ainda não foi aberta para este evento');
      return;
    }

    // Validate
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call API
      const response = await apiClient.post(
        `/api/v1/public/emit-ticket?tenant_slug=${tenantSlug}`,
        {
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: formData.phone || undefined,
        }
      );

      // Success
      setSuccess(true);
      setSuccessTicket(response.data.ticket_number);
      setSuccessEmail(formData.email);

      // Call callback
      if (onSuccess) {
        onSuccess(response.data.ticket_number, formData.email);
      }

      // Reset form
      setFormData({ name: '', email: '', phone: '' });

    } catch (err: any) {
      // Handle error
      const message =
        err.response?.status === 409
          ? 'Você já possui uma senha para este evento'
          : err.response?.status === 429
            ? 'Todas as senhas para este evento foram emitidas'
            : err.response?.data?.detail ||
              'Erro ao emitir senha. Tente novamente.';

      setError(message);
      setLoading(false);

    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className={styles.successcontainer}>
        <div className={styles.successcard}>
          <div className={styles.successicon}>✓</div>
          <h3 className={styles.successtitle}>Senha Emitida com Sucesso!</h3>
          
          <div className={styles.ticketdisplay}>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
              Sua senha:
            </p>
            <p style={{
              fontSize: '56px',
              fontWeight: 'bold',
              color: tenantColor,
              letterSpacing: '8px',
              margin: '10px 0',
            }}>
              {successTicket}
            </p>
          </div>

          <p className={styles.successmessage}>
            Um email de confirmação foi enviado para <strong>{successEmail}</strong>
          </p>

          <div className={styles.successinstructions}>
            <h4>Próximos Passos:</h4>
            <ol>
              <li>Verifique seu email (inclua a pasta de spam)</li>
              <li>Clique no link para confirmar sua senha</li>
              <li>Guarde seu número para a entrada do evento</li>
              <li>Apresente o número na entrada do local</li>
            </ol>
          </div>

          <button
            className={styles.resetbutton}
            style={{ backgroundColor: tenantColor }}
            onClick={() => setSuccess(false)}
          >
            Emitir Outra Senha
          </button>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.formtitle}>Emitir Senha</h2>
      
      {error && (
        <div className={styles.error} style={{
          backgroundColor: '#f8d7da',
          borderLeftColor: '#dc3545',
        }}>
          ❌ {error}
        </div>
      )}

      {!emissionOpen && (
        <div className={styles.warning} style={{
          backgroundColor: '#fff3cd',
          borderLeftColor: '#ffc107',
        }}>
          ⏰ Aguarde o horário de abertura para emitir sua senha
        </div>
      )}

      {/* Name Input */}
      <div className={styles.formgroup}>
        <label htmlFor="name" className={styles.label}>
          Nome Completo *
        </label>
        <input
          id="name"
          type="text"
          placeholder="João da Silva"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          disabled={!emissionOpen || loading}
          className={styles.input}
          maxLength={100}
        />
        <p className={styles.hint}>Como você deseja ser identificado no evento</p>
      </div>

      {/* Email Input */}
      <div className={styles.formgroup}>
        <label htmlFor="email" className={styles.label}>
          Email *
        </label>
        <input
          id="email"
          type="email"
          placeholder="joao@example.com"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          disabled={!emissionOpen || loading}
          className={styles.input}
          maxLength={150}
        />
        <p className={styles.hint}>Onde enviaremos a confirmação da sua senha</p>
      </div>

      {/* Phone Input */}
      <div className={styles.formgroup}>
        <label htmlFor="phone" className={styles.label}>
          Telefone (Opcional)
        </label>
        <input
          id="phone"
          type="tel"
          placeholder="+55 11 98765-4321"
          value={formData.phone}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/\D/g, '');
            handleChange('phone', cleaned);
          }}
          disabled={!emissionOpen || loading}
          className={styles.input}
          maxLength={20}
        />
        <p className={styles.hint}>Para contato em caso de dúvidas</p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!emissionOpen || loading}
        className={styles.submitbutton}
        style={{
          backgroundColor: emissionOpen ? tenantColor : '#ccc',
          cursor: emissionOpen && !loading ? 'pointer' : 'not-allowed',
        }}
      >
        {loading ? (
          <>
            <span className={styles.spinner}></span>
            Processando...
          </>
        ) : (
          '✓ Emitir Senha'
        )}
      </button>

      {/* Terms */}
      <p className={styles.terms}>
        Ao emitir uma senha, você concorda com nossos 
        <a href="#"> Termos de Privacidade</a>
      </p>
    </form>
  );
}
