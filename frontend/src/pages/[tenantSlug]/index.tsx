/**
 * Public tenant site page — /[tenantSlug]
 *
 * Uses getServerSideProps with INTERNAL_API_URL (not NEXT_PUBLIC_) so fetchs
 * work inside the Docker network (Gap #22).
 *
 * All section data including upcoming giras is server-side rendered for SEO (Gap #19).
 */
import React, { useState } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import {
  Box,
  Button,
  Container,
  Divider,
  Popover,
  Typography,
  useTheme,
} from '@mui/material';
import { HERO_FONTS } from '@/constants/heroFonts';

// ── Timezone helper ───────────────────────────────────────────────────────────
/**
 * Extracts { year, month (0-based), day } from an ISO string using
 * America/Sao_Paulo timezone. Safe for both SSR (Node TZ=UTC) and browser.
 */
function parseSPDate(iso: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month') - 1, day: get('day') };
}

// ── Contact SVG Icons ─────────────────────────────────────────────────────────
function IconWhatsApp({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.424A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Z" fill={color} fillOpacity="0.15" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.424A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Zm0 1.8a8.2 8.2 0 1 1-4.363 15.16l-.313-.184-3.248.929.915-3.17-.202-.325A8.2 8.2 0 0 1 12 3.8Z" fill={color} />
      <path d="M9.083 7.5c-.2-.46-.41-.47-.6-.478L8 7.018c-.18 0-.46.067-.7.337-.24.27-.92.898-.92 2.19 0 1.29.942 2.536 1.072 2.71.13.174 1.832 2.92 4.513 3.974 2.232.88 2.682.705 3.166.66.483-.045 1.558-.637 1.778-1.252.22-.614.22-1.14.153-1.25-.066-.11-.24-.178-.503-.312-.263-.133-1.557-.768-1.799-.855-.24-.088-.414-.133-.588.133-.174.266-.675.854-.827 1.03-.152.175-.304.197-.566.066-.263-.133-1.11-.41-2.114-1.304-.782-.696-1.31-1.556-1.464-1.82-.153-.265-.016-.41.115-.541.117-.12.263-.31.394-.465.13-.155.174-.266.26-.443.088-.178.044-.333-.022-.466-.066-.133-.572-1.43-.797-1.954Z" fill={color} />
    </svg>
  );
}

