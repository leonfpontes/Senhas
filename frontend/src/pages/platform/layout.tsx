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

import React, { useState } from "react";
import {
  Box,
  AppBar,
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
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BusinessIcon from "@mui/icons-material/Business";
import PeopleIcon from "@mui/icons-material/People";
import DescriptionIcon from "@mui/icons-material/Description";
import BillingIcon from "@mui/icons-material/ReceiptLong";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiClient } from "../../services/api_client";

const DRAWER_WIDTH = 280;

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ children }) => {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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
    // Clear auth state
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

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Logo / Branding */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main" }}>
          Senhas Platform
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Super Admin Dashboard
        </Typography>
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
                  "&.Mui-selected": {
                    backgroundColor: "primary.light",
                    "& .MuiListItemIcon-root": {
                      color: "primary.main",
                    },
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    variant: "body2",
                    fontWeight: 500,
                  }}
                />
              </ListItemButton>
            </Link>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Footer Info */}
      <Box sx={{ p: 2, fontSize: "0.75rem", color: "text.secondary" }}>
        <Typography variant="caption" display="block">
          Senhas v1.1
        </Typography>
        <Typography variant="caption" display="block">
          Platform Edition
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          width: { xs: "100%", md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar>
          {/* Mobile Menu Icon */}
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

          {/* Title */}
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
            Senhas - Platform Administration
          </Typography>

          {/* User Menu */}
          <IconButton
            onClick={handleMenuOpen}
            sx={{ ml: 2 }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: "secondary.main",
                cursor: "pointer",
              }}
            >
              SA
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={() => router.push("/platform/profile")}>
              Profile
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} />
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Desktop Drawer */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              mt: 0,
            },
          }}
        >
          <Box sx={{ mt: "64px" }}>{drawerContent}</Box>
        </Drawer>
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          <Box sx={{ mt: 2 }}>
            <IconButton
              onClick={() => setMobileOpen(false)}
              sx={{ ml: "auto", display: "block" }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          {drawerContent}
        </Drawer>
      )}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          mt: "64px",
          overflow: "auto",
        }}
      >
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default PlatformLayout;
