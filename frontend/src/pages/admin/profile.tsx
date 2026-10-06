/**
 * /admin/profile — dados da própria conta: foto, nome e telefone, senha, sessões e a
 * "Zona de risco" (desativar / excluir) num Accordion, com confirmação por senha em AlertDialog.
 * Tela de conta, sem feature de grupo: exceção em scripts/audit-permission-guards.js.
 */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CircleAlert, CloudUpload, Loader2, Lock, LogOut, PauseCircle, Save, Trash2, TriangleAlert } from 'lucide-react';
import AdminLayout from './admin_layout';
import { PageHeader } from '@/components/admin';
import { PasswordRules } from '@/components/auth';
import { TextField, PasswordField, MaskedInput } from '@/components/fields';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiClient, extractApiErrorMessage, ApiRequestConfig } from '@/services/api_client';
import { useSnackbar } from '@/contexts/SnackbarContext';
import { passwordError } from '@/constants/passwordPolicy';

interface ProfileData {
  id: string;
  email: string;
  username: string;
  role: string;
  tenant_id: string | null;
  is_active: boolean;
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
  profile_photo_url?: string | null;
}

const DIGITS_ONLY = /\D/g;

/** Telefone com DDD; aceita DDI quando vier com mais de 11 dígitos. */
function maskPhone(value: string): string {
  const digits = value.replace(DIGITS_ONLY, '').slice(0, 15);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, digits.length - 11)} (${digits.slice(-11, -9)}) ${digits.slice(-9, -4)}-${digits.slice(-4)}`;
}

function SectionTitle({ icon, title, description }: { icon?: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-base font-bold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Confirmação por senha + aceite, usada por desativar e excluir. */
function DangerDialog({
  open,
  onOpenChange,
  title,
  description,
  acceptLabel,
  confirmLabel,
  busyLabel,
  destructive,
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  acceptLabel: string;
  confirmLabel: string;
  busyLabel: string;
  destructive?: boolean;
  loading: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const acceptId = React.useId();

  useEffect(() => {
    if (!open) {
      setPassword('');
      setAccepted(false);
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <TriangleAlert className={cn('size-5', destructive ? 'text-destructive' : 'text-warning')} aria-hidden /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <PasswordField
          label="Digite sua senha para confirmar"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />
        <div className="flex items-start gap-2">
          <Checkbox id={acceptId} checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} disabled={loading} className="mt-0.5" />
          <Label htmlFor={acceptId} className="block cursor-pointer font-normal leading-snug">
            {acceptLabel}
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
            disabled={!password || !accepted || loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm(password);
            }}
          >
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {loading ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminProfilePage() {
  return (
    <AdminLayout title="Meu perfil" maxWidth="md">
      <ProfileContent />
    </AdminLayout>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { showSuccess } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const avatarText = useMemo(() => {
    const source = fullName || profile?.username || profile?.email || 'A';
    return source.charAt(0).toUpperCase();
  }, [fullName, profile?.username, profile?.email]);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const mergeStoredUser = (patch: Record<string, unknown>) => {
    const stored = localStorage.getItem('user');
    localStorage.setItem('user', JSON.stringify({ ...(stored ? JSON.parse(stored) : {}), ...patch }));
  };

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<ProfileData>('/api/v1/auth/profile');
      const user = response.data;
      setProfile(user);
      setFullName(user.full_name || '');
      setPhone(user.phone || '');
      setAvatarPreview(user.profile_photo_url || null);
      setAvatarFailed(false);
      mergeStoredUser(user as unknown as Record<string, unknown>);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível carregar seu perfil.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setError(null);
    const normalizedName = fullName.trim();
    const normalizedPhone = phone.replace(DIGITS_ONLY, '');
    if (normalizedName !== '' && normalizedName.length < 3) {
      setError('O nome precisa de pelo menos 3 letras.');
      return;
    }
    if (normalizedPhone !== '' && (normalizedPhone.length < 10 || normalizedPhone.length > 15)) {
      setError('O telefone precisa ter entre 10 e 15 dígitos.');
      return;
    }
    setSavingProfile(true);
    try {
      const response = await apiClient.put('/api/v1/auth/profile', {
        full_name: normalizedName || null,
        phone: normalizedPhone || null,
      });
      const updated = response.data?.user as ProfileData | undefined;
      if (updated) {
        setProfile(updated);
        setPhone(updated.phone || '');
        setAvatarPreview(updated.profile_photo_url || avatarPreview);
        mergeStoredUser(updated as unknown as Record<string, unknown>);
      }
      showSuccess('Dados pessoais salvos.');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível salvar os dados.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const newPasswordMessage = passwordError(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handlePasswordChange = async () => {
    setError(null);
    setPasswordTouched(true);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Preencha os três campos de senha.');
      return;
    }
    if (newPasswordMessage) {
      setError(newPasswordMessage);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não é igual à nova senha.');
      return;
    }
    setSavingPassword(true);
    try {
      await apiClient.post(
        '/api/v1/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        // Senha atual errada volta 401; sem isso o interceptor deslogaria sem explicar.
        { skipAutoLogout: true } as ApiRequestConfig,
      );
      // Trocar a senha encerra todas as sessões, inclusive esta.
      localStorage.removeItem('user');
      router.push('/login?sessions_ended=1');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível alterar a senha.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    setError(null);
    setLoggingOutAll(true);
    try {
      await apiClient.post('/api/v1/auth/logout-all');
      localStorage.removeItem('user');
      router.push('/login?sessions_ended=1');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível encerrar as sessões.'));
      setLoggingOutAll(false);
    }
  };

  const clearSessionAndGo = (path: string) => {
    localStorage.clear();
    sessionStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: 'access_token', newValue: null }));
    router.push(path);
  };

  const handleDeleteAccount = async (password: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.delete('/api/v1/auth/account', { data: { password }, skipAutoLogout: true } as ApiRequestConfig);
      clearSessionAndGo('/login?account_deleted=1');
    } catch (err) {
      setDeleteError(extractApiErrorMessage(err, 'Não foi possível excluir a conta. Confira a senha.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeactivateAccount = async (password: string) => {
    setDeactivating(true);
    setDeactivateError(null);
    try {
      await apiClient.post('/api/v1/auth/deactivate-account', { password }, { skipAutoLogout: true } as ApiRequestConfig);
      clearSessionAndGo('/login?account_deactivated=1');
    } catch (err) {
      setDeactivateError(extractApiErrorMessage(err, 'Não foi possível desativar a conta. Confira a senha.'));
    } finally {
      setDeactivating(false);
    }
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarFailed(false);
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post('/api/v1/auth/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const photoUrl = response.data?.profile_photo_url;
      if (photoUrl) {
        setAvatarPreview(photoUrl);
        mergeStoredUser({ profile_photo_url: photoUrl });
      }
      showSuccess('Foto de perfil atualizada.');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Não foi possível enviar a foto.'));
      await loadProfile();
    } finally {
      setUploadingPhoto(false);
      if (event.target) event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando perfil">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Meu perfil" subtitle="Seus dados de acesso. O terreiro fica em Configurações." />

      {error && (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden />
          <AlertDescription className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="text-xs font-semibold underline" onClick={() => setError(null)}>
              Fechar
            </button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <Card data-tour="profile-foto">
          <CardContent className="flex flex-col items-center gap-4 p-5 text-center">
            <Avatar className="size-28 text-3xl">
              {avatarPreview && !avatarFailed && <AvatarImage src={avatarPreview} alt="Sua foto" onError={() => setAvatarFailed(true)} />}
              <AvatarFallback>{avatarText}</AvatarFallback>
            </Avatar>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="hidden" />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
              <CloudUpload aria-hidden /> {uploadingPhoto ? 'Enviando…' : 'Trocar foto'}
            </Button>
            <p className="text-xs text-muted-foreground">Aparece no topo do painel.</p>
          </CardContent>
        </Card>

        <Card data-tour="profile-dados">
          <CardContent className="p-5">
            <SectionTitle title="Dados pessoais" />
            <div className="flex flex-col gap-4">
              <TextField label="Nome" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Como quer ser chamado" autoComplete="name" />
              <MaskedInput mask={maskPhone} label="Telefone" value={phone} onChange={setPhone} placeholder="(11) 99999-9999" autoComplete="tel" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="E-mail" value={profile?.email || ''} readOnly helperText="Não pode ser alterado aqui." />
                <TextField label="Usuário" value={profile?.username || ''} readOnly />
              </div>
              <Button type="button" className="w-fit" onClick={handleSaveProfile} disabled={savingProfile}>
                <Save aria-hidden /> {savingProfile ? 'Salvando…' : 'Salvar dados'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-tour="profile-senha">
        <CardContent className="p-5">
          <SectionTitle icon={<Lock />} title="Alterar senha" description="Ao trocar a senha, você sai de todos os aparelhos e entra de novo." />
          <div className="grid gap-4 md:grid-cols-3">
            <PasswordField
              label="Senha atual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              autoComplete="new-password"
              error={passwordTouched && newPassword && newPasswordMessage ? newPasswordMessage : undefined}
            />
            <PasswordField
              label="Confirmar nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              error={mismatch ? 'As senhas não são iguais.' : undefined}
            />
          </div>
          <div className="mt-3">
            <PasswordRules value={newPassword} />
          </div>
          <Button type="button" className="mt-4" onClick={handlePasswordChange} disabled={savingPassword}>
            {savingPassword ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {savingPassword ? 'Alterando…' : 'Atualizar senha'}
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="profile-sessoes">
        <CardContent className="p-5">
          <SectionTitle
            icon={<LogOut />}
            title="Sessões ativas"
            description="Sai desta conta em todos os aparelhos e abas (celular, outro computador). Use se perdeu um aparelho ou desconfia de acesso indevido."
          />
          <Button type="button" variant="outline" onClick={handleLogoutAllDevices} disabled={loggingOutAll}>
            {loggingOutAll ? 'Encerrando…' : 'Sair de todos os aparelhos'}
          </Button>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible className="rounded-xl border border-destructive/40 bg-card px-5">
        <AccordionItem value="risco" className="border-b-0">
          <AccordionTrigger className="text-base font-bold text-destructive hover:no-underline">
            <span className="flex items-center gap-2">
              <TriangleAlert className="size-4" aria-hidden /> Zona de risco
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-5 pb-5">
            <div className="rounded-lg border border-warning/50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-warning">
                <PauseCircle className="size-4" aria-hidden /> Desativar conta e terreiro
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                É <strong>reversível</strong>. O terreiro para de ficar acessível e a assinatura é cancelada, mas giras, senhas,
                médiuns e associados ficam guardados. Você reativa quando quiser, voltando no plano gratuito. Só funciona se você
                for o único usuário ativo do terreiro.
              </p>
              <Button type="button" variant="outline" className="mt-3 border-warning text-warning hover:text-warning" onClick={() => { setDeactivateError(null); setDeactivateOpen(true); }}>
                <PauseCircle aria-hidden /> Desativar conta
              </Button>
            </div>

            <div className="rounded-lg border border-destructive/50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-destructive">
                <Trash2 className="size-4" aria-hidden /> Excluir minha conta
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A exclusão é <strong>permanente</strong>. Seus dados pessoais são removidos conforme a LGPD (art. 18, VI). Os registros
                do terreiro (giras, senhas) não são afetados.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Não consegue entrar na conta?{' '}
                <a href="mailto:privacidade@girahub.com.br" className="font-semibold underline underline-offset-4">
                  Peça a exclusão por e-mail
                </a>
                .
              </p>
              <Button type="button" variant="outline" className="mt-3 text-destructive hover:text-destructive" onClick={() => { setDeleteError(null); setDeleteOpen(true); }}>
                <Trash2 aria-hidden /> Excluir minha conta
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <DangerDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Confirmar desativação"
        description={
          <p>
            Você poderá reativar depois, entrando com e-mail e senha em &quot;Reativar conta&quot;. Nada é apagado.
          </p>
        }
        acceptLabel="Entendo que meu terreiro fica inacessível até eu reativar a conta."
        confirmLabel="Confirmar desativação"
        busyLabel="Desativando…"
        loading={deactivating}
        error={deactivateError}
        onConfirm={handleDeactivateAccount}
      />

      <DangerDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Confirmar exclusão da conta"
        description={
          <p>
            Esta ação <strong>não pode ser desfeita</strong>. Seus dados pessoais são removidos para sempre.
          </p>
        }
        acceptLabel="Entendo que meus dados serão removidos para sempre e que não dá para desfazer."
        confirmLabel="Excluir para sempre"
        busyLabel="Excluindo…"
        destructive
        loading={deleting}
        error={deleteError}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
