/**
 * Admin Médiuns e Cambones — CRUD drawer com busca de CEP via ViaCEP.
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import UpgradePrompt from '../../components/UpgradePrompt';
import { apiClient } from '../../services/api_client';
import CrudDrawer from '../../components/CrudDrawer';

// ── Phone mask helpers ───────────────────────────────────────────────

/** Apply (XX) XXXXX-XXXX or (XX) XXXX-XXXX mask to a raw digit string. */
function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  // 11 digits — mobile
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Strip mask — keep only digits. */
function unmaskedPhone(masked: string): string {
  return masked.replace(/\D/g, '');
}

// ── Types ─────────────────────────────────────────────────────────────

interface Medium {
  id: string;
  nome: string;
  is_atendimento: boolean;
  is_active: boolean;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  observacoes?: string | null;
  created_at: string;
}

interface FormData {
  nome: string;
  is_atendimento: boolean;
  is_active: boolean;
  telefone: string;
  email: string;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  observacoes: string;
}

const EMPTY_FORM: FormData = {
  nome: '',
  is_atendimento: false,
  is_active: true,
  telefone: '',
  email: '',
  data_nascimento: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  observacoes: '',
};

// ── Usage progress bar ──────────────────────────────────────────────────

function MediunsUsageBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const atLimit = used >= max;
  return (
    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: atLimit ? 'warning.main' : 'divider' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
        <Typography variant="body2" fontWeight={600} color="text.secondary">
          Médiuns cadastrados
        </Typography>
        <Typography variant="body2" fontWeight={700} color={atLimit ? 'warning.main' : 'text.primary'}>
          {used} / {max}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 8,
          borderRadius: 4,
          bgcolor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            bgcolor: atLimit ? 'warning.main' : pct >= 80 ? 'warning.light' : 'primary.main',
          },
        }}
      />
      {atLimit && (
        <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
          Limite de médiuns atingido.{' '}
          <a href="/admin/plano" style={{ fontWeight: 600, color: 'inherit' }}>Faça upgrade</a> para cadastrar mais.
        </Typography>
      )}
    </Box>
  );
}

// ── Section label helper ───────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={600}
        sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
      >
        {label}
      </Typography>
      <Divider sx={{ mt: 0.5, mb: 1 }} />
    </Box>
  );
}

// ── Page wrapper ───────────────────────────────────────────────────────

export default function AdminMediunsPage() {
  return (
    <AdminLayout title="Médiuns e Cambones">
      <MediunsContent />
    </AdminLayout>
  );
}

// ── Content ────────────────────────────────────────────────────────────

