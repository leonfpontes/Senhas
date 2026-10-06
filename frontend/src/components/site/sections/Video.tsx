/**
 * Video — vídeo do YouTube (iframe youtube-nocookie), sozinho ou ao lado de um texto.
 * Na prévia do editor o iframe vira um placeholder (não carrega o YouTube).
 */
import React from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SectionConfig, SectionContext } from '../types';
import { toYoutubeEmbedUrl } from '../lib';
import { PreviewHint, SectionShell } from './SectionShell';

export function Video({ config, ctx }: { config: SectionConfig; ctx: SectionContext }) {
  const rawUrl = String(config.youtube_url || '');
  const embedUrl = toYoutubeEmbedUrl(rawUrl);
  const isPreview = ctx.mode === 'preview';
  if (!embedUrl && !isPreview) return null;

  const sideBySide = String(config.layout || 'video-only') === 'side-by-side';
  const videoLeft = String(config.video_side || 'right') === 'left';
  const caption = config.caption ? String(config.caption) : '';
  const sideText = config.side_text ? String(config.side_text) : '';
  const captionSize = Number(config.caption_font_size || 24);
  const captionWeight = Number(config.caption_font_weight || 600);

  const player = (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-xl bg-black',
        sideBySide ? 'aspect-video @min-[900px]:w-[55%] @min-[900px]:shrink-0' : 'aspect-video',
      )}
    >
      {embedUrl && !isPreview ? (
        <iframe
          src={embedUrl}
          title={caption || 'Vídeo'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80" aria-hidden>
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-white/50 bg-white/15">
            <Play className="ml-1 size-6" />
          </span>
          {!embedUrl && <span className="text-xs">Cole o link do YouTube</span>}
        </div>
      )}
    </div>
  );

  const captionEl = caption ? (
    <h2 className="leading-snug" style={{ fontSize: captionSize, fontWeight: captionWeight }}>
      {caption}
    </h2>
  ) : null;

  return (
    <SectionShell config={config} defaultBg="#f5f5f5" className="py-8 @min-[900px]:py-12" aria-label="Vídeo">
      {sideBySide ? (
        <div className={cn('flex flex-col gap-8', videoLeft ? '@min-[900px]:flex-row-reverse' : '@min-[900px]:flex-row', '@min-[900px]:items-center')}>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
            {captionEl}
            {sideText ? (
              <p className="leading-relaxed whitespace-pre-line" style={{ fontSize: 16 }}>
                {sideText}
              </p>
            ) : (
              !caption && isPreview && <PreviewHint>Título e texto aparecem aqui, ao lado do vídeo.</PreviewHint>
            )}
          </div>
          {player}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {captionEl && <div className="text-center">{captionEl}</div>}
          {player}
        </div>
      )}
    </SectionShell>
  );
}

export default Video;
