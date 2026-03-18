/**
 * Impersonate Landing Page
 * 
 * Receives token, user, and tenant info via query params.
 * Stores them in sessionStorage (isolating from the super admin's localStorage session).
 * Redirects to /admin/dashboard.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, CircularProgress, Typography, Alert } from "@mui/material";

export default function ImpersonateLandingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const { token, user, tenant } = router.query;

    if (!token || !user || !tenant) {
      setError("Parâmetros de impersonação inválidos");
      return;
    }

    try {
      const tokenStr = Array.isArray(token) ? token[0] : token;
      const userStr = Array.isArray(user) ? user[0] : user;
      const tenantStr = Array.isArray(tenant) ? tenant[0] : tenant;

      // Decode and validate base64 payloads
      const userInfo = JSON.parse(atob(userStr));
      const tenantInfo = JSON.parse(atob(tenantStr));

      // Store in sessionStorage (isolated from super admin's localStorage)
      sessionStorage.setItem("access_token", tokenStr);
      sessionStorage.setItem("user", JSON.stringify(userInfo));
      sessionStorage.setItem("impersonate_tenant", JSON.stringify(tenantInfo));
      sessionStorage.setItem("impersonating", "true");

      // Redirect to admin dashboard
      router.replace("/admin/dashboard");
    } catch {
      setError("Erro ao processar dados de impersonação");
    }
  }, [router.isReady, router.query]);

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
      <Typography sx={{ mt: 2 }}>Configurando sessão de impersonação...</Typography>
    </Box>
  );
}
