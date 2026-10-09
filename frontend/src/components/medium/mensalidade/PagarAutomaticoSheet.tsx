/**
 * "Pagar com PIX" com baixa automática (F-02/AM-22): a casa conectou uma conta de recebimentos
 * (Stripe ou Mercado Pago) e cada mês vira uma cobrança dinâmica NA CONTA DA CASA.
 *
 * - PIX: `POST /api/v1/medium/mensalidades/{mes}/cobranca` (reaproveita a cobrança que ainda vale)
 *   → copia-e-cola + QR + validade. A tela consulta `GET .../cobranca` a cada poucos segundos e
 *   mostra "Pagamento recebido" sozinha quando o webhook do provedor dá a baixa — sem comprovante.
 * - Se o provedor pedir o CPF de quem paga (`CPF_NECESSARIO`), aparece o campo e o PIX é gerado de
 *   novo. Boleto (quando a casa tem): CPF + endereço de quem paga. Esses dados vão direto ao
 *   provedor; o GiraHub não guarda.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CircleCheck, Copy, ExternalLink, Loader2, MessageCircle, TriangleAlert } from 'lucide-react';
import { MaskedInput, TextField } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BR_TIME_ZONE } from '@/lib/dateBr';
import { apiClient, extractApiErrorMessage } from '@/services/api_client';
import { TerreiroEmblem } from '../TerreiroEmblem';
import { nomeDoMes, valorBr } from '../format';
import { MediumSheet, Passo } from './MediumSheet';
import { copiarTexto } from './arquivos';
import type { CobrancaDoMes, MesMensalidade, MetodoCobranca } from './tipos';

/** Intervalo da consulta "já caiu?" enquanto a folha está aberta. */
export const INTERVALO_CONSULTA_MS = 5000;

export interface PagarAutomaticoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mes: MesMensalidade | null;
  metodo: MetodoCobranca;
  terreiroNome?: string | null;
  logoUrl?: string | null;
  whatsapp?: string | null;
  /** A baixa entrou (o mês virou "paga"): a página recarrega a lista. */
  onPaga: () => void;
}

const CODE_BOX =
  'rounded-xl border border-border bg-muted px-3 py-2.5 font-mono text-sm break-all select-all';

function codigoDoErro(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { details?: { error_code?: string } } } })?.response?.data;
  return data?.details?.error_code;
}