function MediunsContent() {
  const { can, loading: subLoading, subscription, canCreateMedium: canCreateMediumFn } = useSubscription();

  const [mediuns, setMediuns] = useState<Medium[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Birthday data: Map of medium id -> dias_ate_aniversario
  const [birthdayMap, setBirthdayMap] = useState<Map<string, number>>(new Map());
  const [filterAniversariantes, setFilterAniversariantes] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [currentItem, setCurrentItem] = useState<Medium | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [originalData, setOriginalData] = useState<FormData>(EMPTY_FORM);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // CEP lookup
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const numeroRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Medium | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (includeInactive) params.append('include_inactive', 'true');
      const res = await apiClient.get<Medium[]>(`/api/v1/admin/mediuns?${params}`);
      setMediuns(res.data);
    } catch {
      showSnackbar('Erro ao carregar médiuns', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetch birthday data — separate, non-blocking
  useEffect(() => {
    if (subLoading || !can('mediuns')) return;
    apiClient
      .get<{ id: string; dias_ate_aniversario: number }[]>(
        '/api/v1/admin/mediuns/aniversariantes?dias=7'
      )
      .then((res) => {
        const entries = Array.isArray(res.data) ? res.data : [];
        setBirthdayMap(new Map(entries.map((e) => [e.id, e.dias_ate_aniversario])));
      })
      .catch(() => { /* non-critical */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subLoading]);

  // ── CEP lookup ──────────────────────────────────────────────────────

  const lookupCep = async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepError(digits.length > 0 ? 'CEP deve ter 8 dígitos' : '');
      return;
    }
    setCepError('');
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const json = await resp.json();
      if (json.erro) {
        setCepError('CEP não encontrado');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        cep: digits,
        logradouro: json.logradouro || '',
        bairro: json.bairro || '',
        cidade: json.localidade || '',
      }));
      // Move focus to Número so user fills it right away
      setTimeout(() => numeroRef.current?.focus(), 50);
    } catch {
      setCepError('Erro ao consultar CEP. Verifique sua conexão.');
    } finally {
      setCepLoading(false);
    }
  };

  const handleCepChange = (value: string) => {
    // Allow only digits and hyphens, max 9 chars (12345-678)
    const cleaned = value.replace(/[^\d-]/g, '').slice(0, 9);
    setFormData((prev) => ({ ...prev, cep: cleaned }));
    setCepError('');
  };

  const handleCepBlur = () => {
    if (formData.cep) lookupCep(formData.cep);
  };

  // ── Drawer helpers ──────────────────────────────────────────────────

  const toForm = (m: Medium): FormData => ({
    nome: m.nome,
    is_atendimento: m.is_atendimento,
    is_active: m.is_active,
    telefone: m.telefone ? maskPhone(m.telefone) : '',
    email: m.email ?? '',
    data_nascimento: m.data_nascimento ?? '',
    cep: m.cep ?? '',
    logradouro: m.logradouro ?? '',
    numero: m.numero ?? '',
    bairro: m.bairro ?? '',
    cidade: m.cidade ?? '',
    observacoes: m.observacoes ?? '',
  });

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setOriginalData(EMPTY_FORM);
    setCurrentItem(null);
    setTouched({});
    setCepError('');
    setDrawerMode('create');
    setDrawerOpen(true);
  };

  const openEdit = (m: Medium) => {
    const f = toForm(m);
    setFormData(f);
    setOriginalData(f);
    setCurrentItem(m);
    setTouched({});
    setCepError('');
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setCurrentItem(null);
    setFormData(EMPTY_FORM);
    setTouched({});
    setCepError('');
  };

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const isDirty =
    drawerMode === 'create'
      ? Object.entries(formData).some(([k, v]) => {
          const emptyVal = EMPTY_FORM[k as keyof FormData];
          return v !== emptyVal;
        })
      : JSON.stringify(formData) !== JSON.stringify(originalData);

  const nomeError = touched.nome && !formData.nome.trim() ? 'Nome é obrigatório' : '';
  const saveDisabled = !formData.nome.trim();

  // ── Save ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setTouched((p) => ({ ...p, nome: true }));
    if (saveDisabled) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: formData.nome.trim(),
        is_atendimento: formData.is_atendimento,
        telefone: unmaskedPhone(formData.telefone) || null,
        email: formData.email.trim() || null,
        data_nascimento: formData.data_nascimento || null,
        cep: formData.cep.replace(/\D/g, '') || null,
        logradouro: formData.logradouro.trim() || null,
        numero: formData.numero.trim() || null,
        bairro: formData.bairro.trim() || null,
        cidade: formData.cidade.trim() || null,
        observacoes: formData.observacoes.trim() || null,
      };

      if (drawerMode === 'create') {
        await apiClient.post('/api/v1/admin/mediuns', payload);
        showSnackbar('Médium criado com sucesso!', 'success');
      } else if (currentItem) {
        await apiClient.patch(`/api/v1/admin/mediuns/${currentItem.id}`, {
          ...payload,
          is_active: formData.is_active,
        });
        showSnackbar('Médium atualizado com sucesso!', 'success');
      }
      closeDrawer();
      load();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: unknown } } };
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Erro ao salvar médium';
      showSnackbar(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────

  const handleDeleteClick = (m: Medium) => {
    setDeleteTarget(m);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/api/v1/admin/mediuns/${deleteTarget.id}`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      showSnackbar('Médium removido com sucesso!', 'success');
      load();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: unknown } } };
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Erro ao remover médium';
      showSnackbar(msg, 'error');
    }
  };

  // ── Plan gate ───────────────────────────────────────────────────────

  if (!subLoading && !can('mediuns')) {
    return <UpgradePrompt feature="Médiuns e Cambones" minPlan="Basic" />;
  }

  // canCreate uses server-side current_mediuns count to avoid false allows when search is filtering the list
  const canCreate = canCreateMediumFn(subscription?.current_mediuns ?? mediuns.length);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <>
      <Box data-tour="mediuns-header" sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            mb: 2,
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 1.5, sm: 0 },
          }}
        >
          <Typography variant="h5" fontWeight={700}>
            Médiuns e Cambones
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Incluir inativos</Typography>}
            />
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
              Atualizar
            </Button>
            <Tooltip
              title={
                !canCreate
                  ? `Limite de ${subscription?.max_mediuns ?? 0} médium(ns) atingido. Faça upgrade do plano.`
                  : ''
              }
            >
              <span>
                <Button
                  data-tour="mediuns-novo"
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={openCreate}
                  disabled={!canCreate}
                >
                  Novo
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        <TextField
          data-tour="mediuns-busca"
          size="small"
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: '100%', sm: 320 } }}
        />
        {birthdayMap.size > 0 && (
          <Chip
            icon={<span style={{ fontSize: 14 }}>🎂</span>}
            label={`${birthdayMap.size} aniversariante${birthdayMap.size > 1 ? 's' : ''}`}
            size="small"
            color={filterAniversariantes ? 'error' : 'default'}
            variant={filterAniversariantes ? 'filled' : 'outlined'}
            onClick={() => setFilterAniversariantes((prev) => !prev)}
            sx={{ fontWeight: 600, cursor: 'pointer' }}
          />
        )}
      </Box>

      {/* Médium quota progress bar — only shown when plan has a finite limit */}
      {subscription && (subscription.max_mediuns ?? 0) > 0 && (subscription.max_mediuns ?? 0) < 999999 && (
        <Box data-tour="mediuns-usage" sx={{ mb: 2 }}>
          <MediunsUsageBar used={subscription.current_mediuns ?? 0} max={subscription.max_mediuns} />
        </Box>
      )}

      <TableContainer data-tour="mediuns-tabela" component={Paper} sx={{ overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : mediuns.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Nenhum médium cadastrado. Clique em &quot;Novo&quot; para começar.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Telefone</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Cidade</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {mediuns
                .filter((m) => !filterAniversariantes || birthdayMap.has(m.id))
                .map((m) => {
                const diasAte = birthdayMap.get(m.id);
                const birthdayLabel =
                  diasAte === 0 ? '🎂 Hoje' :
                  diasAte === 1 ? '🎂 Amanhã' :
                  diasAte !== undefined ? `🎂 Em ${diasAte}d` : null;
                return (
                <TableRow
                  key={m.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => openEdit(m)}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography variant="body2" fontWeight={500}>
                        {m.nome}
                      </Typography>
                      {birthdayLabel && (
                        <Chip
                          label={birthdayLabel}
                          size="small"
                          color={diasAte === 0 ? 'error' : 'default'}
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                      )}
                    </Box>
                    {m.email && (
                      <Typography variant="caption" color="text.secondary">
                        {m.email}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {m.telefone ? maskPhone(m.telefone) : '—'}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {m.cidade || '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={m.is_atendimento ? 'Médium' : 'Cambone'}
                      size="small"
                      color={m.is_atendimento ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={m.is_active ? 'Ativo' : 'Inativo'}
                      size="small"
                      color={m.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Remover">
                      <IconButton size="small" onClick={() => handleDeleteClick(m)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* Create / Edit Drawer */}
      <CrudDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === 'create' ? 'Novo Médium / Cambone' : 'Editar Médium / Cambone'}
        subtitle={
          drawerMode === 'create'
            ? 'Cadastre um novo integrante da corrente.'
            : 'Altere as informações do integrante selecionado.'
        }
        icon={<SelfImprovementIcon />}
        onSave={handleSave}
        saveLabel={drawerMode === 'create' ? 'Criar' : 'Salvar'}
        saving={saving}
        saveDisabled={saveDisabled}
        isDirty={isDirty}
      >
        {/* ── Função na corrente ── */}
        <SectionLabel label="Função na corrente" />

        <TextField
          label="Nome"
          value={formData.nome}
          onChange={(e) => handleChange('nome', e.target.value)}
          onBlur={() => setTouched((p) => ({ ...p, nome: true }))}
          fullWidth
          required
          error={!!nomeError}
          helperText={nomeError}
        />

        <FormControlLabel
          control={
            <Switch
              checked={formData.is_atendimento}
              onChange={(e) => handleChange('is_atendimento', e.target.checked)}
            />
          }
          label="Médium de atendimento"
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1, display: 'block' }}>
          Desativado = Cambone (assistente sem atendimento direto)
        </Typography>

        {drawerMode === 'edit' && (
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
              />
            }
            label="Ativo"
          />
        )}

        {/* ── Contato ── */}
        <SectionLabel label="Contato" />

        <TextField
          label="Telefone"
          value={formData.telefone}
          onChange={(e) => handleChange('telefone', maskPhone(e.target.value))}
          fullWidth
          inputProps={{ maxLength: 15, placeholder: '(DDD) 99999-9999' }}
          helperText="Opcional"
        />

        <TextField
          label="E-mail"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          fullWidth
          helperText="Opcional"
        />

        {/* ── Dados pessoais ── */}
        <SectionLabel label="Dados pessoais" />

        <TextField
          label="Data de nascimento"
          type="date"
          value={formData.data_nascimento}
          onChange={(e) => handleChange('data_nascimento', e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
          helperText="Opcional"
        />

        {/* ── Endereço ── */}
        <SectionLabel label="Endereço" />

        {/* CEP — busca automática ao sair do campo */}
        <TextField
          label="CEP"
          value={formData.cep}
          onChange={(e) => handleCepChange(e.target.value)}
          onBlur={handleCepBlur}
          fullWidth
          error={!!cepError}
          helperText={cepError || 'Digite o CEP e aguarde o preenchimento automático'}
          inputProps={{ maxLength: 9, placeholder: '00000-000' }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {cepLoading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Tooltip title="Buscar CEP">
                    <IconButton
                      size="small"
                      onClick={() => lookupCep(formData.cep)}
                      disabled={cepLoading}
                    >
                      <SearchIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1.5 }}>
          <TextField
            label="Logradouro"
            value={formData.logradouro}
            onChange={(e) => handleChange('logradouro', e.target.value)}
            fullWidth
            helperText="Preenchido automaticamente pelo CEP"
          />
          <TextField
            label="Número"
            value={formData.numero}
            onChange={(e) => handleChange('numero', e.target.value)}
            inputRef={numeroRef}
            sx={{ width: 100 }}
            inputProps={{ maxLength: 20 }}
          />
        </Box>

        <TextField
          label="Bairro"
          value={formData.bairro}
          onChange={(e) => handleChange('bairro', e.target.value)}
          fullWidth
          helperText="Preenchido automaticamente pelo CEP"
        />

        <TextField
          label="Cidade"
          value={formData.cidade}
          onChange={(e) => handleChange('cidade', e.target.value)}
          fullWidth
          helperText="Preenchida automaticamente pelo CEP"
        />

        {/* ── Observações ── */}
        <SectionLabel label="Observações" />

        <TextField
          label="Observações"
          value={formData.observacoes}
          onChange={(e) => handleChange('observacoes', e.target.value)}
          fullWidth
          multiline
          minRows={3}
          helperText="Informações adicionais sobre o integrante"
        />
      </CrudDrawer>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Confirmar Remoção</DialogTitle>
        <DialogContent>
          Deseja realmente remover <strong>{deleteTarget?.nome}</strong>? Esta ação não pode ser desfeita.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Remover
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
