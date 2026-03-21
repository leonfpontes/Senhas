/**
 * Consolidated Audit Logs Page (T114)
 * 
 * Cross-tenant audit log viewing:
 * - View audit logs across all tenants
 * - Filter by date range
 * - View statistics and trends
 * - Export for compliance
 */

import React, { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  CircularProgress,
  Alert,
  Grid,
  Chip,
  Tab,
} from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";

interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
}

interface AuditSummary {
  total: number;
  by_tenant: Record<string, number>;
  by_action: Record<string, number>;
  by_user: Record<string, number>;
}

const ConsolidatedAuditPage: React.FC = () => {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("0");

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7); // 7 days ago
    return date.toISOString().split("T")[0];
  });

  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const fetchAuditData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/platform/audit-logs?start_date=${startDate}&end_date=${endDate}`
      );
      setSummary(response.data);
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post(
        `/api/v1/platform/audit-logs/export?start_date=${startDate}&end_date=${endDate}&format_type=json`
      );
      const data = response.data;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${startDate}-to-${endDate}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlatformLayout>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ mb: 3 }}>
          <h1>Consolidated Audit Logs</h1>
          <p>View and analyze audit logs across all tenants</p>
        </Box>

        {/* Date Range Filter */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Start Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="End Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4} sx={{ display: "flex", gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon />}
                  onClick={fetchAuditData}
                  disabled={loading}
                  fullWidth
                >
                  Load
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleExport}
                  disabled={loading || !summary}
                  fullWidth
                >
                  Export
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Tabs */}
        <TabContext value={tab}>
          <TabList onChange={(e, v) => setTab(v)}>
            <Tab label="Summary" value="0" />
            <Tab label="By Tenant" value="1" />
            <Tab label="By Action" value="2" />
          </TabList>

          {/* Summary Tab */}
          <TabPanel value="0">
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress />
              </Box>
            ) : summary ? (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: "center" }}>
                        <Box sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 700, color: "primary.main" }}>
                          {summary.total}
                        </Box>
                        <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                          Total Log Entries
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Box sx={{ textAlign: "center" }}>
                        <Box sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 700, color: "primary.main" }}>
                          {Object.keys(summary.by_tenant).length}
                        </Box>
                        <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                          Active Tenants
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            ) : (
              <Alert severity="info">Load data to view summary</Alert>
            )}
          </TabPanel>

          {/* By Tenant Tab */}
          <TabPanel value="1">
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress />
              </Box>
            ) : summary ? (
              <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "primary.light" }}>
                      <TableCell>Tenant ID</TableCell>
                      <TableCell align="right">Event Count</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(summary.by_tenant).map(([tenantId, count]) => (
                      <TableRow key={tenantId} hover>
                        <TableCell sx={{ fontFamily: "monospace" }} variant="body2">
                          {tenantId}
                        </TableCell>
                        <TableCell align="right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Alert severity="info">Load data to view tenant breakdown</Alert>
            )}
          </TabPanel>

          {/* By Action Tab */}
          <TabPanel value="2">
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress />
              </Box>
            ) : summary ? (
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {Object.entries(summary.by_action).map(([action, count]) => (
                  <Chip
                    key={action}
                    label={`${action}: ${count}`}
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>
            ) : (
              <Alert severity="info">Load data to view action breakdown</Alert>
            )}
          </TabPanel>
        </TabContext>
      </Box>
    </PlatformLayout>
  );
};

export default ConsolidatedAuditPage;
