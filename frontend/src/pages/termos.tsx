/**
 * Girahub — Termos de Uso
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

// ─── Tokens ──────────────────────────────────────────────────────
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

// ─── Terms sections ──────────────────────────────────────────────
const SECTIONS = [
  {
    title: '1. Descrição do Serviço',
    body: `O Girahub é uma plataforma SaaS (Software as a Service) multi-tenant para gestão de senhas e giras em terreiros de Umbanda e organizações religiosas afins. O serviço inclui:

• Emissão e gestão de senhas online para consulentes.
• Criação e administração de giras com controle de vagas e portas de atendimento.
• Painel administrativo com analytics, relatórios e trilha de auditoria.
• Envio de notificações por e-mail (confirmações de senha, alertas administrativos).
• Isolamento completo de dados entre diferentes terreiros (multi-tenant).`,
  },
  {
    title: '2. Cadastro e Conta',
    body: `Para utilizar o Girahub como administrador, é necessário:

• Criar uma conta fornecendo informações verdadeiras e atualizadas.
• Manter a confidencialidade de suas credenciais de acesso (e-mail e senha).
• Ser responsável por todas as atividades realizadas em sua conta.
• Notificar imediatamente o Girahub em caso de uso não autorizado da conta.

O Girahub reserva-se o direito de recusar ou cancelar cadastros que contenham informações falsas ou que violem estes Termos.`,
  },
  {
    title: '3. Responsabilidades do Usuário',
    body: `Ao utilizar a plataforma, o usuário se compromete a:

• Utilizar o serviço apenas para fins legítimos e de acordo com a legislação brasileira vigente.
• Não tentar acessar dados de outros terreiros ou contornar os mecanismos de segurança da plataforma.
• Não utilizar a plataforma para distribuir conteúdo ilegal, difamatório, discriminatório ou que viole direitos de terceiros.
• Manter os dados de consulentes sob sua gestão em conformidade com a LGPD.
• Não realizar engenharia reversa, descompilar ou interferir no funcionamento da plataforma.`,
  },
  {
    title: '4. Propriedade Intelectual',
    body: `Todo o conteúdo da plataforma Girahub — incluindo, mas não limitado a, código-fonte, design, marca, logotipos, textos, ícones e documentação — é de propriedade exclusiva do Girahub e protegido pela legislação brasileira de propriedade intelectual.

O usuário não adquire qualquer direito de propriedade sobre a plataforma ao utilizá-la. É proibida a reprodução, distribuição ou modificação de qualquer parte da plataforma sem autorização expressa por escrito.`,
  },
  {
    title: '5. Disponibilidade do Serviço',
    body: `O Girahub emprega seus melhores esforços para manter a plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, o serviço pode sofrer interrupções temporárias para:

• Manutenção programada (com aviso prévio quando possível).
• Atualizações de segurança e correções de vulnerabilidades.
• Eventos de força maior ou circunstâncias fora de nosso controle.

O Girahub não garante disponibilidade ininterrupta e não será responsável por danos decorrentes de indisponibilidade temporária.`,
  },
  {
    title: '6. Limitação de Responsabilidade',
    body: `Dentro dos limites permitidos pela lei brasileira:

• O Girahub não será responsável por danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso ou impossibilidade de uso da plataforma.
• A responsabilidade total do Girahub, em qualquer circunstância, estará limitada ao valor pago pelo usuário nos 12 meses anteriores ao evento que deu origem à reclamação.
• O Girahub não se responsabiliza por decisões tomadas com base em relatórios ou dados gerados pela plataforma.`,
  },
  {
    title: '7. Suspensão e Encerramento',
    body: `O Girahub poderá suspender ou encerrar o acesso do usuário à plataforma nas seguintes situações:

• Violação destes Termos de Uso ou da Política de Privacidade.
• Uso da plataforma para atividades ilegais ou fraudulentas.
• Tentativa de comprometer a segurança ou integridade do serviço.
• Inatividade prolongada da conta (após notificação prévia).

Em caso de encerramento, o usuário terá 30 dias para solicitar a exportação de seus dados, após os quais os dados serão eliminados conforme nossa Política de Privacidade.`,
  },
  {
    title: '8. Modificações nos Termos',
    body: `O Girahub reserva-se o direito de modificar estes Termos de Uso a qualquer momento. Alterações significativas serão notificadas por:

• E-mail para o endereço cadastrado na conta do administrador.
• Aviso em destaque no painel administrativo.

O uso continuado da plataforma após a notificação de alterações constitui aceitação dos novos termos. Caso o usuário não concorde com as alterações, deverá cessar o uso da plataforma e solicitar o encerramento de sua conta.`,
  },
  {
    title: '9. Proteção de Dados e LGPD',
    body: `O tratamento de dados pessoais no Girahub segue rigorosamente a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Para informações detalhadas sobre coleta, armazenamento, uso e proteção de dados pessoais, consulte nossa Política de Privacidade em /privacidade.

O Girahub atua como operador de dados em relação aos dados de consulentes inseridos pelos administradores dos terreiros. Os administradores, na qualidade de controladores, são responsáveis por garantir base legal adequada para o tratamento dos dados de seus consulentes.`,
  },
  {
    title: '10. Isenção de Garantias Específicas',
    body: `A plataforma Girahub é fornecida "no estado em que se encontra" (as is). Não oferecemos garantias específicas quanto a:

• Adequação da plataforma a fins específicos não previstos em sua descrição.
• Resultados específicos decorrentes do uso da plataforma.
• Ausência total de erros, bugs ou vulnerabilidades de segurança.

Trabalhamos continuamente para melhorar o serviço, mas não podemos garantir perfeição absoluta em um sistema de software.`,
  },
  {
    title: '11. Lei Aplicável e Foro',
    body: `Estes Termos de Uso são regidos pela legislação da República Federativa do Brasil.

Fica eleito o foro da Comarca de Ribeirão Preto, Estado de São Paulo, como competente para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`,
  },
  {
    title: '12. Disposições Gerais',
    body: `• Se qualquer disposição destes Termos for considerada inválida ou inexequível, as demais disposições permanecerão em pleno vigor e efeito.
• A tolerância do Girahub quanto ao descumprimento de qualquer obrigação não constituirá renúncia ao direito de exigir o cumprimento da obrigação a qualquer tempo.
• Estes Termos constituem o acordo integral entre o usuário e o Girahub em relação ao uso da plataforma, substituindo todos os acordos anteriores sobre o mesmo assunto.`,
  },
  {
    title: '13. Contato',
    body: `Para questões relacionadas a estes Termos de Uso:

• **E-mail:** leonfpontes@gmail.com
• **WhatsApp:** (16) 99109-1234

Estamos à disposição para esclarecer dúvidas e receber sugestões para melhoria de nossos termos e serviços.`,
  },
];

// ═════════════════════════════════════════════════════════════════
export default function TermosPage() {
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
        <title>Termos de Uso — Girahub</title>
        <meta name="description" content="Termos de Uso da plataforma Girahub. Leia atentamente as condições para utilização do serviço." />
      </Head>

      {header}

      {/* Hero banner */}
      <Box sx={{ background: T.heroGradient, pt: 16, pb: 8 }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ color: '#fff', fontWeight: 800, mb: 2, fontSize: { xs: '2rem', md: '2.8rem' } }}>
            Termos de Uso
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
            Bem-vindo ao Girahub. Ao acessar ou utilizar nossa plataforma, você concorda com estes
            Termos de Uso. Leia-os atentamente. Se você não concordar com qualquer parte destes termos,
            não utilize o serviço.
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
