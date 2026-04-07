/**
 * GiraHub Landing Page — Professional SaaS homepage
 */
'use client';

import React, { useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  useMediaQuery,
  useTheme,
  Divider,
} from '@mui/material';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EventIcon from '@mui/icons-material/Event';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import EmailIcon from '@mui/icons-material/Email';
import SecurityIcon from '@mui/icons-material/Security';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MenuIcon from '@mui/icons-material/Menu';
import StarIcon from '@mui/icons-material/Star';

// ─── Design tokens ───────────────────────────────────────────────
const T = {
  primary: '#4f46e5',
  primaryLight: '#818cf8',
  accent: '#f59e0b',
  accentHover: '#d97706',
  dark: '#0f0d2e',
  deep: '#1e1b4b',
  mid: '#312e81',
  gray: '#f8fafc',
  muted: '#94a3b8',
  body: '#475569',
  heroGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)',
  headerBg: 'rgba(15,13,46,0.92)',
  cardRadius: 3,
  cardShadow: '0 4px 24px rgba(0,0,0,0.08)',
  cardHover: '0 12px 40px rgba(79,70,229,0.15)',
};

// ─── Nav links ───────────────────────────────────────────────────
const NAV = [
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Planos', href: '#planos' },
  { label: 'Como Funciona', href: '#como-funciona' },
  { label: 'Contato', href: '#contato' },
];

// ─── Features data ───────────────────────────────────────────────
const FEATURES = [
  { icon: <ConfirmationNumberIcon />, title: 'Emissão Online', desc: 'Consulentes emitem senhas pelo celular com link público. Sem papel, sem filas na porta.' },
  { icon: <EventIcon />, title: 'Gestão de Giras', desc: 'Crie giras com datas, horários e controle de vagas. Calendário organizado do terreiro.' },
  { icon: <DashboardIcon />, title: 'Painel Administrativo', desc: 'Dashboard completo com analytics em tempo real, histórico e relatórios exportáveis.' },
  { icon: <BusinessIcon />, title: 'Médiuns e Cambones', desc: 'Cadastro completo da corrente com dados de contato, endereço via CEP e foto de perfil.' },
  { icon: <EmailIcon />, title: 'Notificações por E-mail', desc: 'Envio automático de senha para o consulente com layout personalizado do terreiro.' },
  { icon: <SecurityIcon />, title: 'Segurança LGPD', desc: 'Dados criptografados, trilha de auditoria completa e conformidade com a LGPD.' },
];

// ─── Steps data ──────────────────────────────────────────────────
const STEPS = [
  { num: '01', title: 'Cadastre seu Terreiro', desc: 'Crie sua conta e configure o perfil do terreiro em minutos.' },
  { num: '02', title: 'Crie suas Giras', desc: 'Defina datas, portas de atendimento e vagas disponíveis.' },
  { num: '03', title: 'Emita Senhas', desc: 'Compartilhe o link público e consulentes emitem senhas online.' },
];

// ─── Trust stats ─────────────────────────────────────────────────
const STATS = [
  { value: '99.9%', label: 'Disponibilidade' },
  { value: 'LGPD', label: 'Conformidade' },
  { value: '24/7', label: 'Monitoramento' },
];

// ─── Pricing plans ───────────────────────────────────────────────
const PLANS = [
  {
    name: 'Free',
    price: 0,
    highlight: false,
    features: [
      'Emissão de senhas online',
      '1 usuário',
      '2 giras por mês',
      'Porta (fila em tempo real)',
      'Link público para retirar senhas',
    ],
  },
  {
    name: 'Basic',
    price: 49,
    highlight: false,
    features: [
      'Tudo do Free +',
      '5 usuários',
      '10 giras por mês',
      'Até 15 médiuns/cambones',
      'Envio de senhas por e-mail',
      'Tema personalizado (cores + logo)',
      'Senhas para patrocinadores',
      'Walk-in (presencial)',
      'Relatório de Gira',
    ],
  },
  {
    name: 'Pro',
    price: 79,
    highlight: true,
    features: [
      'Tudo do Basic +',
      '20 usuários',
      '50 giras por mês',
      'Até 30 médiuns/cambones',
      'Gestão de Associados',
      'Controle de Estoque',
      'Relatório Analítico avançado',
      'Export CSV',
      'Auditoria completa',
    ],
  },
  {
    name: 'Premium',
    price: 99,
    highlight: false,
    features: [
      'Tudo do Pro +',
      'Usuários ilimitados',
      'Giras ilimitadas',
      'Médiuns/cambones ilimitados',
      'Controle de Mensalidade de Médiuns',
      'Suporte prioritário',
    ],
  },
];

