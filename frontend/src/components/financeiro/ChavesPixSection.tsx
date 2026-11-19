/**
 * ChavesPixSection — carrega `GET /config/pix/chaves` uma vez e mostra os dois cards que usam esses
 * dados: o cadastro único das chaves (`ChavesPixCard`) e a chave de cada grupo
 * (`ChavePixDosGruposCard`). Um card salva e o outro já vê a mudança (ex.: chave nova no select).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/services/api_client';
import { ChavesPixCard } from './ChavesPixCard';
import { ChavePixDosGruposCard } from './ChavePixDosGruposCard';
import { PIX_CHAVES_URL, type ChavesPixApi } from './pixChaves';

interface Props {
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function ChavesPixSection({ canInsert, canEdit, canDelete }: Props) {
  const [data, setData] = useState<ChavesPixApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<ChavesPixApi>(PIX_CHAVES_URL);
      if (!Array.isArray(res.data?.chaves)) throw new Error('resposta inesperada');
      setData(res.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Skeleton className="h-40 w-full" aria-label="Carregando as chaves PIX" />;
  if (loadError || !data) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden />
        <AlertDescription>Não foi possível carregar as chaves PIX.</AlertDescription>
      </Alert>
    );
  }
  return (
    <>
      <ChavesPixCard
        data={data}
        onChange={setData}
        reload={load}
        canInsert={canInsert}
        canEdit={canEdit}
        canDelete={canDelete}
      />
      <ChavePixDosGruposCard data={data} onChange={setData} canEdit={canEdit} />
    </>
  );
}

export default ChavesPixSection;
