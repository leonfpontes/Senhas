/**
 * GiraHub Landing Page — Interactive v2
 * Mouse-following orb, app screenshot carousel, scroll animations, parallax.
 */
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import {
  AppBar, Toolbar, Box, Button, Container, Typography,
  Grid, Card, IconButton, Drawer, List, ListItem,
  ListItemText, useMediaQuery, useTheme, Chip,
} from '@mui/material';
import {
  motion, useMotionValue, useSpring, AnimatePresence,
} from 'framer-motion';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import EventIcon from '@mui/icons-material/Event';
import DashboardIcon from '@mui/icons-material/Dashboard';
import GroupsIcon from '@mui/icons-material/Groups';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StarIcon from '@mui/icons-material/Star';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SchoolIcon from '@mui/icons-material/School';
import LanguageIcon from '@mui/icons-material/Language';
import BarChartIcon from '@mui/icons-material/BarChart';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

// ─── Design tokens ──────────────────────────────────────────────────────────
const T = {
  primary: '#4f46e5',
  primaryLight: '#818cf8',
  accent: '#f59e0b',
  dark: '#0f0d2e',
  deep: '#1e1b4b',
  mid: '#312e81',
  muted: '#94a3b8',
  body: '#475569',
  cardShadow: '0 4px 24px rgba(0,0,0,0.08)',
  cardHover: '0 20px 60px rgba(79,70,229,0.2)',
};

const NAV = [
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Financeiro', href: '#financeiro' },
  { label: 'Planos', href: '#planos' },
  { label: 'Contato', href: '#contato' },
];

const FEATURES = [
  {
    icon: <ConfirmationNumberIcon />, color: '#4f46e5',
    title: 'Giras e Senhas Online',
    desc: 'Consulentes retiram senha pelo celular sem baixar app. Controle de vagas, janela de emissão e calendário de giras.',
  },
  {
    icon: <DashboardIcon />, color: '#7c3aed',
    title: 'Porta Ao Vivo (TV)',
    desc: 'Tela dedicada de chamada para exibir na TV da recepção. Número, nome do consulente e contadores em tempo real.',
  },
  {
    icon: <AccountBalanceWalletIcon />, color: '#059669',
    title: 'Financeiro Completo',
    desc: 'Contas a pagar e receber, fluxo de caixa com saldo acumulado, categorias e exportação de relatórios em PDF.',
  },
  {
    icon: <GroupsIcon />, color: '#0891b2',
    title: 'Corrente Espiritual',
    desc: 'Cadastro de médiuns e cambones com foto, endereço via CEP, participação em giras e controle de mensalidades.',
  },
  {
    icon: <PeopleIcon />, color: '#d97706',
    title: 'Associados',
    desc: 'Gerencie membros e associados da casa com histórico, dados completos e controle de anuidades.',
  },
  {
    icon: <Inventory2Icon />, color: '#dc2626',
    title: 'Estoque do Terreiro',
    desc: 'Itens organizados por grupos, controle de movimentações, alertas de quantidade mínima e relatório completo.',
  },
  {
    icon: <SchoolIcon />, color: '#7c3aed',
    title: 'Cursos e Eventos',
    desc: 'Cadastre cursos presenciais com link público de inscrição e gestão de participantes por turma.',
  },
  {
    icon: <LanguageIcon />, color: '#4f46e5',
    title: 'Site do Terreiro',
    desc: 'Página pública personalizada com endereço, próximas giras, galeria e formulário de contato — pronta em minutos.',
  },
  {
    icon: <BarChartIcon />, color: '#059669',
    title: 'Analytics e Relatórios',
    desc: 'Dashboard com KPIs, relatório de gira, distribuição de atendimentos, horários de pico e exportação CSV.',
  },
];

const STEPS = [
  { num: '01', title: 'Cadastre seu Terreiro', desc: 'Crie sua conta e configure o perfil, logo e informações públicas do terreiro.' },
  { num: '02', title: 'Ative os Módulos', desc: 'Corrente, financeiro, estoque, site — ative só o que você precisa agora e expanda depois.' },
  { num: '03', title: 'Compartilhe o Link', desc: 'Consulentes retiram senhas pelo celular. Médiuns e gestores acessam o painel.' },
  { num: '04', title: 'Tudo Integrado', desc: 'Gira acontece, relatórios gerados, caixa atualizado. O terreiro gerencia, você descansa.' },
];

const STATS = [
  { value: '9+', label: 'Módulos integrados' },
  { value: '100%', label: 'Sem papel' },
  { value: 'LGPD', label: 'Conformidade total' },
];

const PLANS = [
  {
    name: 'Free', price: 0, highlight: false,
    features: ['Senhas e giras online', '1 usuário', '4 giras por mês', 'Porta ao vivo (TV)', 'Link público', 'Dashboard básico'],
  },
  {
    name: 'Basic', price: 49, highlight: false,
    features: ['Tudo do Free +', '3 usuários', '10 giras por mês', 'Até 50 médiuns/cambones', 'E-mail automático', 'Relatório de Gira (PDF)', 'Operações em lote'],
  },
  {
    name: 'Pro', price: 79, highlight: true,
    features: ['Tudo do Basic +', '10 usuários', '15 giras por mês', 'Até 150 médiuns', 'Financeiro completo', 'Controle de estoque', 'Associados', 'Site do terreiro', 'Cursos e eventos', 'Analytics avançado', 'Export CSV'],
  },
  {
    name: 'Premium', price: 99, highlight: false,
    features: ['Tudo do Pro +', 'Usuários ilimitados', 'Giras ilimitadas', 'Médiuns ilimitados', 'Suporte prioritário'],
  },
];