function IconEmail({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2.5" fill={color} fillOpacity="0.12" />
      <rect x="2" y="4" width="20" height="16" rx="2.5" stroke={color} strokeWidth="1.6" />
      <path d="M2.5 6.5 12 13.5l9.5-7" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconInstagram({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={color} fillOpacity="0.12" />
      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke={color} strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1" fill={color} />
    </svg>
  );
}

/** Converts #rrggbb + opacity (0-100) to rgba. */
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Normalizes a Brazilian phone number for use in WhatsApp links (wa.me).
 * Numbers stored without country code (10-11 digits) receive the +55 prefix.
 * Numbers already containing the country code (12-13 digits starting with 55)
 * are left unchanged.
 */
function toBrWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

interface GiraItem {
  id: string;
  nome: string;
  data_hora: string | null;
  descricao: string | null;
  has_tickets: boolean;
  has_sponsor_tickets: boolean;
}

interface SectionData {
  id: string;
  section_type: string;
  order_index: number;
  config: Record<string, unknown>;
}

interface SiteData {
  id: string;
  slug: string;
  status: string;
  template: string;
  meta_title: string | null;
  meta_description: string | null;
  sections: SectionData[];
  upcoming_giras: GiraItem[];
}

// ── Section renderers ─────────────────────────────────────────────────────────

function HeroSection({ config }: { config: Record<string, unknown> }) {
  const bgType = String(config.bg_type || 'gradient');
  const bgUrl = config.bg_image_url ? String(config.bg_image_url) : undefined;

  // Font
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const titleFontSize = Number(config.font_size || 48);
  const titleFontWeight = Number(config.font_weight || 700);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#ffffff');
  const marginPreset = String(config.margin_preset || 'contained');
  const heroPx = marginPreset === 'wide' ? { xs: '15px', md: '30px' } : marginPreset === 'medium' ? { xs: '30px', md: '10%' } : 6;
  const subtitleFontSize = Math.max(16, Math.round(titleFontSize * 0.6));
  const bgPositionX = Number(config.bg_position_x ?? 50);
  const bgPositionY = Number(config.bg_position_y ?? 50);
  const logoMode = String(config.logo_mode || 'none');
  const logoPosition = String(config.logo_position || 'left');
  const logoUrl = config.logo_image_url ? String(config.logo_image_url) : undefined;
  const showLogo = logoMode === 'logo' && !!logoUrl;
  // Desktop logo sizes: xl=300, lg=200, md=140, sm=90, xs=56
  const LOGO_SIZE_MAP: Record<string, { xs: number; md: number }> = {
    xl: { xs: 220, md: 300 }, lg: { xs: 160, md: 200 }, md: { xs: 100, md: 140 }, sm: { xs: 68, md: 90 }, xs: { xs: 44, md: 56 },
  };
  const logoSizeKey = String(config.logo_size || 'md');
  const logoSizePx = LOGO_SIZE_MAP[logoSizeKey] ?? LOGO_SIZE_MAP.md;

  let background: string;
  if (bgType === 'image' && bgUrl) {
    background = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${bgUrl}) ${bgPositionX}% ${bgPositionY}% / cover no-repeat`;
  } else if (bgType === 'solid') {
    background = String(config.bg_color || '#6366f1');
  } else {
    // gradient (default)
    const from = String(config.gradient_from || '#6366f1');
    const to = String(config.gradient_to || '#ec4899');
    const dir = String(config.gradient_dir || '135deg');
    background = dir === 'radial'
      ? `radial-gradient(circle, ${from} 0%, ${to} 100%)`
      : `linear-gradient(${dir}, ${from} 0%, ${to} 100%)`;
  }

  return (
    <Box
      sx={{
        minHeight: 380,
        display: 'flex',
        alignItems: 'center',
        justifyContent: showLogo
          ? (marginPreset === 'wide' ? 'space-between' : marginPreset === 'medium' ? 'center' : 'center')
          : 'center',
        flexDirection: { xs: 'column', md: showLogo ? 'row' : 'column' },
        textAlign: 'center',
        gap: showLogo
          ? (marginPreset === 'wide' ? { xs: 3, md: 8 } : marginPreset === 'medium' ? { xs: 3, md: 6 } : { xs: 3, md: 4 })
          : 0,
        py: 6,
        px: heroPx,
        background,
        color: fontColor,
      }}
    >
      {showLogo && logoPosition === 'left' && (
        <Box
          component="img"
          src={logoUrl}
          alt="Logo do terreiro"
          sx={{
            width: { xs: logoSizePx.xs, md: logoSizePx.md },
            height: { xs: logoSizePx.xs, md: logoSizePx.md },
            objectFit: 'contain',
            flexShrink: 0,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
          }}
        />
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography
          component="h1"
          gutterBottom
          sx={{
            fontFamily,
            fontWeight: titleFontWeight,
            fontStyle,
            fontSize: `${titleFontSize}px`,
            lineHeight: 1.2,
            textShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          {String(config.title || '')}
        </Typography>
        {config.subtitle && (
          <Typography
            component="p"
            sx={{
              fontFamily,
              fontStyle,
              fontSize: `${subtitleFontSize}px`,
              opacity: 0.9,
              maxWidth: 640,
            }}
          >
            {String(config.subtitle)}
          </Typography>
        )}
      </Box>
      {showLogo && logoPosition === 'right' && (
        <Box
          component="img"
          src={logoUrl}
          alt="Logo do terreiro"
          sx={{
            width: { xs: logoSizePx.xs, md: logoSizePx.md },
            height: { xs: logoSizePx.xs, md: logoSizePx.md },
            objectFit: 'contain',
            flexShrink: 0,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
          }}
        />
      )}
    </Box>
  );
}

function AboutSection({ config }: { config: Record<string, unknown> }) {
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const titleFontSize = Number(config.title_font_size || 28);
  const titleFontWeight = Number(config.title_font_weight || 700);
  const bodyFontSize = Number(config.body_font_size || 16);
  const bodyFontWeight = Number(config.body_font_weight || 400);
  const fontStyle = String(config.font_style || 'normal');
  const imageSide = String(config.image_side || 'right');
  const bgColor = String(config.bg_color || '#ffffff');
  const bgOpacity = Number(config.bg_opacity ?? 100);
  const fontColor = String(config.font_color || '#111111');
  const marginPreset = String(config.margin_preset || 'contained');
  const aboutContainerSx = marginPreset === 'wide'
    ? { width: '100%', px: { xs: '15px', md: '30px' }, py: 6 }
    : marginPreset === 'medium'
      ? { maxWidth: 1200, mx: 'auto', px: { xs: '15px', md: '30px' }, py: 6 }
      : { maxWidth: 900, mx: 'auto', px: { xs: 2, md: 3 }, py: 6 };

  const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
  const fontImportUrl = fontEntry?.importUrl ?? null;

  const bgRgba = bgColor.startsWith('#') ? hexToRgba(bgColor, bgOpacity) : undefined;

  return (
    <Box sx={{ background: bgRgba }}>
      {fontImportUrl && (
        <Head>
          <link key="about-font" rel="stylesheet" href={fontImportUrl} />
        </Head>
      )}
      <Box sx={aboutContainerSx}>
        {config.title && (
          <Typography
            component="h2"
            gutterBottom
            sx={{
              fontFamily,
              fontSize: `${titleFontSize}px`,
              fontWeight: titleFontWeight,
              fontStyle,
              lineHeight: 1.25,
              color: fontColor,
            }}
          >
            {String(config.title)}
          </Typography>
        )}
        <Box
          sx={{
            display: 'flex',
            gap: 4,
            flexDirection: {
              xs: 'column',
              // text is first child, image is second — use row-reverse to put image on the LEFT
              md: imageSide === 'left' ? 'row-reverse' : 'row',
            },
            alignItems: { md: 'flex-start' },
          }}
        >
          <Typography
            component="p"
            sx={{
              flex: 1,
              whiteSpace: 'pre-line',
              fontFamily,
              fontSize: `${bodyFontSize}px`,
              fontWeight: bodyFontWeight,
              fontStyle,
              color: fontColor,
            }}
          >
            {String(config.body || '')}
          </Typography>
          {config.image_url && (
            <Box
              sx={{
                flexShrink: 0,
                width: { xs: '100%', md: 280 },
              }}
            >
              <Box
                component="img"
                src={String(config.image_url)}
                alt=""
                sx={{
                  width: '100%',
                  borderRadius: 2,
                  objectFit: 'cover',
                  display: 'block',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  border: '3px solid',
                  borderColor: 'divider',
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function VideoEmbedSection({ config }: { config: Record<string, unknown> }) {
  const rawUrl = String(config.youtube_url || '');
  if (!rawUrl) return null;

  // Convert watch URL to embed URL
  let embedUrl = rawUrl;
  const watchMatch = rawUrl.match(/[?&]v=([^&]+)/);
  const shortMatch = rawUrl.match(/youtu\.be\/([^?]+)/);
  const videoId = watchMatch?.[1] || shortMatch?.[1];
  if (videoId) {
    embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
  } else if (rawUrl.includes('youtube.com/embed/')) {
    embedUrl = rawUrl.replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');
  }

  const layout = String(config.layout || 'video-only');
  const videoSide = String(config.video_side || 'right');
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const captionFontSize = Number(config.caption_font_size || 24);
  const captionFontWeight = Number(config.caption_font_weight || 600);
  const fontStyle = String(config.font_style || 'normal');
  const caption = config.caption ? String(config.caption) : null;
  const sideText = config.side_text ? String(config.side_text) : null;
  const bgColor = String(config.bg_color || '#f5f5f5');
  const bgOpacity = Number(config.bg_opacity ?? 100);
  const fontColor = String(config.font_color || '#111111');
  const marginPreset = String(config.margin_preset || 'contained');
  const videoContainerSx = marginPreset === 'wide'
    ? { width: '100%', px: { xs: '15px', md: '30px' } }
    : marginPreset === 'medium'
      ? { maxWidth: 1200, mx: 'auto', px: { xs: '15px', md: '30px' } }
      : { maxWidth: 900, mx: 'auto', px: { xs: 2, md: 3 } };

  const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
  const fontImportUrl = fontEntry?.importUrl ?? null;
  const bgRgba = bgColor.startsWith('#') ? hexToRgba(bgColor, bgOpacity) : undefined;

  const videoEmbed = (
    <Box
      sx={{
        position: 'relative',
        paddingTop: layout === 'side-by-side' ? '0' : '56.25%',
        flex: layout === 'side-by-side' ? '0 0 auto' : undefined,
        // Wide preset: maintain 16:9; other presets: stretch to text column height
        alignSelf: layout === 'side-by-side' && marginPreset !== 'wide' ? 'stretch' : undefined,
        aspectRatio: layout === 'side-by-side' && marginPreset === 'wide' ? '16/9' : undefined,
        width: layout === 'side-by-side' ? { xs: '100%', md: '55%' } : '100%',
        minHeight: layout === 'side-by-side' ? 250 : undefined,
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Box
        component="iframe"
        src={embedUrl}
        title={String(caption || 'Vídeo')}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        sx={
          layout === 'side-by-side'
            ? { width: '100%', height: '100%', border: 0, display: 'block', minHeight: 220 }
            : { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }
        }
      />
    </Box>
  );

  const textCol = sideText || caption ? (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {caption && (
        <Typography
          component="h2"
          sx={{
            fontFamily,
            fontSize: `${captionFontSize}px`,
            fontWeight: captionFontWeight,
            fontStyle,
            lineHeight: 1.3,
            color: fontColor,
          }}
        >
          {caption}
        </Typography>
      )}
      {sideText && (
        <Typography
          component="p"
          sx={{
            fontFamily,
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.7,
            whiteSpace: 'pre-line',
            color: fontColor,
          }}
        >
          {sideText}
        </Typography>
      )}
    </Box>
  ) : null;

  return (
    <Box sx={{ background: bgRgba, py: 4 }}>
      {fontImportUrl && (
        <Head>
          <link key="video-font" rel="stylesheet" href={fontImportUrl} />
        </Head>
      )}
      <Box sx={videoContainerSx}>
        {layout === 'video-only' ? (
          <>
            {caption && (
              <Typography
                component="h2"
                gutterBottom
                textAlign="center"
                sx={{
                  fontFamily,
                  fontSize: `${captionFontSize}px`,
                  fontWeight: captionFontWeight,
                  fontStyle,
                  lineHeight: 1.3,
                  color: fontColor,
                }}
              >
                {caption}
              </Typography>
            )}
            {videoEmbed}
          </>
        ) : (
          <Box
            sx={{
              display: 'flex',
              gap: 4,
              flexDirection: {
                xs: 'column',
                // textCol is first child, videoEmbed is second
                // video_side 'right' → row (text left, video right)
                // video_side 'left' → row-reverse (video pushed left)
                md: videoSide === 'right' ? 'row' : 'row-reverse',
              },
              alignItems: { md: marginPreset === 'wide' ? 'center' : 'stretch' },
            }}
          >
            {textCol}
            {videoEmbed}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function GirasCalendarSection({
  config,
  upcomingGiras,
}: {
  config: Record<string, unknown>;
  upcomingGiras: GiraItem[];
}) {
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const titleFontSize = Number(config.title_font_size || 20);
  const titleFontWeight = Number(config.title_font_weight || 700);
  const bodyFontSize = Number(config.body_font_size || 14);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#111111');
  const cardBgColor = String(config.card_bg_color || '#ffffff');
  const calendarHighlightColor = String(config.calendar_highlight_color || '#6366f1');
  const calendarTextColor = String(config.calendar_text_color || '#111111');
  const calendarBgColor = String(config.calendar_bg_color || '#f8f8f8');
  const bgColor = String(config.bg_color || '#ffffff');
  const bgOpacity = Number(config.bg_opacity ?? 100);
  const displayMode = String(config.display_mode || 'calendar');
  const showTicket = config.show_ticket_button !== false;
  const showSponsor = config.show_sponsor_button !== false;
  const marginPreset = String(config.margin_preset || 'contained');

  const containerSx = marginPreset === 'wide'
    ? { width: '100%', px: { xs: '15px', md: '30px' } }
    : marginPreset === 'medium'
      ? { maxWidth: 1200, mx: 'auto', px: { xs: '15px', md: '30px' } }
      : { maxWidth: 900, mx: 'auto', px: { xs: 2, md: 3 } };

  const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
  const fontImportUrl = fontEntry?.importUrl ?? null;
  const bgRgba = bgColor.startsWith('#') ? hexToRgba(bgColor, bgOpacity) : undefined;

  const [calPopoverAnchor, setCalPopoverAnchor] = useState<HTMLElement | null>(null);
  const [calPopoverGiras, setCalPopoverGiras] = useState<GiraItem[]>([]);

  const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });

  function GiraCardContent({ g }: { g: GiraItem }) {
    return (
      <>
        <Typography sx={{ fontFamily, fontSize: `${titleFontSize}px`, fontWeight: titleFontWeight, fontStyle, color: fontColor, lineHeight: 1.3 }}>
          {g.nome}
        </Typography>
        {g.data_hora && (
          <Typography sx={{ fontFamily, fontSize: `${bodyFontSize}px`, fontStyle, color: fontColor, opacity: 0.65, mt: 0.5 }}>
            {formatDate(g.data_hora)}
          </Typography>
        )}
        {g.descricao && (
          <Typography sx={{ fontFamily, fontSize: `${bodyFontSize}px`, fontStyle, color: fontColor, opacity: 0.8, mt: 0.75 }}>
            {g.descricao}
          </Typography>
        )}
        {((showTicket && g.has_tickets) || (showSponsor && g.has_sponsor_tickets)) && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
            {showTicket && g.has_tickets && (
              <Button
                variant="outlined"
                size="small"
                component="a"
                href={`/public/gira/${g.id}`}
                sx={{ fontFamily, fontSize: `${bodyFontSize}px`, color: fontColor, borderColor: fontColor }}
              >
                Retire sua senha
              </Button>
            )}
            {showSponsor && g.has_sponsor_tickets && (
              <Button
                variant="outlined"
                size="small"
                component="a"
                href={`/public/gira/${g.id}?tipo=associado`}
                sx={{ fontFamily, fontSize: `${bodyFontSize}px`, color: fontColor, borderColor: fontColor, fontStyle: 'italic' }}
              >
                Senha associado
              </Button>
            )}
          </Box>
        )}
      </>
    );
  }

  function renderCalendar() {
    const nowSP = parseSPDate(new Date().toISOString());
    const year = nowSP.year;
    const month = nowSP.month;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const girasByDay = new Map<number, GiraItem[]>();
    for (const g of upcomingGiras) {
      if (!g.data_hora) continue;
      const sp = parseSPDate(g.data_hora);
      if (sp.year === year && sp.month === month) {
        if (!girasByDay.has(sp.day)) girasByDay.set(sp.day, []);
        girasByDay.get(sp.day)!.push(g);
      }
    }

    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <Box sx={{ bgcolor: calendarBgColor, borderRadius: 3, p: { xs: 1.5, md: 2 } }}>
        <Typography sx={{ fontFamily, fontSize: `${titleFontSize * 0.85}px`, fontWeight: 600, fontStyle, color: calendarTextColor, textAlign: 'center', mb: 2, textTransform: 'capitalize' }}>
          {monthName}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
          {dayLabels.map((lbl, i) => (
            <Box key={i} sx={{ textAlign: 'center', fontSize: `${Math.max(10, bodyFontSize * 0.85)}px`, fontFamily, color: calendarTextColor, opacity: 0.5, fontWeight: 600, py: 0.5 }}>
              {lbl}
            </Box>
          ))}
          {cells.map((day, i) => {
            const hasGira = day !== null && girasByDay.has(day);
            return (
              <Box
                key={i}
                onClick={hasGira ? (e: React.MouseEvent<HTMLElement>) => {
                  setCalPopoverAnchor(e.currentTarget);
                  setCalPopoverGiras(girasByDay.get(day!)!);
                } : undefined}
                sx={{
                  py: 1,
                  px: 0.5,
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 1.5,
                  bgcolor: hasGira ? calendarHighlightColor : 'transparent',
                  opacity: day ? 1 : 0,
                  cursor: hasGira ? 'pointer' : 'default',
                  transition: 'opacity 0.15s',
                  '&:hover': hasGira ? { opacity: 0.8 } : {},
                }}
              >
                <Typography sx={{
                  fontFamily,
                  fontSize: `${bodyFontSize}px`,
                  fontWeight: hasGira ? 700 : 400,
                  color: hasGira ? '#fff' : calendarTextColor,
                  lineHeight: 1,
                }}>
                  {day ?? ''}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  const emptyMsg = (
    <Typography sx={{ fontFamily, fontSize: `${bodyFontSize}px`, fontStyle, color: fontColor, opacity: 0.7 }}>
      Nenhuma gira agendada no momento.
    </Typography>
  );

  return (
    <Box sx={{ background: bgRgba, py: 6 }}>
      {fontImportUrl && (
        <Head>
          <link key="giras-font" rel="stylesheet" href={fontImportUrl} />
        </Head>
      )}
      <Box sx={containerSx}>
        <Typography
          component="h2"
          gutterBottom
          sx={{ fontFamily, fontSize: `${titleFontSize * 1.4}px`, fontWeight: titleFontWeight, fontStyle, color: fontColor, lineHeight: 1.25 }}
        >
          {String(config.title || 'Próximas Giras')}
        </Typography>

        {upcomingGiras.length === 0 && displayMode !== 'calendar' && emptyMsg}

        {displayMode === 'list' && upcomingGiras.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {upcomingGiras.map(g => (
              <Box key={g.id} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: cardBgColor }}>
                <GiraCardContent g={g} />
              </Box>
            ))}
          </Box>
        )}

        {displayMode === 'card-grid' && upcomingGiras.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {upcomingGiras.map(g => (
              <Box key={g.id} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: cardBgColor }}>
                <GiraCardContent g={g} />
              </Box>
            ))}
          </Box>
        )}

        {displayMode === 'card-carousel' && upcomingGiras.length > 0 && (
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1, scrollSnapType: 'x mandatory' }}>
            {upcomingGiras.map(g => (
              <Box
                key={g.id}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: cardBgColor,
                  minWidth: { xs: 280, sm: 320 },
                  flexShrink: 0,
                  scrollSnapAlign: 'start',
                }}
              >
                <GiraCardContent g={g} />
              </Box>
            ))}
          </Box>
        )}

        {displayMode === 'calendar' && (
          <>
            {renderCalendar()}
            <Popover
              open={Boolean(calPopoverAnchor)}
              anchorEl={calPopoverAnchor}
              onClose={() => { setCalPopoverAnchor(null); setCalPopoverGiras([]); }}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              transformOrigin={{ vertical: 'top', horizontal: 'center' }}
              slotProps={{ paper: { sx: { maxWidth: 360, borderRadius: 2, boxShadow: 6 } } }}
            >
              <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {calPopoverGiras.map((g, idx) => (
                  <Box key={g.id}>
                    {idx > 0 && <Divider sx={{ mb: 2 }} />}
                    <GiraCardContent g={g} />
                  </Box>
                ))}
              </Box>
            </Popover>
          </>
        )}
      </Box>
    </Box>
  );
}

function LocationSection({ config }: { config: Record<string, unknown> }) {
  const fontFamily   = String(config.font_family      || 'system-ui, sans-serif');
  const titleSize    = Number(config.title_font_size   || 28);
  const titleWeight  = Number(config.title_font_weight || 700);
  const bodySize     = Number(config.body_font_size    || 15);
  const bodyWeight   = Number(config.body_font_weight  || 400);
  const fontStyle    = String(config.font_style        || 'normal');
  const fontColor    = String(config.font_color        || '#111111');
  const bgColor      = String(config.bg_color          || '#f8f8f8');
  const bgOpacity    = Number(config.bg_opacity        ?? 100);
  const marginPreset = String(config.margin_preset     || 'contained');
  const mapSide      = String(config.map_side          || 'right');
  const maxWidth     = marginPreset === 'wide' ? 'xl' : marginPreset === 'medium' ? 'lg' : 'md';
  const background   = hexToRgba(bgColor.startsWith('#') ? bgColor : '#f8f8f8', bgOpacity);

  const street       = String(config.street       || '');
  const number       = String(config.number       || '');
  const complement   = String(config.complement   || '');
  const neighborhood = String(config.neighborhood || '');
  const city         = String(config.city         || '');
  const state        = String(config.state        || '');
  const cep          = String(config.cep          || '');
  const instructions = String(config.instructions || '');
  const title        = String(config.title        || 'Como Chegar');

  const addressLine1 = [street, number, complement].filter(Boolean).join(', ');
  const addressLine2 = [neighborhood, city && state ? `${city} — ${state}` : city || state].filter(Boolean).join(', ');
  const cepLine      = cep ? `CEP ${cep}` : '';
  const fullAddress  = [addressLine1, addressLine2, cepLine].filter(Boolean).join(', ');
  const mapsQuery    = fullAddress || String(config.address || '');
  const mapsUrl      = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : undefined;
  const mapsEmbedUrl = mapsQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery)}&output=embed&z=16`
    : undefined;

  const mapBlock = mapsEmbedUrl ? (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        height: { xs: 260, md: 380 },
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: 2,
      }}
    >
      <iframe
        title="Mapa"
        src={mapsEmbedUrl}
        width="100%"
        height="100%"
        style={{ border: 0, display: 'block' }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </Box>
  ) : (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        height: { xs: 180, md: 280 },
        borderRadius: 2,
        bgcolor: 'rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography sx={{ fontFamily, color: fontColor, opacity: 0.4, fontSize: 14 }}>
        Preencha o endereço para exibir o mapa
      </Typography>
    </Box>
  );

  const infoBlock = (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1.5,
        py: { xs: 0, md: 2 },
      }}
    >
      <Typography sx={{ fontSize: titleSize, fontWeight: titleWeight, fontStyle, fontFamily, color: fontColor, lineHeight: 1.2 }}>
        {title}
      </Typography>
      {(addressLine1 || addressLine2 || cepLine) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {addressLine1 && (
            <Typography sx={{ fontSize: bodySize, fontWeight: bodyWeight, fontStyle, fontFamily, color: fontColor, lineHeight: 1.5 }}>
              {addressLine1}
            </Typography>
          )}
          {addressLine2 && (
            <Typography sx={{ fontSize: bodySize, fontWeight: bodyWeight, fontStyle, fontFamily, color: fontColor, opacity: 0.75, lineHeight: 1.5 }}>
              {addressLine2}
            </Typography>
          )}
          {cepLine && (
            <Typography sx={{ fontSize: bodySize - 1, fontFamily, color: fontColor, opacity: 0.55, lineHeight: 1.5 }}>
              {cepLine}
            </Typography>
          )}
        </Box>
      )}
      {instructions && (
        <Typography sx={{ fontSize: bodySize - 1, fontFamily, fontStyle, color: fontColor, opacity: 0.7, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
          {instructions}
        </Typography>
      )}
      {mapsUrl && (
        <Button
          variant="contained"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ alignSelf: 'flex-start', mt: 0.5, fontFamily }}
        >
          Abrir no Google Maps
        </Button>
      )}
    </Box>
  );

  return (
    <Box sx={{ py: 6, background, fontFamily }}>
      <Container maxWidth={maxWidth}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 3, md: 5 },
            alignItems: { xs: 'stretch', md: 'center' },
          }}
        >
          {mapSide === 'left'
            ? <>{mapBlock}{infoBlock}</>
            : <>{infoBlock}{mapBlock}</>
          }
        </Box>
      </Container>
    </Box>
  );
}

