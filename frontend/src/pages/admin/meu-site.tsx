/**
 * Site Builder editor page — /admin/meu-site
 *
 * Implements:
 * - Split-view: SectionList (280px) + SectionEditor (flex:1)
 * - Mobile stacked: list → full-screen overlay on tap  (Gap #18)
 * - uploadingImageFor state lock  (Gap #13)
 * - Re-fetch after PUT /sections to sync real DB UUIDs  (Gap #12)
 * - Optimistic locking via site_version  (Gap #6)
 * - Restore version confirmation dialog  (Gap #15)
 * - Conflict 409 snackbar  (Gap #6)
 */
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Slider,
  Popover,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import PublicIcon from '@mui/icons-material/Public';
import PublicOffIcon from '@mui/icons-material/PublicOff';
import SaveIcon from '@mui/icons-material/Save';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AdminLayout from './admin_layout';
import { apiClient } from '@/services/api_client';
import { useSubscription } from '@/hooks/useSubscription';
import { usePermissions } from '@/hooks/usePermissions';
import { HERO_FONTS, HERO_FONT_SIZES, HERO_FONT_WEIGHTS, SECTION_TITLE_SIZES, SECTION_BODY_SIZES } from '@/constants/heroFonts';

// ── Timezone helper ───────────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────

const SECTION_TYPES = [
  { value: 'HERO', label: 'Capa (Hero)' },
  { value: 'ABOUT', label: 'Sobre o Terreiro' },
  { value: 'VIDEO_EMBED', label: 'Vídeo do YouTube' },
  { value: 'GIRAS_CALENDAR', label: 'Calendário de Giras' },
  { value: 'SPONSOR', label: 'Patrocinadores' },
  { value: 'LOCATION', label: 'Como Chegar' },
  { value: 'CONTACT', label: 'Contato' },
  { value: 'CUSTOM_TEXT', label: 'Texto Livre' },
];

interface Section {
  id: string; // DB UUID (real after sync) or temp-id (before first save)
  section_type: string;
  order_index: number;
  config: Record<string, unknown>;
  _tempId?: string; // local draft indicator
}

interface SiteInfo {
  id: string;
  slug: string;
  status: string;
  template: string;
  meta_title: string | null;
  meta_description: string | null;
  updated_at: string;
}

interface SiteVersion {
  id: string;
  label: string | null;
  snapshot: unknown[];
  created_by: string | null;
  created_at: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateSection(section: Section): string[] {
  const errors: string[] = [];
  const { section_type, config } = section;

  if (section_type === 'HERO' && !String(config.title || '').trim()) {
    errors.push('Seção Hero requer um título.');
  }
  if (section_type === 'VIDEO_EMBED') {
    const url = String(config.youtube_url || '');
    if (url) {
      const valid = [
        'https://www.youtube.com/embed/',
        'https://www.youtube-nocookie.com/embed/',
        'https://youtu.be/',
        'https://www.youtube.com/watch',
      ];
      if (!valid.some((p) => url.startsWith(p))) {
        errors.push('URL do YouTube inválida. Use o link de compartilhamento ou o embed do YouTube.');
      }
    }
  }
  return errors;
}

// ── Section List item ─────────────────────────────────────────────────────────

function SectionListItem({
  section,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  isFirst,
  isLast,
}: {
  section: Section;
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const label = SECTION_TYPES.find((t) => t.value === section.section_type)?.label ?? section.section_type;
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={onMoveUp} disabled={isFirst} title="Mover para cima">
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onMoveDown} disabled={isLast} title="Mover para baixo">
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} color="error" title="Remover seção">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      }
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <ListItemButton
        selected={isSelected}
        onClick={onSelect}
        sx={{ pr: 14 }}
      >
        <DragIndicatorIcon sx={{ mr: 1, color: 'text.disabled', fontSize: 18 }} />
        <ListItemText
          primary={label}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
        />
        {isSelected && <EditIcon sx={{ ml: 1, fontSize: 14, color: 'primary.main' }} />}
      </ListItemButton>
    </ListItem>
  );
}

// ── Hero Preview (pixel-perfect scale of the real site) ──────────────────────

