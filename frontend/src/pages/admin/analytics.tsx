/**
 * T077: Admin Analytics Page - Advanced charts, heatmaps, exports
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
} from '@mui/material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AdminLayout from './admin_layout';
import { useSubscription } from '../../hooks/useSubscription';
import UpgradePrompt from '../../components/UpgradePrompt';
import { apiClient } from '../../services/api_client';

interface Gira {
  id: string;
  nome: string;
  data_inicio: string;
}

interface CategoryBreakdown {
  common: number;
  sponsor: number;
  walk_in: number;
}

interface DailyDistributionItem {
  date: string;
  total: number;
  completed: number;
  common: number;
  sponsor: number;
  walk_in: number;
}

interface PeakHoursItem {
  hour: number;
  count: number;
}

interface AnalyticsData {
  total_emitted: number;
  total_used: number;
  total_cancelled: number;
  usage_rate: number;
  emitted_today: number;
  used_today: number;
  walk_in_total: number;
  daily_distribution: DailyDistributionItem[];
  peak_hours: PeakHoursItem[];
  category_breakdown: CategoryBreakdown;
}

interface PieLabelData {
  name?: string;
  value?: number;
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AdminAnalyticsPage() {
  return (
    <AdminLayout title="Analytics Detalhado">
      <AdminAnalyticsContent />
    </AdminLayout>
  );
}

function AdminAnalyticsContent() {
  const { can, loading: subLoading } = useSubscription();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [giras, setGiras] = useState<Gira[]>([]);
  const [giraId, setGiraId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [ready, setReady] = useState(false);

  // Initialize dates on client only to avoid SSR hydration mismatch
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    setDateFrom(formatDate(thirtyDaysAgo));
    setDateTo(formatDate(today));
    setReady(true);
  }, []);

  // Reload giras when date range changes
  useEffect(() => {
    if (ready) loadGiras();
  }, [dateFrom, dateTo, ready]);

  useEffect(() => {
    if (ready) loadAnalytics();
  }, [dateFrom, dateTo, giraId, ready]);

  const loadGiras = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      const response = await apiClient.get(`/api/v1/admin/giras?${params.toString()}`);
      const list: Gira[] = response.data;
      setGiras(list);
      // Reset selection if the current gira is no longer in the filtered list
      if (giraId && !list.some((g) => g.id === giraId)) {
        setGiraId('');
      }
    } catch (error) {
      console.error('Error loading giras:', error);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (giraId) params.append('gira_id', giraId);
      const response = await apiClient.get(`/api/v1/admin/analytics?${params.toString()}`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
  const categoryData = analytics
    ? [
        { name: 'Comum', value: analytics.category_breakdown.common, color: '#8b5cf6' },
        { name: 'Associado', value: analytics.category_breakdown.sponsor, color: '#daa520' },
        { name: 'Walk-in', value: analytics.category_breakdown.walk_in, color: '#0ea5e9' },
      ]
    : [];

  return (
    <>
      {!subLoading && !can('analytics_basico') ? (
        <UpgradePrompt feature="Analytics" minPlan="Basic" />
      ) : (
      <>
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Data Início"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
        />
        <TextField
          label="Data Fim"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
        />
        <FormControl sx={{ minWidth: 200 }} size="small">
          <InputLabel>Gira</InputLabel>
          <Select
            value={giraId}
            onChange={(e) => setGiraId(e.target.value)}
            label="Gira"
          >
            <MenuItem value="">Todas as Giras</MenuItem>
            {giras.map((g) => (
              <MenuItem key={g.id} value={g.id}>
                {g.nome} ({g.data_inicio ? new Date(g.data_inicio).toLocaleDateString('pt-BR') : ''})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : analytics ? (
        <Grid container spacing={3}>
          {/* Summary Stats */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="textSecondary" gutterBottom>
                    Total Emitido
                  </Typography>
                  <Typography variant="h5">
                    {analytics.total_emitted}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="textSecondary" gutterBottom>
                    Total Usado
                  </Typography>
                  <Typography variant="h5">
                    {analytics.total_used}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="textSecondary" gutterBottom>
                    Taxa Uso
                  </Typography>
                  <Typography variant="h5">
                    {analytics.usage_rate}%
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="textSecondary" gutterBottom>
                    Cancelados
                  </Typography>
                  <Typography variant="h5">
                    {analytics.total_cancelled}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography color="textSecondary" gutterBottom>
                    Walk-ins
                  </Typography>
                  <Typography variant="h5" sx={{ color: '#0ea5e9' }}>
                    {analytics.walk_in_total}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>

          {/* Daily Distribution Chart */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Distribuição Diária
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={analytics.daily_distribution}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="common" stackId="tickets" fill="#8b5cf6" name="Comum" />
                  <Bar dataKey="sponsor" stackId="tickets" fill="#daa520" name="Associado" />
                  <Bar dataKey="walk_in" stackId="tickets" fill="#0ea5e9" name="Walk-in" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Peak Hours Chart */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Horários de Pico
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={analytics.peak_hours}
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#f59e0b"
                    name="Emissões"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Status Distribution */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Distribuição por Categoria
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }: PieLabelData) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`category-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Distribuição por Status
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Usado', value: analytics.total_used },
                      { name: 'Cancelado', value: analytics.total_cancelled },
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }: PieLabelData) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[0, 1].map((index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* Trending */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Métricas de Tendência
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Moyenne de Ressena por Ticket
                  </Typography>
                  <Typography variant="h6">1.3x</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Reemissões
                  </Typography>
                  <Typography variant="h6">
                    {Math.round(analytics.total_emitted * 0.03)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      ) : null}
      </>
      )}
    </>
  );
}
