import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { SCREENS, type ScreenKey } from '@/constants/landingScreens';

/** Tela real do sistema numa moldura de navegador, celular ou TV (V-05). */
export function ScreenShot({
  name,
  className,
  sizes = '(min-width: 900px) 50vw, 100vw',
  priority = false,
}: {
  name: ScreenKey;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const s = SCREENS[name];
  const img = (
    <Image
      src={s.src}
      alt={s.alt}
      width={s.width}
      height={s.height}
      sizes={sizes}
      priority={priority}
      unoptimized
      className="block h-auto w-full"
    />
  );

  if (s.device === 'mobile') {
    return (
      <div className={cn('mx-auto w-full max-w-[16rem] rounded-[2.2rem] bg-cafe-950 p-2.5 shadow-2xl shadow-cafe-900/30', className)}>
        <div className="overflow-hidden rounded-[1.8rem] bg-white">{img}</div>
      </div>
    );
  }
  if (s.device === 'tv') {
    return (
      <div className={cn('w-full', className)}>
        <div className="overflow-hidden rounded-xl border-[10px] border-cafe-950 bg-cafe-950 shadow-2xl shadow-cafe-900/30">{img}</div>
        <div aria-hidden className="mx-auto h-3 w-1/4 rounded-b-lg bg-cafe-900" />
      </div>
    );
  }
  return (
    <div className={cn('w-full overflow-hidden rounded-xl border border-areia-200 bg-white shadow-xl shadow-cafe-900/15', className)}>
      <div aria-hidden className="flex items-center gap-1.5 border-b border-areia-200 bg-areia-100 px-3 py-2">
        <span className="size-2.5 rounded-full bg-barro-500/70" />
        <span className="size-2.5 rounded-full bg-ouro-400/80" />
        <span className="size-2.5 rounded-full bg-folha-600/70" />
        <span className="ml-3 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-tinta-suave">girahub.com.br</span>
      </div>
      {img}
    </div>
  );
}

export default ScreenShot;
