/**
 * T045: Dynamic Public Route
 * Pages route: /pages/public/[tenant].tsx
 * Maps /:tenant to public ticket emission interface
 * 
 * URL: /public/espiritismo-sp
 * Shows: Gira details + Emit form
 */

'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import PublicLayout from './public_layout';
import GiraDetails from './gira_details';
import EmitForm from './emit_form';
import { apiClient } from '@/services/api_client';
import styles from './public_page.module.css';


interface GiraData {
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


interface TenantInfo {
  slug: string;
  name: string;
  logo_url?: string;
  brand_color?: string;
}


export default function PublicPage() {
  const params = useParams();
  const tenantSlug = params?.tenant as string;

  const [giraData, setGiraData] = useState<GiraData | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantSlug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch next gira
        const giraResponse = await apiClient.get(
          `/api/v1/public/next-gira?tenant_slug=${tenantSlug}`
        );
        setGiraData(giraResponse.data);

        // Extract tenant info from response or use defaults
        setTenantInfo({
          slug: tenantSlug,
          name: 'Centro Espírita',
          logo_url: undefined,
          brand_color: '#2E7D32',
        });

      } catch (err: any) {
        const message =
          err?.response?.status === 404
            ? 'Tenant ou gira não encontrado'
            : 'Erro ao carregar dados. Tente novamente.';
        setError(message);
        console.error('Error fetching gira data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantSlug]);

  if (loading) {
    return (
      <PublicLayout tenantName="Carregando..." tenantLogoUrl={undefined}>
        <div className={styles.loadingcontainer}>
          <div className={styles.spinner}></div>
          <p>Carregando dados do evento...</p>
        </div>
      </PublicLayout>
    );
  }

  if (error || !giraData || !tenantInfo) {
    return (
      <PublicLayout 
        tenantName={tenantInfo?.name || 'Centro Espírita'}
        tenantLogoUrl={tenantInfo?.logo_url}
        tenantColor={tenantInfo?.brand_color}
      >
        <div className={styles.errorcontainer}>
          <div className={styles.errorcontent}>
            <h2>❌ Erro ao Carregar</h2>
            <p>{error || 'Informações não disponíveis'}</p>
            <button
              onClick={() => window.location.reload()}
              className={styles.retrybutton}
              style={{ backgroundColor: tenantInfo?.brand_color || '#2E7D32' }}
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout
      tenantName={tenantInfo.name}
      tenantLogoUrl={tenantInfo.logo_url}
      tenantColor={tenantInfo.brand_color}
    >
      <div className={styles.container}>
        {/* Two-column layout: Gira details left, form right */}
        <div className={styles.grid}>
          <div className={styles.giradetalspan}>
            <GiraDetails
              giraData={giraData}
              tenantColor={tenantInfo.brand_color}
            />
          </div>

          <div className={styles.formspan}>
            <EmitForm
              tenantSlug={tenantSlug}
              girReleaseStart={giraData.release_start_at}
              giraReleaseEnd={giraData.release_end_at}
              tenantColor={tenantInfo.brand_color}
              onSuccess={(ticketNumber, email) => {
                console.log('Ticket emitted:', ticketNumber, email);
                // Could scroll to success section or refresh data here
              }}
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
