/**
 * Platform Layout
 *
 * Shell for all /platform pages.  Responsibilities:
 *   1. Auth guard — redirects non-super_admin users
 *   2. Wraps children in PlatformThemeProvider (scoped dark/light theme)
 *   3. Renders collapsible sidebar + sticky top-bar
 *
 * Every visual sub-piece lives in components/platform/ or providers/.
 * This file only composes them — no inline business logic.
 */

import React, { useState, useEffect } from "react";
import Avatar          from "@mui/material/Avatar";
import Box             from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider         from "@mui/material/Divider";
import Drawer          from "@mui/material/Drawer";
import IconButton      from "@mui/material/IconButton";
import List            from "@mui/material/List";
import ListItem        from "@mui/material/ListItem";
import ListItemButton  from "@mui/material/ListItemButton";
import ListItemIcon    from "@mui/material/ListItemIcon";
import Tooltip         from "@mui/material/Tooltip";
import Typography      from "@mui/material/Typography";
import useMediaQuery   from "@mui/material/useMediaQuery";

import DashboardRoundedIcon          from "@mui/icons-material/DashboardRounded";
import BusinessRoundedIcon           from "@mui/icons-material/BusinessRounded";
import PeopleAltRoundedIcon          from "@mui/icons-material/PeopleAltRounded";
import ReceiptLongRoundedIcon        from "@mui/icons-material/ReceiptLongRounded";
import ManageSearchRoundedIcon       from "@mui/icons-material/ManageSearchRounded";
import TuneRoundedIcon               from "@mui/icons-material/TuneRounded";
import TravelExploreRoundedIcon      from "@mui/icons-material/TravelExploreRounded";
import LogoutRoundedIcon             from "@mui/icons-material/LogoutRounded";
import MenuOpenRoundedIcon           from "@mui/icons-material/MenuOpenRounded";
import MenuRoundedIcon               from "@mui/icons-material/MenuRounded";
import DarkModeRoundedIcon           from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon          from "@mui/icons-material/LightModeRounded";

import Head   from "next/head";
import Link   from "next/link";
import { useRouter } from "next/router";
import { ErrorBoundary } from "../../components/ErrorBoundary";

import {
  PlatformThemeProvider,
  usePlatformTheme,
} from "../../providers/PlatformThemeProvider";
import { ACCENT, ACCENT_GLOW } from "../../styles/platformTheme";
import { LiveClock } from "../../components/platform";
import * as Sentry from '@sentry/nextjs';
import { apiClient } from "../../services/api_client";

// ─── Navigation items — single source of truth ────────────────────────────────

const NAV_ITEMS = [
  { label: "Dashboard",        icon: <DashboardRoundedIcon />,    href: "/platform" },
  { label: "Tenants",          icon: <BusinessRoundedIcon />,     href: "/platform/tenants" },
  { label: "Usuários Globais", icon: <PeopleAltRoundedIcon />,    href: "/platform/users_global" },
  { label: "Observatório",      icon: <TravelExploreRoundedIcon />, href: "/platform/observatory" },
  { label: "Audit Logs",       icon: <ManageSearchRoundedIcon />, href: "/platform/audit_consolidated" },
  { label: "Billing",          icon: <ReceiptLongRoundedIcon />,  href: "/platform/billing" },
  { label: "Configurações",    icon: <TuneRoundedIcon />,         href: "/platform/settings" },
] as const;

// ─── Sizing ───────────────────────────────────────────────────────────────────

const SIDEBAR_EXPANDED  = 240;
const SIDEBAR_COLLAPSED = 72;
const TOPBAR_HEIGHT     = 60;

// ─── NavItem ──────────────────────────────────────────────────────────────────

