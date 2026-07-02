/**
 * Platform Profile Page
 *
 * Super Admin profile view and password change.
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";
import PasswordField from "../../components/PasswordField";

interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/api/v1/auth/me");
      setProfile(response.data);
    } catch (err: any) {
      setError(err?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    setSuccess(null);

    if (newPassword.length < 12) {
      setError("A nova senha deve ter pelo menos 12 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setChangingPassword(true);
    try {
      await apiClient.post(
        "/api/v1/auth/change-password",
        {
          current_password: currentPassword,
          new_password: newPassword,
        },
        // Senha atual errada retorna 401 (UnauthorizedError) — sem isso o
        // interceptor global trata como sessão expirada, tenta refresh
        // silencioso, falha de novo e desloga o usuário sem explicação.
        { skipAutoLogout: true } as any,
      );
      setSuccess("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message || "Falha ao alterar senha");
    } finally {
      setChangingPassword(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  if (loading) {
    return (
      <PlatformLayout>
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <Box sx={{ mb: 3 }}>
        <h1>Profile</h1>
        <p>Informações da sua conta de Super Admin</p>
      </Box>

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

      {/* Profile Info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 2 }}>
            Dados da Conta
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
              <Box sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Email</Box>
              <Box sx={{ fontSize: "1rem" }}>{profile?.email}</Box>
            </Box>
            <Box>
              <Box sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Username</Box>
              <Box sx={{ fontSize: "1rem" }}>{profile?.username}</Box>
            </Box>
            <Box>
              <Box sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Role</Box>
              <Chip label={profile?.role} color="error" size="small" />
            </Box>
            <Box>
              <Box sx={{ fontSize: "0.75rem", color: "text.secondary" }}>Conta criada em</Box>
              <Box sx={{ fontSize: "1rem" }}>
                {profile?.created_at ? formatDate(profile.created_at) : "—"}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardContent>
          <Box sx={{ fontWeight: 700, fontSize: "1.1rem", mb: 2 }}>
            Alterar Senha
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 400 }}>
            <PasswordField
              label="Senha Atual"
              size="small"
              fullWidth
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <PasswordField
              label="Nova Senha"
              size="small"
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirmar Nova Senha"
              size="small"
              fullWidth
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              sx={{ alignSelf: "flex-start" }}
            >
              {changingPassword ? "Salvando..." : "Alterar Senha"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </PlatformLayout>
  );
};

export default ProfilePage;
