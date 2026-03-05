"""
T041: Gira Details Page - Display next gira info and countdown
Shows event details, availability, and countdown to emit window
"""

'use client';

import React, { useEffect, useState } from 'react';
import styles from './gira_details.module.css';
import { useGiraCountdown } from '@/hooks/useGiraCountdown';


interface GiraDetailsInfo {
  id: number;
  name: string;
  location: string;
  release_start_at: string;
  release_end_at: string;
  max_tickets: number;
  current_tickets: number;
  tickets_available: number;
  is_open: boolean;
}


interface GiraDetailsProps {
  giraData: GiraDetailsInfo;
  tenantColor?: string;
}


export default function GiraDetails({
  giraData,
  tenantColor = '#2E7D32',
}: GiraDetailsProps) {
  /**
   * Display gira details with countdown timer
   * 
   * Features:
   * - Gira name, date, location
   * - Ticket availability bar
   * - Countdown to emission window
   * - Status indicator (upcoming, active, closed)
   * - Progress bar animation
   */

  const {
    timeRemaining,
    isOpen,
    percentRemaining,
    status,
  } = useGiraCountdown(giraData.release_start_at, giraData.release_end_at);

  const capacityPercentage = (giraData.current_tickets / giraData.max_tickets) * 100;
  const availabilityPercentage = (giraData.tickets_available / giraData.max_tickets) * 100;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header} style={{ borderBottomColor: tenantColor }}>
        <h2 className={styles.title}>{giraData.name}</h2>
        <p className={styles.location}>
          📍 {giraData.location}
        </p>
      </div>

      {/* Status Badge */}
      <div className={styles.statusbadge} style={{
        backgroundColor: isOpen ? '#4CAF50' : '#2196F3',
        color: 'white',
      }}>
        {isOpen ? '🟢 EMISSÃO ABERTA' : '🔵 PRÓXIMO'}
      </div>

      {/* Event Date/Time */}
      <div className={styles.eventinfo}>
        <div className={styles.infoitem}>
          <span className={styles.label}>Início da Emissão:</span>
          <span className={styles.value}>{formatDate(giraData.release_start_at)}</span>
        </div>
        <div className={styles.infoitem}>
          <span className={styles.label}>Fim da Emissão:</span>
          <span className={styles.value}>{formatDate(giraData.release_end_at)}</span>
        </div>
      </div>

      {/* Countdown Timer */}
      {!isOpen && (
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

      {/* Ticket Availability */}
      <div className={styles.availability}>
        <h3 className={styles.availabilitytitle}>Disponibilidade de Senhas</h3>
        
        {/* Meter Bar */}
        <div className={styles.metercontainer}>
          <div className={styles.meterfull} style={{ 
            backgroundColor: '#e0e0e0',
            borderRadius: '8px',
            overflow: 'hidden',
            height: '24px',
          }}>
            <div 
              className={styles.meterfilled}
              style={{
                backgroundColor: tenantColor,
                width: `${capacityPercentage}%`,
                height: '100%',
                transition: 'width 0.3s ease-in-out',
              }}
            />
          </div>
        </div>

        {/* Statistics */}
        <div className={styles.stats}>
          <div className={styles.statitem}>
            <span className={styles.statlabel}>Emitidas:</span>
            <span className={styles.statvalue} style={{ color: tenantColor }}>
              {giraData.current_tickets} de {giraData.max_tickets}
            </span>
          </div>
          <div className={styles.statitem}>
            <span className={styles.statlabel}>Disponíveis:</span>
            <span className={styles.statvalue} style={{ color: '#4CAF50' }}>
              {giraData.tickets_available}
            </span>
          </div>
        </div>
      </div>

      {/* Capacity Warning */}
      {giraData.tickets_available < 50 && giraData.tickets_available > 0 && (
        <div className={styles.warning} style={{
          backgroundColor: '#fff3cd',
          borderLeftColor: '#ffc107',
        }}>
          <span style={{ color: '#856404' }}>
            ⚠️ Apenas {giraData.tickets_available} senhas disponíveis! Emita sua senha agora.
          </span>
        </div>
      )}

      {giraData.tickets_available === 0 && (
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
