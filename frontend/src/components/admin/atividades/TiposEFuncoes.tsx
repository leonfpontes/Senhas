/**
 * Aba "Tipos e funções" de /admin/atividades (AM-08).
 *
 * Tipos de atividade da casa (Gira, Faxina, Ritual coletivo...): renomear, ícone e cor de listas
 * fechadas, arquivar (o tipo Gira é da casa: renomeia, não arquiva) e as opções de cada tipo —
 * presença, "Vou / Não vou", motivo de quem não vai, como a presença é marcada (AM-28: padrão da casa,
 * confiança, "Cheguei" pelo app ou com o QR do dia) + janela do "Cheguei", quem pode
 * participar (toda a corrente, atendimento, cambones ou grupos da corrente), convocação padrão,
 * modo de escala, horário/duração e visibilidade padrão. Funções da corrente (Cambone, Porteiro,
 * Ogã/Atabaque...) para a escala de gira.
 *
 * Permissões chegam prontas da página (grupo `escalas`): botões só aparecem com a ação liberada.
 * Backend: `api/v1/admin/atividades.py` (`/tipos`, `/funcoes`).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Shapes, UserCog } from 'lucide-react';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import CrudDrawer from '@/components/CrudDrawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { MultiCombobox, TextField } from '@/components/fields';
import { TipoChip } from '@/components/atividades/TipoChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  CORES_TIPO,
  ICONES_ATIVIDADE,
  OPCOES_CONVOCACAO,
  OPCOES_ELEGIVEIS,
  OPCOES_MODO_ESCALA,
  OPCOES_VISIBILIDADE,
  rotuloDe,
  type Convocacao,
  type Elegiveis,
  type FuncaoCorrente,
  type IconeAtividade,
  type ModoEscala,
  type Opcao,
  type TipoAtividade,
  type Visibilidade,
} from '@/constants/atividades';
import { corDoGrupo } from '@/constants/correnteGrupos';
import { OPCOES_MODO_PRESENCA, type ModoPresenca } from '@/constants/presenca';
import { iconeDaAtividade } from '@/lib/icons';
import { cn } from '@/lib/utils';

export const API_ATIVIDADES = '/api/v1/admin/atividades';
const NOME_MAX = 60;

export interface PermissoesEscalas {
  canInsert: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface GrupoOpcao {
  id: string;
  nome: string;
  cor: string;
  total_membros: number;
}

interface TipoForm {
  nome: string;
  icone: IconeAtividade;
  cor: string | null;
  controla_presenca: boolean;
  pede_confirmacao: boolean;
  exige_justificativa: boolean;
  /** AM-28: '' = padrão da casa. */
  presenca_modo: ModoPresenca | '';
  checkin_antes_min: string;
  checkin_depois_min: string;
  elegiveis: Elegiveis;
  grupo_ids: string[];
  convocacao_padrao: Convocacao;
  modo_escala: ModoEscala;
  hora_padrao: string;
  duracao_min: string;
  visibilidade_padrao: Visibilidade;
}

const TIPO_NOVO: TipoForm = {
  nome: '',
  icone: 'estrela',
  cor: 'ambar',
  controla_presenca: true,
  pede_confirmacao: true,
  exige_justificativa: false,
  presenca_modo: '',
  checkin_antes_min: '60',
  checkin_depois_min: '180',
  elegiveis: 'todos',
  grupo_ids: [],
  convocacao_padrao: 'todos_elegiveis',
  modo_escala: 'nenhuma',
  hora_padrao: '',
  duracao_min: '',
  visibilidade_padrao: 'corrente',
};