function HeroPreview({
  config,
  onPositionChange,
}: {
  config: Record<string, unknown>;
  onPositionChange?: (x: number, y: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Track actual container width so text scales proportionally to desktop
  const [containerWidth, setContainerWidth] = useState(480);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, posX: 50, posY: 50 });

  // Desktop viewport we simulate: 1440px wide, 380px min-height
  const DESKTOP_W = 1440;
  const DESKTOP_H = 380;
  // Aspect-ratio ratio keeps the preview proportional to a real desktop hero
  const ASPECT = DESKTOP_H / DESKTOP_W; // ≈ 26.4%

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bgType = String(config.bg_type || 'gradient');
  const bgUrl = config.bg_image_url ? String(config.bg_image_url) : undefined;
  const gradFrom = String(config.gradient_from || '#6366f1');
  const gradTo = String(config.gradient_to || '#ec4899');
  const gradDir = String(config.gradient_dir || '135deg');
  const solidColor = String(config.bg_color || '#6366f1');
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const fontSize = Number(config.font_size || 48);
  const fontWeight = Number(config.font_weight || 700);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#ffffff');
  const marginPreset = String(config.margin_preset || 'contained');
  const subtitleSize = Math.max(16, Math.round(fontSize * 0.6));
  const posX = Number(config.bg_position_x ?? 50);
  const posY = Number(config.bg_position_y ?? 50);

  const logoMode = String(config.logo_mode || 'none');
  const logoPosition = String(config.logo_position || 'left');
  const logoUrl = config.logo_image_url ? String(config.logo_image_url) : undefined;
  const showLogo = logoMode === 'logo' && !!logoUrl;

  const isImageMode = bgType === 'image' && !!bgUrl;
  const isDraggable = isImageMode && !!onPositionChange;

  // Text scale: text rendered at desktop size, scaled down to preview width
  const textScale = containerWidth / DESKTOP_W;
  const scaledFontSize = Math.round(fontSize * textScale);
  const scaledSubtitleSize = Math.max(10, Math.round(subtitleSize * textScale));
  const scaledPadding = Math.round(48 * textScale);

  // Desktop logo sizes (px): xl=300, lg=200, md=140, sm=90, xs=56
  const LOGO_SIZES: Record<string, number> = { xl: 300, lg: 200, md: 140, sm: 90, xs: 56 };
  const logoDesktopPx = LOGO_SIZES[String(config.logo_size || 'md')] ?? 140;
  const scaledLogoPx = Math.round(logoDesktopPx * textScale);

  // Background applied DIRECTLY to the outer container at its actual pixel size
  // so background-size: cover crops identically to the real browser at this aspect ratio.
  let background: string;
  if (bgType === 'image' && bgUrl) {
    background = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${bgUrl}) ${posX}% ${posY}% / cover no-repeat`;
  } else if (bgType === 'solid') {
    background = solidColor;
  } else {
    background = gradDir === 'radial'
      ? `radial-gradient(circle, ${gradFrom} 0%, ${gradTo} 100%)`
      : `linear-gradient(${gradDir}, ${gradFrom} 0%, ${gradTo} 100%)`;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isDraggable) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, posX, posY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !isDraggable || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStart.current.mouseX;
    const dy = e.clientY - dragStart.current.mouseY;
    const newX = Math.round(Math.max(0, Math.min(100, dragStart.current.posX - (dx / rect.width) * 100)));
    const newY = Math.round(Math.max(0, Math.min(100, dragStart.current.posY - (dy / rect.height) * 100)));
    onPositionChange!(newX, newY);
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <Box
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      sx={{
        width: '100%',
        // Maintain the same aspect ratio as the real desktop hero
        paddingTop: `${ASPECT * 100}%`,
        position: 'relative',
        borderRadius: 2,
        boxShadow: 2,
        overflow: 'hidden',
        flexShrink: 0,
        background,
        cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
    >
      {/* Content overlay — absolutely positioned, text scaled to match desktop proportions */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: showLogo ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: showLogo
            ? (marginPreset === 'wide' ? 'space-between' : 'center')
            : 'center',
          textAlign: 'center',
          gap: showLogo
            ? (marginPreset === 'wide' ? `${Math.round(48 * textScale)}px` : marginPreset === 'medium' ? `${Math.round(36 * textScale)}px` : `${Math.round(24 * textScale)}px`)
            : 0,
          paddingTop: `${Math.round(32 * textScale)}px`,
          paddingBottom: `${Math.round(32 * textScale)}px`,
          paddingLeft: `${marginPreset === 'wide' ? Math.round(30 * textScale) : marginPreset === 'medium' ? Math.round(80 * textScale) : scaledPadding}px`,
          paddingRight: `${marginPreset === 'wide' ? Math.round(30 * textScale) : marginPreset === 'medium' ? Math.round(80 * textScale) : scaledPadding}px`,
          color: fontColor,
          pointerEvents: 'none',
        }}
      >
        {bgType === 'image' && !bgUrl && (
          <Typography sx={{ opacity: 0.55, fontSize: 11 }}>
            sem imagem
          </Typography>
        )}
        {showLogo && logoPosition === 'left' && (
          <Box
            component="img"
            src={logoUrl}
            sx={{
              width: scaledLogoPx, height: scaledLogoPx,
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
            }}
          />
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily,
              fontWeight,
              fontStyle,
              fontSize: `${scaledFontSize}px`,
              lineHeight: 1.2,
              textShadow: '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            {String(config.title || 'Título da página')}
          </Typography>
          {Boolean(config.subtitle) && (
            <Typography
              sx={{
                fontFamily,
                fontStyle,
                fontWeight: 400,
                fontSize: `${scaledSubtitleSize}px`,
                opacity: 0.9,
                mt: '16px',
                textShadow: '0 1px 4px rgba(0,0,0,0.4)',
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
            sx={{
              width: scaledLogoPx, height: scaledLogoPx,
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))',
            }}
          />
        )}
      </Box>

      {/* Drag hint overlay */}
      {isDraggable && !isDragging && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 6,
            right: 8,
            bgcolor: 'rgba(0,0,0,0.45)',
            color: '#fff',
            borderRadius: 1,
            px: 1,
            py: 0.25,
            fontSize: 10,
            pointerEvents: 'none',
          }}
        >
          Arraste para reposicionar
        </Box>
      )}
    </Box>
  );
}

// ── Sobre Preview (proporcionado ao site publicado) ───────────────────────────

/** Converts a hex colour (#rrggbb or #rgb) + opacity (0-100) to an rgba string. */
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

function SobrePreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  // Simulate desktop layout: 960px wide, ~320px tall
  const DESKTOP_W = 960;
  const DESKTOP_H = 320;
  const ASPECT = DESKTOP_H / DESKTOP_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const titleFontSize = Number(config.title_font_size || 28);
  const titleFontWeight = Number(config.title_font_weight || 700);
  const bodyFontSize = Number(config.body_font_size || 16);
  const bodyFontWeight = Number(config.body_font_weight || 400);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#111111');
  const marginPreset = String(config.margin_preset || 'contained');
  const imageSide = String(config.image_side || 'right');
  const bgColor = String(config.bg_color || '#ffffff');
  const bgOpacity = Number(config.bg_opacity ?? 100);
  const imageUrl = config.image_url ? String(config.image_url) : undefined;

  const sc = containerWidth / DESKTOP_W; // text scale factor
  const previewHeight = Math.round(containerWidth * ASPECT);
  const background = hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgOpacity);

  const imageBox = imageUrl ? (
    <Box
      sx={{
        width: Math.round(240 * sc),
        height: Math.round(240 * sc),
        flexShrink: 0,
        borderRadius: `${8 * sc}px`,
        border: `${Math.max(1, Math.round(3 * sc))}px solid`,
        borderColor: 'divider',
        overflow: 'hidden',
        boxShadow: `${Math.round(4 * sc)}px ${Math.round(4 * sc)}px ${Math.round(16 * sc)}px rgba(0,0,0,0.12)`,
      }}
    >
      <Box component="img" src={imageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </Box>
  ) : (
    <Box
      sx={{
        width: Math.round(240 * sc),
        height: Math.round(240 * sc),
        flexShrink: 0,
        borderRadius: `${8 * sc}px`,
        border: `${Math.max(1, Math.round(2 * sc))}px dashed`,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100',
      }}
    >
      <Typography sx={{ fontSize: Math.round(10 * sc), color: 'text.disabled' }}>sem imagem</Typography>
    </Box>
  );

  const textBox = (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: `${Math.round(8 * sc)}px` }}>
      {Boolean(config.title) && (
        <Typography sx={{
          fontFamily,
          fontSize: `${Math.round(titleFontSize * sc)}px`,
          fontWeight: titleFontWeight,
          fontStyle,
          lineHeight: 1.25,
          color: fontColor,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {String(config.title)}
        </Typography>
      )}
      {Boolean(config.body) && (
        <Typography sx={{
          fontFamily,
          fontSize: `${Math.round(bodyFontSize * sc)}px`,
          fontWeight: bodyFontWeight,
          fontStyle,
          lineHeight: 1.5,
          color: fontColor,
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {String(config.body)}
        </Typography>
      )}
      {!config.title && !config.body && (
        <Typography sx={{ fontSize: Math.round(11 * sc), color: 'text.disabled', fontStyle: 'italic' }}>
          Título e texto aparecerão aqui
        </Typography>
      )}
    </Box>
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: `${previewHeight}px`,
        borderRadius: 2,
        boxShadow: 2,
        overflow: 'hidden',
        flexShrink: 0,
        background,
        // Checkerboard to show transparency
        backgroundImage: bgOpacity < 100
          ? `${background}, repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / ${Math.round(12 * sc)}px ${Math.round(12 * sc)}px`
          : undefined,
        position: 'relative',
      }}
    >
      {/* Separator line between columns */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%', bottom: '10%',
          left: imageSide === 'left'
            ? `calc(${Math.round(240 * sc)}px + ${Math.round(24 * sc)}px)`
            : `calc(100% - ${Math.round(240 * sc)}px - ${Math.round(24 * sc)}px - 1px)`,
          width: 1,
          bgcolor: 'divider',
          opacity: 0.6,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: imageSide === 'left' ? 'row' : 'row-reverse',
          alignItems: 'center',
          gap: `${Math.round(24 * sc)}px`,
          padding: `${Math.round(24 * sc)}px ${marginPreset === 'wide' ? Math.round(30 * sc) : marginPreset === 'medium' ? Math.round(80 * sc) : Math.round(32 * sc)}px`,
        }}
      >
        {imageBox}
        {textBox}
      </Box>
    </Box>
  );
}

// ── Video Preview ─────────────────────────────────────────────────────────────

function VideoPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasText = config.layout === 'side-by-side';
  const videoSide = String(config.video_side || 'right');
  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const captionFontSize = Number(config.caption_font_size || 24);
  const captionFontWeight = Number(config.caption_font_weight || 600);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#111111');
  const marginPreset = String(config.margin_preset || 'contained');
  const bgColor = String(config.bg_color || '#f5f5f5');
  const bgOpacity = Number(config.bg_opacity ?? 100);
  const caption = String(config.caption || '');
  const sideText = String(config.side_text || '');

  // Scale fonts to preview container width (desktop baseline: 960px)
  const sc = containerWidth / 960;
  const bg = bgColor.startsWith('#') ? hexToRgba(bgColor, bgOpacity) : bgColor;

  // Video placeholder — mimics the real 16:9 iframe via padding-top trick
  const videoPlaceholder = (
    <Box
      sx={{
        flex: hasText ? '0 0 auto' : undefined,
        width: hasText ? '55%' : '100%',
        position: 'relative',
        paddingTop: hasText ? `${(9 / 16) * 55}%` : '56.25%',
        bgcolor: '#111',
        borderRadius: '8px',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Simulated play button */}
      <Box sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Box sx={{
          width: `${Math.round(36 * sc)}px`,
          height: `${Math.round(36 * sc)}px`,
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.15)',
          border: `${Math.max(1, Math.round(2 * sc))}px solid rgba(255,255,255,0.5)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Box sx={{
            width: 0,
            height: 0,
            borderTop: `${Math.round(7 * sc)}px solid transparent`,
            borderBottom: `${Math.round(7 * sc)}px solid transparent`,
            borderLeft: `${Math.round(12 * sc)}px solid rgba(255,255,255,0.8)`,
            marginLeft: `${Math.round(2 * sc)}px`,
          }} />
        </Box>
      </Box>
    </Box>
  );

  const scaledCaptionSize = `${Math.round(captionFontSize * sc)}px`;
  const scaledBodySize = `${Math.round(15 * sc)}px`;

  const textCol = (
    <Box sx={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: `${Math.round(8 * sc)}px`,
    }}>
      {caption && (
        <Typography sx={{
          fontFamily,
          fontSize: scaledCaptionSize,
          fontWeight: captionFontWeight,
          fontStyle,
          lineHeight: 1.3,
          color: fontColor,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{caption}</Typography>
      )}
      {sideText && (
        <Typography sx={{
          fontFamily,
          fontSize: scaledBodySize,
          fontWeight: 400,
          lineHeight: 1.5,
          color: fontColor,
          display: '-webkit-box',
          WebkitLineClamp: 5,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{sideText}</Typography>
      )}
      {!caption && !sideText && (
        <Typography sx={{ fontSize: scaledBodySize, color: 'text.disabled', fontStyle: 'italic' }}>
          Título e texto aparecerão aqui
        </Typography>
      )}
    </Box>
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        borderRadius: 2,
        boxShadow: 2,
        overflow: 'hidden',
        flexShrink: 0,
        background: bg,
        paddingTop: `${Math.round(16 * sc)}px`,
        paddingBottom: `${Math.round(16 * sc)}px`,
        paddingLeft: `${marginPreset === 'wide' ? Math.round(30 * sc) : marginPreset === 'medium' ? Math.round(80 * sc) : Math.round(16 * sc)}px`,
        paddingRight: `${marginPreset === 'wide' ? Math.round(30 * sc) : marginPreset === 'medium' ? Math.round(80 * sc) : Math.round(16 * sc)}px`,
      }}
    >
      {hasText ? (
        <Box sx={{
          display: 'flex',
          flexDirection: videoSide === 'right' ? 'row' : 'row-reverse',
          gap: `${Math.round(20 * sc)}px`,
          alignItems: 'center',
        }}>
          {textCol}
          {videoPlaceholder}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${Math.round(8 * sc)}px` }}>
          {caption && (
            <Typography sx={{
              fontFamily,
              fontSize: scaledCaptionSize,
              fontWeight: captionFontWeight,
              fontStyle,
              textAlign: 'center',
              lineHeight: 1.3,
              color: fontColor,
            }}>{caption}</Typography>
          )}
          {videoPlaceholder}
        </Box>
      )}
    </Box>
  );
}

// ── GirasCalendarPreview ──────────────────────────────────────────────────────

const MOCK_GIRAS_PREVIEW = [
  {
    id: '1',
    nome: 'Gira de Umbanda',
    data_hora: (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString(); })(),
    descricao: 'Gira aberta ao público',
    has_tickets: true,
    has_sponsor_tickets: false,
  },
  {
    id: '2',
    nome: 'Gira de Cura',
    data_hora: (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString(); })(),
    descricao: null,
    has_tickets: true,
    has_sponsor_tickets: true,
  },
  {
    id: '3',
    nome: 'Gira Fechada',
    data_hora: (() => { const d = new Date(); d.setDate(d.getDate() + 21); return d.toISOString(); })(),
    descricao: 'Apenas convidados',
    has_tickets: false,
    has_sponsor_tickets: false,
  },
];

// ── Contact SVG Icons (vectorial, no external deps) ───────────────────────────
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

// ── Contact Preview ────────────────────────────────────────────────────────────
function ContactPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  const DESKTOP_W = 960;
  const DESKTOP_H = 260;
  const ASPECT = DESKTOP_H / DESKTOP_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontFamily  = String(config.font_family  || 'system-ui, sans-serif');
  const titleSize   = Number(config.title_font_size || 28);
  const titleWeight = Number(config.title_font_weight || 700);
  const bodySize    = Number(config.body_font_size || 15);
  const fontStyle   = String(config.font_style    || 'normal');
  const fontColor   = String(config.font_color    || '#111111');
  const bgColor     = String(config.bg_color      || '#ffffff');
  const bgOpacity   = Number(config.bg_opacity    ?? 100);
  const layout      = String(config.contact_layout || 'cards');
  const title       = String(config.title         || 'Contato');
  const phone       = String(config.phone         || '');
  const email       = String(config.email         || '');
  const instagram   = String(config.instagram     || '');

  const sc         = containerWidth / DESKTOP_W;
  const phHeight   = Math.round(containerWidth * ASPECT);
  const background = hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgOpacity);

  const contacts = [
    phone     && { Icon: IconWhatsApp, label: phone,     href: '#' },
    email     && { Icon: IconEmail,    label: email,     href: '#' },
    instagram && { Icon: IconInstagram, label: `@${instagram.replace('@','')}`, href: '#' },
  ].filter(Boolean) as { Icon: React.FC<{ size?: number; color?: string }>; label: string; href: string }[];

  const mockContacts = contacts.length > 0 ? contacts : [
    { Icon: IconWhatsApp,  label: '(11) 99999-9999', href: '#' },
    { Icon: IconEmail,     label: 'contato@terreiro.com', href: '#' },
    { Icon: IconInstagram, label: '@terreiro', href: '#' },
  ];

  const iconSz = Math.round(18 * sc);
  const labelSz = Math.round(bodySize * sc);
  const gap = Math.round(12 * sc);

  const cardsPx = Math.round(16 * sc);
  const cardsPy = Math.round(10 * sc);
  const cardsR  = Math.round(8 * sc);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: phHeight,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1.5px solid',
        borderColor: 'divider',
        background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${Math.round(14 * sc)}px`,
        px: `${Math.round(48 * sc)}px`,
        py: `${Math.round(24 * sc)}px`,
        fontFamily,
      }}
    >
      <Box sx={{ fontSize: Math.round(titleSize * sc), fontWeight: titleWeight, fontStyle, fontFamily, color: fontColor, lineHeight: 1.2, textAlign: 'center' }}>
        {title}
      </Box>

      {layout === 'cards' && (
        <Box sx={{ display: 'flex', gap: `${gap}px`, flexWrap: 'wrap', justifyContent: 'center' }}>
          {mockContacts.map(({ Icon, label }, i) => (
            <Box key={i} sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${Math.round(6 * sc)}px`,
              px: `${cardsPx}px`, py: `${cardsPy}px`,
              border: `${Math.max(1, Math.round(1.5 * sc))}px solid`, borderColor: 'divider',
              borderRadius: `${cardsR}px`, bgcolor: 'rgba(0,0,0,0.03)',
            }}>
              <Icon size={iconSz} color={fontColor} />
              <Box sx={{ fontSize: `${Math.round((bodySize - 2) * sc)}px`, fontFamily, color: fontColor, opacity: 0.8 }}>{label}</Box>
            </Box>
          ))}
        </Box>
      )}

      {layout === 'list' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${Math.round(8 * sc)}px`, alignSelf: 'flex-start' }}>
          {mockContacts.map(({ Icon, label }, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: `${Math.round(8 * sc)}px` }}>
              <Icon size={iconSz} color={fontColor} />
              <Box sx={{ fontSize: `${labelSz}px`, fontFamily, color: fontColor }}>{label}</Box>
            </Box>
          ))}
        </Box>
      )}

      {layout === 'buttons' && (
        <Box sx={{ display: 'flex', gap: `${gap}px`, flexWrap: 'wrap', justifyContent: 'center' }}>
          {mockContacts.map(({ Icon, label }, i) => (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'center', gap: `${Math.round(6 * sc)}px`,
              px: `${Math.round(14 * sc)}px`, py: `${Math.round(7 * sc)}px`,
              bgcolor: fontColor, borderRadius: `${Math.round(20 * sc)}px`,
            }}>
              <Icon size={iconSz} color={background} />
              <Box sx={{ fontSize: `${Math.round((bodySize - 1) * sc)}px`, fontFamily, color: background, fontWeight: 600 }}>{label}</Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Location Preview ───────────────────────────────────────────────────────────
function LocationPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  const DESKTOP_W = 960;
  const DESKTOP_H = 300;
  const ASPECT = DESKTOP_H / DESKTOP_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontFamily     = String(config.font_family      || 'system-ui, sans-serif');
  const titleFontSize  = Number(config.title_font_size  || 28);
  const titleWeight    = Number(config.title_font_weight || 700);
  const bodyFontSize   = Number(config.body_font_size   || 15);
  const fontStyle      = String(config.font_style       || 'normal');
  const fontColor      = String(config.font_color       || '#111111');
  const bgColor        = String(config.bg_color         || '#f8f8f8');
  const bgOpacity      = Number(config.bg_opacity       ?? 100);
  const mapSide        = String(config.map_side         || 'right');

  const sc             = containerWidth / DESKTOP_W;
  const previewHeight  = Math.round(containerWidth * ASPECT);
  const background     = hexToRgba(bgColor.startsWith('#') ? bgColor : '#f8f8f8', bgOpacity);

  // Build display address from fields
  const street   = String(config.street       || '');
  const number   = String(config.number       || '');
  const compl    = String(config.complement   || '');
  const district = String(config.neighborhood || '');
  const city     = String(config.city         || '');
  const state    = String(config.state        || '');
  const cep      = String(config.cep          || '');
  const addressLine1 = [street, number, compl].filter(Boolean).join(', ');
  const addressLine2 = [district, city && state ? `${city} — ${state}` : city || state].filter(Boolean).join(' · ');
  const cepLine = cep ? `CEP ${cep}` : '';
  const hasAddress = addressLine1 || addressLine2 || cepLine;
  const title = String(config.title || 'Como Chegar');

  const mapBlock = (
    <Box
      sx={{
        flex: 1,
        height: '100%',
        bgcolor: 'rgba(0,0,0,0.07)',
        borderRadius: `${Math.round(6 * sc)}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: `${Math.round(6 * sc)}px`,
        border: `${Math.max(1, Math.round(1.5 * sc))}px solid rgba(0,0,0,0.12)`,
      }}
    >
      <Box sx={{ fontSize: Math.round(22 * sc), lineHeight: 1 }}>🗺️</Box>
      <Box sx={{ fontSize: Math.round(9 * sc), color: fontColor, opacity: 0.5, fontFamily }}>Mapa</Box>
    </Box>
  );

  const infoBlock = (
    <Box
      sx={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: `${Math.round(8 * sc)}px`,
        px: `${Math.round(16 * sc)}px`,
      }}
    >
      <Box sx={{ fontSize: Math.round(titleFontSize * sc), fontWeight: titleWeight, fontStyle, fontFamily, color: fontColor, lineHeight: 1.2 }}>
        {title}
      </Box>
      {hasAddress ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${Math.round(3 * sc)}px` }}>
          {addressLine1 && <Box sx={{ fontSize: Math.round(bodyFontSize * sc), fontFamily, fontStyle, color: fontColor, lineHeight: 1.4 }}>{addressLine1}</Box>}
          {addressLine2 && <Box sx={{ fontSize: Math.round(bodyFontSize * sc), fontFamily, fontStyle, color: fontColor, opacity: 0.75, lineHeight: 1.4 }}>{addressLine2}</Box>}
          {cepLine      && <Box sx={{ fontSize: Math.round((bodyFontSize - 2) * sc), fontFamily, color: fontColor, opacity: 0.55, lineHeight: 1.4 }}>{cepLine}</Box>}
        </Box>
      ) : (
        <Box sx={{ fontSize: Math.round(bodyFontSize * sc), fontFamily, color: fontColor, opacity: 0.4, fontStyle: 'italic' }}>Preencha o endereço abaixo</Box>
      )}
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: fontColor, borderRadius: `${Math.round(4 * sc)}px`,
        px: `${Math.round(10 * sc)}px`, py: `${Math.round(4 * sc)}px`,
        width: 'fit-content',
      }}>
        <Box sx={{ fontSize: Math.round(9 * sc), color: background, fontFamily, fontWeight: 600 }}>Abrir no Google Maps</Box>
      </Box>
    </Box>
  );

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: previewHeight,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1.5px solid',
        borderColor: 'divider',
        background,
        display: 'flex',
        flexDirection: 'row',
        gap: `${Math.round(16 * sc)}px`,
        px: `${Math.round(32 * sc)}px`,
        py: `${Math.round(24 * sc)}px`,
      }}
    >
      {mapSide === 'left' ? <>{mapBlock}{infoBlock}</> : <>{infoBlock}{mapBlock}</>}
    </Box>
  );
}

