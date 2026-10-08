/**
 * /cadastro — cria o terreiro e o primeiro admin em 4 passos curtos (CADASTRO_STEPS em
 * `components/auth/cadastroForm.ts`): Seu terreiro → Você → Acesso → Para começar.
 *
 * - Um formulário só (react-hook-form + zod); cada "Continuar" valida apenas os campos do passo e
 *   leva o foco ao primeiro campo do passo seguinte. Enter avança. "Voltar" mantém tudo.
 * - Erros aparecem depois da primeira tentativa de avançar e somem enquanto a pessoa corrige.
 * - O passo vai para a URL (`?passo=2`, shallow): o "voltar" do navegador/Android volta um passo
 *   em vez de sair do cadastro. `?plan=` é preservado.
 * - Rascunho na aba (sessionStorage) sem senha, CPF/CNPJ nem aceite — quem sai e volta não perde
 *   o que já digitou. Apagado ao criar a conta.
 * - Recusa do backend volta ao passo do campo (e-mail já cadastrado → passo "Você").
 * - E-mail que já tem conta ativa em outro terreiro (409 `EMAIL_JA_TEM_CONTA`, 2026-10-08): volta ao
 *   passo "Acesso" com um aviso e um campo só, "Senha da sua conta GiraHub" (sem a regra de senha
 *   nova; "Esqueci a senha" e "Usar outro e-mail"), e reenvia com `conta_existente: true`. Senha errada
 *   (400 `SENHA_CONTA_INCORRETA`) fica no campo; limite de 5 terreiros por e-mail
 *   (409 `LIMITE_CONTAS_EMAIL`) volta ao e-mail. Trocar o e-mail desliga o modo. Não há consulta
 *   antecipada de e-mail (seria um oráculo de "este e-mail tem conta"): só a resposta do envio.
 * Mesmo payload de antes (`buildOnboardingPayload`) e, depois de criar a conta, direto para a
 * primeira gira — ou para o pagamento, com `?plan=` pago.
 */
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  CircleAlert,
  Compass,
  CreditCard,
  Ellipsis,
  Gift,
  Globe,
  Handshake,
  Info,
  Loader2,
  Package,
  Search,
  Ticket,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { AuthShell, AUTH_INPUT, AUTH_LINK, ChoiceCards, PasswordRules, SignupProgress } from '@/components/auth';
import {
  AFTER_SIGNUP_PATH,
  CADASTRO_DEFAULTS,
  CADASTRO_DRAFT_KEY,
  CADASTRO_STEPS,
  buildOnboardingPayload,
  cadastroSchema,
  cadastroSchemaContaExistente,
  maskDocumento,
  parseOnboardingError,
  pickDraft,
  previewSlug,
  readDraft,
  stepOfField,
  type CadastroField,
  type CadastroFormValues,
} from '@/components/auth/cadastroForm';
import { TextField, PasswordField, MaskedInput } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/services/api_client';
import { dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';
import { COMO_CONHECEU_OPTIONS, PRINCIPAL_DOR_OPTIONS } from '@/constants/onboarding';
import { trackEvent } from '@/services/analytics';
import { PLANS, formatPricePerMonth, normalizePlanKey } from '@/constants/plans';

// Ícones dos cartões de escolha do passo "Para começar" (rótulos/valores vêm de constants/onboarding).
const DOR_ICONS: Record<string, LucideIcon> = {
  senhas: Ticket,
  mediuns: Users,
  financeiro: Wallet,
  divulgacao: Globe,
  estoque: Package,
  outro: Compass,
};
const COMO_ICONS: Record<string, LucideIcon> = { google: Search, instagram: Camera, indicacao: Handshake, outro: Ellipsis };
const DOR_CARDS = PRINCIPAL_DOR_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: DOR_ICONS[o.value] }));
const COMO_CONHECEU_CARDS = COMO_CONHECEU_OPTIONS.map((o) => ({ value: o.value, label: o.label, icon: COMO_ICONS[o.value] }));

