import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  TextField,
  Checkbox,
  Stack,
  Typography,
  CircularProgress,
} from "@mui/material";
// `admin_layout.tsx` exporta o AdminLayout como default, então importe sem chaves.
import AdminLayout from "./admin_layout";

// Utilize caminhos relativos como nos outros módulos do projeto.
import CrudDrawer from "../../components/CrudDrawer";
import { apiClient } from "../../services/api_client";

//import { AdminLayout } from "./admin_layout";
//import CrudDrawer from "@/components/CrudDrawer";
//import { apiClient } from "@/services/api_client";
//import { isoToLocalDatetimeInput } from "@/utils/datetime";

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
}

const API_PREFIX = "/api/v1/cursos-presenciais";

const isoToLocalDatetimeInput = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CursosPresenciaisPage = () => {
  const [cursos, setCursos] = useState<CursoPresencial[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CursoPresencial>>({
    titulo: "",
    data_inicio: isoToLocalDatetimeInput(new Date().toISOString()),
    is_active: true,
  });

  const fetchCursos = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<CursoPresencial[]>("/api/v1/cursos-presenciais");
      setCursos(res.data);
    } catch (err) {
      console.error("Erro ao buscar cursos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCursos();
  }, []);

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
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (curso: CursoPresencial) => {
    setDrawerMode("edit");
    setEditingId(curso.id);
    setFormData({
      ...curso,
      // converter datas ISO para o formato aceito por inputs type="datetime-local"
      data_inicio: isoToLocalDatetimeInput(curso.data_inicio),
      data_fim: curso.data_fim ? isoToLocalDatetimeInput(curso.data_fim) : "",
    });
    setDrawerOpen(true);
  };

  const handleDelete = async (curso: CursoPresencial) => {
    if (window.confirm(`Deseja excluir o curso "${curso.titulo}"?`)) {
      await apiClient.delete(`/api/v1/cursos-presenciais/${curso.id}`);
      fetchCursos();
    }
  };

  const handleSave = async () => {
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
    };

    const fetchCursos = async () => {
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

    const handleSave = async () => {
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
    };

    if (drawerMode === "create") {
        await apiClient.post(API_PREFIX, payload);
    } else if (editingId) {
        await apiClient.put(`${API_PREFIX}/${editingId}`, payload);
    }

    setDrawerOpen(false);
    fetchCursos();
    };

    const handleDelete = async (id: string) => {
    if (window.confirm("Deseja excluir este curso?")) {
        await apiClient.delete(`${API_PREFIX}/${id}`);
        fetchCursos();
    }
    };

    if (drawerMode === "create") {
      await apiClient.post("/api/v1/cursos-presenciais", payload);
    } else if (editingId) {
      await apiClient.put(`/api/v1/cursos-presenciais/${editingId}`, payload);
    }

    setDrawerOpen(false);
    fetchCursos();
  };

  return (
    <AdminLayout title="Cursos presenciais">
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Cursos presenciais</Typography>
        <Button variant="contained" onClick={openCreateDrawer}>
          Novo curso
        </Button>
      </Stack>

      {loading ? (
        <Stack alignItems="center" mt={4}>
          <CircularProgress />
        </Stack>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Título</TableCell>
              <TableCell>Início</TableCell>
              <TableCell>Fim</TableCell>
              <TableCell>Local</TableCell>
              <TableCell>Limite</TableCell>
              <TableCell>Mensalidade (R$)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {cursos.map((curso) => (
              <TableRow key={curso.id} hover>
                <TableCell>{curso.titulo}</TableCell>
                <TableCell>
                  {curso.data_inicio
                    ? new Date(curso.data_inicio).toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell>
                  {curso.data_fim
                    ? new Date(curso.data_fim).toLocaleString()
                    : "-"}
                </TableCell>
                <TableCell>{curso.local || "-"}</TableCell>
                <TableCell>{curso.max_participantes ?? "-"}</TableCell>
                <TableCell>{curso.valor_mensalidade_padrao ?? "-"}</TableCell>
                <TableCell>{curso.is_active ? "Ativo" : "Inativo"}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => openEditDrawer(curso)}>
                    Editar
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleDelete(curso)}
                  >
                    Excluir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CrudDrawer
        title={drawerMode === "create" ? "Novo curso" : "Editar curso"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSave}
        saveDisabled={!formData.titulo}
      >
        {/* Formulário dentro do drawer */}
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
            fullWidth
            value={formData.data_inicio || ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, data_inicio: e.target.value }))
            }
          />
          <TextField
            label="Data de término"
            type="datetime-local"
            fullWidth
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
    </AdminLayout>
  );
};

export default CursosPresenciaisPage;