interface NavItemProps {
  label:    string;
  icon:     React.ReactNode;
  href:     string;
  active:   boolean;
  expanded: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({
  label, icon, href, active, expanded, onClick,
}) => {
  const { tokens } = usePlatformTheme();

  const button = (
    <Link href={href} passHref legacyBehavior>
      <ListItemButton
        selected={active}
        onClick={onClick}
        sx={{
          borderRadius: "10px",
          mb: 0.5,
          minHeight: 42,
          justifyContent: expanded ? "flex-start" : "center",
          px: expanded ? 1.5 : 0,
          gap: 1.5,
          transition: "all 0.15s ease",
          position: "relative",
          color: active ? tokens.textPrimary : tokens.textSecondary,
          "&.Mui-selected": {
            background: "rgba(99,102,241,0.12)",
            "&::before": {
              content: '""',
              position: "absolute",
              left: 0, top: "18%",
              height: "64%", width: 3,
              borderRadius: "0 3px 3px 0",
              background: `linear-gradient(180deg, ${ACCENT} 0%, #8B5CF6 100%)`,
              boxShadow: `0 0 10px ${ACCENT_GLOW}`,
            },
          },
          "&.Mui-selected:hover": { background: "rgba(99,102,241,0.18)" },
          "&:not(.Mui-selected):hover": {
            background: "rgba(99,102,241,0.06)",
            color: tokens.textPrimary,
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            color: active ? ACCENT : "inherit",
            "& svg": {
              fontSize: "1.2rem",
              filter: active ? `drop-shadow(0 0 6px ${ACCENT_GLOW})` : "none",
              transition: "filter 0.15s ease",
            },
          }}
        >
          {icon}
        </ListItemIcon>
        {expanded && (
          <Typography
            sx={{
              fontSize: "0.82rem",
              fontWeight: active ? 600 : 500,
              color: active ? tokens.textPrimary : tokens.textSecondary,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Typography>
        )}
      </ListItemButton>
    </Link>
  );

  if (expanded) return <ListItem disablePadding>{button}</ListItem>;

  return (
    <ListItem disablePadding>
      <Tooltip title={label} placement="right" arrow>
        <Box sx={{ width: "100%" }}>{button}</Box>
      </Tooltip>
    </ListItem>
  );
};

// ─── SidebarContent ───────────────────────────────────────────────────────────

interface SidebarContentProps {
  expanded:  boolean;
  isMobile?: boolean;
  onToggle:  () => void;
  onClose?:  () => void;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  expanded, isMobile = false, onToggle, onClose,
}) => {
  const router = useRouter();
  const { tokens } = usePlatformTheme();

  const handleLogout = async () => {
    try { await apiClient.post("/api/v1/auth/logout"); } catch { /* non-critical */ }
    localStorage.removeItem("user");
    Sentry.setUser(null);
    router.push("/login");
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Brand header ── */}
      <Box
        sx={{
          height: TOPBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          px: expanded ? 2 : 0,
          justifyContent: expanded ? "space-between" : "center",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        {expanded ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <BrandLogo size={34} />
              <Box>
                <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: tokens.textPrimary, lineHeight: 1.2 }}>
                  Senhas
                </Typography>
                <Typography
                  sx={{
                    fontSize: "0.58rem", fontWeight: 700, color: ACCENT,
                    letterSpacing: "0.2em", textTransform: "uppercase", lineHeight: 1,
                  }}
                >
                  Platform
                </Typography>
              </Box>
            </Box>
            <IconButton
              size="small"
              onClick={isMobile ? onClose : onToggle}
              sx={{ color: tokens.textSecondary, "&:hover": { color: tokens.textPrimary } }}
            >
              <MenuOpenRoundedIcon fontSize="small" />
            </IconButton>
          </>
        ) : (
          <Tooltip title="Expandir menu" placement="right">
            <Box onClick={onToggle} sx={{ cursor: "pointer" }}>
              <BrandLogo size={36} />
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ── Nav ── */}
      <List sx={{ flex: 1, py: 1.5, px: expanded ? 1 : 0.75 }}>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={router.pathname === item.href}
            expanded={expanded}
            onClick={isMobile ? onClose : undefined}
          />
        ))}
      </List>

      <Divider />

      {/* ── Footer ── */}
      <Box sx={{ py: 1.5, px: expanded ? 1 : 0.75 }}>
        {/* Profile */}
        <Tooltip title={expanded ? "" : "Perfil"} placement="right" arrow>
          <ListItemButton
            onClick={() => {
              router.push("/platform/profile");
              if (isMobile && onClose) onClose();
            }}
            sx={{
              borderRadius: "10px", mb: 0.5,
              justifyContent: expanded ? "flex-start" : "center",
              px: expanded ? 1.5 : 0, gap: 1.5,
              color: tokens.textSecondary,
              "&:hover": { background: "rgba(99,102,241,0.06)", color: tokens.textPrimary },
            }}
          >
            <Avatar
              sx={{
                width: 28, height: 28, fontSize: "0.68rem", fontWeight: 700,
                background: `linear-gradient(135deg, ${ACCENT} 0%, #8B5CF6 100%)`,
                flexShrink: 0, boxShadow: `0 0 10px ${ACCENT_GLOW}`,
              }}
            >
              SA
            </Avatar>
            {expanded && (
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.78rem", fontWeight: 600, color: tokens.textPrimary, lineHeight: 1.3 }}>
                  Super Admin
                </Typography>
                <Typography sx={{ fontSize: "0.64rem", color: tokens.textSecondary }} noWrap>
                  superadmin@senhas.app
                </Typography>
              </Box>
            )}
          </ListItemButton>
        </Tooltip>

