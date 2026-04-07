/**
 * Platform Admin Layout - Super Admin dashboard shell (T111)
 * 
 * Provides:
 * - Top AppBar with branding
 * - Left sidebar drawer with navigation
 * - Main content area
 * - Role-based navigation items
 * - Responsive design
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  AppBar,
  CssBaseline,
  CircularProgress,
  Container,
  Drawer,
  Toolbar,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import Head from "next/head";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BusinessIcon from "@mui/icons-material/Business";
import PeopleIcon from "@mui/icons-material/People";
import DescriptionIcon from "@mui/icons-material/Description";
import BillingIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import AccountIcon from "@mui/icons-material/AccountCircle";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTour } from "@reactour/tour";
import { apiClient } from "../../services/api_client";
import { getPlatformTourSteps } from "../../tours/platformTourSteps";

const DRAWER_WIDTH = 280;
const TOOLBAR_HEIGHT = 64;

// Platform brand colors (fixed — no tenant context)
const BRAND_PRIMARY = "#1a237e";
const BRAND_SECONDARY = "#4a148c";
const BRAND_FONT = "#FFFFFF";

interface PlatformLayoutProps {
  children: React.ReactNode;
}

/**
 * Botão de ajuda (?) que dispara o tour guiado da tela atual do painel Platform.
 */
function PlatformTourHelpButton() {
  const router = useRouter();
  const { setSteps, setIsOpen, setCurrentStep } = useTour();
  const steps = getPlatformTourSteps(router.pathname);

  if (steps.length === 0) return null;

  const handleOpenTour = () => {
    setSteps?.(steps);
    setCurrentStep(0);
    setIsOpen(true);
  };

  return (
    <Tooltip title="Guia desta tela">
      <IconButton
        color="inherit"
        aria-label="abrir guia da tela"
        onClick={handleOpenTour}
        size="small"
        sx={{ opacity: 0.85, '&:hover': { opacity: 1 } }}
      >
        <HelpOutlineIcon />
      </IconButton>
    </Tooltip>
  );
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [authorized, setAuthorized] = useState(false);

  // Guard: only super_admin may view platform pages
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : null;
      if (!user || user.role !== "super_admin") {
        router.replace(user ? "/admin/dashboard" : "/login");
        return;
      }
      setAuthorized(true);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  if (!authorized) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
    } catch (error) {
      console.error("Logout failed:", error);
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
    handleMenuClose();
  };

  const navigationItems = [
    {
      label: "Dashboard",
      icon: <DashboardIcon />,
      href: "/platform",
    },
    {
      label: "Tenants",
      icon: <BusinessIcon />,
      href: "/platform/tenants",
    },
    {
      label: "Global Users",
      icon: <PeopleIcon />,
      href: "/platform/users_global",
    },
    {
      label: "Audit Logs",
      icon: <DescriptionIcon />,
      href: "/platform/audit_consolidated",
    },
    {
      label: "Billing",
      icon: <BillingIcon />,
      href: "/platform/billing",
    },
    {
      label: "Settings",
      icon: <SettingsIcon />,
      href: "/platform/settings",
    },
  ];

  const drawer = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.paper",
      }}
    >
      {/* Header — gradient matching admin layout */}
      <Box
        sx={{
          p: 2,
          minHeight: TOOLBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          background: `linear-gradient(135deg, ${BRAND_PRIMARY} 0%, ${BRAND_SECONDARY} 100%)`,
          position: "relative",
        }}
      >
        {isMobile && (
          <IconButton
            onClick={() => setMobileOpen(false)}
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: BRAND_FONT,
              opacity: 0.8,
              "&:hover": { opacity: 1, bgcolor: "rgba(255,255,255,0.15)" },
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Avatar
            sx={{
              width: 52,
              height: 52,
              bgcolor: "rgba(255,255,255,0.2)",
              color: BRAND_FONT,
              fontWeight: 700,
              fontSize: "1.25rem",
              border: "2px solid rgba(255,255,255,0.5)",
            }}
          >
            SA
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: BRAND_FONT,
                lineHeight: 1.3,
              }}
            >
              Senhas Platform
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: BRAND_FONT,
                opacity: 0.75,
                fontWeight: 500,
                letterSpacing: 0.5,
              }}
            >
              Super Admin
            </Typography>
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Navigation Items */}
      <List sx={{ flex: 1, py: 2 }}>
        {navigationItems.map((item) => (
          <ListItem key={item.href} disablePadding>
            <Link href={item.href} passHref legacyBehavior>
              <ListItemButton
                selected={router.pathname === item.href}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  "& .MuiListItemIcon-root": {
                    color: "text.secondary",
                  },
                  "&.Mui-selected": {
                    background: `linear-gradient(90deg, ${BRAND_PRIMARY} 0%, ${BRAND_SECONDARY} 100%)`,
                    color: BRAND_FONT,
                    "& .MuiListItemIcon-root": {
                      color: BRAND_FONT,
                    },
                    "& .MuiListItemText-primary": {
                      color: BRAND_FONT,
                    },
                  },
                  "&.Mui-selected:hover": {
                    background: `linear-gradient(90deg, ${BRAND_PRIMARY} 0%, ${BRAND_SECONDARY} 100%)`,
                    filter: "brightness(0.97)",
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    variant: "body2",
                    fontWeight: router.pathname === item.href ? 600 : 500,
                  }}
                />
              </ListItemButton>
            </Link>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Footer */}
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" display="block" color="text.secondary">
          Senhas v2.3
        </Typography>
        <Typography variant="caption" display="block" color="text.secondary">
          Platform Edition
        </Typography>
      </Box>
    </Box>
  );

  return (
    <>
    <Head>
      <title>Senhas Platform Admin</title>
    </Head>
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <CssBaseline />

      {/* AppBar */}
      <AppBar
        position="fixed"
        variant="elevation"
        sx={{
          background: `linear-gradient(90deg, ${BRAND_PRIMARY} 0%, ${BRAND_SECONDARY} 100%)`,
          color: BRAND_FONT,
          width: { xs: "100%", md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
            Platform Administration
          </Typography>

          <PlatformTourHelpButton />

          <IconButton
            onClick={handleMenuOpen}
            size="small"
            aria-label="user menu"
            sx={{ ml: 1 }}
          >
            <Avatar
              sx={{
                width: 34,
                height: 34,
                fontSize: "0.875rem",
                bgcolor: "rgba(255,255,255,0.22)",
                color: BRAND_FONT,
                border: "1px solid rgba(255,255,255,0.45)",
              }}
            >
              SA
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem onClick={() => { router.push("/platform/profile"); handleMenuClose(); }}>
              <AccountIcon sx={{ mr: 1, fontSize: "1.2rem" }} />
              Profile
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1, fontSize: "1.2rem" }} />
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Box
        component="nav"
        sx={{
          width: { md: DRAWER_WIDTH },
          flexShrink: { md: 0 },
        }}
      >
        {/* Mobile Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "1px solid #e0e0e0",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
      >
        <Toolbar />
        <Container
          maxWidth="lg"
          sx={{
            py: 3,
            px: { xs: 2, sm: 3 },
          }}
        >
          {children}
        </Container>
      </Box>
    </Box>
    </>
  );
};

export default PlatformLayout;