function validadeBr(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TIME_ZONE, day: '2-digit', month: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${dia} às ${hora.replace(':', 'h')}`;
}

const maskCep = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

interface DadosBoleto {
  cpf: string;
  logradouro: string;
  cidade: string;
  uf: string;
  cep: string;
}

const BOLETO_VAZIO: DadosBoleto = { cpf: '', logradouro: '', cidade: '', uf: '', cep: '' };

export function PagarAutomaticoSheet({
  open,
  onOpenChange,
  mes,
  metodo,
  terreiroNome,
  logoUrl,
  whatsapp,
  onPaga,
}: PagarAutomaticoSheetProps) {
  const [cobranca, setCobranca] = useState<CobrancaDoMes | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedeCpf, setPedeCpf] = useState(false);
  const [cpf, setCpf] = useState('');
  const [boleto, setBoleto] = useState<DadosBoleto>(BOLETO_VAZIO);
  const [copiado, setCopiado] = useState(false);
  const [semCopia, setSemCopia] = useState(false);
  const avisouPaga = useRef(false);

  const paga = cobranca?.status === 'paga' || cobranca?.mes_status === 'paga';
  // Só o "AAAA-MM" importa: a página recarrega a lista (objeto novo) sem fechar a folha.
  const mesKey = mes?.mes ?? null;

  const gerar = useCallback(
    async (corpo: Record<string, unknown>) => {
      if (!mesKey) return;
      setGerando(true);
      setErro(null);
      try {
        const res = await apiClient.post<CobrancaDoMes>(`/api/v1/medium/mensalidades/${mesKey}/cobranca`, {
          metodo,
          ...corpo,
        });
        setCobranca(res.data);
        setPedeCpf(false);
      } catch (err) {
        if (codigoDoErro(err) === 'CPF_NECESSARIO') {
          setPedeCpf(true);
        } else {
          setErro(extractApiErrorMessage(err, 'Não conseguimos gerar a cobrança agora. Tente de novo.'));
        }
      } finally {
        setGerando(false);
      }
    },
    [mesKey, metodo],
  );

  // Abriu a folha: PIX é gerado na hora; boleto espera os dados de quem paga.
  useEffect(() => {
    if (!open || !mesKey) return;
    setCobranca(null);
    setErro(null);
    setPedeCpf(false);
    setCopiado(false);
    setSemCopia(false);
    avisouPaga.current = false;
    if (metodo === 'pix') void gerar({});
  }, [open, mesKey, metodo, gerar]);

  // "Já caiu?" — consulta a cobrança enquanto está pendente e a folha aberta.
  useEffect(() => {
    if (!open || !mesKey || !cobranca || cobranca.status !== 'pendente' || paga) return;
    const id = window.setInterval(() => {
      apiClient
        .get<CobrancaDoMes>(`/api/v1/medium/mensalidades/${mesKey}/cobranca`, { params: { metodo } })
        .then((res) => setCobranca((atual) => (atual ? { ...atual, ...res.data } : res.data)))
        .catch(() => undefined);
    }, INTERVALO_CONSULTA_MS);
    return () => window.clearInterval(id);
  }, [open, mesKey, metodo, cobranca, paga]);

  useEffect(() => {
    if (paga && !avisouPaga.current) {
      avisouPaga.current = true;
      onPaga();
    }
  }, [paga, onPaga]);

  const copiar = async (texto: string) => {
    const ok = await copiarTexto(texto);
    setCopiado(ok);
    setSemCopia(!ok);
  };

  const boletoValido =
    boleto.cpf.replace(/\D/g, '').length === 11 &&
    boleto.logradouro.trim().length >= 3 &&
    boleto.cidade.trim().length >= 2 &&
    /^[A-Za-z]{2}$/.test(boleto.uf.trim()) &&
    boleto.cep.replace(/\D/g, '').length === 8;

  const falar = whatsapp ? (
    <Button asChild variant="outline" size="touch" className="w-full font-bold">
      <a href={whatsapp} target="_blank" rel="noopener noreferrer">
        <MessageCircle aria-hidden /> Falar com a casa
      </a>
    </Button>
  ) : null;

  let conteudo: React.ReactNode;
  if (paga) {
    conteudo = (
      <div className="flex items-start gap-2.5 rounded-xl bg-success/10 p-3 text-base text-success-strong" role="status">
        <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span>
          <strong>Pagamento recebido!</strong>
          <br />
          Sua mensalidade de {mes ? nomeDoMes(mes.mes) : ''} está paga. Não precisa enviar comprovante.
        </span>
      </div>
    );
  } else if (erro) {
    conteudo = (
      <div className="flex flex-col gap-3">
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3 text-base text-destructive-strong"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>{erro}</span>
        </p>
        <Button
          type="button"
          size="touch"
          className="w-full font-bold"
          onClick={() => (metodo === 'pix' && !pedeCpf ? void gerar({}) : setErro(null))}
        >
          Tentar de novo
        </Button>
        {falar}
      </div>
    );
  } else if (pedeCpf && metodo === 'pix') {
    conteudo = (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void gerar({ cpf });
        }}
      >
        <p className="text-base">Para gerar o PIX, informe o CPF de quem vai pagar. Ele vai direto para o banco e não fica guardado.</p>
        <MaskedInput mask="cpf" label="CPF" inputMode="numeric" value={cpf} onChange={setCpf} data-testid="cobranca-cpf" />
        <Button type="submit" size="touch" className="w-full font-bold" disabled={gerando || cpf.replace(/\D/g, '').length !== 11}>
          {gerando && <Loader2 className="animate-spin" aria-hidden />} Gerar PIX
        </Button>
      </form>
    );
  } else if (metodo === 'boleto' && !cobranca) {
    const set = <K extends keyof DadosBoleto>(k: K, v: DadosBoleto[K]) => setBoleto((b) => ({ ...b, [k]: v }));
    conteudo = (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void gerar({
            cpf: boleto.cpf,
            endereco: {
              logradouro: boleto.logradouro,
              cidade: boleto.cidade,
              uf: boleto.uf.toUpperCase(),
              cep: boleto.cep,
            },
          });
        }}
      >
        <p className="text-base">
          O boleto pede o CPF e o endereço de quem paga. Os dados vão direto para o banco e não ficam guardados.
        </p>
        <MaskedInput mask="cpf" label="CPF" inputMode="numeric" value={boleto.cpf} onChange={(v) => set('cpf', v)} />
        <TextField
          label="Endereço (rua e número)"
          value={boleto.logradouro}
          onChange={(e) => set('logradouro', e.target.value)}
          autoComplete="address-line1"
          maxLength={200}
        />
        <TextField
          label="Cidade"
          value={boleto.cidade}
          onChange={(e) => set('cidade', e.target.value)}
          autoComplete="address-level2"
          maxLength={100}
        />
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
          <TextField
            label="UF"
            value={boleto.uf}
            onChange={(e) => set('uf', e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase())}
            autoComplete="address-level1"
            maxLength={2}
          />
          <MaskedInput
            mask={maskCep}
            label="CEP"
            inputMode="numeric"
            autoComplete="postal-code"
            value={boleto.cep}
            onChange={(v) => set('cep', v)}
          />
        </div>
        <Button type="submit" size="touch" className="w-full font-bold" disabled={gerando || !boletoValido}>
          {gerando && <Loader2 className="animate-spin" aria-hidden />} Gerar boleto
        </Button>
      </form>
    );
  } else if (!cobranca) {
    conteudo = (
      <div className="flex flex-col gap-3" role="status" aria-label="Gerando a cobrança">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  } else if (cobranca.metodo === 'boleto') {
    conteudo = (
      <ol className="flex flex-col gap-4">
        <Passo n={1}>
          <strong>Copie o código do boleto</strong>
          {cobranca.boleto_linha_digitavel && (
            <div className={CODE_BOX} data-testid="boleto-linha">
              {cobranca.boleto_linha_digitavel}
            </div>
          )}
          {cobranca.boleto_linha_digitavel && (
            <Button
              type="button"
              size="touch"
              className="w-full font-bold"
              onClick={() => void copiar(cobranca.boleto_linha_digitavel ?? '')}
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? 'Código copiado' : 'Copiar código do boleto'}
            </Button>
          )}
          {cobranca.boleto_url && (
            <Button asChild variant="outline" size="touch" className="w-full font-bold">
              <a href={cobranca.boleto_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Abrir o boleto
              </a>
            </Button>
          )}
        </Passo>
        <Passo n={2}>
          <span>
            Pague no app do banco{cobranca.expira_em ? ` até ${validadeBr(cobranca.expira_em)}` : ''}. O banco leva até 1 dia
            útil para avisar; depois disso a mensalidade aparece como <strong>paga</strong> aqui.
          </span>
        </Passo>
      </ol>
    );
  } else {
    conteudo = (
      <>
        <ol className="flex flex-col gap-4">
          <Passo n={1}>
            <strong>Copie o código do PIX</strong>
            <div className={CODE_BOX} data-testid="pix-auto-copia-e-cola">
              {cobranca.copia_e_cola}
            </div>
            <Button
              type="button"
              size="touch"
              className="w-full font-bold"
              onClick={() => void copiar(cobranca.copia_e_cola ?? '')}
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiado ? 'Código copiado' : 'Copiar código do PIX'}
            </Button>
            {semCopia && (
              <p role="status" className="text-sm text-muted-foreground">
                Não deu para copiar sozinho. Toque e segure no código acima e escolha <strong>Copiar</strong>.
              </p>
            )}
          </Passo>
          <Passo n={2}>
            <span>
              Abra o app do seu banco, entre em <strong>PIX</strong> e escolha <strong>PIX copia e cola</strong>.
            </span>
          </Passo>
          <Passo n={3}>
            <span>
              Pronto: assim que o banco confirmar, a mensalidade aparece como <strong>paga</strong> aqui. Não precisa enviar
              comprovante.
            </span>
          </Passo>
        </ol>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={cobranca.copia_e_cola ?? ''} size={200} level="M" data-testid="pix-auto-qr" />
          </div>
          <p className="text-center text-sm text-muted-foreground">Para pagar de outro aparelho, aponte a câmera do app do banco.</p>
        </div>
        {cobranca.expira_em && (
          <p className="text-sm text-muted-foreground">Este PIX vale até {validadeBr(cobranca.expira_em)}.</p>
        )}
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Esperando o pagamento…
        </p>
      </>
    );
  }

  return (
    <MediumSheet
      open={open}
      onOpenChange={onOpenChange}
      data-testid="sheet-pagar-automatico"
      title={metodo === 'boleto' ? 'Pagar com boleto' : 'Pagar com PIX'}
      leading={<TerreiroEmblem nome={terreiroNome ?? undefined} logoUrl={logoUrl} className="size-11" />}
      description={
        mes ? (
          <>
            Para {terreiroNome || 'a casa'} · {nomeDoMes(mes.mes)} ·{' '}
            <strong className="text-foreground">{valorBr(cobranca?.valor ?? mes.valor)}</strong>
          </>
        ) : undefined
      }
    >
      {conteudo}
    </MediumSheet>
  );
}

export default PagarAutomaticoSheet;