// ── Sponsor Preview ────────────────────────────────────────────────────────────
function SponsorPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  const DESKTOP_W = 960;
  const DESKTOP_H = 220;
  const ASPECT = DESKTOP_H / DESKTOP_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontFamily = String(config.font_family || 'system-ui, sans-serif');
  const titleFontSize = Number(config.title_font_size || 28);
  const titleFontWeight = Number(config.title_font_weight || 700);
  const bodyFontSize = Number(config.body_font_size || 16);
  const fontStyle = String(config.font_style || 'normal');
  const fontColor = String(config.font_color || '#111111');
  const bgColor = String(config.bg_color || '#f8f8f8');
  const bgOpacity = Number(config.bg_opacity ?? 100);

  const sc = containerWidth / DESKTOP_W;
  const previewHeight = Math.round(containerWidth * ASPECT);
  const background = hexToRgba(bgColor.startsWith('#') ? bgColor : '#f8f8f8', bgOpacity);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: previewHeight,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1.5px solid',
        borderColor: 'divider',
        background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${Math.round(12 * sc)}px`,
        px: `${Math.round(48 * sc)}px`,
        py: `${Math.round(24 * sc)}px`,
        fontFamily,
      }}
    >
      <Box
        sx={{
          fontSize: Math.round(titleFontSize * sc),
          fontWeight: titleFontWeight,
          fontStyle,
          fontFamily,
          color: fontColor,
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {String(config.title || 'Apoiadores')}
      </Box>
      {Boolean(config.intro) && (
        <Box
          sx={{
            fontSize: Math.round(bodyFontSize * sc),
            fontFamily,
            fontStyle,
            color: fontColor,
            opacity: 0.75,
            textAlign: 'center',
            lineHeight: 1.4,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {String(config.intro)}
        </Box>
      )}
      {/* Mock sponsor logos */}
      <Box sx={{ display: 'flex', gap: `${Math.round(16 * sc)}px`, mt: `${Math.round(8 * sc)}px` }}>
        {[1, 2, 3].map((i) => (
          <Box
            key={i}
            sx={{
              width: Math.round(80 * sc),
              height: Math.round(48 * sc),
              borderRadius: `${4 * sc}px`,
              border: `${Math.max(1, Math.round(1.5 * sc))}px solid`,
              borderColor: 'divider',
              bgcolor: 'rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box sx={{ fontSize: Math.round(9 * sc), color: fontColor, opacity: 0.4, fontFamily }}>Logo {i}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── CustomText Preview ────────────────────────────────────────────────────────
function CustomTextPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);

  const DESKTOP_W = 960;
  const DESKTOP_H = 200;
  const ASPECT = DESKTOP_H / DESKTOP_W;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fontFamily    = String(config.font_family       || 'system-ui, sans-serif');
  const titleSize     = Number(config.title_font_size   || 28);
  const titleWeight   = Number(config.title_font_weight || 700);
  const bodySize      = Number(config.body_font_size    || 16);
  const bodyWeight    = Number(config.body_font_weight  || 400);
  const fontStyle     = String(config.font_style        || 'normal');
  const fontColor     = String(config.font_color        || '#111111');
  const bgColor       = String(config.bg_color          || '#ffffff');
  const bgOpacity     = Number(config.bg_opacity        ?? 100);

  const sc = containerWidth / DESKTOP_W;
  const previewHeight = Math.round(containerWidth * ASPECT);
  const background = hexToRgba(bgColor.startsWith('#') ? bgColor : '#ffffff', bgOpacity);

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        height: previewHeight,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1.5px solid',
        borderColor: 'divider',
        background,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        px: `${Math.round(48 * sc)}px`,
        py: `${Math.round(24 * sc)}px`,
        gap: `${Math.round(8 * sc)}px`,
        fontFamily,
      }}
    >
      {Boolean(config.title) && (
        <Box sx={{ fontSize: Math.round(titleSize * sc), fontWeight: titleWeight, fontStyle, fontFamily, color: fontColor, lineHeight: 1.2 }}>
          {String(config.title)}
        </Box>
      )}
      {Boolean(config.body) && (
        <Box
          sx={{
            fontSize: Math.round(bodySize * sc),
            fontWeight: bodyWeight,
            fontStyle,
            fontFamily,
            color: fontColor,
            opacity: 0.8,
            lineHeight: 1.5,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {String(config.body)}
        </Box>
      )}
      {!config.title && !config.body && (
        <Box sx={{ fontSize: Math.round(14 * sc), color: fontColor, opacity: 0.35, fontFamily }}>Texto livre</Box>
      )}
    </Box>
  );
}

function GirasCalendarPreview({ config }: { config: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(480);
  const [calPopoverAnchor, setCalPopoverAnchor] = useState<HTMLElement | null>(null);
  const [calPopoverGiras, setCalPopoverGiras] = useState<typeof MOCK_GIRAS_PREVIEW>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sc = containerWidth / 960;
  const displayMode = String(config.display_mode || 'calendar');
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
  const showTicket = config.show_ticket_button !== false;
  const showSponsor = config.show_sponsor_button !== false;

  const bg = bgColor.startsWith('#') ? hexToRgba(bgColor, bgOpacity) : bgColor;

  const sectionTitle = String(config.title || 'Próximas Giras');

  const btnSx = {
    display: 'inline-block',
    px: `${8 * sc}px`,
    py: `${4 * sc}px`,
    borderRadius: `${6 * sc}px`,
    fontSize: `${Math.max(9, 11 * sc)}px`,
    fontFamily,
    fontWeight: 600,
    lineHeight: 1.4,
    border: '1.5px solid currentColor',
    color: fontColor,
    opacity: 0.85,
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderGiraCard(g: typeof MOCK_GIRAS_PREVIEW[0], cardSx?: object) {
    return (
      <Box key={g.id} sx={{
        p: `${12 * sc}px`,
        borderRadius: `${8 * sc}px`,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: cardBgColor,
        ...cardSx,
      }}>
        <Typography sx={{ fontFamily, fontSize: `${titleFontSize * sc}px`, fontWeight: titleFontWeight, fontStyle, color: fontColor, lineHeight: 1.3 }}>
          {g.nome}
        </Typography>
        {g.data_hora && (
          <Typography sx={{ fontFamily, fontSize: `${bodyFontSize * sc}px`, fontStyle, color: fontColor, opacity: 0.65, mt: `${2 * sc}px` }}>
            {formatDate(g.data_hora)}
          </Typography>
        )}
        {g.descricao && (
          <Typography sx={{ fontFamily, fontSize: `${bodyFontSize * sc}px`, fontStyle, color: fontColor, opacity: 0.8, mt: `${4 * sc}px` }}>
            {g.descricao}
          </Typography>
        )}
        {(showTicket && g.has_tickets) || (showSponsor && g.has_sponsor_tickets) ? (
          <Box sx={{ display: 'flex', gap: `${6 * sc}px`, flexWrap: 'wrap', mt: `${8 * sc}px` }}>
            {showTicket && g.has_tickets && (
              <Box component="span" sx={btnSx}>Retire sua senha</Box>
            )}
            {showSponsor && g.has_sponsor_tickets && (
              <Box component="span" sx={{ ...btnSx, opacity: 1, fontStyle: 'italic' }}>Senha associado</Box>
            )}
          </Box>
        ) : null}
      </Box>
    );
  }

  function renderCalendar() {
    const nowSP = parseSPDate(new Date().toISOString());
    const year = nowSP.year;
    const month = nowSP.month;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const giraDayMap = new Map<number, typeof MOCK_GIRAS_PREVIEW>();
    for (const g of MOCK_GIRAS_PREVIEW) {
      if (!g.data_hora) continue;
      const sp = parseSPDate(g.data_hora);
      if (sp.year === year && sp.month === month) {
        if (!giraDayMap.has(sp.day)) giraDayMap.set(sp.day, []);
        giraDayMap.get(sp.day)!.push(g);
      }
    }

    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const dayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
    const cellSize = Math.max(18, 28 * sc);

    return (
      <Box sx={{ bgcolor: calendarBgColor, borderRadius: `${6 * sc}px`, p: `${10 * sc}px` }}>
        <Typography sx={{ fontFamily, fontSize: `${Math.max(10, 13 * sc)}px`, fontWeight: 600, fontStyle, color: calendarTextColor, textAlign: 'center', mb: `${4 * sc}px`, textTransform: 'capitalize' }}>
          {monthName}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: `${2 * sc}px` }}>
          {dayLabels.map((lbl, i) => (
            <Box key={i} sx={{ textAlign: 'center', fontSize: `${Math.max(8, 10 * sc)}px`, fontFamily, color: calendarTextColor, opacity: 0.5, fontWeight: 600, pb: `${2 * sc}px` }}>
              {lbl}
            </Box>
          ))}
          {cells.map((day, i) => {
            const hasGira = day !== null && giraDayMap.has(day);
            return (
              <Box
                key={i}
                onClick={hasGira ? (e: React.MouseEvent<HTMLElement>) => {
                  setCalPopoverAnchor(e.currentTarget);
                  setCalPopoverGiras(giraDayMap.get(day!)!);
                } : undefined}
                sx={{
                  height: `${cellSize}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: `${4 * sc}px`,
                  fontSize: `${Math.max(8, 11 * sc)}px`,
                  fontFamily,
                  fontWeight: hasGira ? 700 : 400,
                  color: hasGira ? '#fff' : calendarTextColor,
                  bgcolor: hasGira ? calendarHighlightColor : 'transparent',
                  opacity: day ? 1 : 0,
                  cursor: hasGira ? 'pointer' : 'default',
                }}
              >
                {day ?? ''}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        background: bg,
        p: `${16 * sc}px`,
        mb: 1,
      }}
    >
      <Typography sx={{ fontFamily, fontSize: `${Math.max(12, titleFontSize * sc * 1.2)}px`, fontWeight: titleFontWeight, fontStyle, color: fontColor, mb: `${12 * sc}px` }}>
        {sectionTitle}
      </Typography>

      {displayMode === 'list' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${8 * sc}px` }}>
          {MOCK_GIRAS_PREVIEW.map(g => renderGiraCard(g))}
        </Box>
      )}

      {displayMode === 'card-grid' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: `${8 * sc}px` }}>
          {MOCK_GIRAS_PREVIEW.map(g => renderGiraCard(g))}
        </Box>
      )}

      {displayMode === 'card-carousel' && (
        <Box sx={{ display: 'flex', gap: `${8 * sc}px`, overflow: 'hidden' }}>
          {MOCK_GIRAS_PREVIEW.map(g => renderGiraCard(g, { flexShrink: 0, width: `${260 * sc}px` }))}
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
            slotProps={{ paper: { sx: { maxWidth: 300, borderRadius: 2, boxShadow: 4 } } }}
          >
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {calPopoverGiras.map((g, idx) => (
                <Box key={g.id}>
                  {idx > 0 && <Divider sx={{ mb: 1.5 }} />}
                  <Typography sx={{ fontFamily, fontSize: 14, fontWeight: titleFontWeight, fontStyle, color: fontColor, lineHeight: 1.3 }}>
                    {g.nome}
                  </Typography>
                  {g.data_hora && (
                    <Typography sx={{ fontFamily, fontSize: 12, fontStyle, color: fontColor, opacity: 0.65, mt: 0.5 }}>
                      {formatDate(g.data_hora)}
                    </Typography>
                  )}
                  {g.descricao && (
                    <Typography sx={{ fontFamily, fontSize: 12, fontStyle, color: fontColor, opacity: 0.8, mt: 0.5 }}>
                      {g.descricao}
                    </Typography>
                  )}
                  {((showTicket && g.has_tickets) || (showSponsor && g.has_sponsor_tickets)) && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                      {showTicket && g.has_tickets && (
                        <Box component="span" sx={{ fontSize: 11, fontFamily, px: 1, py: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, color: fontColor, display: 'inline-block' }}>
                          Retire sua senha
                        </Box>
                      )}
                      {showSponsor && g.has_sponsor_tickets && (
                        <Box component="span" sx={{ fontSize: 11, fontFamily, px: 1, py: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, color: fontColor, fontStyle: 'italic', display: 'inline-block' }}>
                          Senha associado
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Popover>
        </>
      )}
    </Box>
  );
}

// ── Location Editor (needs own hooks — cannot use IIFE pattern) ─────────────
function LocationEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError,   setCepError]   = useState<string | null>(null);

  const fontFamily  = String(config.font_family      || 'system-ui, sans-serif');
  const titleWeight = Number(config.title_font_weight || 700);
  const bodyWeight  = Number(config.body_font_weight  || 400);
  const fontStyle   = String(config.font_style        || 'normal');
  const fontEntry   = HERO_FONTS.find(f => f.value === fontFamily);
  const fontImportUrl = fontEntry?.importUrl ?? null;

  const fetchCep = async (raw: string) => {
    const cep = raw.replace(/\D/g, '');
    if (cep.length !== 8) { setCepError('CEP deve ter 8 dígitos'); return; }
    setCepLoading(true);
    setCepError(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError('CEP não encontrado'); return; }
      onChange({
        ...config,
        cep:          data.cep,
        street:       data.logradouro,
        neighborhood: data.bairro,
        city:         data.localidade,
        state:        data.uf,
      });
      setCepError(null);
    } catch {
      setCepError('Erro ao consultar o CEP');
    } finally {
      setCepLoading(false);
    }
  };

  return (
    <>
      {fontImportUrl && (
        <Head>
          <link key="location-font" rel="stylesheet" href={fontImportUrl} />
        </Head>
      )}

      {/* ── Live preview ── */}
      <LocationPreview config={config} />

      {/* ── Título ── */}
      <TextField
        label="Título da seção"
        value={String(config.title || 'Como Chegar')}
        onChange={(e) => onChange({ ...config, title: e.target.value })}
        fullWidth
        size="small"
      />

      {/* ── Endereço ── */}
      <Divider sx={{ borderStyle: 'dashed' }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Endereço</Typography>
      </Divider>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label="CEP"
          value={String(config.cep || '')}
          onChange={(e) => onChange({ ...config, cep: e.target.value })}
          size="small"
          sx={{ width: 160 }}
          inputProps={{ maxLength: 9 }}
          placeholder="00000-000"
          error={!!cepError}
          helperText={cepError ?? ' '}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={cepLoading}
          onClick={() => fetchCep(String(config.cep || ''))}
          sx={{ mt: 0.5, whiteSpace: 'nowrap', height: 40 }}
          startIcon={cepLoading ? <CircularProgress size={13} /> : undefined}
        >
          {cepLoading ? 'Buscando…' : 'Buscar CEP'}
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 1 }}>
        <TextField label="Logradouro" value={String(config.street || '')} onChange={(e) => onChange({ ...config, street: e.target.value })} size="small" fullWidth />
        <TextField label="Número" value={String(config.number || '')} onChange={(e) => onChange({ ...config, number: e.target.value })} size="small" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <TextField label="Complemento" value={String(config.complement || '')} onChange={(e) => onChange({ ...config, complement: e.target.value })} size="small" />
        <TextField label="Bairro" value={String(config.neighborhood || '')} onChange={(e) => onChange({ ...config, neighborhood: e.target.value })} size="small" />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 1 }}>
        <TextField label="Cidade" value={String(config.city || '')} onChange={(e) => onChange({ ...config, city: e.target.value })} size="small" />
        <TextField label="UF" value={String(config.state || '')} onChange={(e) => onChange({ ...config, state: e.target.value })} size="small" inputProps={{ maxLength: 2 }} />
      </Box>
      <TextField
        label="Instruções adicionais"
        value={String(config.instructions || '')}
        onChange={(e) => onChange({ ...config, instructions: e.target.value })}
        fullWidth multiline rows={2} size="small"
        helperText="Opcional. Ex: Entrada pelo portão lateral, estacionamento no pátio…"
      />

      {/* ── Layout ── */}
      <Divider sx={{ borderStyle: 'dashed' }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Layout</Typography>
      </Divider>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Mapa:</Typography>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {(['left', 'right'] as const).map((side) => (
            <Button key={side} size="small"
              variant={String(config.map_side || 'right') === side ? 'contained' : 'outlined'}
              onClick={() => onChange({ ...config, map_side: side })}
              sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: 12 }}
            >
              {side === 'left' ? '◀ Esquerda' : 'Direita ▶'}
            </Button>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {([
            { value: 'wide',      label: 'Ampla' },
            { value: 'medium',    label: 'Média' },
            { value: 'contained', label: 'Padrão' },
          ]).map(opt => (
            <Button key={opt.value} size="small"
              variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
              onClick={() => onChange({ ...config, margin_preset: opt.value })}
              sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
            >
              {opt.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* ── Tipografia ── */}
      <Divider sx={{ borderStyle: 'dashed' }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
      </Divider>

      <FormControl size="small" fullWidth>
        <InputLabel>Fonte</InputLabel>
        <Select value={fontFamily} label="Fonte" onChange={(e) => onChange({ ...config, font_family: e.target.value })}
          renderValue={(v) => { const entry = HERO_FONTS.find(f => f.value === v); return <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>{entry?.label ?? String(v)}</Typography>; }}
        >
          {HERO_FONTS.map(f => (<MenuItem key={f.value} value={f.value}><Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography></MenuItem>))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary">Título</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
        <FormControl size="small">
          <InputLabel>Tamanho</InputLabel>
          <Select value={Number(config.title_font_size || 28)} label="Tamanho" onChange={(e) => onChange({ ...config, title_font_size: Number(e.target.value) })}
            renderValue={(v) => { const entry = SECTION_TITLE_SIZES.find(s => s.value === v); return (<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography><Typography variant="caption">{entry?.label}</Typography></Box>); }}
          >
            {SECTION_TITLE_SIZES.map(s => (<MenuItem key={s.value} value={s.value}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography></Box><Typography variant="body2">{s.label}</Typography></Box></MenuItem>))}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Peso</InputLabel>
          <Select value={titleWeight} label="Peso" onChange={(e) => onChange({ ...config, title_font_weight: Number(e.target.value) })}
            renderValue={(v) => { const entry = HERO_FONT_WEIGHTS.find(w => w.value === v); return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>; }}
          >
            {HERO_FONT_WEIGHTS.map(w => (<MenuItem key={w.value} value={w.value}><Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography></MenuItem>))}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Estilo</InputLabel>
          <Select value={fontStyle} label="Estilo" onChange={(e) => onChange({ ...config, font_style: e.target.value })}
            renderValue={(v) => (<Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>{v === 'italic' ? 'Itálico' : 'Normal'}</Typography>)}
          >
            <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
            <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Typography variant="caption" color="text.secondary">Texto do corpo</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        <FormControl size="small">
          <InputLabel>Tamanho</InputLabel>
          <Select value={Number(config.body_font_size || 15)} label="Tamanho" onChange={(e) => onChange({ ...config, body_font_size: Number(e.target.value) })}
            renderValue={(v) => { const entry = SECTION_BODY_SIZES.find(s => s.value === v); return (<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.7)}px`, lineHeight: 1 }}>Aa</Typography><Typography variant="caption">{entry?.label}</Typography></Box>); }}
          >
            {SECTION_BODY_SIZES.map(s => (<MenuItem key={s.value} value={s.value}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Box sx={{ width: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}><Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(s.value * 0.7)}px`, lineHeight: 1 }}>Aa</Typography></Box><Typography variant="body2">{s.label}</Typography></Box></MenuItem>))}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel>Peso</InputLabel>
          <Select value={bodyWeight} label="Peso" onChange={(e) => onChange({ ...config, body_font_weight: Number(e.target.value) })}
            renderValue={(v) => { const entry = HERO_FONT_WEIGHTS.find(w => w.value === v); return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>; }}
          >
            {HERO_FONT_WEIGHTS.map(w => (<MenuItem key={w.value} value={w.value}><Typography sx={{ fontFamily, fontWeight: w.value, fontSize: 14 }}>{w.label}</Typography></MenuItem>))}
          </Select>
        </FormControl>
      </Box>

      {/* ── Cor da fonte ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
        <Box component="label" sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.font_color || '#111111'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
          <input type="color" value={String(config.font_color || '#111111')} onChange={(e) => onChange({ ...config, font_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
        </Box>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
      </Box>

      {/* ── Fundo ── */}
      <Divider sx={{ borderStyle: 'dashed' }}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
      </Divider>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
        <Box component="label" sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.bg_color || '#f8f8f8'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
          <input type="color" value={String(config.bg_color || '#f8f8f8')} onChange={(e) => onChange({ ...config, bg_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
        </Box>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#f8f8f8')}</Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
          Transparência: {100 - Number(config.bg_opacity ?? 100)}%
        </Typography>
        <Slider
          value={Number(config.bg_opacity ?? 100)} min={0} max={100} step={5}
          onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
          sx={{ flex: 1 }} size="small"
          marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
        />
      </Box>
    </>
  );
}

// ── Section Editor panel ──────────────────────────────────────────────────────

function SectionEditor({
  section,
  onChange,
  onUploadStart,
  onUploadEnd,
  siteId: _siteId,
}: {
  section: Section;
  onChange: (config: Record<string, unknown>) => void;
  onUploadStart: (sectionId: string) => void;
  onUploadEnd: () => void;
  siteId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadError(null);
    setUploading(true);
    onUploadStart(section.id);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use fetch directly — axios instance default Content-Type conflicts with multipart.
      // Use window.location.origin to work in any env (localhost, docker, prod) without
      // depending on NEXT_PUBLIC_API_BASE_URL being set.
      // Normal sessions authenticate via the HttpOnly access_token cookie (sent
      // automatically with credentials: 'include'); only impersonation carries
      // a bearer token in sessionStorage.
      const impersonationToken =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('access_token') : null;

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${origin}/api/v1/admin/sites/images`, {
        method: 'POST',
        credentials: 'include',
        headers: impersonationToken ? { Authorization: `Bearer ${impersonationToken}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Erro ${res.status} ao fazer upload.`);
      }

      const data = await res.json();
      onChange({ ...section.config, [field]: data.id, [`${field}_url`]: data.url });
    } catch (err: any) {
      setUploadError(err?.message || 'Erro ao fazer upload da imagem.');
    } finally {
      setUploading(false);
      onUploadEnd();
    }
  };

  const { section_type: type, config } = section;

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        {SECTION_TYPES.find((t) => t.value === type)?.label ?? type}
      </Typography>

      {/* HERO */}
      {type === 'HERO' && (() => {
        const bgType = String(config.bg_type || 'gradient');
        const gradFrom = String(config.gradient_from || '#6366f1');
        const gradTo = String(config.gradient_to || '#ec4899');
        const gradDir = String(config.gradient_dir || '135deg');
        const solidColor = String(config.bg_color || '#6366f1');
        const bgImageUrl = config.bg_image_url ? String(config.bg_image_url) : undefined;

        // ── Font
        const fontFamily = String(config.font_family || 'system-ui, sans-serif');
        const fontSize = Number(config.font_size || 48);
        const fontWeight = Number(config.font_weight || 700);
        const fontStyle = String(config.font_style || 'normal');
        const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
        const fontImportUrl = fontEntry?.importUrl ?? null;

        return (
          <>
            {/* ── Font import ── */}
            {fontImportUrl && (
              <Head>
                <link key="hero-font" rel="stylesheet" href={fontImportUrl} />
              </Head>
            )}

            {/* ── Live Hero Preview (proporcional ao site publicado) ── */}
            <HeroPreview
              config={config}
              onPositionChange={bgType === 'image' && bgImageUrl
                ? (x, y) => onChange({ ...config, bg_position_x: x, bg_position_y: y })
                : undefined
              }
            />

            {/* ── Texto ── */}
            <TextField
              label="Título *"
              value={String(config.title || '')}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Subtítulo"
              value={String(config.subtitle || '')}
              onChange={(e) => onChange({ ...config, subtitle: e.target.value })}
              fullWidth
              size="small"
              multiline
              rows={2}
            />

            {/* ── Layout ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Layout</Typography>
            </Divider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([
                  { value: 'wide',      label: 'Ampla' },
                  { value: 'medium',    label: 'Média' },
                  { value: 'contained', label: 'Padrão' },
                ]).map(opt => (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, margin_preset: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* ── Logo ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Logo</Typography>
            </Divider>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Logo:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([{ value: 'none', label: 'Sem logo' }, { value: 'logo', label: 'Com logo' }] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={String(config.logo_mode || 'none') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, logo_mode: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {String(config.logo_mode || 'none') === 'logo' && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Posição:</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {([{ value: 'left', label: 'À esquerda' }, { value: 'right', label: 'À direita' }] as const).map((opt) => (
                      <Button
                        key={opt.value}
                        size="small"
                        variant={String(config.logo_position || 'left') === opt.value ? 'contained' : 'outlined'}
                        onClick={() => onChange({ ...config, logo_position: opt.value })}
                        sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Tamanho:</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {([{ value: 'xl', label: 'XL' }, { value: 'lg', label: 'G' }, { value: 'md', label: 'M' }, { value: 'sm', label: 'P' }, { value: 'xs', label: 'XP' }] as const).map((opt) => (
                      <Button
                        key={opt.value}
                        size="small"
                        variant={String(config.logo_size || 'md') === opt.value ? 'contained' : 'outlined'}
                        onClick={() => onChange({ ...config, logo_size: opt.value })}
                        sx={{ fontSize: 11, px: 1.25, py: 0.5, minWidth: 0 }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Recomendado <strong>200 × 200 px</strong> · PNG com transparência · até 5 MB
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {Boolean(config.logo_image_url) && (
                      <Box
                        component="img"
                        src={String(config.logo_image_url)}
                        sx={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'rgba(0,0,0,0.04)', flexShrink: 0 }}
                      />
                    )}
                    <Button
                      component="label"
                      variant="outlined"
                      size="small"
                      disabled={uploading}
                      startIcon={uploading ? <CircularProgress size={13} /> : undefined}
                    >
                      {uploading ? 'Enviando…' : config.logo_image_url ? 'Trocar logo' : 'Escolher logo'}
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleImageUpload(e, 'logo_image')}
                      />
                    </Button>
                    {Boolean(config.logo_image_url) && (
                      <Button
                        size="small"
                        color="error"
                        variant="text"
                        sx={{ minWidth: 0 }}
                        onClick={() => onChange({ ...config, logo_image: undefined, logo_image_url: undefined })}
                      >
                        Remover
                      </Button>
                    )}
                  </Box>
                  {uploadError && (
                    <Typography variant="caption" color="error">{uploadError}</Typography>
                  )}
                </Box>
              </>
            )}

            {/* ── Tipografia ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
            </Divider>
            <FormControl size="small" fullWidth>
              <InputLabel>Fonte</InputLabel>
              <Select
                value={fontFamily}
                label="Fonte"
                onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                renderValue={(v) => {
                  const entry = HERO_FONTS.find(f => f.value === v);
                  return (
                    <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>
                      {entry?.label ?? String(v)}
                    </Typography>
                  );
                }}
              >
                {HERO_FONTS.map(f => (
                  <MenuItem key={f.value} value={f.value}>
                    <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
              {/* Tamanho — mostra "Aa" escalado */}
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select
                  value={fontSize}
                  label="Tamanho"
                  onChange={(e) => onChange({ ...config, font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.38)}px`, lineHeight: 1, color: 'text.primary' }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {HERO_FONT_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value} sx={{ py: 0.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight, fontStyle, fontSize: `${Math.round(s.value * 0.38)}px`, lineHeight: 1, color: 'text.primary' }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Peso — rótulo no próprio peso */}
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select
                  value={fontWeight}
                  label="Peso"
                  onChange={(e) => onChange({ ...config, font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return (
                      <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>
                        {entry?.label}
                      </Typography>
                    );
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value} sx={{ py: 0.75 }}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>
                        {w.label}
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Estilo — rótulo no próprio estilo */}
              <FormControl size="small">
                <InputLabel>Estilo</InputLabel>
                <Select
                  value={fontStyle}
                  label="Estilo"
                  onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                  renderValue={(v) => (
                    <Typography sx={{ fontFamily, fontWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                      {v === 'italic' ? 'Itálico' : 'Normal'}
                    </Typography>
                  )}
                >
                  <MenuItem value="normal" sx={{ py: 0.75 }}>
                    <Typography sx={{ fontFamily, fontWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography>
                  </MenuItem>
                  <MenuItem value="italic" sx={{ py: 0.75 }}>
                    <Typography sx={{ fontFamily, fontWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography>
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* ── Cor da fonte ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.font_color || '#ffffff'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.font_color || '#ffffff')}
                  onChange={(e) => onChange({ ...config, font_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#ffffff')}</Typography>
            </Box>

            {/* ── Tipo de fundo (linha compacta) ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
            </Divider>
            <FormControl size="small" fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select
                value={bgType}
                label="Tipo"
                onChange={(e) => onChange({ ...config, bg_type: e.target.value })}
              >
                <MenuItem value="gradient">Gradiente</MenuItem>
                <MenuItem value="solid">Cor sólida</MenuItem>
                <MenuItem value="image">Imagem</MenuItem>
              </Select>
            </FormControl>

            {/* ── Gradiente ── */}
            {bgType === 'gradient' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Direção</InputLabel>
                  <Select
                    value={gradDir}
                    label="Direção"
                    onChange={(e) => onChange({ ...config, gradient_dir: e.target.value })}
                  >
                    <MenuItem value="to bottom">↓ Vertical</MenuItem>
                    <MenuItem value="to right">→ Horizontal</MenuItem>
                    <MenuItem value="135deg">↘ Diagonal (padrão)</MenuItem>
                    <MenuItem value="45deg">↗ Diagonal</MenuItem>
                    <MenuItem value="225deg">↙ Diagonal</MenuItem>
                    <MenuItem value="315deg">↖ Diagonal</MenuItem>
                    <MenuItem value="radial">⊙ Radial</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">De</Typography>
                    <Tooltip title={gradFrom}>
                      <Box sx={{ position: 'relative', width: 28, height: 28 }}>
                        <Box
                          sx={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: gradFrom,
                            border: '2px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                          }}
                        />
                        <Box
                          component="input"
                          type="color"
                          value={gradFrom}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onChange({ ...config, gradient_from: e.target.value })
                          }
                          sx={{
                            position: 'absolute', inset: 0, opacity: 0,
                            width: '100%', height: '100%', cursor: 'pointer',
                          }}
                        />
                      </Box>
                    </Tooltip>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">Para</Typography>
                    <Tooltip title={gradTo}>
                      <Box sx={{ position: 'relative', width: 28, height: 28 }}>
                        <Box
                          sx={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: gradTo,
                            border: '2px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                          }}
                        />
                        <Box
                          component="input"
                          type="color"
                          value={gradTo}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onChange({ ...config, gradient_to: e.target.value })
                          }
                          sx={{
                            position: 'absolute', inset: 0, opacity: 0,
                            width: '100%', height: '100%', cursor: 'pointer',
                          }}
                        />
                      </Box>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── Cor sólida ── */}
            {bgType === 'solid' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" color="text.secondary">Cor</Typography>
                <Tooltip title={solidColor}>
                  <Box sx={{ position: 'relative', width: 28, height: 28 }}>
                    <Box
                      sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: solidColor,
                        border: '2px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                      }}
                    />
                    <Box
                      component="input"
                      type="color"
                      value={solidColor}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onChange({ ...config, bg_color: e.target.value })
                      }
                      sx={{
                        position: 'absolute', inset: 0, opacity: 0,
                        width: '100%', height: '100%', cursor: 'pointer',
                      }}
                    />
                  </Box>
                </Tooltip>
                <Typography variant="caption" color="text.secondary">{solidColor}</Typography>
              </Box>
            )}

            {/* ── Imagem ── */}
            {bgType === 'image' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Recomendado <strong>1920 × 600 px</strong> · JPEG/PNG/WebP · até 5 MB
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    component="label"
                    variant="outlined"
                    size="small"
                    disabled={uploading}
                    startIcon={uploading ? <CircularProgress size={13} /> : undefined}
                  >
                    {uploading ? 'Enviando…' : bgImageUrl ? 'Trocar imagem' : 'Escolher imagem'}
                    <input
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleImageUpload(e, 'bg_image')}
                    />
                  </Button>
                  {bgImageUrl && (
                    <Button
                      size="small"
                      color="error"
                      variant="text"
                      sx={{ minWidth: 0 }}
                      onClick={() => onChange({ ...config, bg_image: undefined, bg_image_url: undefined })}
                    >
                      Remover
                    </Button>
                  )}
                </Box>
                {uploadError && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                    {uploadError}
                  </Typography>
                )}
                {!bgImageUrl && !uploadError && (
                  <Typography variant="caption" color="text.disabled">
                    Após escolher a imagem, arraste o preview acima para ajustar o enquadramento.
                  </Typography>
                )}
                {bgImageUrl && (
                  <Typography variant="caption" color="text.secondary">
                    Arraste a imagem no preview acima para ajustar o reposicionamento.
                  </Typography>
                )}
              </Box>
            )}
          </>
        );
      })()}

      {/* ABOUT */}
      {type === 'ABOUT' && (
        <>
          {/* ── Live preview ── */}
          <SobrePreview config={config} />

          {/* ── Conteúdo ── */}
          <TextField
            label="Título da seção"
            value={String(config.title || '')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
            size="small"
          />
          <TextField
            label="Texto"
            value={String(config.body || '')}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
            fullWidth
            multiline
            rows={5}
            size="small"
          />

          {/* ── Imagem ── */}
          <Divider sx={{ borderStyle: 'dashed' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Imagem</Typography>
          </Divider>

          {/* Image side toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Posição:</Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {(['left', 'right'] as const).map((side) => (
                <Button
                  key={side}
                  size="small"
                  variant={String(config.image_side || 'right') === side ? 'contained' : 'outlined'}
                  onClick={() => onChange({ ...config, image_side: side })}
                  sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: 12 }}
                >
                  {side === 'left' ? '◀ Esquerda' : 'Direita ▶'}
                </Button>
              ))}
            </Box>
          </Box>

          {/* Margem lateral */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {([
                { value: 'wide',      label: 'Ampla' },
                { value: 'medium',    label: 'Média' },
                { value: 'contained', label: 'Padrão' },
              ]).map(opt => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                  onClick={() => onChange({ ...config, margin_preset: opt.value })}
                  sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button
              component="label"
              variant="outlined"
              size="small"
              disabled={uploading}
              startIcon={uploading ? <CircularProgress size={13} /> : undefined}
            >
              {uploading ? 'Enviando…' : config.image_url ? 'Trocar imagem' : 'Escolher imagem'}
              <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => handleImageUpload(e, 'image')} />
            </Button>
            {Boolean(config.image_url) && (
              <>
                <Box component="img" src={String(config.image_url)} sx={{ height: 40, width: 40, objectFit: 'cover', borderRadius: 1 }} />
                <Button
                  size="small"
                  color="error"
                  variant="text"
                  onClick={() => onChange({ ...config, image: undefined, image_url: undefined })}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  Remover
                </Button>
              </>
            )}
          </Box>
          {uploadError && (
            <Alert severity="error" onClose={() => setUploadError(null)} sx={{ py: 0.5 }}>
              {uploadError}
            </Alert>
          )}
          {!config.image_url && !uploadError && (
            <Typography variant="caption" color="text.secondary">
              JPEG · PNG · WebP · até 5 MB
            </Typography>
          )}

          {/* ── Tipografia ── */}
          <Divider sx={{ borderStyle: 'dashed' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
          </Divider>

          {/* Font family */}
          {(() => {
            const fontFamily = String(config.font_family || 'system-ui, sans-serif');
            const titleWeight = Number(config.title_font_weight || 700);
            const bodyWeight = Number(config.body_font_weight || 400);
            const fontStyle = String(config.font_style || 'normal');
            const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
            const fontImportUrl = fontEntry?.importUrl ?? null;
            return (
              <>
                {fontImportUrl && (
                  <Head>
                    <link key="sobre-font" rel="stylesheet" href={fontImportUrl} />
                  </Head>
                )}
                <FormControl size="small" fullWidth>
                  <InputLabel>Fonte</InputLabel>
                  <Select
                    value={fontFamily}
                    label="Fonte"
                    onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                    renderValue={(v) => {
                      const entry = HERO_FONTS.find(f => f.value === v);
                      return (
                        <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>
                          {entry?.label ?? String(v)}
                        </Typography>
                      );
                    }}
                  >
                    {HERO_FONTS.map(f => (
                      <MenuItem key={f.value} value={f.value}>
                        <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Title: size + weight */}
                <Typography variant="caption" color="text.secondary">Título</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                  <FormControl size="small">
                    <InputLabel>Tamanho</InputLabel>
                    <Select
                      value={Number(config.title_font_size || 28)}
                      label="Tamanho"
                      onChange={(e) => onChange({ ...config, title_font_size: Number(e.target.value) })}
                      renderValue={(v) => {
                        const entry = SECTION_TITLE_SIZES.find(s => s.value === v);
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                            <Typography variant="caption">{entry?.label}</Typography>
                          </Box>
                        );
                      }}
                    >
                      {SECTION_TITLE_SIZES.map(s => (
                        <MenuItem key={s.value} value={s.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                              <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                            </Box>
                            <Typography variant="body2">{s.label}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small">
                    <InputLabel>Peso</InputLabel>
                    <Select
                      value={titleWeight}
                      label="Peso"
                      onChange={(e) => onChange({ ...config, title_font_weight: Number(e.target.value) })}
                      renderValue={(v) => {
                        const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                        return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                      }}
                    >
                      {HERO_FONT_WEIGHTS.map(w => (
                        <MenuItem key={w.value} value={w.value}>
                          <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small">
                    <InputLabel>Estilo</InputLabel>
                    <Select
                      value={fontStyle}
                      label="Estilo"
                      onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                      renderValue={(v) => (
                        <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                          {v === 'italic' ? 'Itálico' : 'Normal'}
                        </Typography>
                      )}
                    >
                      <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
                      <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {/* Body: size + weight */}
                <Typography variant="caption" color="text.secondary">Texto do corpo</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <FormControl size="small">
                    <InputLabel>Tamanho</InputLabel>
                    <Select
                      value={Number(config.body_font_size || 16)}
                      label="Tamanho"
                      onChange={(e) => onChange({ ...config, body_font_size: Number(e.target.value) })}
                      renderValue={(v) => {
                        const entry = SECTION_BODY_SIZES.find(s => s.value === v);
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                            <Typography variant="caption">{entry?.label}</Typography>
                          </Box>
                        );
                      }}
                    >
                      {SECTION_BODY_SIZES.map(s => (
                        <MenuItem key={s.value} value={s.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                              <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(s.value * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                            </Box>
                            <Typography variant="body2">{s.label}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small">
                    <InputLabel>Peso</InputLabel>
                    <Select
                      value={bodyWeight}
                      label="Peso"
                      onChange={(e) => onChange({ ...config, body_font_weight: Number(e.target.value) })}
                      renderValue={(v) => {
                        const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                        return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                      }}
                    >
                      {HERO_FONT_WEIGHTS.map(w => (
                        <MenuItem key={w.value} value={w.value}>
                          <Typography sx={{ fontFamily, fontWeight: w.value, fontSize: 14 }}>{w.label}</Typography>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </>
            );
          })()}

          {/* ── Cor da fonte ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
            <Box
              component="label"
              sx={{
                width: 32, height: 32, borderRadius: 1,
                border: '2px solid', borderColor: 'divider',
                background: String(config.font_color || '#111111'),
                cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
              }}
            >
              <input
                type="color"
                value={String(config.font_color || '#111111')}
                onChange={(e) => onChange({ ...config, font_color: e.target.value })}
                style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
          </Box>

          {/* ── Fundo ── */}
          <Divider sx={{ borderStyle: 'dashed' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
          </Divider>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
            <Box
              component="label"
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                border: '2px solid',
                borderColor: 'divider',
                background: String(config.bg_color || '#ffffff'),
                cursor: 'pointer',
                flexShrink: 0,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <input
                type="color"
                value={String(config.bg_color || '#ffffff')}
                onChange={(e) => onChange({ ...config, bg_color: e.target.value })}
                style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
              />
            </Box>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#ffffff')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
              Transparência: {100 - Number(config.bg_opacity ?? 100)}%
            </Typography>
            <Slider
              value={Number(config.bg_opacity ?? 100)}
              min={0}
              max={100}
              step={5}
              onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
              sx={{ flex: 1 }}
              size="small"
              marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
            />
          </Box>
        </>
      )}

      {/* VIDEO_EMBED */}
      {type === 'VIDEO_EMBED' && (() => {
        const fontFamily = String(config.font_family || 'system-ui, sans-serif');
        const captionWeight = Number(config.caption_font_weight || 600);
        const captionSize = Number(config.caption_font_size || 24);
        const fontStyle = String(config.font_style || 'normal');
        const layout = String(config.layout || 'video-only');
        const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
        const fontImportUrl = fontEntry?.importUrl ?? null;
        return (
          <>
            {fontImportUrl && (
              <Head>
                <link key="video-font" rel="stylesheet" href={fontImportUrl} />
              </Head>
            )}

            {/* ── Live preview ── */}
            <VideoPreview config={config} />

            {/* ── URL ── */}
            <TextField
              label="URL do YouTube"
              value={String(config.youtube_url || '')}
              onChange={(e) => onChange({ ...config, youtube_url: e.target.value })}
              fullWidth
              size="small"
              placeholder="https://www.youtube.com/watch?v=..."
              helperText="Cole o link do YouTube. O embed será gerado automaticamente."
            />

            {/* ── Título/legenda ── */}
            <TextField
              label="Título / legenda"
              value={String(config.caption || '')}
              onChange={(e) => onChange({ ...config, caption: e.target.value })}
              fullWidth
              size="small"
            />

            {/* ── Layout ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Layout</Typography>
            </Divider>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {([
                { value: 'video-only', label: 'Só o vídeo' },
                { value: 'side-by-side', label: 'Vídeo + texto' },
              ] as const).map((opt) => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={layout === opt.value ? 'contained' : 'outlined'}
                  onClick={() => onChange({ ...config, layout: opt.value })}
                  sx={{ fontSize: 12, px: 1.5 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>

            {/* Margem lateral */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([
                  { value: 'wide',      label: 'Ampla' },
                  { value: 'medium',    label: 'Média' },
                  { value: 'contained', label: 'Padrão' },
                ]).map(opt => (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, margin_preset: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* ── Texto lateral (só quando side-by-side) ── */}
            {layout === 'side-by-side' && (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Vídeo:</Typography>
                  <Box sx={{ display: 'flex', gap: 0.75 }}>
                    {(['left', 'right'] as const).map((side) => (
                      <Button
                        key={side}
                        size="small"
                        variant={String(config.video_side || 'right') === side ? 'contained' : 'outlined'}
                        onClick={() => onChange({ ...config, video_side: side })}
                        sx={{ minWidth: 0, px: 1.5, py: 0.5, fontSize: 12 }}
                      >
                        {side === 'left' ? '◀ Esquerda' : 'Direita ▶'}
                      </Button>
                    ))}
                  </Box>
                </Box>
                <TextField
                  label="Texto lateral"
                  value={String(config.side_text || '')}
                  onChange={(e) => onChange({ ...config, side_text: e.target.value })}
                  fullWidth
                  size="small"
                  multiline
                  rows={4}
                  helperText="Aparece ao lado do vídeo na versão desktop."
                />
              </>
            )}

            {/* ── Tipografia ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia do título</Typography>
            </Divider>
            <FormControl size="small" fullWidth>
              <InputLabel>Fonte</InputLabel>
              <Select
                value={fontFamily}
                label="Fonte"
                onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                renderValue={(v) => {
                  const entry = HERO_FONTS.find(f => f.value === v);
                  return <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>{entry?.label ?? String(v)}</Typography>;
                }}
              >
                {HERO_FONTS.map(f => (
                  <MenuItem key={f.value} value={f.value}>
                    <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select
                  value={captionSize}
                  label="Tamanho"
                  onChange={(e) => onChange({ ...config, caption_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_TITLE_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: captionWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_TITLE_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: captionWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select
                  value={captionWeight}
                  label="Peso"
                  onChange={(e) => onChange({ ...config, caption_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Estilo</InputLabel>
                <Select
                  value={fontStyle}
                  label="Estilo"
                  onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                  renderValue={(v) => (
                    <Typography sx={{ fontFamily, fontWeight: captionWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                      {v === 'italic' ? 'Itálico' : 'Normal'}
                    </Typography>
                  )}
                >
                  <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: captionWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
                  <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: captionWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* ── Cor da fonte ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.font_color || '#111111'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.font_color || '#111111')}
                  onChange={(e) => onChange({ ...config, font_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
            </Box>

            {/* ── Fundo ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
            </Divider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32,
                  borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.bg_color || '#f5f5f5'),
                  cursor: 'pointer',
                  flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.bg_color || '#f5f5f5')}
                  onChange={(e) => onChange({ ...config, bg_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#f5f5f5')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
                Transparência: {100 - Number(config.bg_opacity ?? 100)}%
              </Typography>
              <Slider
                value={Number(config.bg_opacity ?? 100)}
                min={0}
                max={100}
                step={5}
                onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
                sx={{ flex: 1 }}
                size="small"
              />
            </Box>
          </>
        );
      })()}

      {/* GIRAS_CALENDAR */}
      {type === 'GIRAS_CALENDAR' && (() => {
        const fontFamily = String(config.font_family || 'system-ui, sans-serif');
        const titleSize = Number(config.title_font_size || 20);
        const titleWeight = Number(config.title_font_weight || 700);
        const bodySize = Number(config.body_font_size || 14);
        const fontStyle = String(config.font_style || 'normal');
        const displayMode = String(config.display_mode || 'calendar');
        const fontEntry = HERO_FONTS.find(f => f.value === fontFamily);
        const fontImportUrl = fontEntry?.importUrl ?? null;
        return (
          <>
            {fontImportUrl && (
              <Head>
                <link key="giras-font" rel="stylesheet" href={fontImportUrl} />
              </Head>
            )}

            {/* ── Live preview ── */}
            <GirasCalendarPreview config={config} />

            {/* ── Título ── */}
            <TextField
              label="Título da seção"
              value={String(config.title || 'Próximas Giras')}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
              fullWidth
              size="small"
            />

            {/* ── Modo de exibição ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Modo de exibição</Typography>
            </Divider>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {([
                { value: 'list',           label: 'Lista',          soon: true },
                { value: 'card-grid',      label: 'Grid de cards',  soon: true },
                { value: 'card-carousel',  label: 'Carrossel',      soon: true },
                { value: 'calendar',       label: 'Calendário',     soon: false },
              ] as const).map((opt) => (
                opt.soon ? (
                  <Tooltip key={opt.value} title="Em breve" arrow>
                    <span>
                      <Button
                        size="small"
                        variant="outlined"
                        disabled
                        sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                      >
                        {opt.label}
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={displayMode === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, display_mode: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                )
              ))}
            </Box>

            {/* ── Senhas (botões) ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Botões de senha</Typography>
            </Divider>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={config.show_ticket_button !== false}
                  onChange={(e) => onChange({ ...config, show_ticket_button: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Mostrar botão &quot;Retire sua senha&quot;</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={config.show_sponsor_button !== false}
                  onChange={(e) => onChange({ ...config, show_sponsor_button: e.target.checked })}
                />
              }
              label={<Typography variant="caption">Mostrar botão de senha de associado</Typography>}
            />

            {/* ── Margem lateral ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([
                  { value: 'wide',      label: 'Ampla' },
                  { value: 'medium',    label: 'Média' },
                  { value: 'contained', label: 'Padrão' },
                ]).map(opt => (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, margin_preset: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* ── Tipografia ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
            </Divider>
            <FormControl size="small" fullWidth>
              <InputLabel>Fonte</InputLabel>
              <Select
                value={fontFamily}
                label="Fonte"
                onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                renderValue={(v) => {
                  const entry = HERO_FONTS.find(f => f.value === v);
                  return <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>{entry?.label ?? String(v)}</Typography>;
                }}
              >
                {HERO_FONTS.map(f => (
                  <MenuItem key={f.value} value={f.value}>
                    <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
              {/* Title size */}
              <FormControl size="small">
                <InputLabel>Título</InputLabel>
                <Select
                  value={titleSize}
                  label="Título"
                  onChange={(e) => onChange({ ...config, title_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_TITLE_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_TITLE_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* Title weight */}
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select
                  value={titleWeight}
                  label="Peso"
                  onChange={(e) => onChange({ ...config, title_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* Font style */}
              <FormControl size="small">
                <InputLabel>Estilo</InputLabel>
                <Select
                  value={fontStyle}
                  label="Estilo"
                  onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                  renderValue={(v) => (
                    <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                      {v === 'italic' ? 'Itálico' : 'Normal'}
                    </Typography>
                  )}
                >
                  <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
                  <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
                </Select>
              </FormControl>
            </Box>
            {/* Body size */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Corpo:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {SECTION_BODY_SIZES.map(s => (
                  <Button
                    key={s.value}
                    size="small"
                    variant={bodySize === s.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, body_font_size: s.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Box>
            </Box>
            {/* Font color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.font_color || '#111111'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.font_color || '#111111')}
                  onChange={(e) => onChange({ ...config, font_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
            </Box>
            {/* Card background color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Fundo dos cards:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.card_bg_color || '#ffffff'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.card_bg_color || '#ffffff')}
                  onChange={(e) => onChange({ ...config, card_bg_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.card_bg_color || '#ffffff')}</Typography>
            </Box>
            {/* Calendar highlight color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Destaque calendário:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.calendar_highlight_color || '#6366f1'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.calendar_highlight_color || '#6366f1')}
                  onChange={(e) => onChange({ ...config, calendar_highlight_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.calendar_highlight_color || '#6366f1')}</Typography>
            </Box>
            {/* Calendar text color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Texto calendário:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.calendar_text_color || '#111111'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.calendar_text_color || '#111111')}
                  onChange={(e) => onChange({ ...config, calendar_text_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.calendar_text_color || '#111111')}</Typography>
            </Box>
            {/* Calendar bg color */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Fundo do calendário:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.calendar_bg_color || '#f8f8f8'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.calendar_bg_color || '#f8f8f8')}
                  onChange={(e) => onChange({ ...config, calendar_bg_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.calendar_bg_color || '#f8f8f8')}</Typography>
            </Box>

            {/* ── Fundo ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
            </Divider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.bg_color || '#ffffff'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.bg_color || '#ffffff')}
                  onChange={(e) => onChange({ ...config, bg_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#ffffff')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
                Transparência: {100 - Number(config.bg_opacity ?? 100)}%
              </Typography>
              <Slider
                value={Number(config.bg_opacity ?? 100)}
                min={0}
                max={100}
                step={5}
                onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
                sx={{ flex: 1 }}
                size="small"
              />
            </Box>
          </>
        );
      })()}

      {/* LOCATION */}
      {type === 'LOCATION' && <LocationEditor config={config} onChange={onChange} />}

      {/* CONTACT */}
      {type === 'CONTACT' && (
        <>
          {/* ── Live preview ── */}
          <ContactPreview config={config} />

          {/* ── Conteúdo ── */}
          <TextField
            label="Título da seção"
            value={String(config.title || 'Contato')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
            size="small"
          />
          <TextField
            label="WhatsApp / Telefone"
            value={String(config.phone || '')}
            onChange={(e) => onChange({ ...config, phone: e.target.value })}
            fullWidth
            size="small"
            placeholder="(11) 99999-9999"
          />
          <TextField
            label="Email de contato"
            value={String(config.email || '')}
            onChange={(e) => onChange({ ...config, email: e.target.value })}
            fullWidth
            size="small"
            placeholder="contato@terreiro.com"
          />
          <TextField
            label="Instagram (sem @)"
            value={String(config.instagram || '')}
            onChange={(e) => onChange({ ...config, instagram: e.target.value })}
            fullWidth
            size="small"
            placeholder="nomedoterreiro"
          />

          {/* ── Layout ── */}
          <Divider sx={{ borderStyle: 'dashed' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Layout</Typography>
          </Divider>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Exibir como:</Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              {([
                { value: 'cards',   label: 'Cards' },
                { value: 'list',    label: 'Lista' },
                { value: 'buttons', label: 'Botões' },
              ] as const).map((opt) => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={String(config.contact_layout || 'cards') === opt.value ? 'contained' : 'outlined'}
                  onClick={() => onChange({ ...config, contact_layout: opt.value })}
                  sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {([
                { value: 'wide',      label: 'Ampla' },
                { value: 'medium',    label: 'Média' },
                { value: 'contained', label: 'Padrão' },
              ]).map(opt => (
                <Button
                  key={opt.value}
                  size="small"
                  variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                  onClick={() => onChange({ ...config, margin_preset: opt.value })}
                  sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                >
                  {opt.label}
                </Button>
              ))}
            </Box>
          </Box>

          {/* ── Cor da fonte ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
            <Box
              component="label"
              sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.font_color || '#111111'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}
            >
              <input type="color" value={String(config.font_color || '#111111')} onChange={(e) => onChange({ ...config, font_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
            </Box>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
          </Box>

          {/* ── Fundo ── */}
          <Divider sx={{ borderStyle: 'dashed' }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
          </Divider>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
            <Box
              component="label"
              sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.bg_color || '#ffffff'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}
            >
              <input type="color" value={String(config.bg_color || '#ffffff')} onChange={(e) => onChange({ ...config, bg_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
            </Box>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#ffffff')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
              Transparência: {100 - Number(config.bg_opacity ?? 100)}%
            </Typography>
            <Slider
              value={Number(config.bg_opacity ?? 100)}
              min={0} max={100} step={5}
              onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
              sx={{ flex: 1 }} size="small"
              marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
            />
          </Box>
        </>
      )}

      {/* SPONSOR */}
      {type === 'SPONSOR' && (() => {
        const fontFamily = String(config.font_family || 'system-ui, sans-serif');
        const titleWeight = Number(config.title_font_weight || 700);
        const bodyWeight = Number(config.body_font_weight || 400);
        const fontStyle  = String(config.font_style || 'normal');
        const fontEntry  = HERO_FONTS.find(f => f.value === fontFamily);
        const fontImportUrl = fontEntry?.importUrl ?? null;
        return (
          <>
            {fontImportUrl && (
              <Head>
                <link key="sponsor-font" rel="stylesheet" href={fontImportUrl} />
              </Head>
            )}

            {/* ── Live preview ── */}
            <SponsorPreview config={config} />

            {/* ── Conteúdo ── */}
            <TextField
              label="Título da seção"
              value={String(config.title || 'Apoiadores')}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Texto introdutório"
              value={String(config.intro || '')}
              onChange={(e) => onChange({ ...config, intro: e.target.value })}
              fullWidth
              multiline
              rows={2}
              size="small"
            />

            {/* ── Margem ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([
                  { value: 'wide',      label: 'Ampla' },
                  { value: 'medium',    label: 'Média' },
                  { value: 'contained', label: 'Padrão' },
                ]).map(opt => (
                  <Button
                    key={opt.value}
                    size="small"
                    variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, margin_preset: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* ── Tipografia ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
            </Divider>

            <FormControl size="small" fullWidth>
              <InputLabel>Fonte</InputLabel>
              <Select
                value={fontFamily}
                label="Fonte"
                onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                renderValue={(v) => {
                  const entry = HERO_FONTS.find(f => f.value === v);
                  return (
                    <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>
                      {entry?.label ?? String(v)}
                    </Typography>
                  );
                }}
              >
                {HERO_FONTS.map(f => (
                  <MenuItem key={f.value} value={f.value}>
                    <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Título: tamanho + peso + estilo */}
            <Typography variant="caption" color="text.secondary">Título</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select
                  value={Number(config.title_font_size || 28)}
                  label="Tamanho"
                  onChange={(e) => onChange({ ...config, title_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_TITLE_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_TITLE_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select
                  value={titleWeight}
                  label="Peso"
                  onChange={(e) => onChange({ ...config, title_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Estilo</InputLabel>
                <Select
                  value={fontStyle}
                  label="Estilo"
                  onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                  renderValue={(v) => (
                    <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                      {v === 'italic' ? 'Itálico' : 'Normal'}
                    </Typography>
                  )}
                >
                  <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
                  <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Texto: tamanho + peso */}
            <Typography variant="caption" color="text.secondary">Texto do corpo</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select
                  value={Number(config.body_font_size || 16)}
                  label="Tamanho"
                  onChange={(e) => onChange({ ...config, body_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_BODY_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_BODY_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(s.value * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select
                  value={bodyWeight}
                  label="Peso"
                  onChange={(e) => onChange({ ...config, body_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* ── Cor da fonte ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.font_color || '#111111'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.font_color || '#111111')}
                  onChange={(e) => onChange({ ...config, font_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
            </Box>

            {/* ── Fundo ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
            </Divider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
              <Box
                component="label"
                sx={{
                  width: 32, height: 32, borderRadius: 1,
                  border: '2px solid', borderColor: 'divider',
                  background: String(config.bg_color || '#f8f8f8'),
                  cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex',
                }}
              >
                <input
                  type="color"
                  value={String(config.bg_color || '#f8f8f8')}
                  onChange={(e) => onChange({ ...config, bg_color: e.target.value })}
                  style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#f8f8f8')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
                Transparência: {100 - Number(config.bg_opacity ?? 100)}%
              </Typography>
              <Slider
                value={Number(config.bg_opacity ?? 100)}
                min={0}
                max={100}
                step={5}
                onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
                sx={{ flex: 1 }}
                size="small"
                marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
              />
            </Box>
          </>
        );
      })()}

      {/* CUSTOM_TEXT */}
      {type === 'CUSTOM_TEXT' && (() => {
        const fontFamily   = String(config.font_family       || 'system-ui, sans-serif');
        const titleWeight  = Number(config.title_font_weight || 700);
        const bodyWeight   = Number(config.body_font_weight  || 400);
        const fontStyle    = String(config.font_style        || 'normal');
        const fontEntry    = HERO_FONTS.find(f => f.value === fontFamily);
        const fontImportUrl = fontEntry?.importUrl ?? null;
        return (
          <>
            {fontImportUrl && (
              <Head>
                <link key="customtext-font" rel="stylesheet" href={fontImportUrl} />
              </Head>
            )}

            {/* ── Live preview ── */}
            <CustomTextPreview config={config} />

            {/* ── Conteúdo ── */}
            <TextField
              label="Título"
              value={String(config.title || '')}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
              fullWidth
              size="small"
            />
            <TextField
              label="Conteúdo"
              value={String(config.body || '')}
              onChange={(e) => onChange({ ...config, body: e.target.value })}
              fullWidth
              multiline
              rows={5}
              size="small"
            />

            {/* ── Margem ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Margem lateral:</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {([{ value: 'wide', label: 'Ampla' }, { value: 'medium', label: 'Média' }, { value: 'contained', label: 'Padrão' }]).map(opt => (
                  <Button key={opt.value} size="small"
                    variant={String(config.margin_preset || 'contained') === opt.value ? 'contained' : 'outlined'}
                    onClick={() => onChange({ ...config, margin_preset: opt.value })}
                    sx={{ fontSize: 11, px: 1.5, py: 0.5, minWidth: 0 }}>
                    {opt.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* ── Tipografia ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Tipografia</Typography>
            </Divider>

            <FormControl size="small" fullWidth>
              <InputLabel>Fonte</InputLabel>
              <Select value={fontFamily} label="Fonte" onChange={(e) => onChange({ ...config, font_family: e.target.value })}
                renderValue={(v) => {
                  const entry = HERO_FONTS.find(f => f.value === v);
                  return <Typography sx={{ fontFamily: v, fontSize: 14, lineHeight: '1.4' }}>{entry?.label ?? String(v)}</Typography>;
                }}
              >
                {HERO_FONTS.map(f => (
                  <MenuItem key={f.value} value={f.value}>
                    <Typography sx={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Título: tamanho + peso + estilo */}
            <Typography variant="caption" color="text.secondary">Título</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select value={Number(config.title_font_size || 28)} label="Tamanho"
                  onChange={(e) => onChange({ ...config, title_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_TITLE_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_TITLE_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle, fontSize: `${Math.round(s.value * 0.45)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select value={titleWeight} label="Peso" onChange={(e) => onChange({ ...config, title_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontStyle, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Estilo</InputLabel>
                <Select value={fontStyle} label="Estilo" onChange={(e) => onChange({ ...config, font_style: e.target.value })}
                  renderValue={(v) => (
                    <Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: String(v), fontSize: 13, lineHeight: '1.4' }}>
                      {v === 'italic' ? 'Itálico' : 'Normal'}
                    </Typography>
                  )}
                >
                  <MenuItem value="normal"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'normal', fontSize: 14 }}>Normal</Typography></MenuItem>
                  <MenuItem value="italic"><Typography sx={{ fontFamily, fontWeight: titleWeight, fontStyle: 'italic', fontSize: 14 }}>Itálico</Typography></MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* Corpo: tamanho + peso */}
            <Typography variant="caption" color="text.secondary">Texto do corpo</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <FormControl size="small">
                <InputLabel>Tamanho</InputLabel>
                <Select value={Number(config.body_font_size || 16)} label="Tamanho"
                  onChange={(e) => onChange({ ...config, body_font_size: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = SECTION_BODY_SIZES.find(s => s.value === v);
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(Number(v) * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                        <Typography variant="caption">{entry?.label}</Typography>
                      </Box>
                    );
                  }}
                >
                  {SECTION_BODY_SIZES.map(s => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontFamily, fontWeight: bodyWeight, fontStyle, fontSize: `${Math.round(s.value * 0.7)}px`, lineHeight: 1 }}>Aa</Typography>
                        </Box>
                        <Typography variant="body2">{s.label}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Peso</InputLabel>
                <Select value={bodyWeight} label="Peso" onChange={(e) => onChange({ ...config, body_font_weight: Number(e.target.value) })}
                  renderValue={(v) => {
                    const entry = HERO_FONT_WEIGHTS.find(w => w.value === v);
                    return <Typography sx={{ fontFamily, fontWeight: Number(v), fontStyle, fontSize: 13, lineHeight: '1.4' }}>{entry?.label}</Typography>;
                  }}
                >
                  {HERO_FONT_WEIGHTS.map(w => (
                    <MenuItem key={w.value} value={w.value}>
                      <Typography sx={{ fontFamily, fontWeight: w.value, fontSize: 14 }}>{w.label}</Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* ── Cor da fonte ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor da fonte:</Typography>
              <Box component="label" sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.font_color || '#111111'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
                <input type="color" value={String(config.font_color || '#111111')} onChange={(e) => onChange({ ...config, font_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.font_color || '#111111')}</Typography>
            </Box>

            {/* ── Fundo ── */}
            <Divider sx={{ borderStyle: 'dashed' }}>
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>Fundo</Typography>
            </Divider>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>Cor:</Typography>
              <Box component="label" sx={{ width: 32, height: 32, borderRadius: 1, border: '2px solid', borderColor: 'divider', background: String(config.bg_color || '#ffffff'), cursor: 'pointer', flexShrink: 0, overflow: 'hidden', display: 'flex' }}>
                <input type="color" value={String(config.bg_color || '#ffffff')} onChange={(e) => onChange({ ...config, bg_color: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0 }} />
              </Box>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>{String(config.bg_color || '#ffffff')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, minWidth: 80 }}>
                Transparência: {100 - Number(config.bg_opacity ?? 100)}%
              </Typography>
              <Slider value={Number(config.bg_opacity ?? 100)} min={0} max={100} step={5}
                onChange={(_e, v) => onChange({ ...config, bg_opacity: v as number })}
                sx={{ flex: 1 }} size="small"
                marks={[{ value: 0 }, { value: 50 }, { value: 100 }]}
              />
            </Box>
          </>
        );
      })()}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MeuSitePage() {
  const { can } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('cursos_presenciais', 'view');
  const canEdit = canGroup('cursos_presenciais', 'edit');
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Data state
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [versions, setVersions] = useState<SiteVersion[]>([]);

  // Editor state
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null); // Gap #13
  const [siteUpdatedAt, setSiteUpdatedAt] = useState<string>(''); // Gap #6

  // Mobile state
  const [mobileShowEditor, setMobileShowEditor] = useState(false);

  // UI state
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<SiteVersion | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionType, setNewSectionType] = useState('HERO');

  // Settings dialog state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSlug, setSettingsSlug] = useState('');
  const [settingsTemplate, setSettingsTemplate] = useState('moderno');
  const [settingsMetaTitle, setSettingsMetaTitle] = useState('');
  const [settingsMetaDesc, setSettingsMetaDesc] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadSite = useCallback(async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const [siteRes, sectionsRes] = await Promise.all([
        apiClient.get('/api/v1/admin/sites'),
        apiClient.get('/api/v1/admin/sites/sections'),
      ]);
      setSite(siteRes.data);
      setSections(sectionsRes.data.sections);
      setSiteUpdatedAt(sectionsRes.data.site_updated_at || siteRes.data.updated_at);
      setHasChanges(false);
      // Init settings state
      setSettingsSlug(siteRes.data.slug || '');
      setSettingsTemplate(siteRes.data.template || 'moderno');
      setSettingsMetaTitle(siteRes.data.meta_title || '');
      setSettingsMetaDesc(siteRes.data.meta_description || '');
    } catch {
      setSnack({ msg: 'Erro ao carregar site.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const loadVersions = useCallback(async () => {
    if (!canView) return;
    try {
      const res = await apiClient.get('/api/v1/admin/sites/versions');
      setVersions(res.data);
    } catch { /* non-critical */ }
  }, [canView]);

  useEffect(() => {
    if (!can('site_builder')) {
      // Feature not available — show upgrade message instead of loading
      setLoading(false);
      return;
    }
    loadSite();
  }, [can, loadSite]);

  useEffect(() => {
    if (tabIndex === 1) loadVersions();
  }, [tabIndex, loadVersions]);

  // ── Section operations ──────────────────────────────────────────────────────

  const addSection = () => {
    const newSection: Section = {
      id: `temp-${Date.now()}`,
      section_type: newSectionType,
      order_index: sections.length,
      config: {},
      _tempId: `temp-${Date.now()}`,
    };
    setSections((prev) => [...prev, newSection]);
    setSelectedSectionId(newSection.id);
    setHasChanges(true);
    setShowAddSection(false);
    if (isMobile) setMobileShowEditor(true);
  };

  const moveSection = (id: string, direction: 'up' | 'down') => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order_index: i }));
    });
    setHasChanges(true);
  };

  const deleteSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order_index: i })));
    if (selectedSectionId === id) {
      setSelectedSectionId(null);
      setMobileShowEditor(false);
    }
    setHasChanges(true);
  };

  const updateSectionConfig = (id: string, config: Record<string, unknown>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, config } : s)));
    setHasChanges(true);
  };

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  // ── Validation ──────────────────────────────────────────────────────────────

  const allErrors = sections.flatMap((s) => validateSection(s));
  const canSave = !saving && !uploadingImageFor && allErrors.length === 0;

  // ── Save ────────────────────────────────────────────────────────────────────

  // ── Settings ────────────────────────────────────────────────────────────────

  const openSettings = () => {
    if (site) {
      setSettingsSlug(site.slug || '');
      setSettingsTemplate(site.template || 'moderno');
      setSettingsMetaTitle(site.meta_title || '');
      setSettingsMetaDesc(site.meta_description || '');
    }
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    if (!settingsSlug.trim() || !canEdit) return;
    setSavingSettings(true);
    try {
      const res = await apiClient.put('/api/v1/admin/sites', {
        slug: settingsSlug.trim(),
        template: settingsTemplate,
        meta_title: settingsMetaTitle || null,
        meta_description: settingsMetaDesc || null,
      });
      setSite(res.data);
      setShowSettings(false);
      setSnack({ msg: 'Configurações salvas!', severity: 'success' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.detail || 'Erro ao salvar configurações.', severity: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Save sections ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!canSave || !canEdit) return;
    setSaving(true);
    try {
      const payload = {
        sections: sections.map((s) => ({
          section_type: s.section_type,
          config: s.config,
        })),
        site_version: siteUpdatedAt || undefined,
      };
      await apiClient.put('/api/v1/admin/sites/sections', payload);

      // Re-fetch to get real DB UUIDs (Gap #12)
      const res = await apiClient.get('/api/v1/admin/sites/sections');
      setSections(res.data.sections);
      setSiteUpdatedAt(res.data.site_updated_at);
      setHasChanges(false);
      setSelectedSectionId(null);
      setSnack({ msg: 'Rascunho salvo!', severity: 'success' });
    } catch (err: any) {
      if (err?.response?.status === 409) {
        // Optimistic lock conflict (Gap #6)
        setSnack({
          msg: 'O site foi alterado por outro usuário. Recarregue a página para ver as mudanças.',
          severity: 'warning',
        });
        return;
      }
      setSnack({ msg: err?.response?.data?.detail || 'Erro ao salvar.', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Publish / Unpublish ─────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!canEdit) return;
    try {
      await apiClient.post('/api/v1/admin/sites/publish');
      setSite((prev) => prev ? { ...prev, status: 'PUBLISHED' } : prev);
      setSnack({ msg: 'Site publicado!', severity: 'success' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.detail || 'Erro ao publicar.', severity: 'error' });
    }
  };

  const handleUnpublish = async () => {
    if (!canEdit) return;
    try {
      await apiClient.post('/api/v1/admin/sites/unpublish');
      setSite((prev) => prev ? { ...prev, status: 'UNPUBLISHED' } : prev);
      setSnack({ msg: 'Site despublicado.', severity: 'info' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.detail || 'Erro.', severity: 'error' });
    }
  };

  // ── Restore version ─────────────────────────────────────────────────────────

  const handleRestoreConfirm = async () => {
    if (!confirmRestore || !canEdit) return;
    try {
      const res = await apiClient.post(`/api/v1/admin/sites/versions/${confirmRestore.id}/restore`);
      setSections(res.data.sections);
      setSiteUpdatedAt(res.data.site_updated_at);
      setHasChanges(false);
      setConfirmRestore(null);
      setSnack({ msg: 'Versão restaurada!', severity: 'success' });
    } catch {
      setSnack({ msg: 'Erro ao restaurar versão.', severity: 'error' });
      setConfirmRestore(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!can('site_builder')) {
    return (
      <AdminLayout title="Meu Site">
        <Alert severity="warning" sx={{ mt: 4 }}>
          O Site Builder está disponível nos planos <strong>Pro</strong> e <strong>Premium</strong>.
          <Button size="small" sx={{ ml: 2 }} onClick={() => router.push('/admin/plano')}>
            Ver planos
          </Button>
        </Alert>
      </AdminLayout>
    );
  }

  if (!canView) {
    return (
      <AdminLayout title="Meu Site">
        <Alert severity="warning" sx={{ mt: 4 }}>
          Você não tem permissão para visualizar o Meu Site. Contate o administrador do sistema.
        </Alert>
      </AdminLayout>
    );
  }

  const isPublished = site?.status === 'PUBLISHED';
  const publicUrl = site ? `${window.location.origin}/${site.slug}` : '';

  return (
    <AdminLayout title="Meu Site" noPadding>
      <Head>
        <title>Meu Site | Senhas Admin</title>
      </Head>

      {/* Top bar */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ flex: 1, minWidth: 120 }}>
          Meu Site
        </Typography>

        <Chip
          label={isPublished ? 'Publicado' : site?.status === 'UNPUBLISHED' ? 'Despublicado' : 'Rascunho'}
          color={isPublished ? 'success' : 'default'}
          size="small"
        />

        {site && (
          <Tooltip title={isPublished ? publicUrl : 'Publique o site para visualizá-lo'}>
            <span>
              <IconButton
                size="small"
                disabled={!isPublished}
                onClick={() => window.open(publicUrl, '_blank')}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {canEdit && (
          <Tooltip title="Configurações do site (URL, template, meta)">
            <IconButton size="small" onClick={openSettings}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Button
          size="small"
          startIcon={<HistoryIcon />}
          onClick={() => { setTabIndex(1); setMobileShowEditor(false); }}
          variant="outlined"
        >
          Histórico
        </Button>

        {canEdit && (
          isPublished ? (
            <Button size="small" startIcon={<PublicOffIcon />} onClick={handleUnpublish} color="warning">
              Despublicar
            </Button>
          ) : (
            <Button
              size="small"
              startIcon={<PublicIcon />}
              onClick={handlePublish}
              variant="outlined"
              color="success"
              disabled={hasChanges}
            >
              Publicar
            </Button>
          )
        )}

        {canEdit && (
          <Tooltip
            title={
              uploadingImageFor
                ? 'Aguardando upload de imagem…'
                : allErrors.length > 0
                ? allErrors[0]
                : ''
            }
          >
            <span>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={!hasChanges || !canSave || loading}
                size="small"
              >
                Salvar
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {saving && <LinearProgress />}

      {loading ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
          {/* ── Section List (left panel / mobile full-width) ── */}
          {(!isMobile || !mobileShowEditor) && (
            <Box
              sx={{
                width: isMobile ? '100%' : 280,
                borderRight: isMobile ? 0 : 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <Tabs
                value={tabIndex}
                onChange={(_, v) => setTabIndex(v)}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
                variant="fullWidth"
              >
                <Tab label="Seções" />
                <Tab label="Histórico" />
              </Tabs>

              {tabIndex === 0 && (
                <>
                  <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {sections.length === 0 && (
                      <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          Nenhuma seção. Adicione a primeira.
                        </Typography>
                      </Box>
                    )}
                    <List disablePadding>
                      {sections.map((section, idx) => (
                        <SectionListItem
                          key={section.id}
                          section={section}
                          isSelected={selectedSectionId === section.id}
                          isFirst={idx === 0}
                          isLast={idx === sections.length - 1}
                          onSelect={() => {
                            setSelectedSectionId(section.id);
                            if (isMobile) setMobileShowEditor(true);
                          }}
                          onMoveUp={() => moveSection(section.id, 'up')}
                          onMoveDown={() => moveSection(section.id, 'down')}
                          onDelete={() => deleteSection(section.id)}
                        />
                      ))}
                    </List>
                  </Box>

                  <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => setShowAddSection(true)}
                      size="small"
                    >
                      Adicionar seção
                    </Button>
                  </Box>
                </>
              )}

              {tabIndex === 1 && (
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                  {versions.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Nenhuma versão salva ainda.
                      </Typography>
                    </Box>
                  ) : (
                    <List disablePadding>
                      {versions.map((v) => (
                        <ListItem
                          key={v.id}
                          disablePadding
                          secondaryAction={
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => setConfirmRestore(v)}
                            >
                              Restaurar
                            </Button>
                          }
                        >
                          <ListItemText
                            sx={{ px: 2 }}
                            primary={v.label || new Date(v.created_at).toLocaleString('pt-BR')}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ── Section Editor (right panel / mobile overlay) ── */}
          {(!isMobile || mobileShowEditor) && (
            <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'grey.50' }}>
              {isMobile && (
                <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                  <Button
                    startIcon={<ArrowBackIcon />}
                    size="small"
                    onClick={() => {
                      setMobileShowEditor(false);
                      setSelectedSectionId(null);
                    }}
                  >
                    Seções
                  </Button>
                </Box>
              )}
              {selectedSection ? (
                <SectionEditor
                  section={selectedSection}
                  onChange={(config) => updateSectionConfig(selectedSection.id, config)}
                  onUploadStart={(id) => setUploadingImageFor(id)}
                  onUploadEnd={() => setUploadingImageFor(null)}
                  siteId={site?.id ?? ''}
                />
              ) : (
                <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
                  <Typography variant="body1">
                    {isMobile ? '' : 'Selecione uma seção na lista à esquerda para editá-la.'}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* Add Section Dialog */}
      <Dialog open={showAddSection} onClose={() => setShowAddSection(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Adicionar seção</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Tipo de seção</InputLabel>
            <Select
              value={newSectionType}
              label="Tipo de seção"
              onChange={(e) => setNewSectionType(e.target.value)}
            >
              {SECTION_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddSection(false)}>Cancelar</Button>
          <Button variant="contained" onClick={addSection}>
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore confirmation dialog — required before restoring (Gap #15) */}
      <Dialog open={!!confirmRestore} onClose={() => setConfirmRestore(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Restaurar versão</DialogTitle>
        <DialogContent>
          {hasChanges && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Você tem alterações não salvas. Restaurar esta versão vai descartá-las permanentemente.
            </Alert>
          )}
          <Typography variant="body2">
            Restaurar a versão de{' '}
            <strong>
              {confirmRestore
                ? new Date(confirmRestore.created_at).toLocaleString('pt-BR')
                : ''}
            </strong>
            ? As seções atuais serão substituídas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRestore(null)}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={handleRestoreConfirm}>
            Restaurar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configurações do Site</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="URL do site (slug) *"
            value={settingsSlug}
            onChange={(e) => setSettingsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            fullWidth
            helperText={`Seu site ficará em: ${typeof window !== 'undefined' ? window.location.origin : ''}/` + (settingsSlug || '...')}
            inputProps={{ maxLength: 100 }}
          />
          <FormControl fullWidth>
            <InputLabel>Template</InputLabel>
            <Select
              value={settingsTemplate}
              label="Template"
              onChange={(e) => setSettingsTemplate(e.target.value)}
            >
              <MenuItem value="moderno">Moderno</MenuItem>
              <MenuItem value="classico">Clássico</MenuItem>
              <MenuItem value="minimal">Minimalista</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Título da página (SEO)"
            value={settingsMetaTitle}
            onChange={(e) => setSettingsMetaTitle(e.target.value)}
            fullWidth
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Descrição (SEO)"
            value={settingsMetaDesc}
            onChange={(e) => setSettingsMetaDesc(e.target.value)}
            fullWidth
            multiline
            rows={2}
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            disabled={savingSettings || !settingsSlug.trim()}
            startIcon={savingSettings ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={snack?.severity === 'warning' ? 8000 : 4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled">
            {snack.msg}
            {snack.severity === 'warning' && (
              <Button
                size="small"
                color="inherit"
                sx={{ ml: 2 }}
                onClick={() => { setSnack(null); loadSite(); }}
              >
                Recarregar
              </Button>
            )}
          </Alert>
        ) : <div />}
      </Snackbar>
    </AdminLayout>
  );
}