// ═════════════════════════════════════════════════════════════════
export default function HomePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const smoothScroll = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // ─── Header ──────────────────────────────────────────────────
  const header = (
    <AppBar
      position="fixed"
      component="nav"
      aria-label="Navegação principal"
      elevation={0}
      sx={{
        background: T.headerBg,
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: 72 }}>
          {/* Brand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto' }}>
            <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 32 }} />
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.02em' }}>
              GiraHub
            </Typography>
          </Box>

          {isMobile ? (
            <>
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }}>
                <MenuIcon />
              </IconButton>
              <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 260, pt: 2 }}>
                  <Box sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ConfirmationNumberIcon sx={{ color: T.accent }} />
                    <Typography fontWeight={700}>GiraHub</Typography>
                  </Box>
                  <Divider />
                  <List>
                    {NAV.map((n) => (
                      <ListItem
                        key={n.href}
                        component="a"
                        href={n.href}
                        onClick={(e: React.MouseEvent) => { setDrawerOpen(false); smoothScroll(e, n.href); }}
                        sx={{ cursor: 'pointer' }}
                      >
                        <ListItemText primary={n.label} />
                      </ListItem>
                    ))}
                    <Divider sx={{ my: 1 }} />
                    <ListItem>
                      <Link href="/cadastro" passHref legacyBehavior>
                        <Button variant="outlined" fullWidth sx={{ borderColor: T.accent, color: T.accent, fontWeight: 600, '&:hover': { bgcolor: 'rgba(245,158,11,0.08)' } }}>
                          Cadastre-se
                        </Button>
                      </Link>
                    </ListItem>
                    <ListItem>
                      <Link href="/login" passHref legacyBehavior>
                        <Button variant="contained" fullWidth sx={{ bgcolor: T.accent, color: '#000', fontWeight: 600, '&:hover': { bgcolor: T.accentHover } }}>
                          Entrar
                        </Button>
                      </Link>
                    </ListItem>
                  </List>
                </Box>
              </Drawer>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {NAV.map((n) => (
                <Typography
                  key={n.href}
                  component="a"
                  href={n.href}
                  onClick={(e: React.MouseEvent) => smoothScroll(e, n.href)}
                  sx={{
                    color: 'rgba(255,255,255,0.8)',
                    textDecoration: 'none',
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    transition: 'color 0.2s',
                    '&:hover': { color: '#fff' },
                  }}
                >
                  {n.label}
                </Typography>
              ))}
              <Link href="/cadastro" passHref legacyBehavior>
                <Button
                  variant="outlined"
                  sx={{
                    borderColor: 'rgba(255,255,255,0.5)',
                    color: '#fff',
                    fontWeight: 600,
                    px: 3,
                    borderRadius: 2,
                    textTransform: 'none',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  Cadastre-se
                </Button>
              </Link>
              <Link href="/login" passHref legacyBehavior>
                <Button
                  variant="contained"
                  sx={{
                    bgcolor: T.accent,
                    color: '#000',
                    fontWeight: 600,
                    px: 3,
                    borderRadius: 2,
                    textTransform: 'none',
                    '&:hover': { bgcolor: T.accentHover },
                  }}
                >
                  Entrar
                </Button>
              </Link>
            </Box>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );

  // ─── Footer ──────────────────────────────────────────────────
  const footer = (
    <Box component="footer" sx={{ bgcolor: T.dark, color: '#fff', pt: 8, pb: 4 }}>
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Brand col */}
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ConfirmationNumberIcon sx={{ color: T.accent }} />
              <Typography variant="h6" fontWeight={700}>GiraHub</Typography>
            </Box>
            <Typography sx={{ color: T.muted, fontSize: '0.9rem', lineHeight: 1.7 }}>
              Plataforma moderna para gestão de senhas e giras em terreiros de Umbanda.
            </Typography>
          </Grid>
          {/* Platform links */}
          <Grid item xs={6} md={2}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>
              Plataforma
            </Typography>
            {NAV.map((n) => (
              <Typography
                key={n.href}
                component="a"
                href={n.href}
                sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}
              >
                {n.label}
              </Typography>
            ))}
          </Grid>
          {/* Legal links */}
          <Grid item xs={6} md={2}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>
              Legal
            </Typography>
            <Link href="/privacidade" passHref legacyBehavior>
              <Typography component="a" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}>
                Política de Privacidade
              </Typography>
            </Link>
            <Link href="/termos" passHref legacyBehavior>
              <Typography component="a" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}>
                Termos de Uso
              </Typography>
            </Link>
          </Grid>
          {/* Contact col */}
          <Grid item xs={12} md={4}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>
              Contato
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', mb: 1 }}>
              leonfpontes@gmail.com
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
              (16) 99109-1234
            </Typography>
          </Grid>
        </Grid>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 4 }} />
        <Typography sx={{ color: T.muted, fontSize: '0.8rem', textAlign: 'center' }}>
          © {new Date().getFullYear()} GiraHub. Todos os direitos reservados.
        </Typography>
      </Container>
    </Box>
  );

  // ─── Render ──────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>GiraHub — Gestão de Senhas e Giras para Terreiros de Umbanda</title>
        <meta name="description" content="Plataforma moderna para emissão e gestão de senhas em terreiros de Umbanda. Multi-terreiro, LGPD, 100% online. Comece grátis." />
        {/* Canonical */}
        <link rel="canonical" href="https://girahub.com.br/" />
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://girahub.com.br/" />
        <meta property="og:title" content="GiraHub — Gestão de Senhas e Giras para Terreiros" />
        <meta property="og:description" content="Plataforma moderna para emissão e gestão de senhas em terreiros de Umbanda. Multi-terreiro, LGPD, 100% online." />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="GiraHub" />
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="GiraHub — Gestão de Senhas e Giras para Terreiros" />
        <meta name="twitter:description" content="Plataforma moderna para emissão e gestão de senhas em terreiros de Umbanda. Multi-terreiro, LGPD, 100% online." />
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  name: 'GiraHub',
                  url: 'https://girahub.com.br',
                  description: 'Plataforma moderna para gestão de senhas e giras em terreiros de Umbanda.',
                  contactPoint: {
                    '@type': 'ContactPoint',
                    email: 'leonfpontes@gmail.com',
                    contactType: 'customer support',
                    availableLanguage: 'Portuguese',
                  },
                },
                {
                  '@type': 'SoftwareApplication',
                  name: 'GiraHub',
                  applicationCategory: 'BusinessApplication',
                  operatingSystem: 'Web',
                  description: 'Emissão e gestão de senhas para terreiros de Umbanda. Multi-terreiro, LGPD, 100% online.',
                  offers: {
                    '@type': 'Offer',
                    price: '0',
                    priceCurrency: 'BRL',
                    description: 'Plano Free — emissão de senhas, 1 usuário, 2 giras por mês',
                  },
                },
              ],
            }),
          }}
        />
      </Head>

      {header}

      {/* ── Hero ── */}
      <Box
        sx={{
          minHeight: '100vh',
          background: T.heroGradient,
          display: 'flex',
          alignItems: 'center',
          pt: { xs: 10, md: 0 },
          pb: { xs: 8, md: 0 },
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'rgba(79,70,229,0.15)', top: -200, right: -200, filter: 'blur(80px)' }} />
        <Box sx={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'rgba(245,158,11,0.08)', bottom: -100, left: -100, filter: 'blur(60px)' }} />

        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              {/* Badge */}
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  px: 2,
                  py: 0.5,
                  mb: 3,
                }}
              >
                <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 18 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', fontWeight: 500 }}>
                  Plataforma para Terreiros de Umbanda
                </Typography>
              </Box>

              <Typography
                variant="h1"
                sx={{
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: { xs: '2.5rem', sm: '3.2rem', md: '3.8rem' },
                  lineHeight: 1.1,
                  mb: 3,
                  letterSpacing: '-0.03em',
                }}
              >
                Gerencie suas{' '}
                <Box component="span" sx={{ color: T.accent }}>senhas e giras</Box>{' '}
                de forma moderna
              </Typography>

              <Typography
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: { xs: '1.05rem', md: '1.2rem' },
                  lineHeight: 1.7,
                  mb: 4,
                  maxWidth: 540,
                }}
              >
                Emissão de senhas online, gestão completa de giras, painel administrativo com analytics
                e total conformidade com a LGPD. Tudo em uma plataforma multi-terreiro.
              </Typography>

              {/* CTAs */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 5 }}>
                <Button
                  variant="contained"
                  size="large"
                  href="#contato"
                  onClick={(e: React.MouseEvent) => smoothScroll(e, '#contato')}
                  endIcon={<ArrowForwardIcon />}
                  sx={{
                    bgcolor: T.accent,
                    color: '#000',
                    fontWeight: 700,
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                    fontSize: '1rem',
                    textTransform: 'none',
                    '&:hover': { bgcolor: T.accentHover, transform: 'translateY(-2px)' },
                    transition: 'all 0.2s',
                  }}
                >
                  Comece Agora
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  href="#funcionalidades"
                  onClick={(e: React.MouseEvent) => smoothScroll(e, '#funcionalidades')}
                  sx={{
                    borderColor: 'rgba(255,255,255,0.3)',
                    color: '#fff',
                    fontWeight: 600,
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                    fontSize: '1rem',
                    textTransform: 'none',
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.05)' },
                  }}
                >
                  Saiba Mais
                </Button>
              </Box>

              {/* Trust badges */}
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {['Emissão instantânea', 'Multi-terreiro', '100% LGPD'].map((badge) => (
                  <Box key={badge} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ color: T.accent, fontSize: 18 }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>{badge}</Typography>
                  </Box>
                ))}
              </Box>
            </Grid>

            {/* Illustrative stacked cards */}
            {!isMobile && (
              <Grid item md={5}>
                <Box sx={{ position: 'relative', height: 400, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'absolute',
                        width: 280,
                        height: 160,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.07)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        transform: `rotate(${-6 + i * 6}deg) translateY(${-30 + i * 30}px)`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        transition: 'transform 0.4s',
                        '&:hover': { transform: `rotate(${-6 + i * 6 - 2}deg) translateY(${-30 + i * 30 - 8}px)` },
                      }}
                    >
                      <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 36, opacity: 0.9 }} />
                      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>
                        Senha #{String(i + 1).padStart(3, '0')}
                      </Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                        Gira de {['Pretos Velhos', 'Caboclos', 'Erês'][i]}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        </Container>
      </Box>

      {/* ── Features ── */}
      <Box id="funcionalidades" sx={{ py: { xs: 8, md: 12 }, bgcolor: T.gray, scrollMarginTop: '80px' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography
              sx={{
                color: T.primary,
                fontWeight: 600,
                fontSize: '0.9rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                mb: 1,
              }}
            >
              Funcionalidades
            </Typography>
            <Typography variant="h2" sx={{ fontWeight: 800, color: T.dark, mb: 2, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
              Tudo que seu terreiro precisa
            </Typography>
            <Typography sx={{ color: T.body, maxWidth: 600, mx: 'auto', fontSize: '1.05rem' }}>
              Uma plataforma completa para modernizar a gestão do seu terreiro, da emissão de senhas ao relatório final.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {FEATURES.map((f) => (
              <Grid item xs={12} sm={6} md={4} key={f.title}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    borderRadius: T.cardRadius,
                    boxShadow: T.cardShadow,
                    transition: 'all 0.3s',
                    '&:hover': { boxShadow: T.cardHover, transform: 'translateY(-4px)' },
                    border: '1px solid rgba(0,0,0,0.04)',
                  }}
                >
                  <CardContent sx={{ p: 4 }}>
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 2,
                        bgcolor: `${T.primary}10`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 2.5,
                        color: T.primary,
                        fontSize: 28,
                      }}
                    >
                      {f.icon}
                    </Box>
                    <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, color: T.dark, fontSize: '1.1rem' }}>
                      {f.title}
                    </Typography>
                    <Typography sx={{ color: T.body, lineHeight: 1.7, fontSize: '0.93rem' }}>
                      {f.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── How It Works ── */}
      <Box id="como-funciona" sx={{ py: { xs: 8, md: 12 }, bgcolor: '#fff', scrollMarginTop: '80px' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography sx={{ color: T.primary, fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
              Como Funciona
            </Typography>
            <Typography variant="h2" sx={{ fontWeight: 800, color: T.dark, mb: 2, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
              Simples como deve ser
            </Typography>
          </Box>

          <Grid container spacing={4} alignItems="flex-start">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.num}>
                <Grid item xs={12} md={3.5}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        background: T.heroGradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 3,
                      }}
                    >
                      <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.3rem' }}>{s.num}</Typography>
                    </Box>
                    <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, color: T.dark, fontSize: '1rem' }}>{s.title}</Typography>
                    <Typography sx={{ color: T.body, lineHeight: 1.7 }}>{s.desc}</Typography>
                  </Box>
                </Grid>
                {i < STEPS.length - 1 && !isMobile && (
                  <Grid item md={0.75} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pt: '36px !important' }}>
                    <ArrowForwardIcon sx={{ color: T.muted, fontSize: 28 }} />
                  </Grid>
                )}
              </React.Fragment>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Planos / Pricing ── */}
      <Box id="planos" sx={{ py: { xs: 8, md: 12 }, bgcolor: T.gray, scrollMarginTop: '80px' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography sx={{ color: T.primary, fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
              Planos
            </Typography>
            <Typography variant="h2" sx={{ fontWeight: 800, color: T.dark, mb: 2, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
              Escolha o plano ideal para seu terreiro
            </Typography>
            <Typography sx={{ color: T.body, maxWidth: 560, mx: 'auto' }}>
              Comece gratuitamente e escale conforme sua necessidade. Todos os planos incluem emissão online de senhas.
            </Typography>
          </Box>

          <Grid container spacing={3} justifyContent="center">
            {PLANS.map((plan) => (
              <Grid item xs={12} sm={6} md={3} key={plan.name} sx={{ pt: plan.highlight ? 2 : 0 }}>
                <Card
                  elevation={0}
                  sx={{
                    position: 'relative',
                    overflow: 'visible',
                    borderRadius: T.cardRadius,
                    border: plan.highlight ? `2px solid ${T.primary}` : '1px solid rgba(0,0,0,0.06)',
                    boxShadow: plan.highlight ? T.cardHover : T.cardShadow,
                    transform: plan.highlight ? { md: 'scale(1.04)' } : 'none',
                    transition: 'all 0.3s',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    '&:hover': { boxShadow: T.cardHover, transform: 'translateY(-4px)' },
                  }}
                >
                  {plan.highlight && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -1,
                        left: '50%',
                        transform: 'translateX(-50%) translateY(-50%)',
                        bgcolor: T.primary,
                        color: '#fff',
                        px: 2,
                        py: 0.5,
                        borderRadius: 5,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <StarIcon sx={{ fontSize: 14 }} />
                      Mais Popular
                    </Box>
                  )}
                  <CardContent sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography fontWeight={700} sx={{ mb: 1, color: T.dark, fontSize: '1.1rem' }}>
                      {plan.name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 3 }}>
                      {plan.price === 0 ? (
                        <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: T.dark }}>
                          Grátis
                        </Typography>
                      ) : (
                        <>
                          <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: T.dark }}>
                            R${plan.price}
                          </Typography>
                          <Typography sx={{ color: T.muted, ml: 0.5, fontSize: '0.9rem' }}>
                            /mês
                          </Typography>
                        </>
                      )}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      {plan.features.map((feat) => (
                        <Box key={feat} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.2 }}>
                          <CheckCircleIcon sx={{ color: plan.highlight ? T.primary : T.muted, fontSize: 18, mt: '2px', flexShrink: 0 }} />
                          <Typography sx={{ fontSize: '0.85rem', color: T.body }}>
                            {feat}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Button
                      variant={plan.highlight ? 'contained' : 'outlined'}
                      fullWidth
                      href={plan.price === 0 ? '/cadastro' : `/cadastro?plan=${plan.name.toLowerCase()}`}
                      sx={{
                        mt: 3,
                        py: 1.2,
                        fontWeight: 700,
                        textTransform: 'none',
                        borderRadius: 2,
                        ...(plan.highlight
                          ? { bgcolor: T.primary, '&:hover': { bgcolor: T.primaryLight } }
                          : { borderColor: T.primary, color: T.primary }),
                      }}
                    >
                      {plan.price === 0 ? 'Começar Grátis' : `Assinar ${plan.name}`}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ── Trust / About ── */}
      <Box sx={{ py: { xs: 8, md: 12 }, background: T.heroGradient, position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(245,158,11,0.06)', top: -200, left: -200, filter: 'blur(80px)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Typography variant="h2" sx={{ color: '#fff', fontWeight: 800, mb: 3, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
                Construído para a{' '}
                <Box component="span" sx={{ color: T.accent }}>comunidade espiritual</Box>
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.1rem', lineHeight: 1.8, mb: 4, maxWidth: 520 }}>
                O GiraHub nasceu da necessidade real de terreiros que buscavam modernizar sua organização
                sem perder a essência espiritual. Nossa plataforma respeita a tradição enquanto traz a
                eficiência da tecnologia.
              </Typography>
            </Grid>
            <Grid item xs={12} md={5}>
              <Grid container spacing={2}>
                {STATS.map((st) => (
                  <Grid item xs={4} key={st.label}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography sx={{ color: T.accent, fontWeight: 800, fontSize: { xs: '1.6rem', md: '2rem' } }}>
                        {st.value}
                      </Typography>
                      <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>{st.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── Contact ── */}
      <Box id="contato" sx={{ py: { xs: 8, md: 12 }, bgcolor: T.gray, scrollMarginTop: '80px' }}>
        <Container maxWidth="sm">
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography sx={{ color: T.primary, fontWeight: 600, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
              Contato
            </Typography>
            <Typography variant="h2" sx={{ fontWeight: 800, color: T.dark, mb: 2, fontSize: { xs: '1.8rem', md: '2.4rem' } }}>
              Fale conosco
            </Typography>
            <Typography sx={{ color: T.body }}>
              Tem interesse ou dúvidas? Entre em contato por e-mail ou WhatsApp.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Card elevation={0} sx={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow, textAlign: 'center', border: '1px solid rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 4 }}>
                  <MailOutlineIcon sx={{ color: T.primary, fontSize: 40, mb: 2 }} />
                  <Typography fontWeight={600} sx={{ mb: 1, color: T.dark }}>E-mail</Typography>
                  <Typography
                    component="a"
                    href="mailto:leonfpontes@gmail.com"
                    sx={{ color: T.primary, textDecoration: 'none', fontSize: '0.95rem', '&:hover': { textDecoration: 'underline' } }}
                  >
                    leonfpontes@gmail.com
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Card elevation={0} sx={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow, textAlign: 'center', border: '1px solid rgba(0,0,0,0.04)' }}>
                <CardContent sx={{ p: 4 }}>
                  <WhatsAppIcon sx={{ color: '#25D366', fontSize: 40, mb: 2 }} />
                  <Typography fontWeight={600} sx={{ mb: 1, color: T.dark }}>WhatsApp</Typography>
                  <Typography
                    component="a"
                    href="https://wa.me/5516991091234"
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: T.primary, textDecoration: 'none', fontSize: '0.95rem', '&:hover': { textDecoration: 'underline' } }}
                  >
                    (16) 99109-1234
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── CTA ── */}
      <Box sx={{ py: { xs: 8, md: 10 }, bgcolor: T.deep, textAlign: 'center' }}>
        <Container maxWidth="sm">
          <Typography variant="h2" sx={{ color: '#fff', fontWeight: 800, mb: 2, fontSize: { xs: '1.6rem', md: '2rem' } }}>
            Pronto para modernizar seu terreiro?
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', mb: 4 }}>
            Comece agora e transforme a experiência dos seus consulentes.
          </Typography>
          <Button
            variant="contained"
            size="large"
            href="#contato"
            onClick={(e: React.MouseEvent) => smoothScroll(e, '#contato')}
            endIcon={<ArrowForwardIcon />}
            sx={{
              bgcolor: T.accent,
              color: '#000',
              fontWeight: 700,
              px: 5,
              py: 1.5,
              borderRadius: 2,
              fontSize: '1.05rem',
              textTransform: 'none',
              '&:hover': { bgcolor: T.accentHover, transform: 'translateY(-2px)' },
              transition: 'all 0.2s',
            }}
          >
            Comece Agora
          </Button>
        </Container>
      </Box>

      {footer}
    </>
  );
}
