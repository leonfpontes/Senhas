/**
 * T091: Dynamic Public Route with Tenant Branding
 * Pages route: /pages/public/[tenant].tsx
 * Maps /:tenant to public ticket emission interface with tenant-specific branding
 * 
 * URL: /public/espiritismo-sp
 * Shows: Gira details + Emit form with tenant colors
 */

'use client';

import { useRouter } from 'next/router';
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
  id: string;
  slug: string;
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}


export default function PublicPage() {
  const router = useRouter();
  const tenantSlug = router.query.tenant as string;

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
          id: giraResponse.data.tenant_slug,
          slug: giraResponse.data.tenant_slug,
          name: giraResponse.data.tenant_name,
          logo_url: giraResponse.data.logo_url || undefined,
          primary_color: giraResponse.data.primary_color || '#2E7D32',
          secondary_color: giraResponse.data.secondary_color || '#1565C0',
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
    const defaultColors = {
      primary_color: '#2E7D32',
      secondary_color: '#1565C0',
    };
    return (
      <PublicLayout 
        tenantName={tenantInfo?.name || 'Centro Espírita'}
        tenantLogoUrl={tenantInfo?.logo_url}
        tenantColor={tenantInfo?.primary_color || defaultColors.primary_color}
        tenantSecondaryColor={tenantInfo?.secondary_color || defaultColors.secondary_color}
      >
        <div className={styles.errorcontainer}>
          <div className={styles.errorcontent}>
            <h2>❌ Erro ao Carregar</h2>
            <p>{error || 'Informações não disponíveis'}</p>
            <button
              onClick={() => window.location.reload()}
              className={styles.retrybutton}
              style={{ backgroundColor: tenantInfo?.primary_color || defaultColors.primary_color }}
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
      tenantColor={tenantInfo.primary_color}
      tenantSecondaryColor={tenantInfo.secondary_color}
    >
      <div className={styles.container}>
        {/* Two-column layout: Gira details left, form right */}
        <div className={styles.grid}>
          <div className={styles.giradetalspan}>
            <GiraDetails
              giraData={giraData}
              tenantColor={tenantInfo.primary_color}
            />
          </div>

          <div className={styles.formspan}>
            <EmitForm
              tenantSlug={tenantSlug}
              girReleaseStart={giraData.release_start_at}
              giraReleaseEnd={giraData.release_end_at}
              tenantColor={tenantInfo.primary_color}
              onSuccess={() => {
                // Could scroll to success section or refresh data here
              }}
            />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
