/**
 * Girahub — Política de Privacidade
 */
'use client';

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  Container,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Divider,
  useMediaQuery,
  useTheme,
  Grid,
} from '@mui/material';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import MenuIcon from '@mui/icons-material/Menu';

// ─── Tokens (same as homepage) ───────────────────────────────────
const T = {
  primary: '#4f46e5',
  accent: '#f59e0b',
  accentHover: '#d97706',
  dark: '#0f0d2e',
  deep: '#1e1b4b',
  gray: '#f8fafc',
  muted: '#94a3b8',
  body: '#475569',
  heroGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)',
  headerBg: 'rgba(15,13,46,0.92)',
};

const NAV = [
  { label: 'Funcionalidades', href: '/#funcionalidades' },
  { label: 'Como Funciona', href: '/#como-funciona' },
  { label: 'Contato', href: '/#contato' },
];

// ─── Legal sections ──────────────────────────────────────────────
const SECTIONS = [
  {
    title: '1. Dados que Coletamos',
    body: `Coletamos os seguintes tipos de dados pessoais:

• **Dados de cadastro:** nome, e-mail, telefone e informações do terreiro (nome, endereço) ao criar uma conta administrativa.
• **Dados de consulentes:** nome e e-mail fornecidos voluntariamente ao emitir uma senha para participação em giras.
• **Dados de uso:** páginas acessadas, horários de acesso, ações realizadas no painel administrativo (registradas em trilha de auditoria).
• **Dados técnicos:** endereço IP, tipo de navegador e sistema operacional, coletados automaticamente para garantir segurança e desempenho.
• **Dados de comunicação:** conteúdo de e-mails enviados pela plataforma (confirmações de senha, notificações).`,
  },
  {
    title: '2. Finalidade do Uso dos Dados',
    body: `Utilizamos seus dados para:

• Prover e manter o funcionamento da plataforma Girahub.
• Emitir, reenviar e gerenciar senhas para giras.
• Enviar confirmações e notificações por e-mail aos consulentes e administradores.
• Manter a trilha de auditoria de operações para segurança e conformidade.
• Gerar relatórios e analytics agregados para os administradores do terreiro.
• Melhorar a experiência do usuário e a segurança da plataforma.`,
  },
  {
    title: '3. Isolamento Multi-Tenant',
    body: `O Girahub opera com arquitetura multi-tenant, garantindo isolamento total dos dados entre diferentes terreiros. Isso significa que:

• Cada terreiro (tenant) possui um identificador único atrelado a todos os seus dados.
• A autenticação via JWT carrega o identificador do tenant no payload.
• Toda consulta ao banco de dados filtra obrigatoriamente pelo tenant, impedindo acesso cruzado entre organizações.
• Administradores de um terreiro jamais têm acesso aos dados de outro terreiro.`,
  },
  {
    title: '4. Armazenamento e Segurança',
    body: `Adotamos as seguintes medidas de segurança:

• **Criptografia em trânsito:** toda comunicação entre seu navegador e nossos servidores utiliza HTTPS/TLS.
• **Senhas protegidas:** senhas de acesso são armazenadas com hash bcrypt, nunca em texto puro.
• **Controle de acesso (RBAC):** permissões diferenciadas por papel (Super Admin, Administrador, Operador).
• **Trilha de auditoria:** todas as operações sensíveis são registradas com data, hora, usuário e ação realizada.
• **Monitoramento contínuo:** a plataforma conta com monitoramento 24/7 para detecção de anomalias.`,
  },
  {
    title: '5. Compartilhamento de Dados',
    body: `Não vendemos, alugamos ou compartilhamos seus dados pessoais para fins de marketing. Dados podem ser compartilhados apenas nos seguintes casos:

• **Provedores de e-mail:** utilizamos serviços de envio de e-mail (ex.: Brevo, Resend) exclusivamente para entregar notificações e confirmações da plataforma.
• **Obrigação legal:** quando exigido por lei, ordem judicial ou autoridade reguladora competente.
• **Proteção de direitos:** para proteger os direitos, propriedade ou segurança do Girahub, de nossos usuários ou do público.`,
  },
  {
    title: '6. Seus Direitos (LGPD — Art. 18)',
    body: `De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:

• **Confirmação e acesso:** saber se tratamos seus dados e acessar uma cópia.
• **Correção:** solicitar a correção de dados incompletos, inexatos ou desatualizados.
• **Anonimização ou eliminação:** solicitar a anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos.
• **Portabilidade:** solicitar a portabilidade de seus dados a outro fornecedor de serviço.
• **Revogação do consentimento:** retirar seu consentimento a qualquer momento, sem prejuízo ao tratamento realizado anteriormente.
• **Informação:** ser informado sobre entidades públicas e privadas com as quais compartilhamos dados.
• **Oposição:** opor-se ao tratamento quando realizado em descumprimento à LGPD.

Para exercer qualquer destes direitos, entre em contato pelo e-mail leonfpontes@gmail.com.`,
  },
  {
    title: '7. Cookies e Tecnologias de Rastreamento',
    body: `O Girahub utiliza apenas cookies essenciais para o funcionamento da plataforma:

• **Cookies de sessão:** para manter sua autenticação ativa durante o uso do painel.
• **Cookies de preferência:** para lembrar configurações de interface como tema e idioma.

Não utilizamos cookies de publicidade, rastreamento de terceiros ou ferramentas de marketing comportamental.`,
  },
  {
    title: '8. Retenção de Dados',
    body: `• **Dados de conta:** mantidos enquanto sua conta estiver ativa. Após solicitação de exclusão, dados são removidos em até 30 dias.
• **Dados de auditoria:** mantidos por 12 meses para fins de segurança e conformidade, sendo eliminados automaticamente após este período.
• **Dados de consulentes:** mantidos enquanto o terreiro associado mantiver conta ativa. Podem ser eliminados a pedido do consulente ou do administrador do terreiro.`,
  },
  {
    title: '9. Menores de Idade',
    body: `A plataforma Girahub não é direcionada a menores de 18 anos. Não coletamos intencionalmente dados de menores. Caso identifiquemos dados de menores em nossos sistemas, eles serão eliminados prontamente.`,
  },
  {
    title: '10. Alterações nesta Política',
    body: `Podemos atualizar esta Política de Privacidade periodicamente. Alterações significativas serão notificadas por e-mail ou aviso na plataforma. Recomendamos revisar esta página regularmente.

A data da última atualização será sempre indicada no topo desta página.`,
  },
  {
    title: '11. Contato',
    body: `Para questões relacionadas a esta política ou ao tratamento de seus dados pessoais:

• **E-mail:** leonfpontes@gmail.com
• **WhatsApp:** (16) 99109-1234

Responderemos sua solicitação em até 15 dias úteis, conforme previsto pela LGPD.`,
  },
];

