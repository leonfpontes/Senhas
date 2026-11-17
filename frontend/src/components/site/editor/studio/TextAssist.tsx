/**
 * TextAssist — beta "Textos do site com IA" (beta_textos_ia_site), no painel da seção do estúdio.
 *
 * A casa escolhe qual texto da seção quer mexer, o que quer (escrever, melhorar, encurtar, mais
 * acolhedor) e, se quiser, conta a ideia em poucas palavras. Vêm até 3 sugestões; nada entra sozinho:
 * "Usar este texto" aplica como qualquer edição (dá para desfazer). Fechar descarta as sugestões.
 * A seção "Linhas de trabalho" não tem sugestão (a IA não escreve sobre entidades, Orixás e
 * fundamentos). Backend: POST /api/v1/admin/sites/ia/sugestoes.
 */
import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import type { SectionConfig, SiteSection } from '../../types';

export interface IaCampo {
  campo: string;
  rotulo: string;
  max_chars: number;
  precisa_base: boolean;
}

export type IaCampos = Record<string, IaCampo[]>;

type Pedido = 'escrever' | 'melhorar' | 'encurtar' | 'acolhedor';

const PEDIDOS: { id: Pedido; label: string; precisaTexto: boolean }[] = [
  { id: 'escrever', label: 'Escrever', precisaTexto: false },
  { id: 'melhorar', label: 'Melhorar', precisaTexto: true },
  { id: 'encurtar', label: 'Encurtar', precisaTexto: true },
  { id: 'acolhedor', label: 'Mais acolhedor', precisaTexto: true },
];

/** Busca se a beta está ligada no servidor e quais campos têm sugestão. */
export function useSiteIa(enabled: boolean): IaCampos | null {
  const [campos, setCampos] = useState<IaCampos | null>(null);
  useEffect(() => {
    if (!enabled) {
      setCampos(null);
      return;
    }
    let cancelled = false;
    apiClient
      .get('/api/v1/admin/sites/ia')
      .then((res) => {
        if (!cancelled) setCampos(res.data?.disponivel ? (res.data.campos as IaCampos) : null);
      })
      .catch(() => {
        if (!cancelled) setCampos(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return campos;
}

const chip =
  'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50';

export function TextAssist({ section, campos, onChange }: { section: SiteSection; campos: IaCampo[]; onChange: (config: SectionConfig) => void }) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [campo, setCampo] = useState(campos[0]?.campo ?? '');
  const atual = String(section.config[campo] ?? '').trim();
  const [pedido, setPedido] = useState<Pedido>(atual ? 'melhorar' : 'escrever');
  const [ideia, setIdeia] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<string[] | null>(null);
  const info = campos.find((c) => c.campo === campo) ?? campos[0];

  // Trocar de seção zera tudo.
  useEffect(() => {
    setCampo(campos[0]?.campo ?? '');
    setSugestoes(null);
    setErro(null);
    setIdeia('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  if (!info) return null;
  const precisaIdeia = info.precisa_base && !atual && !ideia.trim();
  const pedidoValido = PEDIDOS.find((p) => p.id === pedido)?.precisaTexto ? Boolean(atual) : true;

  const escolherCampo = (c: string) => {
    setCampo(c);
    setSugestoes(null);
    setErro(null);
    setPedido(String(section.config[c] ?? '').trim() ? 'melhorar' : 'escrever');
  };

  const sugerir = async () => {
    setLoading(true);
    setErro(null);
    setSugestoes(null);
    try {
      const res = await apiClient.post('/api/v1/admin/sites/ia/sugestoes', {
        secao: section.section_type,
        campo: info.campo,
        pedido,
        texto_atual: atual,
        ideia: ideia.trim(),
      });
      const lista = (res.data?.sugestoes ?? []) as string[];
      setSugestoes(lista);
      if (lista.length === 0) setErro('Não veio nenhuma sugestão desta vez. Tente contar a ideia com outras palavras.');
    } catch (e) {
      setErro(extractApiErrorMessage(e, 'Não deu para sugerir agora. Tente de novo em instantes.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-b border-border px-4 py-3" data-testid="studio-text-assist">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${baseId}-body`}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Sparkles className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="flex-1 text-xs font-semibold">Escrever com ajuda da IA</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">beta</span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div id={`${baseId}-body`} className="mt-2 flex flex-col gap-3">
          {campos.length > 1 && (
            <div role="radiogroup" aria-label="Qual texto" className="flex flex-wrap gap-1.5">
              {campos.map((c) => (
                <button
                  key={c.campo}
                  type="button"
                  role="radio"
                  aria-checked={c.campo === info.campo}
                  onClick={() => escolherCampo(c.campo)}
                  className={cn(chip, c.campo === info.campo ? 'border-brand bg-brand/10 text-brand' : 'border-border text-foreground hover:bg-muted')}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
          )}

          <div role="radiogroup" aria-label="O que fazer" className="flex flex-wrap gap-1.5">
            {PEDIDOS.map((p) => {
              const off = p.precisaTexto && !atual;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={pedido === p.id}
                  disabled={off}
                  title={off ? 'Escreva um texto primeiro' : undefined}
                  onClick={() => setPedido(p.id)}
                  className={cn(chip, pedido === p.id ? 'border-brand bg-brand/10 text-brand' : 'border-border text-foreground hover:bg-muted')}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${baseId}-ideia`} className="text-xs font-medium">
              O que você quer dizer? {info.precisa_base && !atual ? '' : '(opcional)'}
            </label>
            <Textarea
              id={`${baseId}-ideia`}
              rows={2}
              maxLength={400}
              value={ideia}
              onChange={(e) => setIdeia(e.target.value)}
              placeholder="Ex.: casa de Umbanda aberta a todos, giras às sextas, atendimento gratuito"
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              A IA usa o que a casa escreveu. Ela não escreve sobre entidades, Orixás ou fundamentos e não inventa datas, endereços ou história.
            </p>
          </div>

          <Button size="sm" onClick={sugerir} disabled={loading || precisaIdeia || !pedidoValido} className="self-start">
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {loading ? 'Pensando…' : 'Sugerir texto'}
          </Button>

          {erro && (
            <p role="alert" className="text-xs text-destructive">
              {erro}
            </p>
          )}

          {sugestoes && sugestoes.length > 0 && (
            <div className="flex flex-col gap-2" aria-live="polite">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Sugestões para “{info.rotulo}”</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setSugestoes(null)} aria-label="Descartar sugestões">
                  <X />
                </Button>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {sugestoes.map((s, i) => (
                  <li key={i} className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-sm whitespace-pre-line">{s}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        onChange({ ...section.config, [info.campo]: s });
                        setSugestoes(null);
                      }}
                    >
                      Usar este texto
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Leia antes de publicar. Dá para desfazer com Ctrl+Z.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default TextAssist;
