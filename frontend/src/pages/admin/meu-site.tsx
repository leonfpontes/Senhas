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
  Fab,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
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
import CheckIcon from '@mui/icons-material/Check';
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
import { HERO_FONTS, HERO_FONT_SIZES, HERO_FONT_WEIGHTS } from '@/constants/heroFonts';

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
  const [scale, setScale] = useState(0.33);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, posX: 50, posY: 50 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.offsetWidth / 1200);
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
  const subtitleSize = Math.max(16, Math.round(fontSize * 0.6));
  const posX = Number(config.bg_position_x ?? 50);
  const posY = Number(config.bg_position_y ?? 50);

  const isImageMode = bgType === 'image' && !!bgUrl;
  const isDraggable = isImageMode && !!onPositionChange;

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

  const containerHeight = Math.round(380 * scale);

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
    // Drag left → image moves left → x increases (revealing more right side)
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
        height: `${containerHeight}px`,
        overflow: 'hidden',
        borderRadius: 2,
        boxShadow: 2,
        position: 'relative',
        flexShrink: 0,
        cursor: isDraggable ? (isDragging ? 'grabbing' : 'grab') : 'default',
        userSelect: 'none',
      }}
    >
      {/* Inner box: real site dimensions scaled down */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1200px',
          minHeight: '380px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '48px',
          background,
          color: '#fff',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {bgType === 'image' && !bgUrl && (
          <Typography sx={{ opacity: 0.55, position: 'absolute', top: 12, right: 12, fontSize: 14 }}>
            sem imagem
          </Typography>
        )}
        <Typography
          sx={{
            fontFamily,
            fontWeight,
            fontStyle,
            fontSize: `${fontSize}px`,
            lineHeight: 1.2,
            textShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          {String(config.title || 'Título da página')}
        </Typography>
        {config.subtitle && (
          <Typography
            sx={{
              fontFamily,
              fontStyle,
              fontWeight: 400,
              fontSize: `${subtitleSize}px`,
              opacity: 0.9,
              mt: '16px',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}
          >
            {String(config.subtitle)}
          </Typography>
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

// ── Section Editor panel ──────────────────────────────────────────────────────

function SectionEditor({
  section,
  onChange,
  onUploadStart,
  onUploadEnd,
  siteId,
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
      const token =
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('access_token')) ||
        localStorage.getItem('access_token');

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${origin}/api/v1/admin/sites/images`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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
          <TextField
            label="Título da seção"
            value={String(config.title || '')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
          />
          <TextField
            label="Texto"
            value={String(config.body || '')}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
            fullWidth
            multiline
            rows={5}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">Imagem lateral</Typography>
            <Button
              component="label"
              variant="outlined"
              size="small"
              sx={{ ml: 1 }}
              disabled={uploading}
            >
              {uploading ? 'Enviando…' : 'Escolher imagem'}
              <input type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'image')} />
            </Button>
            {config.image_url && (
              <Box component="img" src={String(config.image_url)} sx={{ mt: 1, maxHeight: 80, borderRadius: 1 }} />
            )}
          </Box>
        </>
      )}

      {/* VIDEO_EMBED */}
      {type === 'VIDEO_EMBED' && (
        <>
          <TextField
            label="URL do YouTube"
            value={String(config.youtube_url || '')}
            onChange={(e) => onChange({ ...config, youtube_url: e.target.value })}
            fullWidth
            placeholder="https://www.youtube.com/watch?v=..."
            helperText="Cole o link do YouTube. O embed será gerado automaticamente."
          />
          <TextField
            label="Título / legenda"
            value={String(config.caption || '')}
            onChange={(e) => onChange({ ...config, caption: e.target.value })}
            fullWidth
          />
        </>
      )}

      {/* GIRAS_CALENDAR */}
      {type === 'GIRAS_CALENDAR' && (
        <>
          <TextField
            label="Título da seção"
            value={String(config.title || 'Próximas Giras')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
          />
          <Alert severity="info" variant="outlined">
            As próximas giras do terreiro serão listadas automaticamente.
          </Alert>
        </>
      )}

      {/* LOCATION */}
      {type === 'LOCATION' && (
        <>
          <TextField
            label="Endereço"
            value={String(config.address || '')}
            onChange={(e) => onChange({ ...config, address: e.target.value })}
            fullWidth
            helperText="Se deixado em branco, usa o endereço das Configurações do terreiro."
          />
          <TextField
            label="Instruções adicionais"
            value={String(config.instructions || '')}
            onChange={(e) => onChange({ ...config, instructions: e.target.value })}
            fullWidth
            multiline
            rows={3}
          />
        </>
      )}

      {/* CONTACT */}
      {type === 'CONTACT' && (
        <>
          <TextField
            label="WhatsApp / Telefone"
            value={String(config.phone || '')}
            onChange={(e) => onChange({ ...config, phone: e.target.value })}
            fullWidth
          />
          <TextField
            label="Email de contato"
            value={String(config.email || '')}
            onChange={(e) => onChange({ ...config, email: e.target.value })}
            fullWidth
          />
          <TextField
            label="Instagram (@ sem link)"
            value={String(config.instagram || '')}
            onChange={(e) => onChange({ ...config, instagram: e.target.value })}
            fullWidth
          />
        </>
      )}

      {/* SPONSOR */}
      {type === 'SPONSOR' && (
        <>
          <TextField
            label="Título da seção"
            value={String(config.title || 'Apoiadores')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
          />
          <TextField
            label="Texto introdutório"
            value={String(config.intro || '')}
            onChange={(e) => onChange({ ...config, intro: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
        </>
      )}

      {/* CUSTOM_TEXT */}
      {type === 'CUSTOM_TEXT' && (
        <>
          <TextField
            label="Título"
            value={String(config.title || '')}
            onChange={(e) => onChange({ ...config, title: e.target.value })}
            fullWidth
          />
          <TextField
            label="Conteúdo"
            value={String(config.body || '')}
            onChange={(e) => onChange({ ...config, body: e.target.value })}
            fullWidth
            multiline
            rows={6}
          />
        </>
      )}
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MeuSitePage() {
  const { can } = useSubscription();
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
  const [showVersionDialog, setShowVersionDialog] = useState(false);
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
    } catch (err: any) {
      setSnack({ msg: 'Erro ao carregar site.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/v1/admin/sites/versions');
      setVersions(res.data);
    } catch {}
  }, []);

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
    if (!settingsSlug.trim()) return;
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
    if (!canSave) return;
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
    try {
      await apiClient.post('/api/v1/admin/sites/publish');
      setSite((prev) => prev ? { ...prev, status: 'PUBLISHED' } : prev);
      setSnack({ msg: 'Site publicado!', severity: 'success' });
    } catch (err: any) {
      setSnack({ msg: err?.response?.data?.detail || 'Erro ao publicar.', severity: 'error' });
    }
  };

  const handleUnpublish = async () => {
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
    if (!confirmRestore) return;
    try {
      const res = await apiClient.post(`/api/v1/admin/sites/versions/${confirmRestore.id}/restore`);
      setSections(res.data.sections);
      setSiteUpdatedAt(res.data.site_updated_at);
      setHasChanges(false);
      setConfirmRestore(null);
      setShowVersionDialog(false);
      setSnack({ msg: 'Versão restaurada!', severity: 'success' });
    } catch (err: any) {
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

        <Tooltip title="Configurações do site (URL, template, meta)">
          <IconButton size="small" onClick={openSettings}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Button
          size="small"
          startIcon={<HistoryIcon />}
          onClick={() => setShowVersionDialog(true)}
          variant="outlined"
        >
          Histórico
        </Button>

        {isPublished ? (
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
        )}

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
