/**
 * /cadastro — cria o terreiro e o primeiro admin numa tela só.
 * Validação no blur (react-hook-form + zod em `components/auth/cadastroForm.ts`); a regra de
 * senha é a mesma do backend. Depois de criar a conta, leva direto para a primeira gira.
 */
'use client';

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, CreditCard, Loader2, PartyPopper } from 'lucide-react';
import { AuthShell, PasswordRules } from '@/components/auth';
import {
  AFTER_SIGNUP_PATH,
  CADASTRO_DEFAULTS,
  buildOnboardingPayload,
  cadastroSchema,
  maskDocumento,
  type CadastroFormValues,
} from '@/components/auth/cadastroForm';
import { TextField, PasswordField, MaskedInput } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { apiClient } from '@/services/api_client';
import { dispatchTenantBrandingUpdated } from '@/providers/ThemeProvider';
import { COMO_CONHECEU_OPTIONS, PRINCIPAL_DOR_OPTIONS } from '@/constants/onboarding';
import { trackEvent } from '@/services/analytics';
import { PLANS, formatPricePerMonth, normalizePlanKey } from '@/constants/plans';

// Chip de escolha opcional (ToggleGroup): quebra linha no celular, destaque na cor do tema.
const CHIP_CLASS =
  'h-auto min-h-8 whitespace-normal rounded-full px-3 py-1.5 text-left text-xs data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary';

export default function CadastroPage() {
  const router = useRouter();
  const wantedPlanKey = normalizePlanKey(router.query.plan);
  const wantedPlan = wantedPlanKey && wantedPlanKey !== 'free' ? PLANS[wantedPlanKey] : null;

  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CadastroFormValues>({
    resolver: zodResolver(cadastroSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: CADASTRO_DEFAULTS,
  });
  const { register, control, handleSubmit, watch, formState } = form;
  const { errors, isSubmitting } = formState;
  const password = watch('password');

  const onSubmit = async (values: CadastroFormValues) => {
    setSubmitError(null);
    const payload = buildOnboardingPayload(values);
    try {
      const res = await apiClient.post('/api/v1/public/onboarding', payload);

      trackEvent('signup_completed', { principal_dor: payload.principal_dor ?? 'nao_informado' });

      const { user } = res.data;
      // access_token chega como cookie HttpOnly
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
      const e = err as { response?: { data?: { detail?: unknown; message?: unknown } } } | undefined;
      const detail = e?.response?.data?.detail ?? e?.response?.data?.message ?? 'Não foi possível criar a conta. Tente novamente.';
      setSubmitError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

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
        title="Crie a conta do seu terreiro"
        subtitle={wantedPlan ? 'Crie a conta e siga para o pagamento' : '1 mês de Premium grátis, sem cartão'}
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        }
      >
        {wantedPlan ? (
          <Alert variant="info" className="mb-5">
            <CreditCard aria-hidden />
            <AlertDescription className="block">
              <strong>Plano escolhido: {wantedPlan.label} — {formatPricePerMonth(wantedPlan.price)}.</strong>{' '}
              Depois do cadastro você vai para o pagamento seguro.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning" className="mb-5">
            <PartyPopper aria-hidden />
            <AlertDescription className="block">
              <strong>Novos terreiros ganham 1 mês grátis no Premium.</strong> Sem cartão. Depois, a conta continua no
              plano gratuito até você escolher assinar.
            </AlertDescription>
          </Alert>
        )}

        {submitError && (
          <Alert variant="destructive" role="alert" className="mb-5">
            <CircleAlert aria-hidden />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <TextField
            label="Nome do terreiro"
            required
            autoFocus
            maxLength={255}
            error={errors.terreiroNome?.message}
            {...register('terreiroNome')}
          />

          <TextField
            label="Seu nome"
            required
            maxLength={255}
            autoComplete="name"
            error={errors.nome?.message}
            {...register('nome')}
          />

          <Controller
            control={control}
            name="whatsapp"
            render={({ field }) => (
              <MaskedInput
                mask="telefone"
                label="Seu WhatsApp"
                required
                placeholder="(11) 99999-9999"
                autoComplete="tel"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.whatsapp?.message}
              />
            )}
          />

          <div className="flex flex-col gap-2">
            <PasswordField
              label="Senha"
              required
              autoComplete="new-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <PasswordRules value={password} />
          </div>

          <Controller
            control={control}
            name="comoConheceu"
            render={({ field }) => (
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-sm font-medium">Como nos conheceu? (opcional)</legend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={2}
                  value={field.value || ''}
                  onValueChange={(v) => field.onChange(v ?? '')}
                  aria-label="Como nos conheceu?"
                  className="flex-wrap justify-start"
                >
                  {COMO_CONHECEU_OPTIONS.map((o) => (
                    <ToggleGroupItem key={o.value} value={o.value} size="sm" className={CHIP_CLASS}>
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </fieldset>
            )}
          />

          <Controller
            control={control}
            name="principalDor"
            render={({ field }) => (
              <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
                <legend className="mb-2 p-0 text-sm font-medium">O que você mais precisa resolver? (opcional)</legend>
                <p className="text-xs text-muted-foreground">Montamos seu guia inicial a partir disso.</p>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={2}
                  value={field.value || ''}
                  onValueChange={(v) => field.onChange(v ?? '')}
                  aria-label="O que você mais precisa resolver?"
                  className="flex-wrap justify-start"
                >
                  {PRINCIPAL_DOR_OPTIONS.map((o) => (
                    <ToggleGroupItem
                      key={o.value}
                      value={o.value}
                      size="sm"
                      className={CHIP_CLASS}
                    >
                      {o.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </fieldset>
            )}
          />

          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              E-mail e CPF/CNPJ são usados para liberar seu mês grátis e recuperar o acesso. Não aparecem para
              ninguém.
            </p>
            <div className="flex flex-col gap-4">
              <TextField
                label="E-mail"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                error={errors.email?.message}
                {...register('email')}
              />
              <Controller
                control={control}
                name="documento"
                render={({ field }) => (
                  <MaskedInput
                    mask={maskDocumento}
                    label="CPF ou CNPJ"
                    required
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.documento?.message}
                    helperText={!errors.documento ? 'Usado para liberar seu mês grátis no Premium.' : undefined}
                  />
                )}
              />
            </div>
          </div>

          <Controller
            control={control}
            name="aceiteTermos"
            render={({ field }) => (
              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="aceite-termos"
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                    aria-invalid={Boolean(errors.aceiteTermos) || undefined}
                    aria-describedby={errors.aceiteTermos ? 'aceite-termos-erro' : undefined}
                    className="mt-0.5"
                  />
                  <Label htmlFor="aceite-termos" className="block cursor-pointer font-normal leading-snug">
                    Li e aceito os{' '}
                    <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e a{' '}
                    <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
                      Política de Privacidade
                    </a>
                  </Label>
                </div>
                {errors.aceiteTermos && (
                  <p id="aceite-termos-erro" className="text-xs text-destructive">
                    {errors.aceiteTermos.message}
                  </p>
                )}
              </div>
            )}
          />

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {isSubmitting ? 'Criando…' : wantedPlan ? `Criar conta e assinar ${wantedPlan.label}` : 'Criar minha conta'}
          </Button>
        </form>
      </AuthShell>
    </>
  );
}
