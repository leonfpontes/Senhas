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
import type { GiraPublic } from 'shared-types';


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

  const [giraData, setGiraData] = useState<GiraPublic | null>(null);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dois 404 distintos do next-gira: tenant inexistente vs tenant sem gira
  // com emissão configurada (distinguidos pelo detail do erro)
  const [tenantMissing, setTenantMissing] = useState(false);
  const [noGira, setNoGira] = useState(false);

  useEffect(() => {
    if (!tenantSlug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        setTenantMissing(false);
        setNoGira(false);

        // Fetch next gira
        const giraResponse = await apiClient.get(
          `/api/v1/public/next-gira?tenant_slug=${encodeURIComponent(tenantSlug)}`
        );

        // Gira com agendamento por horário: esta página não tem seletor de
        // horário — a emissão falharia com 400. A página completa tem.
        if (giraResponse.data.use_time_slots) {
          router.replace(`/public/gira/${giraResponse.data.id}`);
          return;
        }

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

      } catch (err) {
        const { status, detail } =
          err && typeof err === 'object'
            ? (err as { status?: number; detail?: unknown })
            : { status: undefined, detail: undefined };
        if (status === 404) {
          // next_gira.py: "Tenant '<slug>' not found" vs "No active gira scheduled..."
          if (typeof detail === 'string' && detail.startsWith('Tenant')) {
            setTenantMissing(true);
          } else {
            setNoGira(true);
          }
        } else {
          setError('Erro ao carregar dados. Tente novamente.');
        }
        console.error('Error fetching gira data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantSlug, router]);

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

  if (error || tenantMissing || noGira || !giraData || !tenantInfo) {
    const defaultColors = {
      primary_color: '#2E7D32',
      secondary_color: '#1565C0',
    };
    // Sem resposta da gira não há branding do tenant; o nome derivado do slug
    // é mais honesto que um genérico "Centro Espírita"
    const slugDisplayName = (tenantSlug || '')
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const headerName = tenantMissing
      ? 'Emissão de Senhas'
      : tenantInfo?.name || slugDisplayName || 'Emissão de Senhas';
    return (
      <PublicLayout
        tenantName={headerName}
        tenantLogoUrl={tenantInfo?.logo_url}
        tenantColor={tenantInfo?.primary_color || defaultColors.primary_color}
        tenantSecondaryColor={tenantInfo?.secondary_color || defaultColors.secondary_color}
      >
        <div className={styles.errorcontainer}>
          <div className={styles.errorcontent}>
            {tenantMissing ? (
              <>
                <h2 className={styles.emptytitle}>🔍 Terreiro não encontrado</h2>
                <p>
                  Não encontramos nenhum terreiro neste endereço.
                  Confira se o link está correto ou fale com quem o enviou.
                </p>
              </>
            ) : noGira ? (
              <>
                <h2 className={styles.emptytitle}>🕯️ Nenhuma gira com emissão aberta</h2>
                <p>
                  No momento não há emissão de senhas disponível.
                  Entre em contato com o terreiro para saber a data da próxima gira.
                </p>
              </>
            ) : (
              <>
                <h2>❌ Erro ao Carregar</h2>
                <p>{error || 'Informações não disponíveis'}</p>
              </>
            )}
            {!tenantMissing && (
              <button
                onClick={() => window.location.reload()}
                className={styles.retrybutton}
                style={{ backgroundColor: tenantInfo?.primary_color || defaultColors.primary_color }}
              >
                {noGira ? 'Atualizar' : 'Tentar Novamente'}
              </button>
            )}
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
              giraId={giraData.id}
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
