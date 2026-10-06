/**
 * BrandHeader — cabeçalho da sidebar com a marca do terreiro (logo, nome) sobre o gradiente
 * das cores do terreiro (`useTenant`). No modo recolhido (ícones) mostra só o avatar.
 */
import React from 'react';
import { useTenant } from '@/providers/ThemeProvider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { APP_VERSION_SHORT } from '@/lib/version';

const DEFAULT_PRIMARY = '#4F46E5';
const DEFAULT_SECONDARY = '#EC4899';

export interface BrandHeaderProps {
  /** Compacto (sidebar recolhida em ícones). */
  collapsed?: boolean;
}

export const BrandHeader: React.FC<BrandHeaderProps> = ({ collapsed = false }) => {
  const { tenantName, logoUrl, config } = useTenant();
  const brandPrimary = config?.colors?.primary ?? DEFAULT_PRIMARY;
  const brandSecondary = config?.colors?.secondary ?? DEFAULT_SECONDARY;
  const brandFont = config?.colors?.font ?? '#FFFFFF';
  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const initial = (tenantName || 'T').charAt(0).toUpperCase();

  return (
    <div
      data-slot="brand-header"
      className="flex min-h-16 items-center gap-3 px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1"
      style={{ background: `linear-gradient(135deg, ${brandPrimary} 0%, ${brandSecondary} 100%)`, color: brandFont }}
    >
      <Avatar className="size-10 shrink-0 border-2 border-white/50 shadow-sm">
        {logoUrl && !logoFailed && (
          <AvatarImage src={logoUrl} alt="Logo do terreiro" onError={() => setLogoFailed(true)} className="object-cover" />
        )}
        <AvatarFallback className="bg-white/20 text-base font-bold" style={{ color: brandFont }}>
          {initial}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="line-clamp-2 text-sm leading-tight font-bold" style={{ color: brandFont }}>
            {tenantName || 'Meu Terreiro'}
          </p>
          <p className="text-[0.7rem] font-medium opacity-80" style={{ color: brandFont }}>
            GiraHub {APP_VERSION_SHORT}
          </p>
        </div>
      )}
    </div>
  );
};

export default BrandHeader;
