/**
 * T072: Admin Dashboard - KPIs, charts, quick actions
 */
'use client';

import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Button,
  CircularProgress,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckIcon from '@mui/icons-material/Check';
import SendIcon from '@mui/icons-material/Send';
import PeopleIcon from '@mui/icons-material/People';
import AdminLayout from './admin_layout';
import { apiClient } from '../../services/api_client';

interface KPI {
  label: string;
  value: number;
  trend?: number;
  icon: React.ReactNode;
  color: string;
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/admin/analytics?period=week');
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const kpis: KPI[] = [
    {
      label: 'Tickets Emitidos',
      value: analytics?.total_emitted || 0,
      trend: 12,
      icon: <SendIcon />,
      color: '#1976d2',
    },
    {
      label: 'Tickets Usados',
      value: analytics?.total_used || 0,
      trend: 8,
      icon: <CheckIcon />,
      color: '#388e3c',
    },
    {
      label: 'Taxa de Uso',
      value: analytics?.usage_rate || 0,
      icon: <TrendingUpIcon />,
      color: '#f57c00',
    },
    {
      label: 'Emitidos Hoje',
      value: analytics?.emitted_today || 0,
      icon: <PeopleIcon />,
      color: '#7b1fa2',
    },
  ];

  const KPICard = ({ kpi }: { kpi: KPI }) => (
    <Card
      sx={{
        background: `linear-gradient(135deg, ${kpi.color}15 0%, ${kpi.color}05 100%)`,
        border: `2px solid ${kpi.color}30`,
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom>
              {kpi.label}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 'bold', color: kpi.color }}>
              {typeof kpi.value === 'number' ? kpi.value.toFixed(kpi.label.includes('Taxa') ? 1 : 0) : 0}
              {kpi.label.includes('Taxa') ? '%' : ''}
            </Typography>
            {kpi.trend && (
              <Typography variant="caption" color="success.main">
                ↑ {kpi.trend}% este mês
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              backgroundColor: `${kpi.color}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: kpi.color,
            }}
          >
            {kpi.icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout title="Dashboard">
      <Grid container spacing={3}>
        {/* KPIs */}
        {kpis.map((kpi, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            {loading ? (
              <Paper sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={40} />
              </Paper>
            ) : (
              <KPICard kpi={kpi} />
            )}
          </Grid>
        ))}

        {/* Daily Distribution Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Distribuição Diária (Última Semana)
            </Typography>
            {loading ? (
              <CircularProgress />
            ) : (
              <Box>
                {analytics?.daily_distribution?.slice(-7).map((day: any, idx: number) => (
                  <Box key={idx} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption">{day.date}</Typography>
                      <Typography variant="caption">{day.total} tickets</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((day.total / 50) * 100, 100)}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Peak Hours */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Horários de Pico
            </Typography>
            {loading ? (
              <CircularProgress />
            ) : (
              <Box>
                {analytics?.peak_hours?.slice(0, 5).map((hour: any, idx: number) => (
                  <Box key={idx} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption">{hour.hour}:00</Typography>
                      <Typography variant="caption">{hour.count} emissões</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min((hour.count / 20) * 100, 100)}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Ações Rápidas
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" href="/admin/giras">
                Gerenciar Giras
              </Button>
              <Button variant="outlined" href="/admin/tickets">
                Ver Tickets
              </Button>
              <Button variant="outlined" href="/admin/analytics">
                Analytics Detalhado
              </Button>
              <Button variant="outlined" href="/admin/users">
                Gerenciar Usuários
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </AdminLayout>
  );
}
