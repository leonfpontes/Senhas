/**
 * Public tenant site page — /[tenantSlug]
 *
 * Uses getServerSideProps with INTERNAL_API_URL (not NEXT_PUBLIC_) so fetchs
 * work inside the Docker network (Gap #22).
 *
 * All section data including upcoming giras is server-side rendered for SEO (Gap #19).
 */
import React from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import {
  Box,
  Button,
  Container,
  Divider,
  Typography,
  useTheme,
} from '@mui/material';
import { HERO_FONTS } from '@/constants/heroFonts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GiraItem {
  id: string;
  nome: string;
  data_hora: string | null;
  descricao: string | null;
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
  const subtitleFontSize = Math.max(16, Math.round(titleFontSize * 0.6));
  const bgPositionX = Number(config.bg_position_x ?? 50);
  const bgPositionY = Number(config.bg_position_y ?? 50);

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
        justifyContent: 'center',
        flexDirection: 'column',
        textAlign: 'center',
        p: 6,
        background,
        color: '#fff',
      }}
    >
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
  );
}

function AboutSection({ config }: { config: Record<string, unknown> }) {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      {config.title && (
        <Typography variant="h4" fontWeight={600} gutterBottom>
          {String(config.title)}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 4, flexDirection: { xs: 'column', md: 'row' } }}>
        <Typography variant="body1" sx={{ flex: 1, whiteSpace: 'pre-line' }}>
          {String(config.body || '')}
        </Typography>
        {config.image_url && (
          <Box
            component="img"
            src={String(config.image_url)}
            alt=""
            sx={{ width: { xs: '100%', md: 280 }, borderRadius: 2, objectFit: 'cover' }}
          />
        )}
      </Box>
    </Container>
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
    // Already embed — swap to nocookie
    embedUrl = rawUrl.replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');
  }

  return (
    <Box sx={{ py: 4, bgcolor: 'grey.50' }}>
      <Container maxWidth="md">
        {config.caption && (
          <Typography variant="h5" fontWeight={600} gutterBottom textAlign="center">
            {String(config.caption)}
          </Typography>
        )}
        <Box
          sx={{
            position: 'relative',
            paddingTop: '56.25%', // 16:9
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            component="iframe"
            src={embedUrl}
            title={String(config.caption || 'Vídeo')}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0,
            }}
          />
        </Box>
      </Container>
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
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        {String(config.title || 'Próximas Giras')}
      </Typography>
      {upcomingGiras.length === 0 ? (
        <Typography color="text.secondary">Nenhuma gira agendada no momento.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {upcomingGiras.map((g) => (
            <Box
              key={g.id}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                {g.nome}
              </Typography>
              {g.data_hora && (
                <Typography variant="body2" color="text.secondary">
                  {new Date(g.data_hora).toLocaleString('pt-BR', {
                    dateStyle: 'full',
                    timeStyle: 'short',
                    timeZone: 'UTC',
                  })}
                </Typography>
              )}
              {g.descricao && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {g.descricao}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Container>
  );
}

function LocationSection({ config }: { config: Record<string, unknown> }) {
  const address = String(config.address || '');
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : undefined;
  return (
    <Box sx={{ py: 6, bgcolor: 'grey.50' }}>
      <Container maxWidth="md">
        <Typography variant="h4" fontWeight={600} gutterBottom>
          Como Chegar
        </Typography>
        {address && (
          <Typography variant="body1" gutterBottom>
            {address}
          </Typography>
        )}
        {config.instructions && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, whiteSpace: 'pre-line' }}>
            {String(config.instructions)}
          </Typography>
        )}
        {mapsUrl && (
          <Button variant="contained" href={mapsUrl} target="_blank" rel="noopener noreferrer" sx={{ mt: 2 }}>
            Abrir no Google Maps
          </Button>
        )}
      </Container>
    </Box>
  );
}

function ContactSection({ config }: { config: Record<string, unknown> }) {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Typography variant="h4" fontWeight={600} gutterBottom>
        Contato
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {config.phone && (
          <Typography variant="body1">
            📞{' '}
            <a href={`https://wa.me/${String(config.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
              {String(config.phone)}
            </a>
          </Typography>
        )}
        {config.email && (
          <Typography variant="body1">
            ✉️ <a href={`mailto:${String(config.email)}`}>{String(config.email)}</a>
          </Typography>
        )}
        {config.instagram && (
          <Typography variant="body1">
            📷{' '}
            <a
              href={`https://instagram.com/${String(config.instagram).replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              @{String(config.instagram).replace('@', '')}
            </a>
          </Typography>
        )}
      </Box>
    </Container>
  );
}

function CustomTextSection({ config }: { config: Record<string, unknown> }) {
  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      {config.title && (
        <Typography variant="h4" fontWeight={600} gutterBottom>
          {String(config.title)}
        </Typography>
      )}
      <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
        {String(config.body || '')}
      </Typography>
    </Container>
  );
}

function SponsorSection({ config }: { config: Record<string, unknown> }) {
  return (
    <Box sx={{ py: 6, bgcolor: 'grey.50' }}>
      <Container maxWidth="md" sx={{ textAlign: 'center' }}>
        {config.title && (
          <Typography variant="h4" fontWeight={600} gutterBottom>
            {String(config.title)}
          </Typography>
        )}
        {config.intro && (
          <Typography variant="body1" color="text.secondary">
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
  site: SiteData;
}

export default function TenantPublicSitePage({ site }: Props) {
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
        <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Powered by{' '}
            <a href="https://girahub.com.br" target="_blank" rel="noopener noreferrer">
              GiraHub
            </a>
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
      return { notFound: true };
    }
    const site: SiteData = await res.json();
    return { props: { site } };
  } catch {
    return { notFound: true };
  }
};
