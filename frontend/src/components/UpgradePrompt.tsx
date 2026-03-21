/**
 * UpgradePrompt — shown when a feature is locked by the current plan.
 */
import React from 'react';
import { Box, Typography, Button, Card, CardContent } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { useRouter } from 'next/router';
import { useSubscription } from '../hooks/useSubscription';

interface UpgradePromptProps {
  feature: string;
  minPlan: string;
}

export default function UpgradePrompt({ feature, minPlan }: UpgradePromptProps) {
  const router = useRouter();
  const { planLabel } = useSubscription();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <Card elevation={0} sx={{ maxWidth: 480, textAlign: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <CardContent sx={{ p: 5 }}>
          <LockIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Recurso indisponível
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            <strong>{feature}</strong> não está incluso no plano <strong>{planLabel}</strong>.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Disponível a partir do plano <strong>{minPlan}</strong>.
          </Typography>
          <Button
            variant="contained"
            onClick={() => router.push('/admin/plano')}
            sx={{ textTransform: 'none', fontWeight: 600, px: 4 }}
          >
            Ver Planos
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
