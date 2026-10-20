/**
 * DuplasDaNoiteDrawer — o porteiro marca quem trabalha na gira e escolhe o cambone de cada médium.
 *
 * - Uma linha por médium de atendimento: tocar marca "trabalhando hoje"; marcado, aparece a
 *   escolha do cambone. Sem arrastar e soltar (a Porta é usada no celular).
 * - Com a Área do Médium: quem confirmou ("vou"/presente) vem no topo; quem não respondeu e quem
 *   disse que não vai ficam em "Outros médiuns", recolhido. Sem a Área: o cadastro todo.
 * - Atalhos: "Copiar da última gira" e "Usar sugestões" (cambone que mais acompanhou o médium
 *   nas últimas giras, pelas senhas). A sugestão também aparece na linha, para aceitar com um toque.
 * - Um cambone por médium: escolher um cambone que já está em outra dupla tira ele de lá, com
 *   aviso (regras em `./duplas.ts`). O servidor confere de novo ao salvar.
 * Quem abre: a Porta, com `PORTA:edit` (o servidor exige o mesmo no PUT).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Copy, Search, Sparkles, UsersRound } from 'lucide-react';

import CrudDrawer from '@/components/CrudDrawer';
import { Combobox, TextField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import {
  aplicarSugestoes,
  definirCambone,
  desmarcarMedium,
  duplaDoCambone,
  type Dupla,
  type DuplasPainel,
  marcarMedium,
  mesmoRascunho,
  normalizarNome,
  paraEnvio,
  type PessoaDupla,
  type Rascunho,
  rascunhoDe,
  rascunhoVazio,
  type SugestaoDupla,
  sugestoesAplicaveis,
} from './duplas';

interface Props {
  open: boolean;
  onClose: () => void;
  giraId: string;
  giraNome: string;
  /** Chamado depois de salvar, com as duplas gravadas. */
  onSaved: (duplas: Dupla[]) => void;
}

