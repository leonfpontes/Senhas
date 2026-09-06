/**
 * T041: Gira Details Page - Display next gira info and countdown
 * Shows event details, availability, and countdown to emit window
 */

'use client';

import React from 'react';
import type { GiraPublic } from 'shared-types';
import styles from './gira_details.module.css';
import { useGiraCountdown } from '@/hooks/useGiraCountdown';


interface GiraDetailsProps {
  giraData: GiraPublic;
  tenantColor?: string;
}


export default function GiraDetails({
  giraData,
  tenantColor = '#2E7D32',
}: GiraDetailsProps) {
  const {
    timeRemaining,
    isOpen,
    status,
  } = useGiraCountdown(giraData?.release_start_at ?? null, giraData?.release_end_at ?? null);

  if (!giraData) return null;

  const hasWindow = status !== 'unconfigured';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  };

  // Data do evento com dia da semana — é a informação que o consulente mais precisa
  const formatEventDate = (dateStr: string) => {
    const formatted = new Date(dateStr).toLocaleString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header} style={{ borderBottomColor: tenantColor }}>
        <h2 className={styles.title}>{giraData.nome}</h2>
        {giraData.data_inicio && (
          <p className={styles.eventdate} style={{ color: tenantColor }}>
            🗓️ {formatEventDate(giraData.data_inicio)}
          </p>
        )}
        {giraData.local && (
          <p className={styles.location}>
            📍 {giraData.local}
          </p>
        )}
        {giraData.descricao && (
          <p className={styles.description}>{giraData.descricao}</p>
        )}
      </div>

      {/* Status Badge */}
      {hasWindow && (
        <div className={styles.statusbadge} style={{
          backgroundColor: isOpen ? '#4CAF50' : '#2196F3',
          color: 'white',
        }}>
          {isOpen ? '🟢 EMISSÃO ABERTA' : '🔵 PRÓXIMO'}
        </div>
      )}

      {/* Emission Window (secondary info) */}
      {hasWindow && (
        <div className={styles.eventinfo}>
          <div className={styles.infoitem}>
            <span className={styles.label}>Senhas disponíveis a partir de:</span>
            <span className={styles.value}>{formatDate(giraData.release_start_at)}</span>
          </div>
          <div className={styles.infoitem}>
            <span className={styles.label}>Fim da emissão:</span>
            <span className={styles.value}>{formatDate(giraData.release_end_at)}</span>
          </div>
        </div>
      )}

      {/* Countdown Timer */}
      {hasWindow && !isOpen && (
        <div className={styles.countdown}>
          <h3 className={styles.countdowntitle}>Próxima Emissão em</h3>
          <div className={styles.countdowntimer}>
            <div className={styles.timesegment}>
              <span className={styles.timenumber}>
                {Math.floor(timeRemaining / 3600)}
              </span>
              <span className={styles.timelabel}>Horas</span>
            </div>
            <span className={styles.timeseparator}>:</span>
            <div className={styles.timesegment}>
              <span className={styles.timenumber}>
                {Math.floor((timeRemaining % 3600) / 60)}
              </span>
              <span className={styles.timelabel}>Min</span>
            </div>
            <span className={styles.timeseparator}>:</span>
            <div className={styles.timesegment}>
              <span className={styles.timenumber}>
                {timeRemaining % 60}
              </span>
              <span className={styles.timelabel}>Seg</span>
            </div>
          </div>
        </div>
      )}

      {/* Capacity Warning */}
      {giraData.max_tickets != null && giraData.tickets_available < 50 && giraData.tickets_available > 0 && (
        <div className={styles.warning} style={{
          backgroundColor: '#fff3cd',
          borderLeftColor: '#ffc107',
        }}>
          <span style={{ color: '#856404' }}>
            ⚠️ Apenas {giraData.tickets_available} senhas disponíveis! Emita sua senha agora.
          </span>
        </div>
      )}

      {/* is_exhausted (não tickets_available === 0): gira sem limite reporta
          tickets_available: 0 com is_exhausted: false — não está esgotada */}
      {giraData.is_exhausted && (
        <div className={styles.error} style={{
          backgroundColor: '#f8d7da',
          borderLeftColor: '#dc3545',
        }}>
          <span style={{ color: '#721c24' }}>
            ❌ Todas as senhas para este evento já foram emitidas.
          </span>
        </div>
      )}
    </div>
  );
}
