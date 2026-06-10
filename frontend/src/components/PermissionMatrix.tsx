import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Typography,
  Box,
  Chip,
  Card,
  CardContent,
  Grid,
  useTheme,
  useMediaQuery,
  Tooltip,
} from '@mui/material';
import {
  PermissionFeature,
  FEATURE_LABELS,
  FeatureMeta,
} from '../constants/permissionFeatures';
import { GroupPermission } from '../services/permissionGroupsService';

interface PermissionMatrixProps {
  value: GroupPermission[];
  onChange: (newValue: GroupPermission[]) => void;
  disabled?: boolean;
}

const ACTIONS: ('can_view' | 'can_insert' | 'can_edit' | 'can_delete')[] = [
  'can_view',
  'can_insert',
  'can_edit',
  'can_delete',
];

const ACTION_LABELS: Record<string, string> = {
  can_view: 'Visualizar',
  can_insert: 'Inserir',
  can_edit: 'Editar',
  can_delete: 'Deletar',
};

// Groups defined in implementation plan G5
const GROUPS = ['Operacional', 'Cadastros', 'Financeiro', 'Administração', 'Relatórios'];

export default function PermissionMatrix({ value, onChange, disabled = false }: PermissionMatrixProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Ensure all features exist in value array
  const permissionsMap = useMemo(() => {
    const map = new Map<PermissionFeature, GroupPermission>();
    value.forEach((p) => {
      map.set(p.feature, p);
    });

    const allFeatures = Object.keys(FEATURE_LABELS) as PermissionFeature[];
    allFeatures.forEach((f) => {
      if (!map.has(f)) {
        map.set(f, {
          feature: f,
          can_view: false,
          can_insert: false,
          can_edit: false,
          can_delete: false,
        });
      }
    });

    return map;
  }, [value]);

  const updatePermission = (
    feature: PermissionFeature,
    action: 'can_view' | 'can_insert' | 'can_edit' | 'can_delete',
    checked: boolean
  ) => {
    if (disabled) return;
    const current = permissionsMap.get(feature)!;
    const updated = { ...current, [action]: checked };
    
    // Auto-enable view if inserting, editing, or deleting
    if (checked && action !== 'can_view') {
      updated.can_view = true;
    }
    // Auto-disable other actions if view is disabled
    if (!checked && action === 'can_view') {
      updated.can_insert = false;
      updated.can_edit = false;
      updated.can_delete = false;
    }

    const nextValue = Array.from(permissionsMap.values()).map((p) =>
      p.feature === feature ? updated : p
    );
    onChange(nextValue);
  };

  // Group features
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, { feature: PermissionFeature; meta: FeatureMeta }[]> = {};
    GROUPS.forEach((g) => {
      groups[g] = [];
    });

    Object.entries(FEATURE_LABELS).forEach(([f, meta]) => {
      if (groups[meta.group]) {
        groups[meta.group].push({ feature: f as PermissionFeature, meta });
      }
    });

    return groups;
  }, []);

  // Row header checkbox (Toggle All for a single feature)
  const isRowAllChecked = (feature: PermissionFeature) => {
    const perm = permissionsMap.get(feature)!;
    return ACTIONS.every((act) => perm[act]);
  };

  const handleRowToggle = (feature: PermissionFeature, checked: boolean) => {
    if (disabled) return;
    const nextValue = Array.from(permissionsMap.values()).map((p) => {
      if (p.feature === feature) {
        return {
          ...p,
          can_view: checked,
          can_insert: checked,
          can_edit: checked,
          can_delete: checked,
        };
      }
      return p;
    });
    onChange(nextValue);
  };

  // Column header checkbox (Toggle All for a single action)
  const isColumnAllChecked = (action: typeof ACTIONS[number]) => {
    return Array.from(permissionsMap.values()).every((p) => p[action]);
  };

  const handleColumnToggle = (action: typeof ACTIONS[number], checked: boolean) => {
    if (disabled) return;
    const nextValue = Array.from(permissionsMap.values()).map((p) => {
      const updated = { ...p, [action]: checked };
      if (checked && action !== 'can_view') {
        updated.can_view = true;
      }
      if (!checked && action === 'can_view') {
        updated.can_insert = false;
        updated.can_edit = false;
        updated.can_delete = false;
      }
      return updated;
    });
    onChange(nextValue);
  };

  // Preset Handlers (G5)
  const applyPreset = (preset: 'leitura' | 'operacional' | 'completo' | 'nenhum') => {
    if (disabled) return;
    const nextValue = Array.from(permissionsMap.values()).map((p) => {
      if (preset === 'nenhum') {
        return {
          feature: p.feature,
          can_view: false,
          can_insert: false,
          can_edit: false,
          can_delete: false,
        };
      }
      if (preset === 'completo') {
        return {
          feature: p.feature,
          can_view: true,
          can_insert: true,
          can_edit: true,
          can_delete: true,
        };
      }
      if (preset === 'leitura') {
        return {
          feature: p.feature,
          can_view: true,
          can_insert: false,
          can_edit: false,
          can_delete: false,
        };
      }
      if (preset === 'operacional') {
        // Operational: view + insert on transactional features, view only on others
        const opFeatures: PermissionFeature[] = ['giras', 'tickets', 'porta', 'estoque'];
        const isOp = opFeatures.includes(p.feature);
        return {
          feature: p.feature,
          can_view: true,
          can_insert: isOp,
          can_edit: false,
          can_delete: false,
        };
      }
      return p;
    });
    onChange(nextValue);
  };

  // Render presets bar
  const presetsBar = (
    <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mr: 1, fontWeight: 500 }}>
        Configurações rápidas:
      </Typography>
      <Chip
        label="Nenhuma"
        onClick={() => applyPreset('nenhum')}
        disabled={disabled}
        variant="outlined"
        clickable
        sx={{ borderRadius: 2 }}
      />
      <Chip
        label="Somente Leitura"
        onClick={() => applyPreset('leitura')}
        disabled={disabled}
        color="info"
        variant="outlined"
        clickable
        sx={{ borderRadius: 2 }}
      />
      <Chip
        label="Operacional"
        onClick={() => applyPreset('operacional')}
        disabled={disabled}
        color="warning"
        variant="outlined"
        clickable
        sx={{ borderRadius: 2 }}
      />
      <Chip
        label="Completo (Administrador)"
        onClick={() => applyPreset('completo')}
        disabled={disabled}
        color="success"
        variant="outlined"
        clickable
        sx={{ borderRadius: 2 }}
      />
    </Box>
  );

  if (isMobile) {
    // Mobile layouts using cards per feature (G15)
    return (
      <Box>
        {presetsBar}
        {GROUPS.map((groupName) => {
          const groupFeatures = groupedFeatures[groupName];
          if (groupFeatures.length === 0) return null;

          return (
            <Box key={groupName} sx={{ mb: 4 }}>
              <Typography
                variant="subtitle2"
                color="primary"
                sx={{ mb: 2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}
              >
                {groupName}
              </Typography>
              <Grid container spacing={2}>
                {groupFeatures.map(({ feature, meta }) => {
                  const perm = permissionsMap.get(feature)!;
                  const isAll = isRowAllChecked(feature);

                  return (
                    <Grid item xs={12} key={feature}>
                      <Card
                        variant="outlined"
                        sx={{
                          borderRadius: 3,
                          borderColor: isAll ? 'success.light' : 'divider',
                          backgroundColor: isAll ? 'rgba(76, 175, 80, 0.04)' : 'background.paper',
                        }}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              mb: 2,
                            }}
                          >
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {meta.label}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                Todos
                              </Typography>
                              <Checkbox
                                size="small"
                                checked={isAll}
                                disabled={disabled}
                                onChange={(e) => handleRowToggle(feature, e.target.checked)}
                              />
                            </Box>
                          </Box>
                          <Grid container spacing={1}>
                            {ACTIONS.map((act) => (
                              <Grid item xs={6} key={act}>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    p: 1,
                                    borderRadius: 2,
                                    border: '1px solid',
                                    borderColor: perm[act] ? 'primary.light' : 'grey.200',
                                    backgroundColor: perm[act]
                                      ? 'rgba(25, 118, 210, 0.04)'
                                      : 'transparent',
                                  }}
                                >
                                  <Checkbox
                                    size="small"
                                    checked={perm[act]}
                                    disabled={disabled}
                                    onChange={(e) => updatePermission(feature, act, e.target.checked)}
                                  />
                                  <Typography variant="caption" sx={{ fontWeight: perm[act] ? 600 : 400 }}>
                                    {ACTION_LABELS[act]}
                                  </Typography>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          );
        })}
      </Box>
    );
  }

  // Desktop layout using styled tables (G5)
  return (
    <Box>
      {presetsBar}
      <TableContainer component={Paper} sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, width: '30%', py: 1.5 }}>Funcionalidade</TableCell>
              {ACTIONS.map((act) => (
                <TableCell key={act} align="center" sx={{ fontWeight: 600, py: 1.5 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {ACTION_LABELS[act]}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Marcar todos
                      </Typography>
                      <Checkbox
                        size="small"
                        checked={isColumnAllChecked(act)}
                        disabled={disabled}
                        onChange={(e) => handleColumnToggle(act, e.target.checked)}
                        sx={{ p: 0.5 }}
                      />
                    </Box>
                  </Box>
                </TableCell>
              ))}
              <TableCell align="center" sx={{ fontWeight: 600, width: '12%', py: 1.5 }}>
                Marcar Linha
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {GROUPS.map((groupName) => {
              const groupFeatures = groupedFeatures[groupName];
              if (groupFeatures.length === 0) return null;

              return (
                <React.Fragment key={groupName}>
                  {/* Category Separator Line (G5) */}
                  <TableRow sx={{ backgroundColor: 'rgba(25, 118, 210, 0.05)' }}>
                    <TableCell colSpan={6} sx={{ fontWeight: 700, color: 'primary.main', py: 1 }}>
                      {groupName}
                    </TableCell>
                  </TableRow>
                  {groupFeatures.map(({ feature, meta }) => {
                    const perm = permissionsMap.get(feature)!;
                    const isAll = isRowAllChecked(feature);

                    return (
                      <TableRow
                        key={feature}
                        sx={{
                          transition: 'background-color 0.2s',
                          backgroundColor: isAll ? 'rgba(76, 175, 80, 0.04)' : 'transparent',
                          '&:hover': {
                            backgroundColor: isAll ? 'rgba(76, 175, 80, 0.07)' : 'rgba(0, 0, 0, 0.02)',
                          },
                        }}
                      >
                        <TableCell sx={{ pl: 3, fontWeight: 500 }}>
                          {meta.label}
                        </TableCell>
                        {ACTIONS.map((act) => (
                          <TableCell key={act} align="center">
                            <Checkbox
                              checked={perm[act]}
                              disabled={disabled}
                              onChange={(e) => updatePermission(feature, act, e.target.checked)}
                              size="small"
                            />
                          </TableCell>
                        ))}
                        <TableCell align="center">
                          <Checkbox
                            checked={isAll}
                            disabled={disabled}
                            onChange={(e) => handleRowToggle(feature, e.target.checked)}
                            size="small"
                            color="success"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