// ─── App screenshot mockups ──────────────────────────────────────────────────
const MockDashboard = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#f1f5f9', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <ConfirmationNumberIcon sx={{ color: '#4f46e5', fontSize: 20 }} />
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#1e1b4b' }}>GiraHub · Dashboard</Typography>
      <Box sx={{ ml: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
    </Box>
    <Grid container spacing={1} sx={{ mb: 2 }}>
      {[
        { label: 'Tickets', val: '248', color: '#4f46e5' },
        { label: 'Giras', val: '12', color: '#7c3aed' },
        { label: 'Médiuns', val: '89', color: '#0891b2' },
        { label: 'Receita', val: 'R$4.2k', color: '#059669' },
      ].map((k) => (
        <Grid item xs={6} key={k.label}>
          <Box sx={{ background: '#fff', borderRadius: 1.5, p: 1, border: `2px solid ${k.color}18` }}>
            <Typography sx={{ fontSize: 9, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</Typography>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.val}</Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
    <Box sx={{ background: '#fff', borderRadius: 1.5, p: 1.5, mb: 1 }}>
      <Typography sx={{ fontSize: 9, color: '#94a3b8', mb: 1 }}>TICKETS POR DIA</Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 40 }}>
        {[30, 55, 40, 70, 60, 85, 72, 90, 65, 80, 95, 88].map((h, i) => (
          <Box key={i} sx={{ flex: 1, background: `rgba(79,70,229,${0.3 + h / 300})`, borderRadius: '2px 2px 0 0', height: `${h}%`, transition: 'height 0.3s' }} />
        ))}
      </Box>
    </Box>
    {[
      { name: 'Gira de Cura', date: 'Sáb, 28 Jun', status: 'Ativa', color: '#22c55e' },
      { name: 'Gira de Umbanda', date: 'Dom, 29 Jun', status: 'Lotada', color: '#f59e0b' },
      { name: 'Gira de Preto Velho', date: 'Sex, 04 Jul', status: 'Planej.', color: '#818cf8' },
    ].map((g) => (
      <Box key={g.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 9, color: '#475569', flex: 1 }}>{g.name}</Typography>
        <Typography sx={{ fontSize: 8, color: '#94a3b8' }}>{g.date}</Typography>
        <Box sx={{ px: 0.8, py: 0.2, borderRadius: 1, background: `${g.color}20` }}>
          <Typography sx={{ fontSize: 8, color: g.color, fontWeight: 700 }}>{g.status}</Typography>
        </Box>
      </Box>
    ))}
  </Box>
);

const MockPorta = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 2000); return () => clearInterval(t); }, []);
  const nums = [47, 48, 49];
  const cur = nums[tick % 3];
  return (
    <Box sx={{ width: '100%', height: '100%', background: '#0f0d2e', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <ConfirmationNumberIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Porta · Gira de Cura</Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
          <Typography sx={{ fontSize: 8, color: '#22c55e' }}>AO VIVO</Typography>
        </Box>
      </Box>
      <Box sx={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: 10, color: '#818cf8', letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>Chamando agora</Typography>
        <motion.div
          key={cur}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.4 }}
        >
          <Typography sx={{ fontSize: 64, fontWeight: 900, color: '#f59e0b', lineHeight: 1, letterSpacing: -2 }}>
            #{cur}
          </Typography>
        </motion.div>
        <Typography sx={{ fontSize: 9, color: '#94a3b8', mt: 1 }}>Maria Silva Ferreira</Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2 }}>
          <Box sx={{ px: 2, py: 0.8, borderRadius: 1.5, background: '#4f46e5', cursor: 'pointer' }}>
            <Typography sx={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>Confirmar</Typography>
          </Box>
          <Box sx={{ px: 2, py: 0.8, borderRadius: 1.5, border: '1px solid #4f46e5', cursor: 'pointer' }}>
            <Typography sx={{ fontSize: 10, color: '#818cf8', fontWeight: 700 }}>Próxima</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 1 }}>
        {[{ l: 'Na fila', v: '12' }, { l: 'Atendidos', v: '46' }, { l: 'Restantes', v: '32' }].map(s => (
          <Box key={s.l} sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{s.v}</Typography>
            <Typography sx={{ fontSize: 8, color: '#94a3b8' }}>{s.l}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const MockGiras = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#f8fafc', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1e1b4b' }}>Giras · Junho 2026</Typography>
      <Box sx={{ ml: 'auto', px: 1.5, py: 0.5, borderRadius: 1.5, background: '#4f46e5' }}>
        <Typography sx={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>+ Nova Gira</Typography>
      </Box>
    </Box>
    {[
      { nome: 'Gira de Cura', data: '28 Jun', vagas: '90/120', status: 'Ativa', cor: '#22c55e' },
      { nome: 'Gira de Umbanda', data: '29 Jun', vagas: '120/120', status: 'Lotada', cor: '#f59e0b' },
      { nome: 'Gira de Exu', data: '05 Jul', vagas: '0/80', status: 'Planej.', cor: '#818cf8' },
      { nome: 'Gira de Preto Velho', data: '12 Jul', vagas: '45/100', status: 'Aberta', cor: '#0891b2' },
      { nome: 'Gira de Caboclo', data: '19 Jul', vagas: '10/80', status: 'Aberta', cor: '#0891b2' },
    ].map((g, i) => (
      <Box key={i} sx={{ background: '#fff', borderRadius: 1.5, p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #e2e8f0', '&:hover': { borderColor: '#4f46e5' } }}>
        <Box sx={{ width: 32, height: 32, borderRadius: 1, background: `${g.cor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <EventIcon sx={{ fontSize: 16, color: g.cor }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</Typography>
          <Typography sx={{ fontSize: 8, color: '#94a3b8' }}>{g.data} · {g.vagas} vagas</Typography>
        </Box>
        <Box sx={{ px: 1, py: 0.3, borderRadius: 1, background: `${g.cor}18` }}>
          <Typography sx={{ fontSize: 8, fontWeight: 700, color: g.cor }}>{g.status}</Typography>
        </Box>
      </Box>
    ))}
  </Box>
);

const MockRelatorio = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#0f172a', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Analytics · Últimos 30 dias</Typography>
      <Box sx={{ ml: 'auto', px: 1.5, py: 0.3, borderRadius: 1, background: '#4f46e518', border: '1px solid #4f46e540' }}>
        <Typography sx={{ fontSize: 8, color: '#818cf8' }}>Export CSV</Typography>
      </Box>
    </Box>
    <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
      {[{ l: 'Total Tickets', v: '1.247', delta: '+18%', pos: true }, { l: 'Ocupação Média', v: '87%', delta: '+5%', pos: true }, { l: 'Novos Assoc.', v: '34', delta: '-2%', pos: false }].map(k => (
        <Box key={k.l} sx={{ flex: 1, background: '#1e293b', borderRadius: 1.5, p: 1 }}>
          <Typography sx={{ fontSize: 8, color: '#64748b', mb: 0.3 }}>{k.l}</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{k.v}</Typography>
          <Typography sx={{ fontSize: 8, color: k.pos ? '#22c55e' : '#f87171', fontWeight: 600 }}>{k.delta}</Typography>
        </Box>
      ))}
    </Box>
    <Box sx={{ background: '#1e293b', borderRadius: 1.5, p: 1.5, mb: 1 }}>
      <Typography sx={{ fontSize: 8, color: '#64748b', mb: 1 }}>TICKETS POR TIPO DE GIRA</Typography>
      {[
        { tipo: 'Gira de Cura', pct: 38, color: '#4f46e5' },
        { tipo: 'Gira de Umbanda', pct: 27, color: '#7c3aed' },
        { tipo: 'Gira de Exu', pct: 20, color: '#f59e0b' },
        { tipo: 'Outros', pct: 15, color: '#0891b2' },
      ].map(r => (
        <Box key={r.tipo} sx={{ mb: 0.8 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
            <Typography sx={{ fontSize: 8, color: '#94a3b8' }}>{r.tipo}</Typography>
            <Typography sx={{ fontSize: 8, color: r.color, fontWeight: 700 }}>{r.pct}%</Typography>
          </Box>
          <Box sx={{ height: 4, borderRadius: 2, background: '#334155', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${r.pct}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
              style={{ height: '100%', borderRadius: 2, background: r.color }}
            />
          </Box>
        </Box>
      ))}
    </Box>
    <Box sx={{ background: '#1e293b', borderRadius: 1.5, p: 1 }}>
      <Typography sx={{ fontSize: 8, color: '#64748b', mb: 0.5 }}>TOP MÉDIUNS ATIVOS</Typography>
      {['Pai João', 'Mãe Benedita', 'Irmão Zé'].map((n, i) => (
        <Box key={n} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.3 }}>
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', background: ['#4f46e5', '#7c3aed', '#0891b2'][i], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: 7, color: '#fff', fontWeight: 800 }}>{n[0]}</Typography>
          </Box>
          <Typography sx={{ fontSize: 9, color: '#94a3b8', flex: 1 }}>{n}</Typography>
          <Typography sx={{ fontSize: 9, color: '#f1f5f9', fontWeight: 700 }}>{[42, 38, 31][i]} giras</Typography>
        </Box>
      ))}
    </Box>
  </Box>
);

const MockMediuns = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#f8fafc', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1e1b4b' }}>Médiuns e Cambones</Typography>
      <Box sx={{ ml: 'auto', px: 1.5, py: 0.5, borderRadius: 1.5, background: '#4f46e5' }}>
        <Typography sx={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>+ Cadastrar</Typography>
      </Box>
    </Box>
    {[
      { nome: 'Pai João de Angola', funcao: 'Médium', giras: 42, status: 'Ativo', cor: '#22c55e' },
      { nome: 'Mãe Benedita', funcao: 'Cambona', giras: 38, status: 'Ativo', cor: '#22c55e' },
      { nome: 'Irmão Zé do Caroço', funcao: 'Médium', giras: 31, status: 'Ativo', cor: '#22c55e' },
      { nome: 'Ana Clara Mendes', funcao: 'Cambona', giras: 18, status: 'Licença', cor: '#f59e0b' },
      { nome: 'Ricardo Souza', funcao: 'Médium', giras: 7, status: 'Novo', cor: '#818cf8' },
    ].map((m, i) => (
      <Box key={i} sx={{ background: '#fff', borderRadius: 1.5, p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1.5, border: '1px solid #e2e8f0' }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', background: `${m.cor}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: m.cor }}>{m.nome[0]}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</Typography>
          <Typography sx={{ fontSize: 8, color: '#94a3b8' }}>{m.funcao} · {m.giras} giras</Typography>
        </Box>
        <Box sx={{ px: 1, py: 0.3, borderRadius: 1, background: `${m.cor}18` }}>
          <Typography sx={{ fontSize: 8, fontWeight: 700, color: m.cor }}>{m.status}</Typography>
        </Box>
      </Box>
    ))}
    <Box sx={{ background: '#4f46e508', border: '1px solid #4f46e520', borderRadius: 1.5, p: 1, mt: 1 }}>
      <Typography sx={{ fontSize: 9, color: '#4f46e5', fontWeight: 600 }}>89 médiuns · 67 ativos · mensalidades em dia: 94%</Typography>
    </Box>
  </Box>
);

// ─── New mockups ─────────────────────────────────────────────────────────────
const MockEstoque = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#fff', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Inventory2Icon sx={{ color: '#dc2626', fontSize: 18 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1e1b4b' }}>Estoque · Itens</Typography>
      <Box sx={{ ml: 'auto', px: 1, py: 0.3, borderRadius: 1, background: '#fef2f2' }}>
        <Typography sx={{ fontSize: 8, color: '#dc2626', fontWeight: 700 }}>2 alertas</Typography>
      </Box>
    </Box>
    {[
      { nome: 'Vela 7 dias branca', grupo: 'Velas', qtd: 3, min: 10, alert: true },
      { nome: 'Incenso Mirra', grupo: 'Incensos', qtd: 42, min: 20, alert: false },
      { nome: 'Pemba branca', grupo: 'Pemba', qtd: 2, min: 5, alert: true },
      { nome: 'Defumador Arruda', grupo: 'Defumação', qtd: 18, min: 10, alert: false },
      { nome: 'Fita vermelha 5m', grupo: 'Materiais', qtd: 30, min: 15, alert: false },
    ].map((item) => (
      <Box key={item.nome} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.7, borderBottom: '1px solid #f1f5f9' }}>
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: item.alert ? '#dc2626' : '#22c55e', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 9, fontWeight: 600, color: '#1e1b4b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nome}</Typography>
          <Typography sx={{ fontSize: 7, color: '#94a3b8' }}>{item.grupo}</Typography>
        </Box>
        <Typography sx={{ fontSize: 10, fontWeight: 800, color: item.alert ? '#dc2626' : '#475569' }}>{item.qtd}</Typography>
      </Box>
    ))}
  </Box>
);

const MockSite = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#0f0d2e', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ background: '#1e1b4b', px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ display: 'flex', gap: 0.4 }}>
        {['#ef4444','#f59e0b','#22c55e'].map(c => <Box key={c} sx={{ width: 6, height: 6, borderRadius: '50%', background: c }} />)}
      </Box>
      <Box sx={{ flex: 1, background: '#312e81', borderRadius: 1, px: 1, py: 0.3 }}>
        <Typography sx={{ fontSize: 7, color: '#818cf8' }}>girahub.com.br/ilê-axe-oxum</Typography>
      </Box>
    </Box>
    <Box sx={{ flex: 1, p: 1.5, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontSize: 10, color: '#fff', fontWeight: 900 }}>I</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>Ilê Axé Oxum</Typography>
          <Typography sx={{ fontSize: 7, color: '#818cf8' }}>Terreiro de Umbanda · SP</Typography>
        </Box>
      </Box>
      <Box sx={{ background: 'rgba(79,70,229,0.2)', borderRadius: 1, p: 1, mb: 1 }}>
        <Typography sx={{ fontSize: 8, color: '#e2e8f0', lineHeight: 1.4 }}>Bem-vindo ao nosso terreiro. A paz de Oxum!</Typography>
      </Box>
      <Typography sx={{ fontSize: 8, color: '#f59e0b', fontWeight: 700, mb: 0.5 }}>Próximas Giras</Typography>
      {[{ g: 'Gira de Cura', d: 'Sáb 05 Jul' }, { g: 'Gira de Umbanda', d: 'Sáb 12 Jul' }].map(g => (
        <Box key={g.g} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: 8, color: '#e2e8f0' }}>{g.g}</Typography>
          <Typography sx={{ fontSize: 8, color: '#818cf8' }}>{g.d}</Typography>
        </Box>
      ))}
      <Box sx={{ mt: 1, px: 1.5, py: 0.7, borderRadius: 1, background: '#4f46e5', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>Retirar Senha</Typography>
      </Box>
    </Box>
  </Box>
);

const MockFinanceiroDash = () => (
  <Box sx={{ width: '100%', height: '100%', background: '#fff', borderRadius: 1, overflow: 'hidden', p: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <AccountBalanceWalletIcon sx={{ color: '#059669', fontSize: 18 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#1e1b4b' }}>Fluxo de Caixa · Jun 2026</Typography>
    </Box>
    <Grid container spacing={1} sx={{ mb: 1.5 }}>
      {[
        { label: 'Receitas', val: 'R$ 3.480', color: '#059669' },
        { label: 'Despesas', val: 'R$ 1.210', color: '#dc2626' },
        { label: 'Saldo', val: 'R$ 2.270', color: '#4f46e5' },
        { label: 'Pendentes', val: 'R$ 420', color: '#d97706' },
      ].map(k => (
        <Grid item xs={6} key={k.label}>
          <Box sx={{ background: '#f8fafc', borderRadius: 1.5, p: 1, borderLeft: `3px solid ${k.color}` }}>
            <Typography sx={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>{k.label}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: k.color }}>{k.val}</Typography>
          </Box>
        </Grid>
      ))}
    </Grid>
    <Box sx={{ background: '#f8fafc', borderRadius: 1.5, p: 1 }}>
      <Typography sx={{ fontSize: 8, color: '#94a3b8', mb: 0.8 }}>ÚLTIMOS LANÇAMENTOS</Typography>
      {[
        { desc: 'Mensalidade — João Carlos', tipo: 'entrada', val: '+R$ 80' },
        { desc: 'Velas e incensos', tipo: 'saida', val: '-R$ 95' },
        { desc: 'Mensalidade — Ana Paula', tipo: 'entrada', val: '+R$ 80' },
      ].map(l => (
        <Box key={l.desc} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {l.tipo === 'entrada' ? <TrendingUpIcon sx={{ fontSize: 10, color: '#059669' }} /> : <TrendingDownIcon sx={{ fontSize: 10, color: '#dc2626' }} />}
            <Typography sx={{ fontSize: 8, color: '#475569' }}>{l.desc}</Typography>
          </Box>
          <Typography sx={{ fontSize: 9, fontWeight: 700, color: l.tipo === 'entrada' ? '#059669' : '#dc2626' }}>{l.val}</Typography>
        </Box>
      ))}
    </Box>
  </Box>
);

// ─── Screenshots carousel data ───────────────────────────────────────────────
const SCREENS = [
  { label: 'Dashboard', sublabel: 'Visão geral em tempo real', component: <MockDashboard /> },
  { label: 'Porta', sublabel: 'Chamada de senhas ao vivo', component: <MockPorta /> },
  { label: 'Giras', sublabel: 'Calendário e gestão completa', component: <MockGiras /> },
  { label: 'Analytics', sublabel: 'Relatórios e métricas avançadas', component: <MockRelatorio /> },
];

// ─── Scroll-reveal wrapper ───────────────────────────────────────────────────
const Reveal = ({
  children,
  delay = 0,
  direction = 'up',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const initial = { opacity: 0, y: direction === 'up' ? 32 : direction === 'down' ? -32 : 0, x: direction === 'left' ? 32 : direction === 'right' ? -32 : 0 };
  return (
    <motion.div ref={ref} initial={initial} animate={visible ? { opacity: 1, y: 0, x: 0 } : initial} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
};

// ─── Mobile carousel (swipeable, snap, dot indicators) ──────────────────────
function MobileCarousel<T>({ items, renderItem }: {
  items: T[];
  renderItem: (item: T, i: number) => React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !el.children.length) return;
    const cardW = (el.children[0] as HTMLElement).offsetWidth + 16; // 16 = gap
    setActive(Math.min(Math.round(el.scrollLeft / cardW), items.length - 1));
  }, [items.length]);

  const scrollTo = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement;
    child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    setActive(i);
  };

  return (
    <Box>
      <Box
        ref={scrollRef}
        onScroll={onScroll}
        sx={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          gap: 2,
          pb: 1,
          px: 2,
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {items.map((item, i) => (
          <Box key={i} sx={{ flexShrink: 0, width: 'calc(85vw)', scrollSnapAlign: 'center' }}>
            {renderItem(item, i)}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 2.5 }}>
        {items.map((_, i) => (
          <Box
            key={i}
            onClick={() => scrollTo(i)}
            sx={{
              width: i === active ? 20 : 8, height: 8,
              borderRadius: 4,
              background: i === active ? T.primary : '#e2e8f0',
              transition: 'width 0.3s, background 0.3s',
              cursor: 'pointer',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

// ─── Cursor glow (follows mouse) — multi-layer magnetic effect ───────────────
const CursorGlow = () => {
  const mouseX = useMotionValue(-800);
  const mouseY = useMotionValue(-800);

  // Three layers: fast dot, medium halo, slow nebula
  const dotX   = useSpring(mouseX, { stiffness: 900, damping: 28 });
  const dotY   = useSpring(mouseY, { stiffness: 900, damping: 28 });
  const haloX  = useSpring(mouseX, { stiffness: 140, damping: 20 });
  const haloY  = useSpring(mouseY, { stiffness: 140, damping: 20 });
  const nebulaX = useSpring(mouseX, { stiffness: 40,  damping: 16 });
  const nebulaY = useSpring(mouseY, { stiffness: 40,  damping: 16 });

  // Trail — keeps last N positions
  const [trail, setTrail] = useState<{x: number; y: number; id: number}[]>([]);
  const trailRef = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      trailRef.current += 1;
      const id = trailRef.current;
      setTrail(prev => [...prev.slice(-12), { x: e.clientX, y: e.clientY, id }]);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [mouseX, mouseY]);

  return (
    <>
      {/* Trail particles */}
      {trail.map((pt, i) => (
        <motion.div
          key={pt.id}
          aria-hidden
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            position: 'fixed',
            top: 0, left: 0,
            x: pt.x - 4,
            y: pt.y - 4,
            width: 8, height: 8,
            borderRadius: '50%',
            background: `hsla(${245 + i * 4}, 90%, 70%, ${0.7 - i * 0.05})`,
            pointerEvents: 'none',
            zIndex: 9997,
            mixBlendMode: 'screen',
          }}
        />
      ))}

      {/* Slow nebula — large atmospheric glow */}
      <motion.div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0,
          x: nebulaX, y: nebulaY,
          translateX: '-50%', translateY: '-50%',
          width: 700, height: 700,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,70,229,0.10) 0%, rgba(124,58,237,0.06) 35%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 9996,
          filter: 'blur(8px)',
        }}
      />

      {/* Medium halo — crisp ring */}
      <motion.div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0,
          x: haloX, y: haloY,
          translateX: '-50%', translateY: '-50%',
          width: 48, height: 48,
          borderRadius: '50%',
          border: '1px solid rgba(129,140,248,0.5)',
          background: 'radial-gradient(circle, rgba(79,70,229,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      />

      {/* Fast dot — sharp cursor accent */}
      <motion.div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0,
          x: dotX, y: dotY,
          translateX: '-50%', translateY: '-50%',
          width: 8, height: 8,
          borderRadius: '50%',
          background: 'rgba(129,140,248,0.95)',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: '0 0 12px 4px rgba(79,70,229,0.6)',
        }}
      />
    </>
  );
};

// ─── Floating orbs (ambient background) ─────────────────────────────────────
const FloatingOrbs = () => (
  <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    {[
      { size: 400, x: '10%', y: '20%', color: 'rgba(79,70,229,0.15)', delay: 0 },
      { size: 300, x: '75%', y: '60%', color: 'rgba(124,58,237,0.12)', delay: 2 },
      { size: 250, x: '50%', y: '80%', color: 'rgba(245,158,11,0.08)', delay: 4 },
      { size: 200, x: '85%', y: '10%', color: 'rgba(79,70,229,0.1)', delay: 1 },
    ].map((orb, i) => (
      <motion.div
        key={i}
        aria-hidden
        animate={{ y: [0, -30, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 8 + i * 2, repeat: Infinity, delay: orb.delay, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          left: orb.x, top: orb.y,
          width: orb.size, height: orb.size,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(1px)',
        }}
      />
    ))}
  </Box>
);

// ─── Screenshot carousel ─────────────────────────────────────────────────────
const ScreenshotCarousel = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive(a => (a + 1) % SCREENS.length), 3500);
    return () => clearInterval(t);
  }, [paused]);

  const prev = () => setActive(a => (a - 1 + SCREENS.length) % SCREENS.length);
  const next = () => setActive(a => (a + 1) % SCREENS.length);

  return (
    <Box sx={{ position: 'relative' }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Tab labels */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, overflowX: 'auto', pb: 0.5, justifyContent: { xs: 'flex-start', md: 'flex-start' }, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
        {SCREENS.map((s, i) => (
          <Box
            key={i}
            onClick={() => setActive(i)}
            sx={{
              px: 2, py: 0.8, borderRadius: 2, cursor: 'pointer',
              background: active === i ? T.primary : 'rgba(255,255,255,0.06)',
              border: `1px solid ${active === i ? T.primary : 'rgba(255,255,255,0.12)'}`,
              transition: 'all 0.2s',
              '&:hover': { background: active === i ? T.primary : 'rgba(255,255,255,0.12)' },
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: active === i ? '#fff' : '#94a3b8', whiteSpace: 'nowrap' }}>
              {s.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Screen frame */}
      <Box sx={{
        position: 'relative',
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        p: 1.5,
      }}>
        {/* Browser bar mockup */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.5, px: 0.5 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <Box key={c} sx={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
          <Box sx={{ ml: 1.5, flex: 1, height: 20, borderRadius: 1, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', px: 1.5 }}>
            <Typography sx={{ fontSize: 9, color: '#64748b' }}>app.girahub.com.br/admin/{SCREENS[active].label.toLowerCase()}</Typography>
          </Box>
        </Box>

        {/* Screen content */}
        <Box sx={{ height: 320, position: 'relative', overflow: 'hidden', borderRadius: 0.5 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: 'absolute', inset: 0 }}
            >
              {SCREENS[active].component}
            </motion.div>
          </AnimatePresence>
        </Box>

        {/* Caption */}
        <Box sx={{ mt: 1.5, px: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{SCREENS[active].label}</Typography>
            <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>{SCREENS[active].sublabel}</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={prev} sx={{ color: '#94a3b8', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.08)' } }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={next} sx={{ color: '#94a3b8', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.08)' } }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Progress dots */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.8, mt: 2 }}>
        {SCREENS.map((_, i) => (
          <Box
            key={i}
            onClick={() => setActive(i)}
            sx={{
              width: i === active ? 24 : 8, height: 8, borderRadius: 4,
              background: i === active ? T.primary : 'rgba(255,255,255,0.2)',
              cursor: 'pointer', transition: 'all 0.3s ease',
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

// ─── Animated counter ─────────────────────────────────────────────────────────
const AnimCounter = ({ value, suffix = '' }: { value: string; suffix?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect(); } }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return <span ref={ref}>{shown ? value : '—'}{suffix}</span>;
};

// ─── Hero mockup (floating) ───────────────────────────────────────────────────
const HeroMockup = () => (
  <motion.div
    animate={{ y: [0, -12, 0] }}
    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    style={{ width: '100%', maxWidth: 420 }}
  >
    <Box sx={{
      borderRadius: 1.5,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(15,13,46,0.8)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 40px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(79,70,229,0.2)',
    }}>
      {/* Browser bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map(c => (
          <Box key={c} sx={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
        ))}
        <Box sx={{ ml: 1, flex: 1, height: 16, borderRadius: 1, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', px: 1 }}>
          <Typography sx={{ fontSize: 8, color: '#64748b' }}>app.girahub.com.br</Typography>
        </Box>
      </Box>
      {/* Content: mini porta view */}
      <Box sx={{ p: 2, height: 260, position: 'relative', overflow: 'hidden' }}>
        <MockPorta />
      </Box>
    </Box>

    {/* Floating badges */}
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 3, repeat: Infinity, delay: 0.5, ease: 'easeInOut' }}
      style={{ position: 'absolute', top: -20, right: -30 }}
    >
      <Box sx={{ px: 2, py: 1, borderRadius: 2, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', backdropFilter: 'blur(10px)' }}>
        <Typography sx={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✓ 48 atendidos hoje</Typography>
      </Box>
    </motion.div>

    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
      style={{ position: 'absolute', bottom: 40, left: -40 }}
    >
      <Box sx={{ px: 2, py: 1, borderRadius: 2, background: 'rgba(79,70,229,0.15)', border: '1px solid rgba(79,70,229,0.3)', backdropFilter: 'blur(10px)' }}>
        <Typography sx={{ fontSize: 11, color: '#818cf8', fontWeight: 700 }}>🎫 Nova senha emitida</Typography>
      </Box>
    </motion.div>
  </motion.div>
);

// ═════════════════════════════════════════════════════════════════════════════
export default function HomePage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const heroRef = useRef(null);

  const smoothScroll = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ─── Header ──────────────────────────────────────────────────────────────
  const header = (
    <AppBar
      position="fixed"
      component="nav"
      aria-label="Navegação principal"
      elevation={0}
      sx={{
        background: 'rgba(15,13,46,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: 72 }}>
          <motion.div whileHover={{ scale: 1.03 }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 'auto' }}>
            <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 28 }} />
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, letterSpacing: '-0.03em' }}>
              GiraHub
            </Typography>
          </motion.div>

          {isMobile ? (
            <>
              <IconButton onClick={() => setDrawerOpen(true)} sx={{ color: '#fff' }}>
                <MenuIcon />
              </IconButton>
              <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 280, pt: 2, background: T.deep, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 22 }} />
                    <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>GiraHub</Typography>
                  </Box>
                  <List sx={{ flex: 1 }}>
                    {NAV.map(n => (
                      <ListItem key={n.label} component="a" href={n.href} onClick={(e: React.MouseEvent) => { smoothScroll(e, n.href); setDrawerOpen(false); }} sx={{ cursor: 'pointer', py: 1.5 }}>
                        <ListItemText primary={n.label} sx={{ '& .MuiListItemText-primary': { color: '#cbd5e1', fontWeight: 600, fontSize: 15 } }} />
                      </ListItem>
                    ))}
                  </List>
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <Button fullWidth variant="outlined" href="/login" sx={{ color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 600, borderRadius: 2 }}>
                      Entrar
                    </Button>
                    <Button fullWidth variant="contained" href="/cadastro" sx={{ background: T.primary, fontWeight: 700, borderRadius: 2 }}>
                      Começar grátis
                    </Button>
                  </Box>
                </Box>
              </Drawer>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {NAV.map(n => (
                <Button
                  key={n.label}
                  component="a"
                  href={n.href}
                  onClick={(e: React.MouseEvent) => smoothScroll(e, n.href)}
                  sx={{ color: '#cbd5e1', fontSize: 14, fontWeight: 500, px: 1.5, '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.06)' } }}
                >
                  {n.label}
                </Button>
              ))}
              <Button
                href="/login"
                sx={{ color: '#cbd5e1', fontSize: 14, fontWeight: 500, mx: 1, '&:hover': { color: '#fff' } }}
              >
                Entrar
              </Button>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  href="/cadastro"
                  variant="contained"
                  sx={{ background: T.primary, fontWeight: 700, borderRadius: 2, px: 3, '&:hover': { background: '#4338ca' } }}
                >
                  Começar grátis
                </Button>
              </motion.div>
            </Box>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );

  // ─── Hero ─────────────────────────────────────────────────────────────────
  const hero = (
    <Box
      ref={heroRef}
      id="hero"
      component="section"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        background: `linear-gradient(135deg, ${T.dark} 0%, ${T.deep} 50%, ${T.mid} 100%)`,
        pt: { xs: 14, md: 10 },
        pb: { xs: 10, md: 8 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <FloatingOrbs />

      {/* Subtle grid texture */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 6, md: 8 }} alignItems="center">
          <Grid item xs={12} md={6}>
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
              <Chip
                label="✦ 9 módulos integrados · gestão completa do terreiro"
                size="small"
                sx={{ mb: 3, background: 'rgba(79,70,229,0.2)', color: '#818cf8', border: '1px solid rgba(79,70,229,0.3)', fontWeight: 600, fontSize: 11 }}
              />
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: 36, md: 52, lg: 60 },
                  fontWeight: 900,
                  lineHeight: 1.1,
                  color: '#fff',
                  letterSpacing: '-0.03em',
                  mb: 3,
                }}
              >
                A plataforma{' '}
                <Box component="span" sx={{ background: `linear-gradient(135deg, ${T.primaryLight}, ${T.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  completa
                </Box>{' '}
                para seu terreiro
              </Typography>
              <Typography sx={{ fontSize: { xs: 16, md: 18 }, color: '#94a3b8', lineHeight: 1.7, mb: 4, maxWidth: 500 }}>
                Senhas, giras, corrente espiritual, financeiro, estoque, cursos e site — tudo em um lugar. Feito para quem cuida de um terreiro de verdade.
              </Typography>

              {/* Módulos em destaque */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 4 }}>
                {[
                  { label: 'Senhas e Giras', color: '#4f46e5' },
                  { label: 'Financeiro', color: '#059669' },
                  { label: 'Corrente Espiritual', color: '#7c3aed' },
                  { label: 'Estoque', color: '#dc2626' },
                  { label: 'Cursos', color: '#d97706' },
                  { label: 'Site do Terreiro', color: '#0891b2' },
                ].map(m => (
                  <Box key={m.label} sx={{ px: 1.2, py: 0.4, borderRadius: 1.5, border: `1px solid ${m.color}40`, background: `${m.color}15` }}>
                    <Typography sx={{ fontSize: 11, color: m.color, fontWeight: 600 }}>{m.label}</Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap', gap: 2, mb: 5 }}>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ flex: 1 }}>
                  <Button
                    href="/cadastro"
                    variant="contained"
                    size="large"
                    fullWidth
                    endIcon={<ArrowForwardIcon />}
                    sx={{ background: T.primary, fontWeight: 700, borderRadius: 2.5, px: 4, py: 1.6, fontSize: 15, '&:hover': { background: '#4338ca' } }}
                  >
                    Comece gratuitamente
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ flex: 1 }}>
                  <Button
                    onClick={(e: React.MouseEvent) => smoothScroll(e, '#funcionalidades')}
                    variant="outlined"
                    size="large"
                    fullWidth
                    sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#cbd5e1', fontWeight: 600, borderRadius: 2.5, px: 3, py: 1.6, '&:hover': { borderColor: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)' } }}
                  >
                    Ver todos os módulos
                  </Button>
                </motion.div>
              </Box>

              {/* Trust badges */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {['Sem papel', '9 módulos integrados', 'LGPD compliant'].map(b => (
                  <Box key={b} sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                    <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 16 }} />
                    <Typography sx={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{b}</Typography>
                  </Box>
                ))}
              </Box>
            </motion.div>
          </Grid>

          {/* Right: floating app preview — desktop full, mobile compact strip */}
          <Grid item xs={12} md={6}>
            <motion.div
              initial={{ opacity: 0, x: isMobile ? 0 : 60, y: isMobile ? 20 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ position: 'relative' }}
            >
              {isMobile ? (
                <Box sx={{
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(15,13,46,0.8)',
                  mx: -1,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                      <Box key={c} sx={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    ))}
                    <Box sx={{ ml: 1, flex: 1, height: 16, borderRadius: 1, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', px: 1 }}>
                      <Typography sx={{ fontSize: 8, color: '#64748b' }}>app.girahub.com.br</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ height: 220 }}>
                    <MockPorta />
                  </Box>
                </Box>
              ) : (
                <HeroMockup />
              )}
            </motion.div>
          </Grid>
        </Grid>
      </Container>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{ position: 'absolute', bottom: 32, left: '50%', translateX: '-50%', zIndex: 1 }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, cursor: 'pointer', opacity: 0.5 }}
          onClick={(e: React.MouseEvent) => smoothScroll(e, '#funcionalidades')}>
          <Typography sx={{ fontSize: 10, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase' }}>Scroll</Typography>
          <Box sx={{ width: 1, height: 30, background: 'rgba(255,255,255,0.2)' }} />
        </Box>
      </motion.div>
    </Box>
  );

  // ─── Features ────────────────────────────────────────────────────────────
  const features = (
    <Box id="funcionalidades" component="section" sx={{ py: { xs: 10, md: 14 }, background: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
              Plataforma completa
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 32, md: 44 }, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em', mb: 2 }}>
              9 módulos. Um só sistema.
            </Typography>
            <Typography sx={{ fontSize: 18, color: T.body, maxWidth: 560, mx: 'auto' }}>
              Do ticket ao fluxo de caixa — cada área do terreiro tem o seu módulo, e tudo conversa entre si.
            </Typography>
          </Box>
        </Reveal>

        {/* Desktop/tablet grid */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Grid container spacing={3}>
            {FEATURES.map((f, i) => (
              <Grid item xs={12} sm={6} md={4} key={f.title}>
                <Reveal delay={i * 0.06}>
                  <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.25 }} style={{ height: '100%' }}>
                    <Card
                      sx={{
                        height: '100%', p: 3, borderRadius: 3,
                        border: `1px solid ${f.color}20`,
                        boxShadow: T.cardShadow,
                        cursor: 'default',
                        transition: 'all 0.2s',
                        '&:hover': { boxShadow: `0 20px 60px ${f.color}20`, borderColor: `${f.color}50` },
                      }}
                    >
                      <Box sx={{ width: 48, height: 48, borderRadius: 2.5, background: `${f.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, color: f.color }}>
                        {f.icon}
                      </Box>
                      <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.dark, mb: 1 }}>{f.title}</Typography>
                      <Typography sx={{ fontSize: 14, color: T.body, lineHeight: 1.7 }}>{f.desc}</Typography>
                    </Card>
                  </motion.div>
                </Reveal>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Mobile carousel */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, mx: -2 }}>
          <MobileCarousel
            items={FEATURES}
            renderItem={(f) => (
              <Card sx={{ height: '100%', p: 3, borderRadius: 3, border: `1px solid ${f.color}20`, boxShadow: T.cardShadow }}>
                <Box sx={{ width: 48, height: 48, borderRadius: 2.5, background: `${f.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, color: f.color }}>
                  {f.icon}
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.dark, mb: 1 }}>{f.title}</Typography>
                <Typography sx={{ fontSize: 14, color: T.body, lineHeight: 1.7 }}>{f.desc}</Typography>
              </Card>
            )}
          />
        </Box>
      </Container>
    </Box>
  );

  // ─── A Porta ─────────────────────────────────────────────────────────────
  const porta = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: '#fff', overflow: 'hidden' }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 6, md: 10 }} alignItems="center">
          <Grid item xs={12} md={6}>
            <Reveal>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
                O diferencial que ninguém mais tem
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 44 }, fontWeight: 900, color: T.dark, letterSpacing: '-0.03em', lineHeight: 1.1, mb: 3 }}>
                Chame as senhas{' '}
                <Box component="span" sx={{ background: `linear-gradient(135deg, ${T.primary}, #7c3aed)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  na TV. Ao vivo.
                </Box>
              </Typography>
              <Typography sx={{ fontSize: 17, color: T.body, lineHeight: 1.75, mb: 4 }}>
                Uma tela dedicada para o operador na porta — exibe a senha atual, o nome do consulente e o contador de atendidos. Funciona em qualquer TV ou monitor conectado. Sem app extra, sem configuração.
              </Typography>
              {[
                'Número da senha em destaque — visível de longe',
                'Nome do consulente exibido automaticamente',
                'Contador de atendidos, na fila e restantes',
                'Som de notificação configurável',
                'Modo kiosk para tela cheia (TV da recepção)',
              ].map((item, i) => (
                <Reveal key={item} delay={i * 0.08}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ width: 22, height: 22, borderRadius: '50%', background: `${T.primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircleIcon sx={{ fontSize: 14, color: T.primary }} />
                    </Box>
                    <Typography sx={{ fontSize: 15, color: T.body }}>{item}</Typography>
                  </Box>
                </Reveal>
              ))}
              <Reveal delay={0.5}>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ display: 'inline-block', marginTop: 24 }}>
                  <Button
                    href="/cadastro"
                    variant="contained"
                    size="large"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ background: T.primary, fontWeight: 700, borderRadius: 2.5, px: 4, py: 1.5, '&:hover': { background: '#4338ca' } }}
                  >
                    Testar a Porta grátis
                  </Button>
                </motion.div>
              </Reveal>
            </Reveal>
          </Grid>

          <Grid item xs={12} md={6}>
            <Reveal delay={0.2} direction="left">
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Box sx={{
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  border: '1px solid rgba(15,13,46,0.12)',
                  boxShadow: `0 40px 80px rgba(79,70,229,0.18), 0 0 0 1px rgba(79,70,229,0.08)`,
                  height: 380,
                }}>
                  <MockPorta />
                </Box>
              </motion.div>
            </Reveal>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );

  // ─── Screenshots ─────────────────────────────────────────────────────────
  const screenshots = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: `linear-gradient(135deg, ${T.dark} 0%, ${T.deep} 100%)`, position: 'relative', overflow: 'hidden' }}>
      <FloatingOrbs />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
          <Grid item xs={12} md={5}>
            <Reveal>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
                Veja o sistema
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 40 }, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', mb: 2 }}>
                Simples de usar, poderoso de verdade
              </Typography>
              <Typography sx={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, mb: 4 }}>
                Interface pensada para operadores e administradores que não têm tempo a perder. Rápida, clara e intuitiva.
              </Typography>
              {[
                'Dashboard com KPIs e alertas em tempo real',
                'Financeiro com fluxo de caixa e exportação PDF',
                'Corrente espiritual com histórico de participação',
                'Porta ao vivo exibida em qualquer TV',
                'Site do terreiro pronto em minutos',
              ].map((item, i) => (
                <Reveal key={item} delay={i * 0.1}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ width: 20, height: 20, borderRadius: '50%', background: `${T.primary}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.2 }}>
                      <CheckCircleIcon sx={{ fontSize: 14, color: T.primaryLight }} />
                    </Box>
                    <Typography sx={{ fontSize: 14, color: '#cbd5e1' }}>{item}</Typography>
                  </Box>
                </Reveal>
              ))}
            </Reveal>
          </Grid>

          <Grid item xs={12} md={7}>
            <Reveal delay={0.2} direction="left">
              <ScreenshotCarousel />
            </Reveal>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );

  // ─── Financeiro ──────────────────────────────────────────────────────────
  const financeiro = (
    <Box id="financeiro" component="section" sx={{ py: { xs: 10, md: 14 }, background: '#fff', overflow: 'hidden' }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 6, md: 10 }} alignItems="center">
          <Grid item xs={12} md={6}>
            <Reveal delay={0.1} direction="right">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
                <Box sx={{ borderRadius: 1.5, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: `0 32px 80px rgba(5,150,105,0.15), 0 0 0 1px rgba(5,150,105,0.08)`, height: 380 }}>
                  <MockFinanceiroDash />
                </Box>
              </motion.div>
            </Reveal>
          </Grid>

          <Grid item xs={12} md={6}>
            <Reveal>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#059669', letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
                Módulo Financeiro
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 28, md: 42 }, fontWeight: 900, color: T.dark, letterSpacing: '-0.03em', lineHeight: 1.15, mb: 3 }}>
                Pare de gerenciar o dinheiro do terreiro no papel
              </Typography>
              <Typography sx={{ fontSize: 16, color: T.body, lineHeight: 1.75, mb: 4 }}>
                Contas a pagar, contas a receber, fluxo de caixa e mensalidades integrados. Veja onde o dinheiro entra e sai — e exporte tudo em PDF no final do mês.
              </Typography>
              {[
                'Contas a pagar com alertas de vencimento',
                'Contas a receber e controle de inadimplência',
                'Fluxo de caixa com saldo acumulado',
                'Mensalidades de médiuns e associados',
                'Categorias personalizadas e múltiplas contas',
                'Exportação de relatórios em PDF',
              ].map((item, i) => (
                <Reveal key={item} delay={i * 0.07}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ width: 22, height: 22, borderRadius: '50%', background: '#05966918', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircleIcon sx={{ fontSize: 14, color: '#059669' }} />
                    </Box>
                    <Typography sx={{ fontSize: 15, color: T.body }}>{item}</Typography>
                  </Box>
                </Reveal>
              ))}
              <Reveal delay={0.5}>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} style={{ display: 'inline-block', marginTop: 24 }}>
                  <Button
                    href="/cadastro"
                    variant="contained"
                    size="large"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ background: '#059669', fontWeight: 700, borderRadius: 2.5, px: 4, py: 1.5, '&:hover': { background: '#047857' } }}
                  >
                    Testar o financeiro grátis
                  </Button>
                </motion.div>
              </Reveal>
            </Reveal>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );

  // ─── Corrente Espiritual ─────────────────────────────────────────────────
  const corrente = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: '#f8fafc', overflow: 'hidden' }}>
      <Container maxWidth="lg">
        <Grid container spacing={{ xs: 6, md: 10 }} alignItems="center">
          <Grid item xs={12} md={6}>
            <Reveal>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
                Corrente Espiritual
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 28, md: 42 }, fontWeight: 900, color: T.dark, letterSpacing: '-0.03em', lineHeight: 1.15, mb: 3 }}>
                Sua corrente organizada e presente em cada gira
              </Typography>
              <Typography sx={{ fontSize: 16, color: T.body, lineHeight: 1.75, mb: 4 }}>
                Cadastre médiuns e cambones com foto, endereço, data de nascimento e histórico de participação. Veja quem confirmou presença e gere relatórios automáticos.
              </Typography>
              {[
                'Cadastro com foto e endereço via CEP',
                'Histórico de participação em giras',
                'Controle de mensalidades por médium',
                'Associados com anuidades separadas',
                'Aniversariantes da semana no dashboard',
                'Relatório de participação exportável em PDF',
              ].map((item, i) => (
                <Reveal key={item} delay={i * 0.07}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ width: 22, height: 22, borderRadius: '50%', background: '#7c3aed18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircleIcon sx={{ fontSize: 14, color: '#7c3aed' }} />
                    </Box>
                    <Typography sx={{ fontSize: 15, color: T.body }}>{item}</Typography>
                  </Box>
                </Reveal>
              ))}
            </Reveal>
          </Grid>

          <Grid item xs={12} md={6}>
            <Reveal delay={0.1} direction="left">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                <Box sx={{ borderRadius: 1.5, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: `0 32px 80px rgba(124,58,237,0.15)`, height: 380 }}>
                  <MockMediuns />
                </Box>
              </motion.div>
            </Reveal>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );

  // ─── Steps ───────────────────────────────────────────────────────────────
  const steps = (
    <Box id="como-funciona" component="section" sx={{ py: { xs: 10, md: 14 }, background: '#fff' }}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
              Como funciona
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 32, md: 44 }, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em' }}>
              Do cadastro à chamada em 4 passos
            </Typography>
          </Box>
        </Reveal>

        <Grid container spacing={{ xs: 4, md: 2 }} alignItems="center">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.num}>
              <Grid item xs={12} md={3}>
                <Reveal delay={i * 0.15}>
                  <Box sx={{ textAlign: 'center', position: 'relative' }}>
                    <motion.div whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
                      <Box
                        sx={{
                          width: 80, height: 80, borderRadius: '50%',
                          background: `linear-gradient(135deg, ${T.primary}, #7c3aed)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          mx: 'auto', mb: 3,
                          boxShadow: `0 16px 40px rgba(79,70,229,0.35)`,
                        }}
                      >
                        <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#fff' }}>{s.num}</Typography>
                      </Box>
                    </motion.div>
                    <Typography sx={{ fontSize: 19, fontWeight: 800, color: T.dark, mb: 1 }}>{s.title}</Typography>
                    <Typography sx={{ fontSize: 14, color: T.body, lineHeight: 1.7 }}>{s.desc}</Typography>
                  </Box>
                </Reveal>
              </Grid>
              {i < STEPS.length - 1 && (
                <>
                  {/* Desktop: seta horizontal */}
                  <Grid item md={1} sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center' }}>
                    <Box sx={{ fontSize: 28, color: '#e2e8f0' }}>→</Box>
                  </Grid>
                  {/* Mobile: linha vertical conectora */}
                  <Grid item xs={12} sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', py: 0 }}>
                    <Box sx={{ width: 2, height: 32, background: `linear-gradient(${T.primary}, #7c3aed)`, borderRadius: 1, opacity: 0.3 }} />
                  </Grid>
                </>
              )}
            </React.Fragment>
          ))}
        </Grid>
      </Container>
    </Box>
  );

  // ─── Pricing ─────────────────────────────────────────────────────────────
  const pricing = (
    <Box id="planos" component="section" sx={{ py: { xs: 10, md: 14 }, background: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
              Planos e Preços
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 32, md: 44 }, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em', mb: 2 }}>
              Comece grátis, cresça sem limites
            </Typography>
            <Typography sx={{ fontSize: 18, color: T.body }}>
              Sem contratos. Cancele quando quiser.
            </Typography>
          </Box>
        </Reveal>

        {/* Desktop/tablet grid */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Grid container spacing={3} justifyContent="center">
            {PLANS.map((plan, i) => (
              <Grid item xs={12} sm={6} md={3} key={plan.name}>
                <Reveal delay={i * 0.08}>
                  <motion.div whileHover={{ y: plan.highlight ? -4 : -6, scale: 1.01 }} transition={{ duration: 0.25 }}>
                    <Box
                      sx={{
                        height: '100%',
                        p: 3,
                        borderRadius: 3,
                        border: plan.highlight ? `2px solid ${T.primary}` : '1px solid #e2e8f0',
                        background: plan.highlight ? `linear-gradient(135deg, ${T.deep} 0%, ${T.mid} 100%)` : '#fff',
                        position: 'relative',
                        boxShadow: plan.highlight ? `0 24px 60px rgba(79,70,229,0.25)` : T.cardShadow,
                      }}
                    >
                      {plan.highlight && (
                        <Box sx={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }}>
                          <Chip
                            icon={<StarIcon sx={{ fontSize: '14px !important', color: T.accent }} />}
                            label="Mais Popular"
                            size="small"
                            sx={{ background: T.accent, color: T.dark, fontWeight: 700, fontSize: 11 }}
                          />
                        </Box>
                      )}
                      <Typography sx={{ fontSize: 18, fontWeight: 800, color: plan.highlight ? '#fff' : T.dark, mb: 1 }}>
                        {plan.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 3 }}>
                        {plan.price > 0 && <Typography sx={{ fontSize: 14, color: plan.highlight ? '#94a3b8' : T.muted, fontWeight: 500 }}>R$</Typography>}
                        <Typography sx={{ fontSize: plan.price === 0 ? 36 : 40, fontWeight: 900, color: plan.highlight ? '#fff' : T.dark, lineHeight: 1 }}>
                          {plan.price === 0 ? 'Grátis' : plan.price}
                        </Typography>
                        {plan.price > 0 && <Typography sx={{ fontSize: 13, color: plan.highlight ? '#94a3b8' : T.muted }}>/mês</Typography>}
                      </Box>
                      {plan.features.map(f => (
                        <Box key={f} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.2 }}>
                          <CheckCircleIcon sx={{ fontSize: 16, color: plan.highlight ? T.accent : '#22c55e', flexShrink: 0, mt: 0.2 }} />
                          <Typography sx={{ fontSize: 13, color: plan.highlight ? '#cbd5e1' : T.body, lineHeight: 1.5 }}>{f}</Typography>
                        </Box>
                      ))}
                      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={{ marginTop: 24 }}>
                        <Button
                          href="/cadastro"
                          fullWidth
                          variant={plan.highlight ? 'contained' : 'outlined'}
                          sx={{
                            fontWeight: 700, borderRadius: 2, py: 1.2,
                            ...(plan.highlight
                              ? { background: T.accent, color: T.dark, '&:hover': { background: '#d97706' } }
                              : { borderColor: T.primary, color: T.primary, '&:hover': { background: `${T.primary}08` } }),
                          }}
                        >
                          {plan.price === 0 ? 'Começar grátis' : `Assinar ${plan.name}`}
                        </Button>
                      </motion.div>
                    </Box>
                  </motion.div>
                </Reveal>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Mobile carousel */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, mx: -2 }}>
          <MobileCarousel
            items={PLANS}
            renderItem={(plan) => (
              <Box
                sx={{
                  p: 3, borderRadius: 3, position: 'relative',
                  border: plan.highlight ? `2px solid ${T.primary}` : '1px solid #e2e8f0',
                  background: plan.highlight ? `linear-gradient(135deg, ${T.deep} 0%, ${T.mid} 100%)` : '#fff',
                  boxShadow: plan.highlight ? `0 24px 60px rgba(79,70,229,0.25)` : T.cardShadow,
                }}
              >
                {plan.highlight && (
                  <Box sx={{ mb: 1 }}>
                    <Chip
                      icon={<StarIcon sx={{ fontSize: '14px !important', color: T.accent }} />}
                      label="Mais Popular"
                      size="small"
                      sx={{ background: T.accent, color: T.dark, fontWeight: 700, fontSize: 11 }}
                    />
                  </Box>
                )}
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: plan.highlight ? '#fff' : T.dark, mb: 1 }}>
                  {plan.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 3 }}>
                  {plan.price > 0 && <Typography sx={{ fontSize: 14, color: plan.highlight ? '#94a3b8' : T.muted, fontWeight: 500 }}>R$</Typography>}
                  <Typography sx={{ fontSize: plan.price === 0 ? 36 : 40, fontWeight: 900, color: plan.highlight ? '#fff' : T.dark, lineHeight: 1 }}>
                    {plan.price === 0 ? 'Grátis' : plan.price}
                  </Typography>
                  {plan.price > 0 && <Typography sx={{ fontSize: 13, color: plan.highlight ? '#94a3b8' : T.muted }}>/mês</Typography>}
                </Box>
                {plan.features.map((f: string) => (
                  <Box key={f} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.2 }}>
                    <CheckCircleIcon sx={{ fontSize: 16, color: plan.highlight ? T.accent : '#22c55e', flexShrink: 0, mt: 0.2 }} />
                    <Typography sx={{ fontSize: 13, color: plan.highlight ? '#cbd5e1' : T.body, lineHeight: 1.5 }}>{f}</Typography>
                  </Box>
                ))}
                <Button
                  href="/cadastro"
                  fullWidth
                  variant={plan.highlight ? 'contained' : 'outlined'}
                  sx={{
                    fontWeight: 700, borderRadius: 2, py: 1.2, mt: 3,
                    ...(plan.highlight
                      ? { background: T.accent, color: T.dark, '&:hover': { background: '#d97706' } }
                      : { borderColor: T.primary, color: T.primary, '&:hover': { background: `${T.primary}08` } }),
                  }}
                >
                  {plan.price === 0 ? 'Começar grátis' : `Assinar ${plan.name}`}
                </Button>
              </Box>
            )}
          />
        </Box>
      </Container>
    </Box>
  );

  // ─── Trust ───────────────────────────────────────────────────────────────
  const trust = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: `linear-gradient(135deg, ${T.dark} 0%, ${T.deep} 100%)`, position: 'relative', overflow: 'hidden' }}>
      <FloatingOrbs />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Grid container spacing={6} alignItems="center">
          <Grid item xs={12} md={6}>
            <Reveal>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
                Feito com cuidado
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 40 }, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', mb: 3 }}>
                Construído para a{' '}
                <Box component="span" sx={{ background: `linear-gradient(135deg, ${T.primaryLight}, ${T.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  comunidade espiritual
                </Box>
              </Typography>
              <Typography sx={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7 }}>
                Entendemos que tecnologia deve servir a tradição, não substituí-la. O GiraHub foi criado para facilitar o trabalho dos terreiros, preservando o que há de mais sagrado em cada gira.
              </Typography>
            </Reveal>
          </Grid>

          <Grid item xs={12} md={6}>
            <Grid container spacing={3}>
              {STATS.map((s, i) => (
                <Grid item xs={12} sm={4} key={s.label}>
                  <Reveal delay={i * 0.15}>
                    <motion.div whileHover={{ scale: 1.06 }} transition={{ duration: 0.2 }}>
                      <Box sx={{ textAlign: 'center', p: 3, borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
                        <Typography sx={{ fontSize: { xs: 22, md: 32 }, fontWeight: 900, color: T.primaryLight, mb: 1 }}>
                          <AnimCounter value={s.value} />
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</Typography>
                      </Box>
                    </motion.div>
                  </Reveal>
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );

  // ─── Mais telas ──────────────────────────────────────────────────────────
  const maisTelas = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
              Veja tudo funcionando
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 42 }, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em' }}>
              Cada módulo, uma tela
            </Typography>
            <Typography sx={{ fontSize: 17, color: T.body, mt: 2, maxWidth: 560, mx: 'auto' }}>
              Interfaces limpas, intuitivas e feitas para quem usa no dia a dia do terreiro.
            </Typography>
          </Box>
        </Reveal>

        {(() => {
          const maisTelasList = [
            { label: 'Dashboard Geral', sublabel: 'KPIs, alertas e próximas giras em tempo real', component: <MockDashboard />, color: '#4f46e5' },
            { label: 'Corrente Espiritual', sublabel: 'Médiuns e cambones com histórico de participação', component: <MockMediuns />, color: '#7c3aed' },
            { label: 'Financeiro', sublabel: 'Fluxo de caixa, entradas, saídas e saldo', component: <MockFinanceiroDash />, color: '#059669' },
            { label: 'Porta Ao Vivo', sublabel: 'Tela de chamada para exibir na TV da recepção', component: <MockPorta />, color: '#f59e0b' },
            { label: 'Estoque', sublabel: 'Itens, grupos e alertas de quantidade mínima', component: <MockEstoque />, color: '#dc2626' },
            { label: 'Site do Terreiro', sublabel: 'Página pública com giras, endereço e contato', component: <MockSite />, color: '#0891b2' },
          ];
          const renderTelaCard = (s: (typeof maisTelasList)[number]) => (
            <Box sx={{
              borderRadius: 1, overflow: 'hidden', border: '1px solid #e2e8f0',
              boxShadow: T.cardShadow, background: '#fff',
              '&:hover': { boxShadow: `0 24px 64px rgba(79,70,229,0.13)`, borderColor: `${s.color}30` },
            }}>
              <Box sx={{ height: 300, p: 1.5, background: '#f1f5f9' }}>{s.component}</Box>
              <Box sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.dark }}>{s.label}</Typography>
                </Box>
                <Typography sx={{ fontSize: 13, color: T.muted }}>{s.sublabel}</Typography>
              </Box>
            </Box>
          );
          return (
            <>
              {/* Desktop grid — 3 colunas, 2 linhas */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Grid container spacing={3}>
                  {maisTelasList.map((s, i) => (
                    <Grid item xs={12} md={4} key={s.label}>
                      <Reveal delay={i * 0.1}>
                        <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.2 }}>
                          {renderTelaCard(s)}
                        </motion.div>
                      </Reveal>
                    </Grid>
                  ))}
                </Grid>
              </Box>
              {/* Mobile carousel */}
              <Box sx={{ display: { xs: 'block', md: 'none' }, mx: -2 }}>
                <MobileCarousel items={maisTelasList} renderItem={renderTelaCard} />
              </Box>
            </>
          );
        })()}
      </Container>
    </Box>
  );

  // ─── Contact ─────────────────────────────────────────────────────────────
  const contact = (
    <Box id="contato" component="section" sx={{ py: { xs: 10, md: 14 }, background: '#fff' }}>
      <Container maxWidth="md">
        <Reveal>
          <Box sx={{ textAlign: 'center', mb: 6 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.primary, letterSpacing: 2, textTransform: 'uppercase', mb: 1 }}>
              Fale conosco
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 40 }, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em' }}>
              Estamos aqui para ajudar
            </Typography>
          </Box>
        </Reveal>

        <Grid container spacing={3} justifyContent="center">
          {[
            { icon: <MailOutlineIcon sx={{ fontSize: 28 }} />, title: 'E-mail', value: 'leonfpontes@gmail.com', href: 'mailto:leonfpontes@gmail.com' },
            { icon: <WhatsAppIcon sx={{ fontSize: 28 }} />, title: 'WhatsApp', value: '(16) 99109-1234', href: 'https://wa.me/5516991091234' },
          ].map(c => (
            <Grid item xs={12} sm={6} key={c.title}>
              <Reveal>
                <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                  <Box
                    component="a"
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 3, p: 3,
                      borderRadius: 3, border: '1px solid #e2e8f0',
                      textDecoration: 'none', transition: 'all 0.2s',
                      '&:hover': { borderColor: `${T.primary}60`, boxShadow: T.cardHover },
                    }}
                  >
                    <Box sx={{ width: 56, height: 56, borderRadius: 2.5, background: `${T.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary }}>
                      {c.icon}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 13, color: T.muted, fontWeight: 500, mb: 0.3 }}>{c.title}</Typography>
                      <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.dark }}>{c.value}</Typography>
                    </Box>
                    <ArrowForwardIcon sx={{ ml: 'auto', color: T.muted, fontSize: 20 }} />
                  </Box>
                </motion.div>
              </Reveal>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );

  // ─── Final CTA ───────────────────────────────────────────────────────────
  const finalCta = (
    <Box component="section" sx={{ py: { xs: 10, md: 14 }, background: `linear-gradient(135deg, ${T.primary} 0%, #7c3aed 100%)`, position: 'relative', overflow: 'hidden' }}>
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <Reveal>
          <Typography variant="h2" sx={{ fontSize: { xs: 30, md: 48 }, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', mb: 2 }}>
            Seu terreiro merece uma plataforma à altura
          </Typography>
          <Typography sx={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', mb: 5 }}>
            9 módulos. Um sistema. Comece grátis — sem cartão de crédito.
          </Typography>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} style={{ display: 'inline-block' }}>
            <Button
              href="/cadastro"
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              sx={{ background: '#fff', color: T.primary, fontWeight: 800, borderRadius: 3, px: 5, py: 1.8, fontSize: 16, '&:hover': { background: '#f1f5f9' } }}
            >
              Criar conta grátis
            </Button>
          </motion.div>
        </Reveal>
      </Container>
    </Box>
  );

  // ─── Footer ──────────────────────────────────────────────────────────────
  const footer = (
    <Box component="footer" sx={{ background: T.dark, py: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <Container maxWidth="lg">
        <Grid container spacing={4} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <ConfirmationNumberIcon sx={{ color: T.accent, fontSize: 24 }} />
              <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>GiraHub</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
              Plataforma completa de gestão para terreiros de umbanda e candomblé. Do ticket ao fluxo de caixa.
            </Typography>
          </Grid>
          <Grid item xs={6} md={2}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', mb: 2 }}>Plataforma</Typography>
            {['Funcionalidades', 'Planos', 'Como Funciona'].map(l => (
              <Box key={l} component="a" href="#" sx={{ display: 'block', fontSize: 13, color: '#64748b', mb: 1, textDecoration: 'none', '&:hover': { color: '#94a3b8' } }}>{l}</Box>
            ))}
          </Grid>
          <Grid item xs={6} md={2}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', mb: 2 }}>Legal</Typography>
            {[['Privacidade', '/privacidade'], ['Termos de Uso', '/termos']].map(([l, h]) => (
              <Box key={l} component="a" href={h} sx={{ display: 'block', fontSize: 13, color: '#64748b', mb: 1, textDecoration: 'none', '&:hover': { color: '#94a3b8' } }}>{l}</Box>
            ))}
          </Grid>
          <Grid item xs={12} md={4}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, textTransform: 'uppercase', mb: 2 }}>Contato</Typography>
            <Typography sx={{ fontSize: 13, color: '#64748b', mb: 0.8 }}>leonfpontes@gmail.com</Typography>
            <Typography sx={{ fontSize: 13, color: '#64748b' }}>(16) 99109-1234</Typography>
          </Grid>
        </Grid>
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', pt: 3, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ fontSize: 12, color: '#475569' }}>© {new Date().getFullYear()} GiraHub. Todos os direitos reservados.</Typography>
          <Typography sx={{ fontSize: 12, color: '#475569' }}>Feito com ♥ para a comunidade espiritual</Typography>
        </Box>
      </Container>
    </Box>
  );

  // ─── JSON-LD + SEO ───────────────────────────────────────────────────────
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'GiraHub',
    applicationCategory: 'BusinessApplication',
    description: 'Plataforma completa de gestão para terreiros de umbanda e candomblé — senhas, financeiro, corrente espiritual, estoque, cursos e site.',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
  };

  return (
    <>
      <Head>
        <title>GiraHub — Plataforma completa de gestão para terreiros</title>
        <meta name="description" content="Senhas, giras, financeiro, corrente espiritual, estoque, cursos e site — tudo em um lugar. Feito para terreiros de umbanda e candomblé." />
        <meta property="og:title" content="GiraHub — A plataforma completa para seu terreiro" />
        <meta property="og:description" content="9 módulos integrados. Do ticket ao fluxo de caixa. Grátis para começar." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://girahub.com.br" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      {/* Cursor glow — desktop only */}
      {!isMobile && <CursorGlow />}

      <Box component="main" sx={{ overflowX: 'hidden' }}>
        {header}
        {hero}
        {features}
        {financeiro}
        {corrente}
        {porta}
        {screenshots}
        {maisTelas}
        {steps}
        {pricing}
        {trust}
        {contact}
        {finalCta}
        {footer}
      </Box>
    </>
  );
}
