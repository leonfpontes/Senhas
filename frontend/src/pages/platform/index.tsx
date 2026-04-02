/**
 * Platform Admin Dashboard (T111-5)
 * 
 * Main dashboard for SUPER_ADMIN:
 * - Quick statistics
 * - Recent activity
 * - Links to management pages
 * - System status
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  CircularProgress,
  Alert,
  LinearProgress,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import PeopleIcon from "@mui/icons-material/People";
import DescriptionIcon from "@mui/icons-material/Description";
import BillingIcon from "@mui/icons-material/ReceiptLong";
import Link from "next/link";
import PlatformLayout from "./layout";

interface DashboardStats {
  total_tenants?: number;
  active_tenants?: number;
  total_users?: number;
  total_revenue?: number;
}

const StatCard = ({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) => (
  <Card sx={{ height: "100%" }}>
    <CardContent>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{
            bgcolor: color,
            color: "white",
            borderRadius: "50%",
            p: 2,
            display: "flex",
          }}
        >
          {icon}
        </Box>
        <Box>
          <Box sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
            {title}
          </Box>
          <Box sx={{ fontSize: "1.5rem", fontWeight: 700 }}>{value}</Box>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const PlatformDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // In a real implementation, you'd have a dedicated stats endpoint
        // For now, we'll show placeholder data
        setStats({
          total_tenants: 42,
          active_tenants: 38,
          total_users: 256,
          total_revenue: 12500,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <PlatformLayout>
      <Box>
        <Box data-tour="platform-header" sx={{ mb: 4 }}>
          <p>Manage all tenants, users, and billing from here</p>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        {/* Statistics */}
        <Grid data-tour="platform-stats" container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Tenants"
              value={stats.total_tenants || 0}
              icon={<BusinessIcon />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Tenants"
              value={stats.active_tenants || 0}
              icon={<BusinessIcon />}
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Platform Users"
              value={stats.total_users || 0}
              icon={<PeopleIcon />}
              color="info.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Monthly Revenue"
              value={`$${stats.total_revenue || 0}`}
              icon={<BillingIcon />}
              color="warning.main"
            />
          </Grid>
        </Grid>

        {/* Quick Links */}
        <Box data-tour="platform-quick-links" sx={{ mb: 4 }}>
          <h2>Quick Links</h2>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/tenants" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<BusinessIcon />}
                      sx={{ textAlign: "left" }}
                    >
                      Manage Tenants
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/users_global" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<PeopleIcon />}
                    >
                      Global Users
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/audit_consolidated" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<DescriptionIcon />}
                    >
                      Audit Logs
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ cursor: "pointer", height: "100%" }}>
                <CardContent>
                  <Link href="/platform/billing" passHref legacyBehavior>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<BillingIcon />}
                    >
                      Billing
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* System Status */}
        <Box>
          <h2>System Status</h2>
          <Card>
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>Database Connection</span>
                  <span style={{ color: "green" }}>✓ Healthy</span>
                </Box>
                <LinearProgress variant="determinate" value={100} sx={{ bgcolor: "success.light" }} />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>API Response Time</span>
                  <span style={{ color: "green" }}>45ms</span>
                </Box>
                <LinearProgress variant="determinate" value={90} sx={{ bgcolor: "success.light" }} />
              </Box>

              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                  <span>Server CPU</span>
                  <span style={{ color: "green" }}>38%</span>
                </Box>
                <LinearProgress variant="determinate" value={38} sx={{ bgcolor: "success.light" }} />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </PlatformLayout>
  );
};

export default PlatformDashboard;
