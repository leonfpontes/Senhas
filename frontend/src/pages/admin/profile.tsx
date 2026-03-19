/**
 * Admin Profile Page
 * Allows current admin user to manage personal data, profile photo and password.
 */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/CloudUpload';
import LockIcon from '@mui/icons-material/Lock';

import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';

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

const formatPhoneDisplay = (value: string) => {
  const digits = value.replace(DIGITS_ONLY, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, digits.length - 11)} (${digits.slice(-11, -9)}) ${digits.slice(-9, -4)}-${digits.slice(-4)}`;
};

export default function AdminProfilePage() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const avatarText = useMemo(() => {
    const source = fullName || profile?.username || profile?.email || 'A';
    return source.charAt(0).toUpperCase();
  }, [fullName, profile?.username, profile?.email]);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

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

      const stored = localStorage.getItem('user');
      localStorage.setItem(
        'user',
        JSON.stringify({
          ...(stored ? JSON.parse(stored) : {}),
          ...user,
        }),
      );
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar seu perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setError(null);
    setSuccess(null);

    const normalizedName = fullName.trim();
    const normalizedPhone = phone.replace(DIGITS_ONLY, '');

    if (normalizedName !== '' && normalizedName.length < 3) {
      setError('Nome deve ter ao menos 3 caracteres.');
      return;
    }

    if (normalizedPhone !== '' && (normalizedPhone.length < 10 || normalizedPhone.length > 15)) {
      setError('Telefone deve ter entre 10 e 15 dígitos.');
      return;
    }

    setSavingProfile(true);
    try {
      const response = await apiClient.put('/api/v1/auth/profile', {
        full_name: normalizedName || null,
        phone: normalizedPhone || null,
      });

      const updated = response.data?.user as ProfileData;
      if (updated) {
        setProfile(updated);
        setPhone(updated.phone || '');
        setAvatarPreview(updated.profile_photo_url || avatarPreview);

        const stored = localStorage.getItem('user');
        localStorage.setItem(
          'user',
          JSON.stringify({
            ...(stored ? JSON.parse(stored) : {}),
            ...updated,
          }),
        );
      }

      setSuccess('Dados pessoais atualizados com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar os dados do perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Preencha todos os campos de senha.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação da senha não confere.');
      return;
    }

    if (newPassword.length < 12) {
      setError('A nova senha deve ter ao menos 12 caracteres.');
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.post('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Senha atualizada com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível alterar a senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSelectPhoto = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setSuccess(null);

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }

    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
    setAvatarFailed(false);

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post('/api/v1/auth/profile/photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const photoUrl = response.data?.profile_photo_url;
      if (photoUrl) {
        setAvatarPreview(photoUrl);

        const stored = localStorage.getItem('user');
        localStorage.setItem(
          'user',
          JSON.stringify({
            ...(stored ? JSON.parse(stored) : {}),
            profile_photo_url: photoUrl,
          }),
        );
      }

      setSuccess('Foto de perfil atualizada com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao enviar foto de perfil.');
      await loadProfile();
    } finally {
      setUploadingPhoto(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return (
    <AdminLayout title="Meu Perfil" maxWidth="md">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}

          <Grid container spacing={2.5}>
            <Grid item xs={12} md={5}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    Foto de Perfil
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Essa foto será exibida no header do painel admin.
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <Avatar
                      src={avatarPreview && !avatarFailed ? avatarPreview : undefined}
                      onError={() => setAvatarFailed(true)}
                      sx={{ width: 110, height: 110, fontSize: '2rem' }}
                    >
                      {avatarText}
                    </Avatar>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />

                    <Button
                      variant="outlined"
                      startIcon={<UploadIcon />}
                      onClick={handleSelectPhoto}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? 'Enviando...' : 'Alterar Foto'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={7}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    Dados Pessoais
                  </Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="Nome"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome para exibição"
                      fullWidth
                    />

                    <TextField
                      label="Telefone"
                      value={formatPhoneDisplay(phone)}
                      onChange={(e) => setPhone(e.target.value.replace(DIGITS_ONLY, ''))}
                      placeholder="(11) 99999-9999"
                      fullWidth
                    />

                    <TextField
                      label="Email"
                      value={profile?.email || ''}
                      InputProps={{ readOnly: true }}
                      fullWidth
                    />

                    <TextField
                      label="Usuário"
                      value={profile?.username || ''}
                      InputProps={{ readOnly: true }}
                      fullWidth
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      {savingProfile ? 'Salvando...' : 'Salvar Dados'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mt: 2.5 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <LockIcon fontSize="small" />
                <Typography variant="h6" fontWeight={700}>
                  Alterar Senha
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                A nova senha deve atender à política de segurança do sistema.
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Senha Atual"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Nova Senha"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Confirmar Nova Senha"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    fullWidth
                  />
                </Grid>
              </Grid>

              <Button
                variant="contained"
                onClick={handlePasswordChange}
                disabled={savingPassword}
                sx={{ mt: 2 }}
              >
                {savingPassword ? 'Alterando...' : 'Atualizar Senha'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
