/**
 * "Rodízio" da escala por função (AM-18) — `CrudDrawer` com a função, quem gira (médiuns OU grupos,
 * na ordem escolhida), por quantas giras/atividades a partir desta e quantos por vez.
 *
 * A prévia usa `rodizio` de `constants/escalaGira.ts` (espelho da função pura do servidor):
 * "Esta gira: Ana · 2ª: Beto · 3ª: Ana". Ao salvar, `POST /admin/atividades/{id}/escala/rodizio`;
 * quem já tem outra função numa gira continua nela (o servidor devolve os nomes).
 * Quem chama decide se mostra (ESCALAS:edit).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import CrudDrawer from '@/components/CrudDrawer';
import { Combobox, MultiCombobox, TextField } from '@/components/fields';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { corDoGrupo, type GrupoOpcao } from '@/constants/correnteGrupos';
import {
  API_ESCALA,
  RODIZIO_MAX_ATIVIDADES,
  RODIZIO_MAX_POR_VEZ,
  rodizio,
  type EscalaResponse,
  type RodizioResponse,
} from '@/constants/escalaGira';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';

type Entre = 'mediuns' | 'grupos';

function limitar(valor: string, max: number): number {
  const n = Math.floor(Number(valor));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

export function RodizioDrawer({
  open,
  onClose,
  escala,
  grupos,
  onFeito,
}: {
  open: boolean;
  onClose: () => void;
  escala: EscalaResponse;
  grupos: GrupoOpcao[];
  onFeito: (res: RodizioResponse) => void;
}) {
  const ehGira = escala.atividade.origem === 'gira';
  const unidade = ehGira ? 'gira' : 'atividade';
  const funcoes = useMemo(() => escala.funcoes.filter((f) => !f.arquivada), [escala.funcoes]);
  const [funcaoId, setFuncaoId] = useState<string | null>(null);
  const [entre, setEntre] = useState<Entre>('mediuns');
  const [ordem, setOrdem] = useState<string[]>([]);
  const [quantidade, setQuantidade] = useState('4');
  const [porVez, setPorVez] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFuncaoId(funcoes[0]?.id ?? null);
    setEntre('mediuns');
    setOrdem([]);
    setQuantidade('4');
    setPorVez('1');
    setErro(null);
  }, [open, funcoes]);

  const opcoes =
    entre === 'mediuns'
      ? escala.elegiveis.map((m) => ({ value: m.id, label: m.nome }))
      : grupos.map((g) => ({
          value: g.id,
          label: g.nome,
          description: `${g.total_membros} ${g.total_membros === 1 ? 'médium' : 'médiuns'}`,
          dot: corDoGrupo(g.cor),
        }));
  const nome = (id: string) => opcoes.find((o) => o.value === id)?.label ?? '—';
  const n = limitar(quantidade, RODIZIO_MAX_ATIVIDADES);
  const k = limitar(porVez, RODIZIO_MAX_POR_VEZ);
  const previa = rodizio(ordem, n, k);

  const salvar = async () => {
    if (!funcaoId || ordem.length === 0) {
      setErro(`Escolha a função e quem entra no rodízio.`);
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiClient.post<RodizioResponse>(
        `${API_ESCALA}/${encodeURIComponent(escala.atividade.atividade_id)}/escala/rodizio`,
        {
          funcao_id: funcaoId,
          medium_ids: entre === 'mediuns' ? ordem : [],
          grupo_ids: entre === 'grupos' ? ordem : [],
          quantidade: n,
          por_vez: k,
        },
      );
      onFeito(res.data);
    } catch (err) {
      setErro(extractApiErrorMessage(err, 'Não foi possível fazer o rodízio. Tente de novo.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <CrudDrawer
      open={open}
      onClose={onClose}
      title="Rodízio"
      subtitle={`Distribui uma função em ordem, por esta ${unidade} e as próximas do mesmo tipo.`}
      icon={<Repeat />}
      onSave={salvar}
      saving={salvando}
      saveLabel="Fazer o rodízio"
      saveDisabled={!funcaoId || ordem.length === 0}
      isDirty={ordem.length > 0}
      error={erro}
    >
      <Combobox
        label="Função"
        required
        options={funcoes.map((f) => ({ value: f.id, label: f.nome }))}
        value={funcaoId}
        onChange={setFuncaoId}
        placeholder="Escolha a função"
        searchPlaceholder="Buscar função..."
        emptyText="Nenhuma função. Cadastre em “Tipos e funções”."
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Girar entre</legend>
        <RadioGroup
          value={entre}
          onValueChange={(v) => {
            setEntre(v as Entre);
            setOrdem([]);
          }}
          className="flex flex-wrap gap-2"
        >
          {(
            [
              ['mediuns', 'Médiuns'],
              ['grupos', 'Grupos da corrente'],
            ] as const
          ).map(([valor, rotulo]) => (
            <Label
              key={valor}
              htmlFor={`rodizio-entre-${valor}`}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 has-[[data-state=checked]]:border-primary"
            >
              <RadioGroupItem id={`rodizio-entre-${valor}`} value={valor} />
              {rotulo}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <MultiCombobox
        label={entre === 'mediuns' ? 'Médiuns, na ordem do rodízio' : 'Grupos, na ordem do rodízio'}
        helperText="A ordem em que você escolhe é a ordem do rodízio."
        options={opcoes}
        value={ordem}
        onChange={setOrdem}
        placeholder={entre === 'mediuns' ? 'Escolha os médiuns' : 'Escolha os grupos'}
        searchPlaceholder="Buscar..."
        emptyText="Ninguém encontrado."
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={`Quantas ${unidade}s`}
          type="number"
          inputMode="numeric"
          min={1}
          max={RODIZIO_MAX_ATIVIDADES}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          helperText={`A partir desta (até ${RODIZIO_MAX_ATIVIDADES}).`}
        />
        <TextField
          label="Quantos por vez"
          type="number"
          inputMode="numeric"
          min={1}
          max={RODIZIO_MAX_POR_VEZ}
          value={porVez}
          onChange={(e) => setPorVez(e.target.value)}
        />
      </div>
      {previa.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="rodizio-previa">
          <span className="text-sm font-medium">Como fica</span>
          <ol className="flex flex-col gap-1 text-sm">
            {previa.map((itens, i) => (
              <li key={i} className="rounded-md bg-muted px-3 py-1.5">
                <b>{i === 0 ? `Esta ${unidade}` : `${i + 1}ª ${unidade}`}:</b> {itens.map(nome).join(', ')}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Só esta função muda em cada {unidade}. Quem já tem outra função numa delas continua nela.
            {ehGira ? ' Giras canceladas ficam de fora.' : ' Atividades canceladas ficam de fora.'}
          </p>
        </div>
      )}
    </CrudDrawer>
  );
}

export default RodizioDrawer;
