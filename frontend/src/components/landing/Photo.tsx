import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { PHOTOS, type PhotoKey } from '@/constants/landingPhotos';

/**
 * Foto das páginas de marketing. `unoptimized`: os arquivos já saem em WebP otimizado
 * (frontend/public/landing/fotos) e a imagem standalone de produção não tem `sharp`.
 */
export function Photo({
  name,
  className,
  priority = false,
  sizes = '(min-width: 900px) 50vw, 100vw',
  decorative = false,
}: {
  name: PhotoKey;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Imagem de fundo/ambiente: alt vazio para leitores de tela. */
  decorative?: boolean;
}) {
  const p = PHOTOS[name];
  return (
    <Image
      src={p.src}
      alt={decorative ? '' : p.alt}
      width={p.width}
      height={p.height}
      sizes={sizes}
      priority={priority}
      unoptimized
      className={cn('object-cover', className)}
    />
  );
}

export default Photo;