// ═════════════════════════════════════════════════════════════════
export default function PrivacidadePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── Header ──────────────────────────────────────────────────
  const header = (
    <AppBar position="fixed" elevation={0} sx={{ background: T.headerBg, backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: 72 }}>
          <Link href="/" passHref legacyBehavior>
            <Box component="a" sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto', textDecoration: 'none' }}>
              <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 32 }} />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.02em' }}>Girahub</Typography>
            </Box>
          </Link>
          {isMobile ? (
            <>
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }}><MenuIcon /></IconButton>
              <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 260, pt: 2 }}>
                  <Box sx={{ px: 2, pb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ConfirmationNumberIcon sx={{ color: T.accent }} />
                    <Typography fontWeight={700}>Girahub</Typography>
                  </Box>
                  <Divider />
                  <List>
                    {NAV.map((n) => (
                      <ListItem key={n.href} component="a" href={n.href} sx={{ cursor: 'pointer' }}>
                        <ListItemText primary={n.label} />
                      </ListItem>
                    ))}
                    <Divider sx={{ my: 1 }} />
                    <ListItem>
                      <Link href="/login" passHref legacyBehavior>
                        <Button variant="contained" fullWidth sx={{ bgcolor: T.accent, color: '#000', fontWeight: 600, '&:hover': { bgcolor: T.accentHover } }}>Entrar</Button>
                      </Link>
                    </ListItem>
                  </List>
                </Box>
              </Drawer>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {NAV.map((n) => (
                <Typography key={n.href} component="a" href={n.href} sx={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.95rem', fontWeight: 500, '&:hover': { color: '#fff' } }}>
                  {n.label}
                </Typography>
              ))}
              <Link href="/login" passHref legacyBehavior>
                <Button variant="contained" sx={{ bgcolor: T.accent, color: '#000', fontWeight: 600, px: 3, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: T.accentHover } }}>Entrar</Button>
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
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ConfirmationNumberIcon sx={{ color: T.accent }} />
              <Typography variant="h6" fontWeight={700}>Girahub</Typography>
            </Box>
            <Typography sx={{ color: T.muted, fontSize: '0.9rem', lineHeight: 1.7 }}>
              Plataforma moderna para gestão de senhas e giras em terreiros de Umbanda.
            </Typography>
          </Grid>
          <Grid item xs={6} md={2}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>Plataforma</Typography>
            {NAV.map((n) => (
              <Typography key={n.href} component="a" href={n.href} sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}>
                {n.label}
              </Typography>
            ))}
          </Grid>
          <Grid item xs={6} md={2}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>Legal</Typography>
            <Link href="/privacidade" passHref legacyBehavior>
              <Typography component="a" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}>Política de Privacidade</Typography>
            </Link>
            <Link href="/termos" passHref legacyBehavior>
              <Typography component="a" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', mb: 1, fontSize: '0.9rem', '&:hover': { color: '#fff' } }}>Termos de Uso</Typography>
            </Link>
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography fontWeight={600} sx={{ mb: 2, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: T.muted }}>Contato</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', mb: 1 }}>leonfpontes@gmail.com</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>(16) 99109-1234</Typography>
          </Grid>
        </Grid>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 4 }} />
        <Typography sx={{ color: T.muted, fontSize: '0.8rem', textAlign: 'center' }}>
          © {new Date().getFullYear()} Girahub. Todos os direitos reservados.
        </Typography>
      </Container>
    </Box>
  );

  return (
    <>
      <Head>
        <title>Política de Privacidade — Girahub</title>
        <meta name="description" content="Política de Privacidade da plataforma Girahub. Saiba como tratamos seus dados pessoais em conformidade com a LGPD." />
      </Head>

      {header}

      {/* Hero banner */}
      <Box sx={{ background: T.heroGradient, pt: 16, pb: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ color: '#fff', fontWeight: 800, mb: 2, fontSize: { xs: '2rem', md: '2.8rem' } }}>
            Política de Privacidade
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>
            Última atualização: Março de 2026
          </Typography>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: '#fff' }}>
        <Container maxWidth="md">
          <Typography sx={{ color: T.body, lineHeight: 1.8, mb: 5, fontSize: '1.05rem' }}>
            A Girahub (&quot;nós&quot;, &quot;nosso&quot;) tem o compromisso de proteger a privacidade e os dados pessoais
            de nossos usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e
            protegemos suas informações ao utilizar nossa plataforma, em conformidade com a Lei Geral de Proteção
            de Dados (LGPD — Lei nº 13.709/2018).
          </Typography>

          {SECTIONS.map((s) => (
            <Box key={s.title} sx={{ mb: 5 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: T.dark, mb: 2, fontSize: '1.3rem' }}>
                {s.title}
              </Typography>
              <Typography
                sx={{ color: T.body, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: '0.98rem' }}
              >
                {s.body}
              </Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {footer}
    </>
  );
}