function ContactSection({ config }: { config: Record<string, unknown> }) {
  const fontColor    = String(config.font_color    || '#111111');
  const bgColor      = String(config.bg_color      || '#ffffff');
  const bgOpacity    = Number(config.bg_opacity    ?? 100);
  const marginPreset = String(config.margin_preset || 'contained');
  const layout       = String(config.contact_layout || 'cards');
  const title        = String(config.title         || 'Contato');
  const phone        = String(config.phone         || '');
  const email        = String(config.email         || '');
  const instagram    = String(config.instagram     || '');
  const maxWidth     = marginPreset === 'wide' ? 'xl' : marginPreset === 'medium' ? 'lg' : 'md';
  const background   = hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgOpacity);

  type ContactItem = { Icon: React.FC<{ size?: number; color?: string }>; label: string; href: string };
  const contacts: ContactItem[] = [
    phone     ? { Icon: IconWhatsApp,  label: phone,                                href: `https://wa.me/${toBrWhatsAppNumber(phone)}` } : null,
    email     ? { Icon: IconEmail,     label: email,                                href: `mailto:${email}` } : null,
    instagram ? { Icon: IconInstagram, label: `@${instagram.replace('@', '')}`,     href: `https://instagram.com/${instagram.replace('@', '')}` } : null,
  ].filter(Boolean) as ContactItem[];

  if (contacts.length === 0) return null;

  return (
    <Box sx={{ py: 6, background }}>
      <Container maxWidth={maxWidth} sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontSize: { xs: 26, md: 32 }, fontWeight: 700, color: fontColor, mb: 3, lineHeight: 1.2 }}>
          {title}
        </Typography>

        {/* ── Cards layout ── */}
        {layout === 'cards' && (
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
            {contacts.map(({ Icon, label, href }, i) => (
              <Box
                key={i}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5,
                  px: 3, py: 2.5,
                  border: '1.5px solid', borderColor: 'divider',
                  borderRadius: 3,
                  bgcolor: 'rgba(0,0,0,0.03)',
                  minWidth: 140,
                  textDecoration: 'none',
                  transition: 'box-shadow 0.15s, transform 0.15s',
                  '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
                }}
              >
                <Icon size={32} color={fontColor} />
                <Typography sx={{ fontSize: 14, color: fontColor, fontWeight: 500, textAlign: 'center', wordBreak: 'break-all' }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* ── List layout ── */}
        {layout === 'list' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            {contacts.map(({ Icon, label, href }, i) => (
              <Box
                key={i}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex', alignItems: 'center', gap: 2,
                  textDecoration: 'none',
                  '&:hover > *': { opacity: 0.75 },
                }}
              >
                <Box sx={{ flexShrink: 0 }}><Icon size={28} color={fontColor} /></Box>
                <Typography sx={{ fontSize: 16, color: fontColor, fontWeight: 500 }}>{label}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* ── Buttons layout ── */}
        {layout === 'buttons' && (
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            {contacts.map(({ Icon, label, href }, i) => (
              <Box
                key={i}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 1,
                  px: 2.5, py: 1.25,
                  bgcolor: fontColor,
                  borderRadius: 5,
                  textDecoration: 'none',
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 0.85 },
                }}
              >
                <Icon size={20} color={background} />
                <Typography sx={{ fontSize: 14, color: background, fontWeight: 600 }}>{label}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}

function CustomTextSection({ config }: { config: Record<string, unknown> }) {
  const fontFamily   = String(config.font_family       || 'system-ui, sans-serif');
  const titleSize    = Number(config.title_font_size   || 28);
  const titleWeight  = Number(config.title_font_weight || 700);
  const bodySize     = Number(config.body_font_size    || 16);
  const bodyWeight   = Number(config.body_font_weight  || 400);
  const fontStyle    = String(config.font_style        || 'normal');
  const fontColor    = String(config.font_color        || '#111111');
  const bgColor      = String(config.bg_color          || '#ffffff');
  const bgOpacity    = Number(config.bg_opacity        ?? 100);
  const marginPreset = String(config.margin_preset     || 'contained');
  const maxWidth     = marginPreset === 'wide' ? 'xl' : marginPreset === 'medium' ? 'lg' : 'md';
  const background   = hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgOpacity);

  const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
  const fontImportUrl = fontEntry?.importUrl ?? null;

  return (
    <Box sx={{ background, fontFamily }}>
      {fontImportUrl && (
        <Head>
          <link rel="stylesheet" href={fontImportUrl} />
        </Head>
      )}
      <Container maxWidth={maxWidth} sx={{ py: 6 }}>
        {config.title && (
          <Typography
            component="h2"
            gutterBottom
            sx={{
              fontFamily,
              fontSize: titleSize,
              fontWeight: titleWeight,
              fontStyle,
              color: fontColor,
              lineHeight: 1.2,
              mb: 2,
            }}
          >
            {String(config.title)}
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily,
            fontSize: bodySize,
            fontWeight: bodyWeight,
            fontStyle,
            color: fontColor,
            whiteSpace: 'pre-line',
            lineHeight: 1.7,
          }}
        >
          {String(config.body || '')}
        </Typography>
      </Container>
    </Box>
  );
}

function SponsorSection({ config }: { config: Record<string, unknown> }) {
  const fontFamily   = String(config.font_family      || 'system-ui, sans-serif');
  const titleSize    = Number(config.title_font_size   || 28);
  const titleWeight  = Number(config.title_font_weight || 700);
  const bodySize     = Number(config.body_font_size    || 16);
  const bodyWeight   = Number(config.body_font_weight  || 400);
  const fontStyle    = String(config.font_style        || 'normal');
  const fontColor    = String(config.font_color        || '#111111');
  const bgColor      = String(config.bg_color          || '#f8f8f8');
  const bgOpacity    = Number(config.bg_opacity        ?? 100);
  const marginPreset = String(config.margin_preset     || 'contained');
  const maxWidth     = marginPreset === 'wide' ? 'xl' : marginPreset === 'medium' ? 'lg' : 'md';
  const background   = hexToRgba(bgColor.startsWith('#') ? bgColor : '#f8f8f8', bgOpacity);

  return (
    <Box sx={{ py: 6, background, fontFamily }}>
      <Container maxWidth={maxWidth} sx={{ textAlign: 'center' }}>
        <Typography
          sx={{
            fontSize: titleSize,
            fontWeight: titleWeight,
            fontStyle,
            fontFamily,
            color: fontColor,
            lineHeight: 1.25,
            mb: 1.5,
          }}
        >
          {String(config.title || 'Apoiadores')}
        </Typography>
        {config.intro && (
          <Typography
            sx={{
              fontSize: bodySize,
              fontWeight: bodyWeight,
              fontStyle,
              fontFamily,
              color: fontColor,
              opacity: 0.8,
              lineHeight: 1.6,
            }}
          >
            {String(config.intro)}
          </Typography>
        )}
      </Container>
    </Box>
  );
}

function renderSection(section: SectionData, upcomingGiras: GiraItem[]) {
  const { section_type, config, id } = section;
  switch (section_type) {
    case 'HERO':
      return <HeroSection key={id} config={config} />;
    case 'ABOUT':
      return <AboutSection key={id} config={config} />;
    case 'VIDEO_EMBED':
      return <VideoEmbedSection key={id} config={config} />;
    case 'GIRAS_CALENDAR':
      return <GirasCalendarSection key={id} config={config} upcomingGiras={upcomingGiras} />;
    case 'LOCATION':
      return <LocationSection key={id} config={config} />;
    case 'CONTACT':
      return <ContactSection key={id} config={config} />;
    case 'SPONSOR':
      return <SponsorSection key={id} config={config} />;
    case 'CUSTOM_TEXT':
      return <CustomTextSection key={id} config={config} />;
    default:
      return null;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  site: SiteData | null;
}

export default function TenantPublicSitePage({ site }: Props) {
  // ── Fallback: site not published or not set up yet ────────────────────────
  if (site === null) {
    return (
      <>
        <Head>
          <title>Site em breve | GiraHub</title>
          <meta name="robots" content="noindex" />
        </Head>
        <Box
          sx={{
            minHeight: '100vh',
            background: 'radial-gradient(ellipse at 50% 30%, #1e0040 0%, #0d0020 60%, #000010 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            px: 3,
            gap: 3,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Floating stars */}
          {Array.from({ length: 18 }).map((_, i) => (
            <Box
              key={i}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                top: `${(i * 41 + 7) % 90}%`,
                left: `${(i * 67 + 5) % 92}%`,
                width: i % 3 === 0 ? 3 : 2,
                height: i % 3 === 0 ? 3 : 2,
                borderRadius: '50%',
                background: i % 3 === 0 ? '#f0abfc' : i % 3 === 1 ? '#818cf8' : '#facc15',
                pointerEvents: 'none',
                '@keyframes twinkleFS': {
                  '0%, 100%': { opacity: 0.15 },
                  '50%':      { opacity: 0.9 },
                },
                animation: `twinkleFS ${1.4 + (i % 5) * 0.35}s ${(i * 0.19).toFixed(1)}s ease-in-out infinite`,
              }}
            />
          ))}

          {/* Icon */}
          <Box
            aria-hidden="true"
            sx={{
              fontSize: '5rem',
              lineHeight: 1,
              '@keyframes floatIcon': {
                '0%, 100%': { transform: 'translateY(0) rotate(-3deg)' },
                '50%':      { transform: 'translateY(-14px) rotate(3deg)' },
              },
              animation: 'floatIcon 4s ease-in-out infinite',
              zIndex: 1,
            }}
          >
            🕯️
          </Box>

          <Box sx={{ zIndex: 1 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: '#c084fc',
                mb: 1.5,
                textShadow: '0 2px 16px rgba(192,132,252,0.6)',
                fontSize: { xs: '1.6rem', md: '2rem' },
              }}
            >
              Site em preparação ✨
            </Typography>
            <Typography
              sx={{
                color: 'rgba(240,171,252,0.7)',
                fontSize: { xs: '0.95rem', md: '1.05rem' },
                maxWidth: 420,
                mx: 'auto',
                lineHeight: 1.7,
              }}
            >
              Este terreiro ainda está preparando seu espaço digital.
              Em breve estará no ar com todas as informações.
            </Typography>
          </Box>

          <Box
            component="a"
            href="/"
            sx={{
              mt: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 3,
              py: 1.25,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              textDecoration: 'none',
              boxShadow: '0 0 20px rgba(168,85,247,0.4)',
              zIndex: 1,
              '&:hover': { opacity: 0.88 },
              transition: 'opacity 0.2s',
            }}
          >
            🏠 Conhecer o GiraHub
          </Box>

          <Typography
            variant="caption"
            sx={{ position: 'absolute', bottom: 16, color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem' }}
          >
            GiraHub © {new Date().getFullYear()}
          </Typography>
        </Box>
      </>
    );
  }

  const sortedSections = [...site.sections].sort((a, b) => a.order_index - b.order_index);

  // Inject Google Font for HERO section if one is configured
  const heroSection = sortedSections.find(s => s.section_type === 'HERO');
  const heroFontFamily = heroSection ? String(heroSection.config.font_family || '') : '';
  const heroFontEntry = HERO_FONTS.find(f => f.value === heroFontFamily);
  const heroFontImportUrl = heroFontEntry?.importUrl ?? null;

  return (
    <>
      <Head>
        <title>{site.meta_title || 'Terreiro — GiraHub'}</title>
        {site.meta_description && (
          <meta name="description" content={site.meta_description} />
        )}
        <meta property="og:title" content={site.meta_title || 'Terreiro — GiraHub'} />
        {site.meta_description && (
          <meta property="og:description" content={site.meta_description} />
        )}
        {heroFontImportUrl && (
          <link rel="stylesheet" href={heroFontImportUrl} />
        )}
      </Head>

      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        {sortedSections.map((section) =>
          renderSection(section, site.upcoming_giras)
        )}

        {/* Footer */}
        <Box
          component="footer"
          sx={{
            py: 4,
            px: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          {/* Logo + wordmark */}
          <Box
            component="a"
            href="https://girahub.com.br"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              textDecoration: 'none',
              opacity: 0.85,
              '&:hover': { opacity: 1 },
            }}
          >
            <Box
              component="img"
              src="/favicon.svg"
              alt="GiraHub"
              sx={{ width: 28, height: 28 }}
            />
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: '-0.3px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                lineHeight: 1,
              }}
            >
              GiraHub
            </Typography>
          </Box>

          {/* Powered by */}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12 }}>
            Powered by{' '}
            <Box
              component="a"
              href="https://girahub.com.br"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
            >
              GiraHub
            </Box>
            {' '}— a plataforma digital para centros de umbanda e candomblé
          </Typography>

          {/* Copyright */}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
            © {new Date().getFullYear()} GiraHub. Todos os direitos reservados.
          </Typography>
        </Box>
      </Box>
    </>
  );
}

// ── SSR ───────────────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = params?.tenantSlug as string;

  // Use INTERNAL_API_URL for server-side fetches inside Docker network.
  // 'backend' is the Docker service name (resolves inside the network).
  // Falls back to localhost:8000 for development outside Docker.
  const base = process.env.INTERNAL_API_URL || 'http://backend:8000';

  try {
    const res = await fetch(`${base}/api/v1/public/sites/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      // Site not published or not set up yet — show a friendly "coming soon" page
      // instead of the default Next.js 404.
      return { props: { site: null } };
    }
    const site: SiteData = await res.json();
    return { props: { site } };
  } catch {
    return { props: { site: null } };
  }
};
