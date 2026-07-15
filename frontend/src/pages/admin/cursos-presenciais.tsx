import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Button,
  TextField,
  Checkbox,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import PeopleIcon from "@mui/icons-material/People";
import SchoolIcon from "@mui/icons-material/School";
import LinkIcon from "@mui/icons-material/Link";

import AdminLayout from "./admin_layout";
import CrudDrawer from "../../components/CrudDrawer";
import { apiClient } from "../../services/api_client";
import { useSubscription } from "../../hooks/useSubscription";
import { usePermissions } from "../../hooks/usePermissions";
import UpgradePrompt from "../../components/UpgradePrompt";
import { ConfirmDialog } from '@/components/admin';

interface CursoPresencial {
  id: string;
  tenant_id: string;
  titulo: string;
  ementa?: string;
  data_inicio: string; // ISO string
  data_fim?: string | null;
  max_participantes?: number | null;
  valor_mensalidade_padrao?: number | null;
  local?: string | null;
  observacoes?: string | null;
  is_active: boolean;
  gerar_mensalidade: boolean;
  tipo_formulario: string;
  chave_pix?: string | null;
}

const API_PREFIX = "/api/v1/admin/cursos-presenciais";

const isoToLocalDatetimeInput = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CursosPresenciaisPage = () => {
  const router = useRouter();
  const { subscription, loading: subLoading } = useSubscription();
  const { can: canGroup } = usePermissions();
  const canView = canGroup('cursos_presenciais', 'view');
  const canInsert = canGroup('cursos_presenciais', 'insert');
  const canEdit = canGroup('cursos_presenciais', 'edit');
  const canDelete = canGroup('cursos_presenciais', 'delete');

  const [cursos, setCursos] = useState<CursoPresencial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkSnack, setLinkSnack] = useState<{ open: boolean; message: string }>({ open: false, message: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setCursoConfirmTarget] = useState<CursoPresencial | null>(null);
  const [formData, setFormData] = useState<Partial<CursoPresencial>>({
    titulo: "",
    data_inicio: isoToLocalDatetimeInput(new Date().toISOString()),
    is_active: true,
    gerar_mensalidade: false,
  });

  const fetchCursos = async () => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiClient.get<CursoPresencial[]>(API_PREFIX);
      setCursos(res.data);
    } catch (err) {
      console.error("Erro ao buscar cursos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subscription?.plan === "pro" || subscription?.plan === "premium") {
      fetchCursos();
    }
    // fetchCursos isn't memoized — including it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription, canView]);

  const openCreateDrawer = () => {
    setDrawerMode("create");
    setEditingId(null);
    setFormData({
      titulo: "",
      ementa: "",
      data_inicio: isoToLocalDatetimeInput(new Date().toISOString()),
      data_fim: "",
      max_participantes: undefined,
      valor_mensalidade_padrao: undefined,
      local: "",
      observacoes: "",
      is_active: true,
      gerar_mensalidade: false,
      tipo_formulario: "simples",
      chave_pix: "",
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (curso: CursoPresencial) => {
    setDrawerMode("edit");
    setEditingId(curso.id);
    setFormData({
      ...curso,
      data_inicio: isoToLocalDatetimeInput(curso.data_inicio),
      data_fim: curso.data_fim ? isoToLocalDatetimeInput(curso.data_fim) : "",
    });
    setDrawerOpen(true);
  };

  const requestDelete = (curso: CursoPresencial) => {
    setCursoConfirmTarget(curso);
    setConfirmOpen(true);
  };

  const handleDeleteCurso = async () => {
    if (!confirmTarget || !canDelete) return;
    try {
      await apiClient.delete(`${API_PREFIX}/${confirmTarget.id}`);
      fetchCursos();
    } catch (err) {
      console.error("Erro ao excluir curso:", err);
    } finally {
      setConfirmOpen(false);
      setCursoConfirmTarget(null);
    }
  };

  const handleCopyLink = (curso: CursoPresencial) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/public/cursos/${curso.id}/inscricao`;
    navigator.clipboard.writeText(link).then(
      () => setLinkSnack({ open: true, message: "Link copiado!" }),
      () => setLinkSnack({ open: true, message: `Link: ${link}` })
    );
  };

  const handleSave = async () => {
    if (drawerMode === 'create' && !canInsert) return;
    if (drawerMode === 'edit' && !canEdit) return;
    setSaving(true);
    const payload = {
      titulo: formData.titulo,
      ementa: formData.ementa || null,
      data_inicio: formData.data_inicio
        ? new Date(formData.data_inicio).toISOString()
        : null,
      data_fim: formData.data_fim
        ? new Date(formData.data_fim).toISOString()
        : null,
      max_participantes: formData.max_participantes || null,
      valor_mensalidade_padrao: formData.valor_mensalidade_padrao || null,
      local: formData.local || null,
      observacoes: formData.observacoes || null,
      is_active: formData.is_active,
      gerar_mensalidade: formData.gerar_mensalidade ?? false,
      tipo_formulario: formData.tipo_formulario || "simples",
      chave_pix: formData.chave_pix || null,
    };

    try {
      if (drawerMode === "create") {
        await apiClient.post(API_PREFIX, payload);
      } else if (editingId) {
        await apiClient.put(`${API_PREFIX}/${editingId}`, payload);
      }
      setDrawerOpen(false);
      fetchCursos();
    } catch (err) {
      console.error("Erro ao salvar curso:", err);
    } finally {
      setSaving(false);
    }
  };

  const isPlanAllowed = subscription?.plan === "pro" || subscription?.plan === "premium";

  if (subLoading) {
    return (
      <AdminLayout title="Cursos presenciais">
        <Stack alignItems="center" mt={8}>
          <CircularProgress />
        </Stack>
      </AdminLayout>
    );
  }

  if (!isPlanAllowed) {
    return (
      <AdminLayout title="Cursos presenciais">
        <UpgradePrompt feature="Cursos Presenciais" minPlan="Pro" />
      </AdminLayout>
    );
  }

  if (!canView) {
    return (
      <AdminLayout title="Cursos presenciais">
        <Alert severity="warning" sx={{ mt: 2 }}>
          Você não tem permissão para visualizar cursos presenciais. Contate o administrador do sistema.
        </Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Cursos presenciais">
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" fontWeight={700}>Cursos Presenciais</Typography>
          {canInsert && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreateDrawer}
              size="small"
            >
              Novo curso
            </Button>
          )}
        </Stack>
      </Box>

      {loading ? (
        <Stack alignItems="center" mt={4}>
          <CircularProgress />
        </Stack>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Título</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Início</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Fim</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Local</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Limite</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Mensalidade</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Formulário</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cursos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: "text.secondary" }}>
                    Nenhum curso cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                cursos.map((curso) => (
                  <TableRow key={curso.id} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{curso.titulo}</TableCell>
                    <TableCell>
                      {curso.data_inicio
                        ? new Date(curso.data_inicio).toLocaleString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {curso.data_fim
                        ? new Date(curso.data_fim).toLocaleString("pt-BR")
                        : "-"}
                    </TableCell>
                    <TableCell>{curso.local || "-"}</TableCell>
                    <TableCell>{curso.max_participantes ?? "-"}</TableCell>
                    <TableCell>
                      {curso.valor_mensalidade_padrao !== null && curso.valor_mensalidade_padrao !== undefined
                        ? `R$ ${Number(curso.valor_mensalidade_padrao).toFixed(2).replace(".", ",")}`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={curso.tipo_formulario === "completo" ? "Completo" : "Simples"}
                        size="small"
                        color={curso.tipo_formulario === "completo" ? "primary" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box
                        sx={{
                          display: "inline-block",
                          px: 2,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: curso.is_active ? "#c8e6c9" : "#ffcdd2",
                          color: curso.is_active ? "#2e7d32" : "#c62828",
                          fontSize: "0.875rem",
                          fontWeight: 500,
                        }}
                      >
                        {curso.is_active ? "Ativo" : "Inativo"}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="Link Público de Inscrição">
                          <IconButton
                            size="small"
                            color="info"
                            onClick={() => handleCopyLink(curso)}
                          >
                            <LinkIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Gerenciar Participantes">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => router.push(`/admin/cursos-presenciais/${curso.id}/participantes`)}
                          >
                            <PeopleIcon />
                          </IconButton>
                        </Tooltip>
                        {canEdit && (
                          <Tooltip title="Editar">
                            <IconButton
                              size="small"
                              onClick={() => openEditDrawer(curso)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDelete && (
                          <Tooltip title="Excluir">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => requestDelete(curso)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CrudDrawer
        title={drawerMode === "create" ? "Novo curso" : "Editar curso"}
        subtitle={
          drawerMode === "create"
            ? "Cadastre um novo curso presencial para o seu terreiro."
            : "Altere as informações do curso presencial selecionado."
        }
        icon={<SchoolIcon />}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        saving={saving}
        saveDisabled={!formData.titulo || !formData.data_inicio}
      >
        <Stack spacing={2} mt={1}>
          <TextField
            label="Título"
            required
            fullWidth
            value={formData.titulo || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, titulo: e.target.value }))
            }
          />
          <TextField
            label="Ementa"
            multiline
            rows={3}
            fullWidth
            value={formData.ementa || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, ementa: e.target.value }))
            }
          />
          <TextField
            label="Data de início"
            type="datetime-local"
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={formData.data_inicio || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, data_inicio: e.target.value }))
            }
          />
          <TextField
            label="Data de término"
            type="datetime-local"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={formData.data_fim || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, data_fim: e.target.value }))
            }
          />
          <TextField
            label="Limite de participantes"
            type="number"
            fullWidth
            value={formData.max_participantes ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                max_participantes: e.target.value
                  ? parseInt(e.target.value)
                  : undefined,
              }))
            }
          />
          <TextField
            label="Valor mensalidade padrão (R$)"
            type="number"
            fullWidth
            value={formData.valor_mensalidade_padrao ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                valor_mensalidade_padrao: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              }))
            }
          />
          <TextField
            label="Chave PIX para Inscrição/Matrícula"
            fullWidth
            value={formData.chave_pix || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, chave_pix: e.target.value }))
            }
          />
          <TextField
            label="Local"
            fullWidth
            value={formData.local || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, local: e.target.value }))
            }
          />
          <TextField
            label="Observações"
            multiline
            rows={3}
            fullWidth
            value={formData.observacoes || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, observacoes: e.target.value }))
            }
          />
          <FormControl fullWidth size="small">
            <InputLabel id="tipo-formulario-label">Formulário de Inscrição</InputLabel>
            <Select
              labelId="tipo-formulario-label"
              id="tipo-formulario-select"
              value={formData.tipo_formulario || "simples"}
              label="Formulário de Inscrição"
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  tipo_formulario: e.target.value as string,
                }))
              }
            >
              <MenuItem value="simples">Simples (Sem endereço/saúde)</MenuItem>
              <MenuItem value="completo">Completo (Com endereço, emergência e saúde)</MenuItem>
            </Select>
          </FormControl>
          <Stack direction="row" alignItems="center">
            <Checkbox
              checked={formData.gerar_mensalidade ?? false}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  gerar_mensalidade: e.target.checked,
                }))
              }
            />
            <span>Gerar cobrança mensal</span>
          </Stack>
          <Stack direction="row" alignItems="center">
            <Checkbox
              checked={formData.is_active ?? true}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  is_active: e.target.checked,
                }))
              }
            />
            <span>Ativo</span>
          </Stack>
        </Stack>
      </CrudDrawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Excluir curso"
        message={`Deseja excluir o curso "${confirmTarget?.titulo}"?`}
        confirmText="Excluir"
        destructive
        onConfirm={handleDeleteCurso}
        onCancel={() => { setConfirmOpen(false); setCursoConfirmTarget(null); }}
      />

      {/* Snackbar de link copiado */}
      <Snackbar
        open={linkSnack.open}
        autoHideDuration={4000}
        onClose={() => setLinkSnack((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="info" onClose={() => setLinkSnack((p) => ({ ...p, open: false }))}>
          🔗 {linkSnack.message}
        </Alert>
      </Snackbar>
    </AdminLayout>
  );
};

export default CursosPresenciaisPage;