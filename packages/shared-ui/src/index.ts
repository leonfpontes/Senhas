/**
 * Shared UI Components Export
 * Re-export commonly used Material-UI components and custom components
 * Material-UI v6 with tenant branding support
 */

// Theme System (T080-T082)
export { default as ThemeProvider } from './theme/theme_provider';
export type { TenantThemeConfig } from './theme/theme_provider';
export { default as defaultTheme } from './theme/default_theme';
export {
  applyTenantBranding,
  lightenColor,
  darkenColor,
  getContrastColor,
  type TenantBrandingColors,
} from './theme/brand_overrides';

// Shared Components (T083-T086)
export { AppBar } from './components/AppBar';
export type { AppBarProps } from './components/AppBar';
export { Drawer } from './components/Drawer';
export type { DrawerItem, DrawerProps } from './components/Drawer';
export { Layout } from './components/Layout';
export type { LayoutProps } from './components/Layout';
export { Card } from './components/Card';
export type { CardProps } from './components/Card';

// Form Components (T087-T088)
export { TextField } from './components/form/TextField';
export type { TextFieldProps } from './components/form/TextField';
export {
  ButtonPrimary,
  ButtonSecondary,
  ButtonDanger,
  ButtonSuccess,
} from './components/form/ButtonPrimary';
export type { ButtonProps } from './components/form/ButtonPrimary';

// Re-export Material-UI commons for convenience
export {
  Box,
  Container,
  Grid,
  Stack,
  Paper,
  Card as MuiCard,
  CardContent,
  CardHeader,
  Button as MuiButton,
  TextField as MuiTextField,
  InputLabel,
  FormControl,
  Select,
  Checkbox,
  RadioGroup,
  Radio,
  FormGroup,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Chip,
  Badge,
  Avatar,
  AvatarGroup,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  AppBar as MuiAppBar,
  Toolbar,
  IconButton,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Drawer as MuiDrawer,
  Breadcrumbs,
  Tab,
  Tabs,
  useTheme,
  useMediaQuery,
  CssBaseline,
} from '@mui/material';
