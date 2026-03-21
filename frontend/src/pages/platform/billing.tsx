/**
 * Platform Billing Page (T109)
 *
 * Billing overview for SUPER_ADMIN:
 * - Platform-wide billing statistics
 * - Per-tenant invoice listing
 * - Revenue overview
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
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
  Chip,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { apiClient } from "../../services/api_client";
import PlatformLayout from "./layout";

interface BillingStats {
  total_invoices: number;
  paid_invoices: number;
  total_revenue: number;
  average_invoice_value: number;
}

interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  status: string;
  paid_amount: number;
  payment_method: string | null;
  due_date: string;
  paid_at: string | null;
  created_at: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "overdue":
      return "error";
    case "cancelled":
      return "default";
    default:
      return "info";
  }
};

const BillingPage: React.FC = () => {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    fetchTenants();
  }, []);

  useEffect(() => {
    if (selectedTenant) {
      fetchInvoices(selectedTenant);
    } else {
      setInvoices([]);
    }
  }, [selectedTenant]);

  const fetchStats = async () => {
    try {
      const response = await apiClient.get(
        "/api/v1/platform/billing/statistics/summary"
      );
      setStats(response.data);
    } catch (err: any) {
      console.error("Failed to fetch billing stats:", err);
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await apiClient.get("/api/v1/platform/tenants");
      setTenants(response.data);
    } catch (err: any) {
      console.error("Failed to fetch tenants:", err);
    }
  };

  const fetchInvoices = async (tenantId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/api/v1/platform/billing/${tenantId}/invoices`
      );
      setInvoices(response.data);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch invoices");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR");

  return (
    <PlatformLayout>
      <Box sx={{ mb: 3 }}>
        <h1>Billing</h1>
        <p>Platform billing statistics and invoice management</p>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Total Invoices
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {stats.total_invoices}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Paid Invoices
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700, color: "success.main" }}>
                  {stats.paid_invoices}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Total Revenue
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700, color: "primary.main" }}>
                  {formatCurrency(stats.total_revenue)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
                  Avg Invoice Value
                </Box>
                <Box sx={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {formatCurrency(stats.average_invoice_value)}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tenant Selector + Invoices */}
      <Card>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <FormControl sx={{ minWidth: { xs: '100%', sm: 250 } }} size="small">
              <InputLabel>Select Tenant</InputLabel>
              <Select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                label="Select Tenant"
              >
                <MenuItem value="">
                  <em>-- Select a tenant --</em>
                </MenuItem>
                {tenants.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedTenant && (
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchInvoices(selectedTenant)}
                size="small"
              >
                Refresh
              </Button>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : !selectedTenant ? (
            <Alert severity="info">
              Select a tenant above to view their invoices.
            </Alert>
          ) : invoices.length === 0 ? (
            <Alert severity="info">No invoices found for this tenant.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Paid</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Paid At</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.invoice_number}</TableCell>
                      <TableCell>
                        {formatDate(inv.period_start)} –{" "}
                        {formatDate(inv.period_end)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(inv.total_amount)}
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {formatCurrency(inv.paid_amount)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={inv.status}
                          color={statusColor(inv.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(inv.due_date)}</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </PlatformLayout>
  );
};

export default BillingPage;