        {/* Logout */}
        <Tooltip title={expanded ? "" : "Sair"} placement="right" arrow>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              borderRadius: "10px",
              justifyContent: expanded ? "flex-start" : "center",
              px: expanded ? 1.5 : 0, gap: 1.5,
              color: tokens.textSecondary,
              transition: "all 0.15s ease",
              "&:hover": { background: "rgba(239,68,68,0.08)", color: "#EF4444" },
            }}
          >
            <LogoutRoundedIcon sx={{ fontSize: "1.1rem", flexShrink: 0 }} />
            {expanded && (
              <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>Sair</Typography>
            )}
          </ListItemButton>
        </Tooltip>

        {expanded && (
          <Typography
            sx={{
              fontSize: "0.58rem", color: tokens.textGhost, fontWeight: 600,
              textAlign: "center", mt: 1.5, letterSpacing: "0.08em",
            }}
          >
            SENHAS PLATFORM v1.1
          </Typography>
        )}
      </Box>
    </Box>
  );
};

// ─── BrandLogo ────────────────────────────────────────────────────────────────

const BrandLogo: React.FC<{ size: number }> = ({ size }) => (
  <Box
    component="img"
    src="/favicon.svg"
    alt="Senhas Platform"
    sx={{
      width: size,
      height: size,
      borderRadius: `${size * 0.22}px`,
      boxShadow: `0 0 ${size * 0.5}px ${ACCENT_GLOW}`,
      transition: "box-shadow 0.15s ease",
      display: "block",
      flexShrink: 0,
      "&:hover": { boxShadow: `0 0 ${size * 0.75}px ${ACCENT_GLOW}` },
    }}
  />
);

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

const ThemeToggle: React.FC = () => {
  const { isDark, toggleMode, tokens } = usePlatformTheme();

  return (
    <Tooltip title={isDark ? "Modo claro" : "Modo escuro"}>
      <IconButton
        onClick={toggleMode}
        size="small"
        sx={{
          color: tokens.textSecondary,
          border: `1px solid ${tokens.border}`,
          borderRadius: "8px",
          p: 0.75,
          bgcolor: "rgba(99,102,241,0.05)",
          "&:hover": {
            color: ACCENT,
            bgcolor: "rgba(99,102,241,0.1)",
            borderColor: ACCENT,
          },
          transition: "all 0.15s ease",
        }}
      >
        {isDark
          ? <LightModeRoundedIcon sx={{ fontSize: "1rem" }} />
          : <DarkModeRoundedIcon  sx={{ fontSize: "1rem" }} />
        }
      </IconButton>
    </Tooltip>
  );
};

// ─── PlatformShell — the actual layout (runs inside PlatformThemeProvider) ────

interface PlatformShellProps {
  children: React.ReactNode;
}

