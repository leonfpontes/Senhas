import { getAdminTokens, buildAdminTheme } from '@/styles/adminTheme';

describe('getAdminTokens', () => {
  it('returns light tokens for light mode', () => {
    const t = getAdminTokens('light');
    expect(t.pageBg).toBe('#F8FAFC');
    expect(t.cardBg).toBe('#FFFFFF');
    expect(t.sidebarBg).toBe('#FFFFFF');
  });

  it('returns dark tokens for dark mode', () => {
    const t = getAdminTokens('dark');
    expect(t.pageBg).toBe('#0F172A');
    expect(t.cardBg).toBe('#1E293B');
  });

  it('light and dark pageBg are different', () => {
    expect(getAdminTokens('light').pageBg).not.toBe(getAdminTokens('dark').pageBg);
  });

  it('all required token keys are present', () => {
    const keys = [
      'pageBg', 'sidebarBg', 'cardBg', 'border', 'borderStrong',
      'textPrimary', 'textSecondary', 'textGhost', 'inputBg',
      'chartGrid', 'chartTick', 'tooltipBg', 'rowHover', 'skeletonBase',
    ];
    const t = getAdminTokens('light');
    keys.forEach((k) => expect(t).toHaveProperty(k));
  });
});

describe('buildAdminTheme', () => {
  const BRAND_PRIMARY   = '#FF0000';
  const BRAND_SECONDARY = '#00FF00';

  it('builds a theme object', () => {
    const theme = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    expect(theme).toBeDefined();
    expect(theme.palette).toBeDefined();
  });

  it('injects brand primary color into palette', () => {
    const theme = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    expect(theme.palette.primary.main).toBe(BRAND_PRIMARY);
  });

  it('injects brand secondary color into palette', () => {
    const theme = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    expect(theme.palette.secondary.main).toBe(BRAND_SECONDARY);
  });

  it('sets correct MUI palette mode for light', () => {
    const theme = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    expect(theme.palette.mode).toBe('light');
  });

  it('sets correct MUI palette mode for dark', () => {
    const theme = buildAdminTheme('dark', BRAND_PRIMARY, BRAND_SECONDARY);
    expect(theme.palette.mode).toBe('dark');
  });

  it('brand colors are the same in light and dark mode', () => {
    const light = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    const dark  = buildAdminTheme('dark',  BRAND_PRIMARY, BRAND_SECONDARY);
    expect(light.palette.primary.main).toBe(dark.palette.primary.main);
    expect(light.palette.secondary.main).toBe(dark.palette.secondary.main);
  });

  it('background differs between light and dark', () => {
    const light = buildAdminTheme('light', BRAND_PRIMARY, BRAND_SECONDARY);
    const dark  = buildAdminTheme('dark',  BRAND_PRIMARY, BRAND_SECONDARY);
    expect(light.palette.background.default).not.toBe(dark.palette.background.default);
  });
});
