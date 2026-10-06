/**
 * Location — "Como chegar": endereço, instruções, mapa (OpenStreetMap via Nominatim,
 * só no site público) e botão para o Google Maps.
 */
import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickForeground } from '@/lib/brand';
import { buttonVariants } from '@/components/ui/button';
import type { SectionConfig, SectionContext } from '../types';
import { sectionForeground } from '../lib';
import { SectionBody, SectionShell, SectionTitle } from './SectionShell';

export function buildAddress(config: SectionConfig) {
  const street = String(config.street || '');
  const number = String(config.number || '');
  const complement = String(config.complement || '');
  const neighborhood = String(config.neighborhood || '');
  const city = String(config.city || '');
  const state = String(config.state || '');
  const cep = String(config.cep || '');
  const line1 = [street, number, complement].filter(Boolean).join(', ');
  const line2 = [neighborhood, city && state ? `${city} — ${state}` : city || state].filter(Boolean).join(', ');
  const cepLine = cep ? `CEP ${cep}` : '';
  const full = [line1, line2, cepLine].filter(Boolean).join(', ');
  const legacy = String(config.address || '');
  return { line1, line2, cepLine, full, legacy, query: full || legacy, street, number, city, state };
}

export function Location({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const isPreview = ctx.mode === 'preview';
  const address = buildAddress(config);
  const title = String(config.title || 'Como chegar');
  const instructions = String(config.instructions || '');
  const mapLeft = String(config.map_side || 'right') === 'left';
  const fg = sectionForeground(config, '#f8f8f8');
  const mapsUrl = address.query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.query)}`
    : null;

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);

  useEffect(() => {
    if (isPreview || !address.query) return;
    let cancelled = false;
    setGeocodeFailed(false);
    const geocode = (q: string) =>
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'pt-BR' },
      })
        .then((r) => r.json())
        .then((data) => (Array.isArray(data) ? data[0] ?? null : null));
    // Endereços com nome de condomínio/bairro às vezes não casam no OSM — tenta a versão curta.
    const fallback = [address.street, address.number, address.city, address.state].filter(Boolean).join(', ');
    geocode(address.query)
      .then((r) => r ?? (fallback && fallback !== address.query ? geocode(fallback) : null))
      .then((r) => {
        if (cancelled) return;
        if (r) setCoords({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
        else setGeocodeFailed(true);
      })
      .catch(() => {
        if (!cancelled) setGeocodeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isPreview, address.query, address.street, address.number, address.city, address.state]);

  const osmUrl = coords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon - 0.005}%2C${coords.lat - 0.003}%2C${coords.lon + 0.005}%2C${coords.lat + 0.003}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`
    : null;

  const mapBlock = (
    <div
      className={cn(
        'relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/[0.06] shadow',
        address.query ? 'h-[260px] @min-[900px]:h-[380px]' : 'h-[180px] @min-[900px]:h-[280px]',
      )}
    >
      {osmUrl ? (
        <iframe title="Mapa" src={osmUrl} className="block size-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 text-center text-sm opacity-60">
          <MapPin className="size-8" aria-hidden />
          {!address.query
            ? 'Preencha o endereço para exibir o mapa'
            : isPreview
              ? 'O mapa aparece no site publicado'
              : geocodeFailed
                ? 'Não foi possível localizar este endereço no mapa. Use o botão "Abrir no Google Maps".'
                : 'Carregando mapa…'}
        </div>
      )}
    </div>
  );

  const infoBlock = (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 @min-[900px]:py-4">
      <SectionTitle config={config} className="mb-0">
        {title}
      </SectionTitle>
      {address.line1 || address.line2 || address.cepLine ? (
        <address className="flex flex-col gap-1 not-italic">
          {address.line1 && <SectionBody config={config} defaultSize={15}>{address.line1}</SectionBody>}
          {address.line2 && (
            <SectionBody config={config} defaultSize={15} className="opacity-75">
              {address.line2}
            </SectionBody>
          )}
          {address.cepLine && <span className="text-sm opacity-55">{address.cepLine}</span>}
        </address>
      ) : address.legacy ? (
        <SectionBody config={config} defaultSize={15} as="div">
          <address className="not-italic">{address.legacy}</address>
        </SectionBody>
      ) : (
        isPreview && <p className="text-sm italic opacity-50">Preencha o endereço no painel ao lado.</p>
      )}
      {instructions && <p className="text-sm leading-relaxed whitespace-pre-line opacity-70">{instructions}</p>}
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={isPreview ? -1 : undefined}
          onClick={isPreview ? (e) => e.preventDefault() : undefined}
          className={cn(
            buttonVariants({ size: 'touch' }), 'no-underline',
            'mt-1 self-start bg-[var(--fg)] text-[var(--btn-fg)] hover:bg-[var(--fg)] hover:opacity-90 focus-visible:ring-[var(--fg)]/50',
          )}
          style={{ '--btn-fg': pickForeground(fg) } as React.CSSProperties}
        >
          <MapPin aria-hidden />
          Abrir no Google Maps
        </a>
      )}
    </div>
  );

  return (
    <SectionShell config={config} defaultBg="#f8f8f8" aria-label="Como chegar" data-section="location">
      <div className={cn('flex flex-col gap-6 @min-[900px]:items-center @min-[900px]:gap-10', mapLeft ? '@min-[900px]:flex-row-reverse' : '@min-[900px]:flex-row')}>
        {infoBlock}
        {mapBlock}
      </div>
    </SectionShell>
  );
}

export default Location;