const LAST_STEP = CADASTRO_STEPS.length - 1;
const ACESSO_STEP = stepOfField('password');

// Senha nova (regra visível) ou senha da conta que o e-mail já tem (só não pode ficar vazia).
const resolverSenhaNova = zodResolver(cadastroSchema);
const resolverContaExistente = zodResolver(cadastroSchemaContaExistente);

function session(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** `?passo=N` (1-based) → índice 0-based; ausente/inválido → 0. */
function stepFromQuery(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= CADASTRO_STEPS.length ? n - 1 : 0;
}

export default function CadastroPage() {
  const router = useRouter();
  const wantedPlanKey = normalizePlanKey(router.query.plan);
  const wantedPlan = wantedPlanKey && wantedPlanKey !== 'free' ? PLANS[wantedPlanKey] : null;

  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const maxReached = useRef(0);
  /** Passos em que a pessoa já tentou avançar: a partir daí, os erros se refazem a cada tecla. */
  const attempted = useRef<Set<number>>(new Set());
  /** Entradas de histórico criadas por nós (para o "Voltar" usar o histórico do navegador). */
  const historyDepth = useRef(0);
  const pendingFocus = useRef<CadastroField | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  /** O e-mail já tem conta no GiraHub: a senha do passo "Acesso" é a dessa conta. Ref para o resolver. */
  const [contaExistente, setContaExistente] = useState(false);
  const contaExistenteRef = useRef(false);
  const setModoContaExistente = useCallback((value: boolean) => {
    contaExistenteRef.current = value;
    setContaExistente(value);
  }, []);

  const form = useForm<CadastroFormValues>({
    resolver: (values, context, options) =>
      (contaExistenteRef.current ? resolverContaExistente : resolverSenhaNova)(values, context, options),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: CADASTRO_DEFAULTS,
  });
  const { register, control, handleSubmit, watch, trigger, setError, setFocus, setValue, clearErrors, reset, formState } =
    form;
  const { errors, isSubmitting } = formState;
  const password = watch('password');
  const email = watch('email');
  const terreiroNome = watch('terreiroNome');
  const slug = previewSlug(terreiroNome ?? '');

  // Rascunho: restaura o que a pessoa já tinha digitado nesta aba (sem senha/documento/aceite).
  useEffect(() => {
    const draft = readDraft(session());
    if (Object.keys(draft).length) reset({ ...CADASTRO_DEFAULTS, ...draft });
  }, [reset]);

  // Salva o rascunho e refaz a validação do campo depois da primeira tentativa no passo dele.
  useEffect(() => {
    const sub = watch((values, { name }) => {
      try {
        session()?.setItem(CADASTRO_DRAFT_KEY, JSON.stringify(pickDraft(values as Partial<CadastroFormValues>)));
      } catch {
        /* armazenamento indisponível: segue sem rascunho */
      }
      const field = name as CadastroField | undefined;
      // Outro e-mail: volta a ser senha nova (a conta existente era do e-mail anterior).
      if (field === 'email' && contaExistenteRef.current) setModoContaExistente(false);
      if (field && attempted.current.has(stepOfField(field))) void trigger(field);
    });
    return () => sub.unsubscribe();
  }, [watch, trigger, setModoContaExistente]);

  // Foco no primeiro campo (ou no campo com erro do servidor) a cada troca de passo.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // No celular o topo do passo (progresso + pergunta) pode ter ficado acima da tela.
    const progressTop = progressRef.current?.getBoundingClientRect().top ?? 0;
    const scrolled = progressTop < 0;
    if (scrolled) progressRef.current?.scrollIntoView({ block: 'start' });
    const field = pendingFocus.current;
    pendingFocus.current = null;
    if (field) {
      setFocus(field);
      return;
    }
    sectionRef.current
      ?.querySelector<HTMLElement>('input:not([type="hidden"]), button[role="radio"], button[role="checkbox"]')
      ?.focus({ preventScroll: scrolled });
  }, [step, setFocus]);

  // ── Passo na URL ───────────────────────────────────────────────────────────
  const stepUrl = useCallback(
    (index: number) => {
      const query: Record<string, string | string[] | undefined> = { ...router.query };
      if (index > 0) query.passo = String(index + 1);
      else delete query.passo;
      return { pathname: router.pathname || '/cadastro', query };
    },
    [router.pathname, router.query],
  );

  const pushStep = (index: number) => {
    try {
      Promise.resolve(router.push(stepUrl(index), undefined, { shallow: true, scroll: false }))
        .then((ok) => {
          if (ok) historyDepth.current += 1;
        })
        .catch(() => {});
    } catch {
      /* roteador indisponível (testes): o passo vive só no estado */
    }
  };

  const replaceStep = (index: number) => {
    try {
      Promise.resolve(router.replace(stepUrl(index), undefined, { shallow: true, scroll: false })).catch(() => {});
    } catch {
      /* idem */
    }
  };

  // "Voltar"/"avançar" do navegador: segue a URL, sem pular passos ainda não validados.
  const urlStep = stepFromQuery(router.query.passo);
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    if (!router.isReady) return;
    const target = Math.min(urlStep, maxReached.current);
    const currentStep = stepRef.current;
    if (target === currentStep) return;
    if (target < currentStep) historyDepth.current = Math.max(0, historyDepth.current - (currentStep - target));
    setStep(target);
  }, [urlStep, router.isReady]);

  /** Volta para um passo anterior mantendo os valores. */
  const goTo = (target: number) => {
    if (target < 0 || target >= step) return;
    const back = step - target;
    setSubmitError(null);
    setStep(target);
    if (historyDepth.current >= back) {
      historyDepth.current -= back;
      if (back === 1) router.back();
      else window.history.go(-back);
    } else {
      replaceStep(target);
    }
  };

  const goNext = async () => {
    setSubmitError(null);
    attempted.current.add(step);
    const ok = await trigger([...CADASTRO_STEPS[step].fields], { shouldFocus: true });
    if (!ok) return;
    trackEvent('signup_step_completed', { passo: step + 1, etapa: CADASTRO_STEPS[step].key });
    const next = step + 1;
    maxReached.current = Math.max(maxReached.current, next);
    setStep(next);
    pushStep(next);
  };

  /** Erro de validação no envio final: volta ao primeiro passo com problema. */
  const onInvalid = (errs: FieldErrors<CadastroFormValues>) => {
    const first = CADASTRO_STEPS.findIndex((s) => s.fields.some((f) => errs[f]));
    if (first < 0) return;
    CADASTRO_STEPS.forEach((_, i) => attempted.current.add(i));
    if (first < step) {
      pendingFocus.current = CADASTRO_STEPS[first].fields.find((f) => errs[f]) ?? null;
      goTo(first);
    }
  };

  const onSubmit = async (values: CadastroFormValues) => {
    setSubmitError(null);
    const payload = buildOnboardingPayload(values, contaExistenteRef.current);
    try {
      const res = await apiClient.post('/api/v1/public/onboarding', payload);

      trackEvent('signup_completed', { principal_dor: payload.principal_dor ?? 'nao_informado' });
      try {
        session()?.removeItem(CADASTRO_DRAFT_KEY);
      } catch {
        /* ignora */
      }

      const { user } = res.data;
      // A sessão chega nos mesmos 3 cookies do login (access_token e refresh_token HttpOnly +
      // auth_state legível) — aqui só o `user` vai para o localStorage.
      localStorage.setItem('user', JSON.stringify(user));
      dispatchTenantBrandingUpdated();

      // Plano pago escolhido na landing: vai direto para o pagamento.
      if (wantedPlan) {
        try {
          const checkoutRes = await apiClient.post('/api/v1/admin/billing/checkout', { plan: wantedPlan.key });
          window.location.href = checkoutRes.data.checkout_url;
          return;
        } catch {
          window.location.href = '/admin/billing?status=checkout_error';
          return;
        }
      }

      // Recarga completa para os providers remontarem com a sessão nova.
      window.location.href = AFTER_SIGNUP_PATH;
    } catch (err) {
      const target = parseOnboardingError(err);
      if (target.code === 'EMAIL_JA_TEM_CONTA') {
        // Não é erro: a pessoa já tem conta. O passo "Acesso" passa a pedir a senha dessa conta
        // (o aviso explica). A senha nova digitada sai do campo, sem erro até a próxima tentativa.
        trackEvent('signup_email_ja_tem_conta');
        setModoContaExistente(true);
        attempted.current.delete(ACESSO_STEP);
        setValue('password', '');
        clearErrors('password');
        if (ACESSO_STEP < step) {
          pendingFocus.current = 'password';
          goTo(ACESSO_STEP);
        } else {
          setFocus('password');
        }
        return;
      }
      if (!target.field) {
        setSubmitError(target.message);
        return;
      }
      const target_step = stepOfField(target.field);
      attempted.current.add(target_step);
      setError(target.field, { type: 'server', message: target.message });
      if (target_step < step) {
        pendingFocus.current = target.field;
        goTo(target_step);
      } else {
        setFocus(target.field);
      }
    }
  };

  const onFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step < LAST_STEP) {
      void goNext();
      return;
    }
    void handleSubmit(onSubmit, onInvalid)(e);
  };

  const current = CADASTRO_STEPS[step];
  const senhaDaConta = current.key === 'acesso' && contaExistente;
  const stepTitle = senhaDaConta ? 'Use a senha que você já tem' : current.title;
  const stepHint = senhaDaConta
    ? 'Uma senha só: com ela você entra no terreiro novo e nos que já usa.'
    : current.hint;

  /** "Usar outro e-mail": volta ao passo "Você" com o foco no e-mail (trocar desliga o modo). */
  const usarOutroEmail = () => {
    pendingFocus.current = 'email';
    goTo(stepOfField('email'));
  };
  const emailTaken = errors.email?.type === 'server' && /cadastrad/i.test(errors.email.message ?? '');

  return (
    <>
      <Head>
        <title>Criar conta — GiraHub</title>
        <meta
          name="description"
          content="Crie sua conta gratuita no GiraHub e coloque a primeira gira no ar em 3 minutos: senha pelo WhatsApp e fila sem tumulto."
        />
        <link rel="canonical" href="https://girahub.com.br/cadastro" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://girahub.com.br/cadastro" />
        <meta property="og:title" content="Criar conta grátis — GiraHub" />
        <meta
          property="og:description"
          content="Crie sua conta gratuita no GiraHub e coloque a primeira gira no ar em 3 minutos."
        />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="GiraHub" />
      </Head>

      <AuthShell
        size="sm"
        photo="maeDeSantoVela"
        headerAction={{ label: 'Já tenho conta', href: '/login' }}
        title="Crie a conta do seu terreiro"
        subtitle={
          wantedPlan
            ? 'Quatro passos rápidos e você segue para o pagamento.'
            : 'Quatro passos rápidos e a sua primeira gira já pode ir para o ar.'
        }
        footer={
          <p className="text-center text-sm text-tinta-suave">
            Já tem conta?{' '}
            <Link href="/login" className={AUTH_LINK}>
              Entrar
            </Link>
          </p>
        }
      >
        {wantedPlan ? (
          <p className="mb-6 flex items-start gap-2.5 rounded-xl bg-areia-100 px-3.5 py-2.5 text-sm text-tinta">
            <CreditCard className="mt-0.5 size-4 shrink-0 text-barro-700" aria-hidden />
            <span>
              <strong>
                Plano escolhido: {wantedPlan.label} — {formatPricePerMonth(wantedPlan.price)}.
              </strong>{' '}
              Depois do cadastro você vai para o pagamento seguro.
            </span>
          </p>
        ) : (
          <p className="mb-6 flex items-start gap-2.5 rounded-xl bg-areia-100 px-3.5 py-2.5 text-sm text-tinta">
            <Gift className="mt-0.5 size-4 shrink-0 text-barro-700" aria-hidden />
            <span>
              <strong>1 mês de Premium grátis, sem cartão.</strong> Depois, a conta segue no plano gratuito até
              você escolher assinar.
            </span>
          </p>
        )}

        <div ref={progressRef} className="mb-7 scroll-mt-4">
          <SignupProgress steps={CADASTRO_STEPS} active={step} onStepClick={goTo} />
        </div>

        <form onSubmit={onFormSubmit} noValidate aria-labelledby="passo-titulo">
          <div ref={sectionRef} key={current.key}>
            <h2 id="passo-titulo" className="font-display text-2xl leading-tight font-bold text-tinta">
              {stepTitle}
            </h2>
            <p className="mt-1.5 text-sm text-tinta-suave">{stepHint}</p>

            <div className="mt-6 flex flex-col gap-6">
              {current.key === 'terreiro' && (
                <TextField
                  label="Nome do terreiro"
                  required
                  autoFocus
                  maxLength={255}
                  placeholder="Ex.: Tenda Caboclo Pena Branca"
                  inputClassName={AUTH_INPUT}
                  error={errors.terreiroNome?.message}
                  helperText={
                    slug.length >= 3 ? (
                      <>
                        Seu link vai ficar parecido com{' '}
                        <span className="font-semibold break-all text-tinta">girahub.com.br/{slug}</span>
                      </>
                    ) : undefined
                  }
                  {...register('terreiroNome')}
                />
              )}

              {current.key === 'voce' && (
                <>
                  <TextField
                    label="Seu nome"
                    required
                    maxLength={255}
                    autoComplete="name"
                    inputClassName={AUTH_INPUT}
                    error={errors.nome?.message}
                    {...register('nome')}
                  />
                  <Controller
                    control={control}
                    name="whatsapp"
                    render={({ field }) => (
                      <MaskedInput
                        ref={field.ref}
                        mask="telefone"
                        label="Seu WhatsApp"
                        required
                        placeholder="(11) 99999-9999"
                        autoComplete="tel"
                        inputClassName={AUTH_INPUT}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.whatsapp?.message}
                      />
                    )}
                  />
                  <div className="flex flex-col gap-1.5">
                    <TextField
                      label="E-mail"
                      type="email"
                      required
                      autoComplete="email"
                      inputMode="email"
                      inputClassName={AUTH_INPUT}
                      error={errors.email?.message}
                      {...register('email')}
                    />
                    {emailTaken && (
                      <p className="text-sm text-tinta-suave">
                        É seu?{' '}
                        <Link href="/login" className={AUTH_LINK}>
                          Entrar com este e-mail
                        </Link>{' '}
                        ou{' '}
                        <Link href="/forgot-password" className={AUTH_LINK}>
                          recuperar a senha
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                </>
              )}

              {current.key === 'acesso' && (
                <>
                  {contaExistente && (
                    <Alert variant="info" role="status">
                      <Info aria-hidden />
                      <AlertDescription>
                        <span>
                          Você já tem conta no GiraHub com <strong className="break-all">{email}</strong>. Digite a
                          senha dessa conta para criar a casa nova. Depois, na hora de entrar, é só escolher o terreiro.
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-col gap-3">
                    <PasswordField
                      // Troca de modo remonta o campo (autocomplete e nome acessível novos).
                      key={contaExistente ? 'senha-da-conta' : 'senha-nova'}
                      label={contaExistente ? 'Senha da sua conta GiraHub' : 'Senha'}
                      required
                      autoComplete={contaExistente ? 'current-password' : 'new-password'}
                      inputClassName={AUTH_INPUT}
                      error={errors.password?.message}
                      {...register('password')}
                    />
                    {contaExistente ? (
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {/* Nova aba: o cadastro (senha e documento não vão para o rascunho) continua aqui. */}
                        <a href="/forgot-password" target="_blank" rel="noopener noreferrer" className={AUTH_LINK}>
                          Esqueci a senha
                        </a>
                        <button type="button" className={AUTH_LINK} onClick={usarOutroEmail}>
                          Usar outro e-mail
                        </button>
                      </p>
                    ) : (
                      <PasswordRules value={password} />
                    )}
                  </div>
                  <Controller
                    control={control}
                    name="documento"
                    render={({ field }) => (
                      <MaskedInput
                        ref={field.ref}
                        mask={maskDocumento}
                        label="CPF ou CNPJ"
                        required
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        inputClassName={AUTH_INPUT}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.documento?.message}
                        helperText={!errors.documento ? 'Usado só para liberar seu mês grátis no Premium. Não aparece para ninguém.' : undefined}
                      />
                    )}
                  />
                </>
              )}

              {current.key === 'comeco' && (
                <>
                  <Controller
                    control={control}
                    name="principalDor"
                    render={({ field }) => (
                      <ChoiceCards
                        label="O que você mais precisa resolver?"
                        required
                        options={DOR_CARDS}
                        value={field.value}
                        onChange={field.onChange}
                        focusRef={field.ref}
                        error={errors.principalDor?.message}
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="comoConheceu"
                    render={({ field }) => (
                      <ChoiceCards
                        label="Como nos conheceu?"
                        required
                        columns="2"
                        options={COMO_CONHECEU_CARDS}
                        value={field.value}
                        onChange={field.onChange}
                        focusRef={field.ref}
                        error={errors.comoConheceu?.message}
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="aceiteTermos"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1.5 rounded-xl border border-areia-200 bg-areia-50 p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            ref={field.ref}
                            id="aceite-termos"
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                            aria-invalid={Boolean(errors.aceiteTermos) || undefined}
                            aria-describedby={errors.aceiteTermos ? 'aceite-termos-erro' : undefined}
                            className="mt-0.5 size-5 bg-white"
                          />
                          <Label htmlFor="aceite-termos" className="block cursor-pointer text-sm leading-relaxed font-normal">
                            Li e aceito os{' '}
                            <a href="/termos" target="_blank" rel="noopener noreferrer" className={AUTH_LINK}>
                              Termos de Uso
                            </a>{' '}
                            e a{' '}
                            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className={AUTH_LINK}>
                              Política de Privacidade
                            </a>
                          </Label>
                        </div>
                        {errors.aceiteTermos && (
                          <p id="aceite-termos-erro" className="pl-8 text-xs text-destructive">
                            {errors.aceiteTermos.message}
                          </p>
                        )}
                      </div>
                    )}
                  />
                </>
              )}
            </div>
          </div>

          {/* Perto do botão: no celular, um aviso no topo do cartão ficaria fora da tela. */}
          {submitError && (
            <Alert variant="destructive" role="alert" className="mt-8">
              <CircleAlert aria-hidden />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="mt-9 flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
            <Button
              key={step === LAST_STEP ? 'criar' : 'continuar'}
              type="submit"
              size="touch"
              className="w-full font-bold sm:w-auto sm:min-w-48"
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              // Clique duplo em "Continuar" não pode pular um passo nem virar "Criar conta":
              // só o primeiro clique de uma sequência envia (teclado e toque têm detail 0/1).
              onClick={(e) => {
                if (e.detail > 1) e.preventDefault();
              }}
            >
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {step < LAST_STEP ? (
                <>
                  Continuar <ChevronRight aria-hidden />
                </>
              ) : isSubmitting ? (
                'Criando…'
              ) : wantedPlan ? (
                `Criar conta e assinar ${wantedPlan.label}`
              ) : (
                'Criar minha conta'
              )}
            </Button>
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="w-full text-tinta-suave hover:bg-areia-100 hover:text-tinta sm:w-auto"
                onClick={() => goTo(step - 1)}
                disabled={isSubmitting}
              >
                <ArrowLeft aria-hidden /> Voltar
              </Button>
            )}
          </div>
        </form>
      </AuthShell>
    </>
  );
}