const PlatformShell: React.FC<PlatformShellProps> = ({ children }) => {
  const router    = useRouter();
  const isMobile  = useMediaQuery("(max-width: 900px)");
  const { tokens, isDark } = usePlatformTheme();

  const [expanded,   setExpanded]   = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    try {
      const raw  = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : null;
      if (!user || user.role !== "super_admin") {
        const dest = user ? "/admin/dashboard" : "/login";
        window.location.replace(dest);
        return;
      }
      setAuthorized(true);
    } catch {
      window.location.replace("/login");
    }
  // router não é dependência estável no Pages Router — rodar só na montagem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authorized) {
    return (
      <Box
        sx={{
          display: "flex", justifyContent: "center", alignItems: "center",
          minHeight: "100vh", bgcolor: "background.default",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <BrandLogo size={48} />
          <CircularProgress size={24} sx={{ color: ACCENT, mt: 2 }} />
        </Box>
      </Box>
    );
  }

  const sidebarWidth = isMobile ? 0 : (expanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED);
  const currentLabel = NAV_ITEMS.find((i) => i.href === router.pathname)?.label ?? "Administration";

  return (
    <>
      {/* Ambient glow — decorative only, positioned fixed */}
      <Box
        aria-hidden
        sx={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden",
          "&::before": {
            content: '""', position: "absolute",
            top: "-15%", right: "-8%", width: "55vw", height: "55vh",
            background: tokens.glowTR,
          },
          "&::after": {
            content: '""', position: "absolute",
            bottom: "-10%", left: "-5%", width: "40vw", height: "40vh",
            background: tokens.glowBL,
          },
        }}
      />

      <Box
        sx={{
          display: "flex", minHeight: "100vh",
          bgcolor: "background.default",
          position: "relative", zIndex: 1,
        }}
      >
        {/* ── Desktop sidebar ── */}
        {!isMobile && (
          <Box
            component="nav"
            sx={{
              width: sidebarWidth,
              flexShrink: 0,
              transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
              position: "fixed", left: 0, top: 0, bottom: 0,
              bgcolor: tokens.sidebarBg,
              borderRight: `1px solid ${tokens.border}`,
              backdropFilter: "blur(24px)",
              boxShadow: isDark
                ? "none"
                : "2px 0 20px rgba(99,102,241,0.07)",
              zIndex: 100, overflow: "hidden",
            }}
          >
            <SidebarContent
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
            />
          </Box>
        )}

        {/* ── Mobile drawer ── */}
        {isMobile && (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            PaperProps={{
              sx: {
                width: SIDEBAR_EXPANDED,
                bgcolor: tokens.sidebarBg,
                borderRight: `1px solid ${tokens.border}`,
                backdropFilter: "blur(24px)",
              },
            }}
          >
            <SidebarContent
              expanded
              isMobile
              onToggle={() => {}}
              onClose={() => setMobileOpen(false)}
            />
          </Drawer>
        )}

        {/* ── Main ── */}
        <Box
          component="main"
          sx={{
            flex: 1,
            ml: isMobile ? 0 : `${sidebarWidth}px`,
            transition: "margin-left 0.25s cubic-bezier(0.4,0,0.2,1)",
            display: "flex", flexDirection: "column", minHeight: "100vh",
          }}
        >
          {/* Top bar */}
          <Box
            component="header"
            sx={{
              height: TOPBAR_HEIGHT,
              display: "flex", alignItems: "center",
              px: { xs: 2, sm: 3 }, gap: 2,
              position: "sticky", top: 0, zIndex: 50,
              bgcolor: tokens.topbarBg,
              backdropFilter: "blur(20px)",
              borderBottom: `1px solid ${tokens.border}`,
              flexShrink: 0,
            }}
          >
            {isMobile && (
              <IconButton
                onClick={() => setMobileOpen(true)}
                sx={{ color: tokens.textSecondary, mr: -0.5 }}
              >
                <MenuRoundedIcon />
              </IconButton>
            )}

            <Box sx={{ flex: 1 }}>
              <Typography
                sx={{
                  fontSize: "0.58rem", fontWeight: 700, color: ACCENT,
                  letterSpacing: "0.2em", textTransform: "uppercase", lineHeight: 1,
                }}
              >
                Platform
              </Typography>
              <Typography
                sx={{ fontSize: "0.88rem", fontWeight: 600, color: tokens.textPrimary, lineHeight: 1.3 }}
              >
                {currentLabel}
              </Typography>
            </Box>

            <LiveClock />
            <ThemeToggle />

            <Avatar
              onClick={() => router.push("/platform/profile")}
              sx={{
                width: 32, height: 32, fontSize: "0.68rem", fontWeight: 700,
                background: `linear-gradient(135deg, ${ACCENT} 0%, #8B5CF6 100%)`,
                cursor: "pointer",
                boxShadow: `0 0 12px ${ACCENT_GLOW}`,
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                "&:hover": {
                  transform: "scale(1.08)",
                  boxShadow: `0 0 20px ${ACCENT_GLOW}`,
                },
              }}
            >
              SA
            </Avatar>
          </Box>

          {/* Page content */}
          <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 } }}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </Box>
        </Box>
      </Box>
    </>
  );
};

// ─── Public export — wraps shell in provider ──────────────────────────────────

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export const PlatformLayout: React.FC<PlatformLayoutProps> = ({ children }) => (
  <PlatformThemeProvider>
    <Head><title>Senhas · Platform</title></Head>
    <PlatformShell>{children}</PlatformShell>
  </PlatformThemeProvider>
);

export default PlatformLayout;
