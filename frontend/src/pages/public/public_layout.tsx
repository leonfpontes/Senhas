/**
 * T040: Public Layout Component - No authentication required wrapper
 * Simple, clean layout for public ticket emission interface
 */

'use client';

import React, { ReactNode, useMemo, useState } from 'react';
import styles from './public_layout.module.css';


interface PublicLayoutProps {
  tenantName: string;
  tenantLogoUrl?: string;
  tenantColor?: string;
  tenantSecondaryColor?: string;
  children: ReactNode;
}


export default function PublicLayout({
  tenantName,
  tenantLogoUrl,
  tenantColor = '#2E7D32',
  tenantSecondaryColor = '#1565C0',
  children,
}: PublicLayoutProps) {
  /**
   * Public layout - no navbar, no authentication required
   * 
   * Features:
   * - Minimal, clean design
   * - Tenant branding (logo, color)
   * - Mobile-first responsive
   * - Footer with support links
   * - No auth UI elements
   */

  const [logoFailed, setLogoFailed] = useState(false);
  const tenantInitial = useMemo(() => tenantName.charAt(0).toUpperCase(), [tenantName]);
  const brandGradient = useMemo(
    () => `linear-gradient(135deg, ${tenantColor} 0%, ${tenantSecondaryColor} 100%)`,
    [tenantColor, tenantSecondaryColor]
  );

  return (
    <div className={styles.container}>
      {/* Header with Tenant Branding */}
      <header className={styles.header} style={{ background: brandGradient }}>
        <div className={styles.headerContent}>
          {tenantLogoUrl && !logoFailed ? (
            <img
              src={tenantLogoUrl}
              alt={tenantName}
              className={styles.logo}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <div className={styles.logofallback}>{tenantInitial}</div>
          )}
          <h1 className={styles.title}>{tenantName}</h1>
        </div>
        <p className={styles.subtitle}>Emissão Pública de Senhas</p>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {children}
      </main>

      {/* Footer */}
      <footer className={styles.footer} style={{ background: brandGradient }}>
        <div className={styles.footerContent}>
          <p className={styles.footerText}>
            © 2026 {tenantName} - Administração de Senhas Espíritas
          </p>
          <div className={styles.footerLinks}>
            <a href="#" className={styles.footerLink}>Privacidade</a>
            <span className={styles.separator}>|</span>
            <a href="#" className={styles.footerLink}>Termos</a>
            <span className={styles.separator}>|</span>
            <a href="#" className={styles.footerLink}>Suporte</a>
          </div>
          <p className={styles.footerTime}>
            Horário Brasília: {new Date().toLocaleTimeString('pt-BR', { 
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}