function formDoTipo(t: TipoAtividade): TipoForm {
  return {
    nome: t.nome,
    icone: t.icone,
    cor: t.cor,
    controla_presenca: t.controla_presenca,
    pede_confirmacao: t.pede_confirmacao,
    exige_justificativa: t.exige_justificativa,
    presenca_modo: t.presenca_modo ?? '',
    checkin_antes_min: String(t.checkin_antes_min),
    checkin_depois_min: String(t.checkin_depois_min),
    elegiveis: t.elegiveis,
    grupo_ids: t.grupos.map((g) => g.id),
    convocacao_padrao: t.convocacao_padrao,
    modo_escala: t.modo_escala,
    hora_padrao: t.hora_padrao ?? '',
    duracao_min: t.duracao_min ? String(t.duracao_min) : '',
    visibilidade_padrao: t.visibilidade_padrao,
  };
}

/** Modo de presença do tipo (AM-28): o padrão da casa (Configurações da Área) ou um dos três. */
const OPCOES_MODO_TIPO: readonly Opcao<'padrao' | ModoPresenca>[] = [
  { valor: 'padrao', rotulo: 'O padrão da casa', ajuda: 'O que estiver em Configurações → Área do Médium.' },
  ...OPCOES_MODO_PRESENCA,
];

/** Resumo do tipo em linguagem da casa: "Presença · Vou/Não vou · Motivo · Toda a corrente". */
export function resumoDoTipo(t: TipoAtividade): string {
  const partes: string[] = [];
  if (t.controla_presenca) partes.push('Presença');
  if (t.pede_confirmacao) partes.push('Vou / Não vou');
  if (t.exige_justificativa) partes.push('Pede o motivo');
  if (t.controla_presenca && t.presenca_modo === 'app') partes.push('“Cheguei” no app');
  if (t.controla_presenca && t.presenca_modo === 'qr') partes.push('“Cheguei” com QR');
  if (t.controla_presenca && t.presenca_modo === 'confianca') partes.push('Presença por confiança');
  partes.push(
    t.elegiveis === 'grupos' && t.grupos.length > 0
      ? t.grupos.map((g) => g.nome).join(', ')
      : rotuloDe(OPCOES_ELEGIVEIS, t.elegiveis),
  );
  if (t.modo_escala !== 'nenhuma') partes.push(`Escala: ${rotuloDe(OPCOES_MODO_ESCALA, t.modo_escala).toLowerCase()}`);
  return partes.join(' · ');
}