const SITUACAO_LABEL: Record<string, { texto: string; className: string }> = {
  vou: { texto: 'Confirmou', className: 'bg-success/15 text-success-strong' },
  presente: { texto: 'Presente', className: 'bg-success/15 text-success-strong' },
  nao_vou: { texto: 'Não vai', className: 'bg-warning/15 text-warning-strong' },
};

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function DuplasDaNoiteDrawer({ open, onClose, giraId, giraNome, onSaved }: Props) {
  const [painel, setPainel] = useState<DuplasPainel | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [inicial, setInicial] = useState<Rascunho>(rascunhoVazio);
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoVazio);
  const [busca, setBusca] = useState('');
  const [mostrarOutros, setMostrarOutros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !giraId) return;
    let ativo = true;
    setPainel(null);
    setErroCarga(null);
    setErro(null);
    setBusca('');
    setMostrarOutros(false);
    apiClient
      .get<DuplasPainel>(`/api/v1/admin/giras/${giraId}/door/duplas`)
      .then((res) => {
        if (!ativo) return;
        const r = rascunhoDe(res.data.duplas);
        setPainel(res.data);
        setInicial(r);
        setRascunho(r);
      })
      .catch((err) => ativo && setErroCarga(extractApiErrorMessage(err, 'Não foi possível carregar as duplas.')));
    return () => {
      ativo = false;
    };
  }, [open, giraId]);

  const pessoas = useMemo(() => painel?.pessoas ?? [], [painel]);
  const nomes = useMemo(() => Object.fromEntries(pessoas.map((p) => [p.id, p.nome])), [pessoas]);
  const sugestaoDe = useMemo(
    () => new Map<string, SugestaoDupla>((painel?.sugestoes ?? []).map((s) => [s.medium_id, s])),
    [painel],
  );

  const mediuns = pessoas.filter((p) => p.is_atendimento);
  const termo = normalizarNome(busca);
  const visiveis = termo ? mediuns.filter((p) => normalizarNome(p.nome).includes(termo)) : mediuns;
  const confirmou = (p: PessoaDupla) => p.situacao === 'vou' || p.situacao === 'presente';
  const comArea = !!painel?.tem_confirmacoes;
  const principais = comArea ? visiveis.filter(confirmou) : visiveis;
  const outros = comArea
    ? visiveis
        .filter((p) => !confirmou(p))
        // Quem não respondeu antes de quem disse que não vai.
        .sort((a, b) => Number(a.situacao === 'nao_vou') - Number(b.situacao === 'nao_vou'))
    : [];
  const outrosAbertos = mostrarOutros || !!termo || outros.some((p) => rascunho.ordem.includes(p.id));

  const aplicaveis = sugestoesAplicaveis(rascunho, painel?.sugestoes ?? []);
  const temSugestoes = (painel?.sugestoes.length ?? 0) > 0;
  const anterior = painel?.anterior ?? null;
  // Os atalhos ficam na tela enquanto existirem (não aparecem/somem a cada toque): a lista abaixo
  // não pode pular debaixo do dedo do porteiro.
  const podeCopiar = !!anterior && anterior.duplas.length > 0;
  const isDirty = !mesmoRascunho(rascunho, inicial);
  const trabalhando = rascunho.ordem.length;

  const aplicar = ({ rascunho: r, aviso }: { rascunho: Rascunho; aviso?: string }) => {
    setRascunho(r);
    if (aviso) toast.info(aviso);
  };

  const alternar = (p: PessoaDupla, marcar: boolean) => {
    if (marcar) aplicar(marcarMedium(rascunho, p.id, nomes));
    else setRascunho(desmarcarMedium(rascunho, p.id));
  };

  const copiarAnterior = () => {
    if (!anterior) return;
    setRascunho(rascunhoDe(anterior.duplas));
    toast.info(`Duplas de ${anterior.gira_nome} (${dataCurta(anterior.data_inicio)}) copiadas. Confira e salve.`);
  };

  const usarSugestoes = () => {
    const n = aplicaveis.length;
    if (n === 0) {
      toast.info('Nenhuma sugestão para aplicar: marque quem trabalha hoje (e sem cambone) primeiro.');
      return;
    }
    setRascunho(aplicarSugestoes(rascunho, painel?.sugestoes ?? []));
    toast.info(`${n} cambone${n === 1 ? '' : 's'} sugerido${n === 1 ? '' : 's'} pelo histórico.`);
  };

  const salvar = async () => {
    try {
      setSaving(true);
      setErro(null);
      const res = await apiClient.put<Dupla[]>(`/api/v1/admin/giras/${giraId}/door/duplas`, {
        duplas: paraEnvio(rascunho),
      });
      toast.success(trabalhando ? 'Duplas da noite salvas.' : 'Duplas da noite apagadas.');
      onSaved(res.data);
      onClose();
    } catch (err) {
      setErro(extractApiErrorMessage(err, 'Não foi possível salvar as duplas.'));
    } finally {
      setSaving(false);
    }
  };

  const opcoesCambone = (mediumId: string) =>
    pessoas
      .filter((p) => p.id !== mediumId && !rascunho.ordem.includes(p.id))
      // Ordem: livres antes de quem já tem dupla; entre os livres, escalados como Cambone (AM-18),
      // depois cambones do cadastro e por último médiuns de atendimento que não trabalham hoje.
      .map((p) => {
        const de = duplaDoCambone(rascunho, p.id);
        const ocupado = de !== null && de !== mediumId;
        return {
          p,
          ocupado,
          option: {
            value: p.id,
            label: p.nome,
            description: ocupado
              ? `Com ${nomes[de as string]} — passa para esta dupla`
              : p.escalado_cambone
                ? 'Escalado como cambone'
                : undefined,
          },
        };
      })
      .sort(
        (a, b) =>
          Number(a.ocupado) - Number(b.ocupado) ||
          Number(b.p.escalado_cambone) - Number(a.p.escalado_cambone) ||
          Number(a.p.is_atendimento) - Number(b.p.is_atendimento),
      )
      .map((o) => o.option);

  const linha = (p: PessoaDupla) => {
    const marcado = rascunho.ordem.includes(p.id);
    const situacao = p.situacao ? SITUACAO_LABEL[p.situacao] : null;
    const sugestao = sugestaoDe.get(p.id);
    const cambone = rascunho.cambone[p.id] ?? null;
    const sugestaoLivre =
      sugestao && !cambone && !rascunho.ordem.includes(sugestao.cambone_id) && duplaDoCambone(rascunho, sugestao.cambone_id) === null;
    const idCheck = `dupla-${p.id}`;
    return (
      <li
        key={p.id}
        className={cn(
          'flex flex-col gap-2 border-b px-3 py-2 last:border-b-0 sm:flex-row sm:items-center',
          p.situacao === 'nao_vou' && !marcado && 'opacity-70',
        )}
        data-testid="dupla-linha"
      >
        <label htmlFor={idCheck} className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
          <Checkbox
            id={idCheck}
            checked={marcado}
            onCheckedChange={(v) => alternar(p, v === true)}
            className="size-5"
            aria-label={`${p.nome} trabalha hoje`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
          {situacao && (
            <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs', situacao.className)}>{situacao.texto}</span>
          )}
        </label>
        {marcado && (
          <div className="flex flex-col gap-1 sm:w-56">
            <Combobox
              label="Cambone"
              options={opcoesCambone(p.id)}
              value={cambone}
              onChange={(v) => aplicar(definirCambone(rascunho, p.id, v, nomes))}
              placeholder="Sem cambone"
              searchPlaceholder="Buscar cambone…"
              emptyText="Ninguém livre com esse nome."
              clearable
            />
            {sugestaoLivre && sugestao && (
              <button
                type="button"
                className="self-start rounded-md border border-dashed px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
                onClick={() => aplicar(definirCambone(rascunho, p.id, sugestao.cambone_id, nomes))}
              >
                <Sparkles className="mr-1 inline size-3" aria-hidden />
                {nomes[sugestao.cambone_id]}? · junto em {sugestao.juntos} de {sugestao.giras_do_medium} giras
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Duplas da noite"
      subtitle={`${giraNome} · ${trabalhando} ${trabalhando === 1 ? 'médium' : 'médiuns'} trabalhando`}
      icon={<UsersRound />}
      onSave={salvar}
      saveLabel="Salvar duplas"
      saving={saving}
      saveDisabled={!painel || !isDirty}
      isDirty={isDirty}
      error={erro ?? erroCarga}
    >
      {!painel ? (
        erroCarga ? null : (
          <div className="flex flex-col gap-2" role="status" aria-label="Carregando as duplas">
            <Skeleton className="h-10" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )
      ) : mediuns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum médium de atendimento no cadastro. Cadastre em Médiuns (marcando “atendimento”) para montar as duplas.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Marque quem trabalha hoje e escolha o cambone de cada um. Ao chamar uma senha, é só tocar no médium.
          </p>

          {(podeCopiar || temSugestoes) && (
            <div className="flex flex-wrap gap-2">
              {podeCopiar && anterior && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copiarAnterior}
                  title={`Duplas de ${anterior.gira_nome}`}
                >
                  <Copy aria-hidden /> Copiar da última gira ({dataCurta(anterior.data_inicio)})
                </Button>
              )}
              {temSugestoes && (
                <Button type="button" variant="outline" size="sm" onClick={usarSugestoes}>
                  <Sparkles aria-hidden /> Usar sugestões ({aplicaveis.length})
                </Button>
              )}
            </div>
          )}

          {mediuns.length > 8 && (
            <TextField
              aria-label="Buscar médium"
              placeholder="Buscar médium…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              startAdornment={<Search aria-hidden />}
            />
          )}

          <section aria-label={comArea ? 'Confirmados na Área do Médium' : 'Médiuns de atendimento'}>
            {comArea && (
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                Confirmados na Área do Médium · {principais.length}
              </h3>
            )}
            {principais.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                {termo ? 'Ninguém com esse nome.' : 'Ninguém confirmou ainda.'}
              </p>
            ) : (
              <ul className="m-0 list-none overflow-hidden rounded-lg border p-0">{principais.map(linha)}</ul>
            )}
          </section>

          {outros.length > 0 && (
            <section aria-label="Outros médiuns do cadastro">
              {outrosAbertos ? (
                <>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Outros médiuns do cadastro · {outros.length}</h3>
                  <ul className="m-0 list-none overflow-hidden rounded-lg border p-0">{outros.map(linha)}</ul>
                </>
              ) : (
                <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setMostrarOutros(true)}>
                  <ChevronDown aria-hidden /> Outros médiuns do cadastro ({outros.length})
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </CrudDrawer>
  );
}
