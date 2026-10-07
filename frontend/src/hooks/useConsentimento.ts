/**
 * A escolha de cookies atual (lib/consent.ts), reativa: muda quando a pessoa decide no banner.
 * `pronto` só fica true depois de montar no navegador — no servidor não há cookie para ler,
 * então nada que dependa do consentimento deve aparecer antes disso (evita erro de hidratação).
 */
import { useEffect, useState } from 'react';
import { aoMudarConsentimento, lerConsentimento, type Consentimento } from '@/lib/consent';

export function useConsentimento(): { consentimento: Consentimento | null; pronto: boolean } {
  const [estado, setEstado] = useState<{ consentimento: Consentimento | null; pronto: boolean }>({
    consentimento: null,
    pronto: false,
  });
  useEffect(() => {
    setEstado({ consentimento: lerConsentimento(), pronto: true });
    return aoMudarConsentimento((c) => setEstado({ consentimento: c, pronto: true }));
  }, []);
  return estado;
}

export default useConsentimento;