function OpcoesRadio<T extends string>({
  id,
  legenda,
  opcoes,
  valor,
  onChange,
}: {
  id: string;
  legenda: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legenda}</legend>
      <RadioGroup value={valor} onValueChange={(v) => onChange(v as T)} className="flex flex-col gap-2">
        {opcoes.map((o) => (
          <Label
            key={o.valor}
            htmlFor={`${id}-${o.valor}`}
            className="flex cursor-pointer items-start gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem id={`${id}-${o.valor}`} value={o.valor} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{o.rotulo}</span>
              {o.ajuda && <span className="text-xs font-normal text-muted-foreground">{o.ajuda}</span>}
            </span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function Interruptor({
  id,
  rotulo,
  ajuda,
  checked,
  onChange,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="font-medium">
          {rotulo}
        </Label>
        {ajuda && <span className="text-xs text-muted-foreground">{ajuda}</span>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ListaSkeleton({ testid }: { testid: string }) {
  return (
    <div className="flex flex-col gap-3" data-testid={testid}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function TiposEFuncoes({ canInsert, canEdit, canDelete }: PermissoesEscalas) {
  const { showSuccess, showError } = useSnackbar();

  // ── Tipos ────────────────────────────────────────────────────────────────
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const [carregandoTipos, setCarregandoTipos] = useState(true);
  const [erroTipos, setErroTipos] = useState(false);
  const [verArquivados, setVerArquivados] = useState(false);
  const [grupoOpcoes, setGrupoOpcoes] = useState<GrupoOpcao[]>([]);

  const [tipoAberto, setTipoAberto] = useState(false);
  const [tipoEditando, setTipoEditando] = useState<TipoAtividade | null>(null);
  const [tipoForm, setTipoForm] = useState<TipoForm>(TIPO_NOVO);
  const [tipoInicial, setTipoInicial] = useState<TipoForm | null>(null);
  const [tipoTocado, setTipoTocado] = useState(false);
  const [salvandoTipo, setSalvandoTipo] = useState(false);
  const [erroSalvarTipo, setErroSalvarTipo] = useState<string | null>(null);
  const [arquivarTipo, setArquivarTipo] = useState<TipoAtividade | null>(null);

  const carregarTipos = useCallback(async () => {
    setCarregandoTipos(true);
    setErroTipos(false);
    try {
      const res = await apiClient.get<TipoAtividade[]>(`${API_ATIVIDADES}/tipos`, {
        params: verArquivados ? { incluir_arquivados: true } : undefined,
      });
      setTipos(Array.isArray(res.data) ? res.data : []);
    } catch {
      setErroTipos(true);
    } finally {
      setCarregandoTipos(false);
    }
  }, [verArquivados]);

  useEffect(() => {
    void carregarTipos();
  }, [carregarTipos]);

  // Grupos da corrente para "quem pode participar" — só para quem cria/edita tipos.
  useEffect(() => {
    if (!(canInsert || canEdit)) return;
    apiClient
      .get<GrupoOpcao[]>('/api/v1/admin/corrente-grupos/opcoes')
      .then((res) => setGrupoOpcoes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setGrupoOpcoes([]));
  }, [canInsert, canEdit]);

  const setTipo = <K extends keyof TipoForm>(k: K, v: TipoForm[K]) => setTipoForm((f) => ({ ...f, [k]: v }));

  const abrirNovoTipo = () => {
    setTipoEditando(null);
    setTipoForm(TIPO_NOVO);
    setTipoInicial(TIPO_NOVO);
    setTipoTocado(false);
    setErroSalvarTipo(null);
    setTipoAberto(true);
  };

  const abrirEdicaoTipo = (t: TipoAtividade) => {
    const atual = formDoTipo(t);
    setTipoEditando(t);
    setTipoForm(atual);
    setTipoInicial(atual);
    setTipoTocado(false);
    setErroSalvarTipo(null);
    setTipoAberto(true);
  };

  const ehGira = tipoEditando?.natureza === 'gira';
  const nomeTipoErro = tipoTocado && !tipoForm.nome.trim() ? 'Dê um nome ao tipo' : undefined;
  const gruposErro =
    tipoTocado && tipoForm.elegiveis === 'grupos' && tipoForm.grupo_ids.length === 0
      ? 'Escolha pelo menos um grupo'
      : undefined;
  const tipoSujo = tipoInicial !== null && JSON.stringify(tipoForm) !== JSON.stringify(tipoInicial);

  const salvarTipo = async () => {
    setTipoTocado(true);
    if (!tipoForm.nome.trim()) return;
    if (tipoForm.elegiveis === 'grupos' && tipoForm.grupo_ids.length === 0) return;
    if (tipoEditando ? !canEdit : !canInsert) return;
    const payload: Record<string, unknown> = {
      nome: tipoForm.nome.trim(),
      icone: tipoForm.icone,
      cor: tipoForm.cor,
      controla_presenca: tipoForm.controla_presenca,
      pede_confirmacao: tipoForm.pede_confirmacao,
      exige_justificativa: tipoForm.exige_justificativa,
      presenca_modo: tipoForm.presenca_modo || null,
      checkin_antes_min: Number(tipoForm.checkin_antes_min) || 0,
      checkin_depois_min: Number(tipoForm.checkin_depois_min) || 0,
      elegiveis: tipoForm.elegiveis,
      convocacao_padrao: tipoForm.convocacao_padrao,
      modo_escala: tipoForm.modo_escala,
    };
    if (tipoForm.elegiveis === 'grupos') payload.grupo_ids = tipoForm.grupo_ids;
    if (!ehGira) {
      payload.hora_padrao = tipoForm.hora_padrao || null;
      payload.duracao_min = tipoForm.duracao_min ? Number(tipoForm.duracao_min) : null;
      payload.visibilidade_padrao = tipoForm.visibilidade_padrao;
    }
    setSalvandoTipo(true);
    setErroSalvarTipo(null);
    try {
      if (tipoEditando) {
        await apiClient.put(`${API_ATIVIDADES}/tipos/${tipoEditando.id}`, payload);
        showSuccess('Tipo atualizado.');
      } else {
        await apiClient.post(`${API_ATIVIDADES}/tipos`, payload);
        showSuccess('Tipo criado.');
      }
      setTipoAberto(false);
      void carregarTipos();
    } catch (err) {
      setErroSalvarTipo(extractApiErrorMessage(err, 'Não foi possível salvar o tipo. Tente de novo.'));
    } finally {
      setSalvandoTipo(false);
    }
  };

  const confirmarArquivarTipo = async () => {
    if (!arquivarTipo || !canDelete) return;
    try {
      await apiClient.delete(`${API_ATIVIDADES}/tipos/${arquivarTipo.id}`);
      showSuccess('Tipo arquivado. As atividades dele continuam na agenda.');
      void carregarTipos();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível arquivar o tipo.'));
    } finally {
      setArquivarTipo(null);
    }
  };

  const desarquivarTipo = async (t: TipoAtividade) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_ATIVIDADES}/tipos/${t.id}/desarquivar`);
      showSuccess('Tipo de volta.');
      void carregarTipos();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível trazer o tipo de volta.'));
    }
  };

  // ── Funções ──────────────────────────────────────────────────────────────
  const [funcoes, setFuncoes] = useState<FuncaoCorrente[]>([]);
  const [carregandoFuncoes, setCarregandoFuncoes] = useState(true);
  const [verFuncoesArquivadas, setVerFuncoesArquivadas] = useState(false);
  const [funcaoAberta, setFuncaoAberta] = useState(false);
  const [funcaoEditando, setFuncaoEditando] = useState<FuncaoCorrente | null>(null);
  const [funcaoForm, setFuncaoForm] = useState({ nome: '', descricao: '' });
  const [funcaoInicial, setFuncaoInicial] = useState<{ nome: string; descricao: string } | null>(null);
  const [funcaoTocada, setFuncaoTocada] = useState(false);
  const [salvandoFuncao, setSalvandoFuncao] = useState(false);
  const [erroSalvarFuncao, setErroSalvarFuncao] = useState<string | null>(null);
  const [arquivarFuncao, setArquivarFuncao] = useState<FuncaoCorrente | null>(null);

  const carregarFuncoes = useCallback(async () => {
    setCarregandoFuncoes(true);
    try {
      const res = await apiClient.get<FuncaoCorrente[]>(`${API_ATIVIDADES}/funcoes`, {
        params: verFuncoesArquivadas ? { incluir_arquivadas: true } : undefined,
      });
      setFuncoes(Array.isArray(res.data) ? res.data : []);
    } catch {
      setFuncoes([]);
    } finally {
      setCarregandoFuncoes(false);
    }
  }, [verFuncoesArquivadas]);

  useEffect(() => {
    void carregarFuncoes();
  }, [carregarFuncoes]);

  const abrirFuncao = (f: FuncaoCorrente | null) => {
    const atual = { nome: f?.nome ?? '', descricao: f?.descricao ?? '' };
    setFuncaoEditando(f);
    setFuncaoForm(atual);
    setFuncaoInicial(atual);
    setFuncaoTocada(false);
    setErroSalvarFuncao(null);
    setFuncaoAberta(true);
  };

  const salvarFuncao = async () => {
    setFuncaoTocada(true);
    if (!funcaoForm.nome.trim()) return;
    if (funcaoEditando ? !canEdit : !canInsert) return;
    const payload = { nome: funcaoForm.nome.trim(), descricao: funcaoForm.descricao.trim() || null };
    setSalvandoFuncao(true);
    setErroSalvarFuncao(null);
    try {
      if (funcaoEditando) {
        await apiClient.put(`${API_ATIVIDADES}/funcoes/${funcaoEditando.id}`, payload);
        showSuccess('Função atualizada.');
      } else {
        await apiClient.post(`${API_ATIVIDADES}/funcoes`, payload);
        showSuccess('Função criada.');
      }
      setFuncaoAberta(false);
      void carregarFuncoes();
    } catch (err) {
      setErroSalvarFuncao(extractApiErrorMessage(err, 'Não foi possível salvar a função. Tente de novo.'));
    } finally {
      setSalvandoFuncao(false);
    }
  };

  const confirmarArquivarFuncao = async () => {
    if (!arquivarFuncao || !canDelete) return;
    try {
      await apiClient.delete(`${API_ATIVIDADES}/funcoes/${arquivarFuncao.id}`);
      showSuccess('Função arquivada.');
      void carregarFuncoes();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível arquivar a função.'));
    } finally {
      setArquivarFuncao(null);
    }
  };

  const desarquivarFuncao = async (f: FuncaoCorrente) => {
    if (!canEdit) return;
    try {
      await apiClient.post(`${API_ATIVIDADES}/funcoes/${f.id}/desarquivar`);
      showSuccess('Função de volta.');
      void carregarFuncoes();
    } catch (err) {
      showError(extractApiErrorMessage(err, 'Não foi possível trazer a função de volta.'));
    }
  };

  const opcoesGrupos = useMemo(
    () =>
      grupoOpcoes.map((g) => ({
        value: g.id,
        label: g.nome,
        description: `${g.total_membros} ${g.total_membros === 1 ? 'médium' : 'médiuns'}`,
        dot: corDoGrupo(g.cor),
      })),
    [grupoOpcoes],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* ── Tipos ── */}
      <section className="flex flex-col gap-4" aria-labelledby="titulo-tipos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="titulo-tipos" className="text-lg font-semibold">
              Tipos de atividade
            </h2>
            <p className="text-sm text-muted-foreground">
              Como a casa chama o que a corrente faz junto. Só a Gira aparece no site; o resto fica na Área do Médium.
            </p>
          </div>
          {canInsert && (
            <Button onClick={abrirNovoTipo}>
              <Plus aria-hidden />
              Novo tipo
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="tipos-arquivados" checked={verArquivados} onCheckedChange={setVerArquivados} />
          <Label htmlFor="tipos-arquivados" className="text-sm font-normal">
            Mostrar tipos arquivados
          </Label>
        </div>

        {carregandoTipos ? (
          <ListaSkeleton testid="tipos-loading" />
        ) : erroTipos ? (
          <EmptyState
            icon={<Shapes />}
            title="Não foi possível carregar os tipos"
            description="Confira a internet e tente de novo."
            action={
              <Button variant="outline" onClick={() => void carregarTipos()}>
                Tentar de novo
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Tipos de atividade">
            {tipos.map((t) => (
              <li key={t.id}>
                <Card className={cn('h-full flex-row items-start gap-3 p-4', t.arquivado_em && 'opacity-75')} data-testid="tipo-item">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <TipoChip tipo={t} />
                      {t.is_sistema && <Badge variant="secondary">Da casa · vai ao site</Badge>}
                      {t.arquivado_em && <span className="text-xs text-muted-foreground">Arquivado</span>}
                    </span>
                    <p className="text-sm text-muted-foreground">{resumoDoTipo(t)}</p>
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex shrink-0 gap-1">
                      {!t.arquivado_em && canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => abrirEdicaoTipo(t)}
                          title="Editar"
                          aria-label={`Editar ${t.nome}`}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {!t.arquivado_em && canDelete && t.natureza !== 'gira' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setArquivarTipo(t)}
                          title="Arquivar"
                          aria-label={`Arquivar ${t.nome}`}
                        >
                          <Archive />
                        </Button>
                      )}
                      {t.arquivado_em && canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void desarquivarTipo(t)}
                          title="Trazer de volta"
                          aria-label={`Trazer de volta ${t.nome}`}
                        >
                          <ArchiveRestore />
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Funções ── */}
      <section className="flex flex-col gap-4" aria-labelledby="titulo-funcoes">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="titulo-funcoes" className="text-lg font-semibold">
              Funções da corrente
            </h2>
            <p className="text-sm text-muted-foreground">Cambone, porteiro, ogã… Usadas na escala de gira.</p>
          </div>
          {canInsert && (
            <Button variant="outline" onClick={() => abrirFuncao(null)}>
              <Plus aria-hidden />
              Nova função
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="funcoes-arquivadas" checked={verFuncoesArquivadas} onCheckedChange={setVerFuncoesArquivadas} />
          <Label htmlFor="funcoes-arquivadas" className="text-sm font-normal">
            Mostrar funções arquivadas
          </Label>
        </div>
        {carregandoFuncoes ? (
          <ListaSkeleton testid="funcoes-loading" />
        ) : funcoes.length === 0 ? (
          <EmptyState icon={<UserCog />} title="Nenhuma função ainda" description="Crie as funções da casa." />
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border" aria-label="Funções da corrente">
            {funcoes.map((f) => (
              <li key={f.id} className={cn('flex items-center gap-3 p-3', f.arquivado_em && 'opacity-75')} data-testid="funcao-item">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {f.nome}
                    {f.arquivado_em && <span className="ml-2 text-xs font-normal text-muted-foreground">Arquivada</span>}
                  </span>
                  {f.descricao && <span className="text-sm text-muted-foreground">{f.descricao}</span>}
                </div>
                {!f.arquivado_em && canEdit && (
                  <Button variant="ghost" size="icon-sm" onClick={() => abrirFuncao(f)} aria-label={`Editar ${f.nome}`}>
                    <Pencil />
                  </Button>
                )}
                {!f.arquivado_em && canDelete && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setArquivarFuncao(f)} aria-label={`Arquivar ${f.nome}`}>
                    <Archive />
                  </Button>
                )}
                {f.arquivado_em && canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void desarquivarFuncao(f)}
                    aria-label={`Trazer de volta ${f.nome}`}
                  >
                    <ArchiveRestore />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Drawer do tipo ── */}
      <CrudDrawer
        open={tipoAberto}
        title={tipoEditando ? 'Editar tipo' : 'Novo tipo de atividade'}
        subtitle={
          ehGira
            ? 'A gira de verdade se marca na tela Giras; é o único tipo que aparece no site.'
            : 'As opções valem para as atividades novas deste tipo.'
        }
        icon={<Shapes />}
        onClose={() => setTipoAberto(false)}
        onSave={salvarTipo}
        saving={salvandoTipo}
        saveLabel={tipoEditando ? 'Salvar' : 'Criar tipo'}
        isDirty={tipoSujo}
        error={erroSalvarTipo}
      >
        <TextField
          label="Nome"
          required
          fullWidth
          maxLength={NOME_MAX}
          placeholder="Ex.: Faxina, Ritual coletivo, Reunião"
          value={tipoForm.nome}
          onChange={(e) => setTipo('nome', e.target.value)}
          error={nomeTipoErro}
          autoFocus
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Ícone</legend>
          <div role="radiogroup" aria-label="Ícone do tipo" className="flex flex-wrap gap-2">
            {ICONES_ATIVIDADE.map((i) => {
              const Icone = iconeDaAtividade(i.valor);
              const marcado = tipoForm.icone === i.valor;
              return (
                <button
                  key={i.valor}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  aria-label={i.rotulo}
                  title={i.rotulo}
                  onClick={() => setTipo('icone', i.valor)}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    marcado ? 'border-primary bg-primary/10 text-brand' : 'text-muted-foreground',
                  )}
                >
                  <Icone className="size-5" aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cor</legend>
          <div role="radiogroup" aria-label="Cor do tipo" className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={tipoForm.cor === null}
              aria-label="Cor da casa"
              title="Cor da casa"
              onClick={() => setTipo('cor', null)}
              className={cn(
                'h-9 rounded-full border border-primary px-3 text-sm font-bold text-brand ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                tipoForm.cor === null && 'ring-2 ring-foreground',
              )}
            >
              Cor da casa
            </button>
            {CORES_TIPO.map((c) => {
              const marcada = tipoForm.cor === c.chave;
              return (
                <button
                  key={c.chave}
                  type="button"
                  role="radio"
                  aria-checked={marcada}
                  aria-label={c.nome}
                  title={c.nome}
                  onClick={() => setTipo('cor', c.chave)}
                  className={cn(
                    'size-9 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    marcada && 'ring-2 ring-foreground',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
          </div>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            Assim aparece:{' '}
            <TipoChip tipo={{ nome: tipoForm.nome.trim() || 'Nome do tipo', icone: tipoForm.icone, cor: tipoForm.cor }} />
          </span>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Presença</span>
          <Interruptor
            id="tipo-presenca"
            rotulo="Controla presença"
            ajuda="A casa marca quem veio."
            checked={tipoForm.controla_presenca}
            onChange={(v) => setTipo('controla_presenca', v)}
          />
          <Interruptor
            id="tipo-confirmacao"
            rotulo="Pede “Vou / Não vou”"
            checked={tipoForm.pede_confirmacao}
            onChange={(v) => setTipo('pede_confirmacao', v)}
          />
          <Interruptor
            id="tipo-justificativa"
            rotulo="Pede o motivo de quem não vai"
            ajuda="O médium conta o motivo (sem precisar detalhar saúde)."
            checked={tipoForm.exige_justificativa}
            onChange={(v) => setTipo('exige_justificativa', v)}
          />
          {tipoForm.controla_presenca && (
            <OpcoesRadio
              id="tipo-modo-presenca"
              legenda="Como a presença é marcada"
              opcoes={OPCOES_MODO_TIPO}
              valor={tipoForm.presenca_modo === '' ? 'padrao' : tipoForm.presenca_modo}
              onChange={(v) => setTipo('presenca_modo', v === 'padrao' ? '' : (v as ModoPresenca))}
            />
          )}
          {tipoForm.controla_presenca && tipoForm.presenca_modo !== 'confianca' && (
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Minutos antes do início"
                type="number"
                min={0}
                max={1440}
                value={tipoForm.checkin_antes_min}
                onChange={(e) => setTipo('checkin_antes_min', e.target.value)}
              />
              <TextField
                label="Minutos depois do início"
                type="number"
                min={0}
                max={1440}
                value={tipoForm.checkin_depois_min}
                onChange={(e) => setTipo('checkin_depois_min', e.target.value)}
              />
            </div>
          )}
        </div>

        <OpcoesRadio
          id="tipo-elegiveis"
          legenda="Quem pode participar"
          opcoes={OPCOES_ELEGIVEIS}
          valor={tipoForm.elegiveis}
          onChange={(v) => setTipo('elegiveis', v)}
        />
        {tipoForm.elegiveis === 'grupos' &&
          (grupoOpcoes.length > 0 ? (
            <MultiCombobox
              label="Grupos"
              required
              options={opcoesGrupos}
              value={tipoForm.grupo_ids}
              onChange={(v) => setTipo('grupo_ids', v)}
              placeholder="Escolha os grupos"
              searchPlaceholder="Buscar grupo..."
              emptyText="Nenhum grupo encontrado."
              countLabel={(n) => `${n} ${n === 1 ? 'grupo' : 'grupos'}`}
              error={gruposErro}
            />
          ) : (
            <p className="rounded-md border p-3 text-sm text-muted-foreground" data-testid="tipo-sem-grupos">
              Nenhum grupo da corrente ainda. Crie em Médiuns → Grupos da corrente.
            </p>
          ))}

        <OpcoesRadio
          id="tipo-convocacao"
          legenda="Quem é chamado"
          opcoes={OPCOES_CONVOCACAO}
          valor={tipoForm.convocacao_padrao}
          onChange={(v) => setTipo('convocacao_padrao', v)}
        />
        <OpcoesRadio
          id="tipo-escala"
          legenda="Escala"
          opcoes={OPCOES_MODO_ESCALA}
          valor={tipoForm.modo_escala}
          onChange={(v) => setTipo('modo_escala', v)}
        />

        {!ehGira && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Horário padrão"
                type="time"
                value={tipoForm.hora_padrao}
                onChange={(e) => setTipo('hora_padrao', e.target.value)}
              />
              <TextField
                label="Duração (minutos)"
                type="number"
                min={15}
                max={1440}
                placeholder="Ex.: 120"
                value={tipoForm.duracao_min}
                onChange={(e) => setTipo('duracao_min', e.target.value)}
              />
            </div>
            <OpcoesRadio
              id="tipo-visibilidade"
              legenda="Quem vê na Agenda (padrão)"
              opcoes={OPCOES_VISIBILIDADE}
              valor={tipoForm.visibilidade_padrao}
              onChange={(v) => setTipo('visibilidade_padrao', v)}
            />
          </>
        )}
      </CrudDrawer>

      {/* ── Drawer da função ── */}
      <CrudDrawer
        open={funcaoAberta}
        title={funcaoEditando ? 'Editar função' : 'Nova função'}
        subtitle="Funções aparecem na escala de gira."
        icon={<UserCog />}
        onClose={() => setFuncaoAberta(false)}
        onSave={salvarFuncao}
        saving={salvandoFuncao}
        saveLabel={funcaoEditando ? 'Salvar' : 'Criar função'}
        isDirty={funcaoInicial !== null && JSON.stringify(funcaoForm) !== JSON.stringify(funcaoInicial)}
        error={erroSalvarFuncao}
      >
        <TextField
          label="Nome da função"
          required
          fullWidth
          maxLength={NOME_MAX}
          placeholder="Ex.: Cambone, Porteiro, Ogã"
          value={funcaoForm.nome}
          onChange={(e) => setFuncaoForm((f) => ({ ...f, nome: e.target.value }))}
          error={funcaoTocada && !funcaoForm.nome.trim() ? 'Dê um nome à função' : undefined}
          autoFocus
        />
        <TextField
          label="Descrição (opcional)"
          fullWidth
          multiline
          rows={2}
          maxLength={300}
          value={funcaoForm.descricao}
          onChange={(e) => setFuncaoForm((f) => ({ ...f, descricao: e.target.value }))}
        />
      </CrudDrawer>

      <ConfirmDialog
        open={arquivarTipo !== null}
        title="Arquivar tipo"
        message={
          <>
            O tipo <strong className="text-foreground">{arquivarTipo?.nome}</strong> sai das opções de atividade nova. As
            atividades que já existem continuam na agenda.
          </>
        }
        confirmText="Arquivar"
        destructive
        onConfirm={confirmarArquivarTipo}
        onCancel={() => setArquivarTipo(null)}
      />
      <ConfirmDialog
        open={arquivarFuncao !== null}
        title="Arquivar função"
        message={
          <>
            A função <strong className="text-foreground">{arquivarFuncao?.nome}</strong> sai das opções da escala.
          </>
        }
        confirmText="Arquivar"
        destructive
        onConfirm={confirmarArquivarFuncao}
        onCancel={() => setArquivarFuncao(null)}
      />
    </div>
  );
}

export default TiposEFuncoes;
