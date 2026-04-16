/**
 * Custom 404 page — animated and fun.
 * Used for truly unmatched routes and when notFound: true is returned.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import NextLink from 'next/link';
import { Box, Button, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';

interface FloatingItem {
  emoji: string;
  top: string;
  left?: string;
  right?: string;
  delay: string;
  duration: string;
  size: number;
  rotationDeg: number;
}

const FLOATING_ITEMS: FloatingItem[] = [
  { emoji: '🕯️', top: '8%',  left: '6%',   delay: '0s',    duration: '4s',   size: 38, rotationDeg: 10  },
  { emoji: '✨', top: '18%', right: '10%',  delay: '0.7s',  duration: '3.5s', size: 28, rotationDeg: -15 },
  { emoji: '🌕', top: '68%', left: '4%',   delay: '1.1s',  duration: '5.2s', size: 44, rotationDeg: 5   },
  { emoji: '⭐', top: '14%', left: '42%',  delay: '0.3s',  duration: '3.2s', size: 22, rotationDeg: 20  },
  { emoji: '🕯️', top: '58%', right: '6%',  delay: '1.9s',  duration: '4.8s', size: 36, rotationDeg: -8  },
  { emoji: '💫', top: '78%', right: '18%', delay: '0.5s',  duration: '4s',   size: 32, rotationDeg: 12  },
  { emoji: '🌀', top: '38%', left: '2%',   delay: '1.4s',  duration: '6.5s', size: 36, rotationDeg: 360 },
  { emoji: '✨', top: '82%', left: '28%',  delay: '0.9s',  duration: '4.4s', size: 24, rotationDeg: -20 },
  { emoji: '🌙', top: '4%',  right: '28%', delay: '0.1s',  duration: '5.8s', size: 42, rotationDeg: -5  },
  { emoji: '💫', top: '48%', right: '2%',  delay: '2.3s',  duration: '3.4s', size: 28, rotationDeg: 15  },
  { emoji: '🌟', top: '90%', left: '55%',  delay: '1.7s',  duration: '4.1s', size: 30, rotationDeg: -10 },
  { emoji: '🕯️', top: '30%', right: '30%', delay: '2.6s',  duration: '3.8s', size: 30, rotationDeg: 8   },
];

const MESSAGES = [
  'Essa página cruzou pro astral...',
  'Os guias ainda estão procurando isso!',
  'Nem o Seu Sete Encruzilhadas achou essa página.',
  'A gira virou aqui e levou a página junto!',
];

export default function Custom404() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIndex(i => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 500);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Head>
        <title>404 — Página perdida no astral | GiraHub</title>
        <meta name="robots" content="noindex" />
      </Head>

      <Box
        sx={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 40%, #1e0040 0%, #0d0020 55%, #000010 100%)',
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: 3,
          userSelect: 'none',
        }}
      >
        {/* ── Floating Elements ─────────────────────────────────────────── */}
        {FLOATING_ITEMS.map((item, i) => (
          <Box
            key={i}
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: item.top,
              ...(item.left  ? { left: item.left }   : {}),
              ...(item.right ? { right: item.right } : {}),
              fontSize: item.size,
              lineHeight: 1,
              pointerEvents: 'none',
              opacity: 0.75,
              '@keyframes floatBob': {
                '0%':   { transform: 'translateY(0px) rotate(0deg)' },
                '50%':  { transform: `translateY(-22px) rotate(${item.rotationDeg}deg)` },
                '100%': { transform: 'translateY(0px) rotate(0deg)' },
              },
              animation: `floatBob ${item.duration} ${item.delay} ease-in-out infinite`,
            }}
          >
            {item.emoji}
          </Box>
        ))}

        {/* ── Star particles (tiny dots) ─────────────────────────────────── */}
        {Array.from({ length: 25 }).map((_, i) => (
          <Box
            key={`star-${i}`}
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: `${Math.round((i * 37 + 5) % 95)}%`,
              left: `${Math.round((i * 61 + 10) % 94)}%`,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: '50%',
              background: i % 4 === 0 ? '#f0abfc' : i % 4 === 1 ? '#818cf8' : '#facc15',
              pointerEvents: 'none',
              '@keyframes twinkle': {
                '0%, 100%': { opacity: 0.15 },
                '50%':      { opacity: 1 },
              },
              animation: `twinkle ${1.5 + (i % 5) * 0.4}s ${(i * 0.17).toFixed(1)}s ease-in-out infinite`,
            }}
          />
        ))}

        {/* ── 404 giant text ────────────────────────────────────────────── */}
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '7rem', sm: '10rem', md: '14rem' },
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              background: 'linear-gradient(135deg, #c084fc 0%, #f0abfc 45%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              '@keyframes pulseGlow': {
                '0%, 100%': { filter: 'drop-shadow(0 0 18px rgba(192,132,252,0.5)) drop-shadow(0 0 60px rgba(192,132,252,0.2))' },
                '50%':      { filter: 'drop-shadow(0 0 40px rgba(240,171,252,0.9)) drop-shadow(0 0 100px rgba(192,132,252,0.5))' },
              },
              animation: 'pulseGlow 2.8s ease-in-out infinite',
            }}
          >
            404
          </Typography>

          {/* ── Ghost spirit SVG ────────────────────────────────────────── */}
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -70%)',
              fontSize: { xs: '3rem', md: '4rem' },
              '@keyframes ghostWobble': {
                '0%':   { transform: 'translate(-50%, -70%) rotate(-5deg) scale(1)' },
                '25%':  { transform: 'translate(-50%, -80%) rotate(5deg) scale(1.05)' },
                '50%':  { transform: 'translate(-50%, -70%) rotate(-3deg) scale(1)' },
                '75%':  { transform: 'translate(-50%, -78%) rotate(4deg) scale(1.04)' },
                '100%': { transform: 'translate(-50%, -70%) rotate(-5deg) scale(1)' },
              },
              animation: 'ghostWobble 3s ease-in-out infinite',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            👻
          </Box>
        </Box>

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <Typography
          variant="h4"
          sx={{
            mt: 2,
            mb: 1,
            fontWeight: 700,
            color: '#c084fc',
            fontSize: { xs: '1.3rem', md: '1.7rem' },
            textShadow: '0 2px 12px rgba(192,132,252,0.5)',
            zIndex: 1,
            position: 'relative',
          }}
        >
          Página perdida no astral!
        </Typography>

        {/* ── Rotating messages ─────────────────────────────────────────── */}
        <Box
          sx={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 4,
            zIndex: 1,
            position: 'relative',
          }}
        >
          <Typography
            variant="body1"
            sx={{
              color: 'rgba(240,171,252,0.75)',
              fontSize: { xs: '0.95rem', md: '1.05rem' },
              fontStyle: 'italic',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(-8px)',
            }}
          >
            {MESSAGES[msgIndex]}
          </Typography>
        </Box>

        {/* ── CTA Button ─────────────────────────────────────────────────── */}
        <Box sx={{ zIndex: 1, position: 'relative', display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            component={NextLink}
            href="/"
            variant="contained"
            size="large"
            startIcon={<HomeIcon />}
            sx={{
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              color: '#fff',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              borderRadius: 3,
              textTransform: 'none',
              fontSize: '1rem',
              boxShadow: '0 0 20px rgba(168,85,247,0.5)',
              '@keyframes btnPulse': {
                '0%, 100%': { boxShadow: '0 0 20px rgba(168,85,247,0.4)' },
                '50%':      { boxShadow: '0 0 40px rgba(168,85,247,0.8), 0 0 80px rgba(168,85,247,0.3)' },
              },
              animation: 'btnPulse 2.5s ease-in-out infinite',
              '&:hover': {
                background: 'linear-gradient(135deg, #6d28d9, #9333ea)',
                transform: 'scale(1.04)',
              },
              transition: 'transform 0.2s',
            }}
          >
            Voltar ao início
          </Button>

          <Button
            onClick={() => window.history.back()}
            variant="outlined"
            size="large"
            sx={{
              borderColor: 'rgba(192,132,252,0.5)',
              color: 'rgba(192,132,252,0.85)',
              fontWeight: 600,
              px: 3,
              py: 1.5,
              borderRadius: 3,
              textTransform: 'none',
              fontSize: '1rem',
              '&:hover': {
                borderColor: '#c084fc',
                background: 'rgba(192,132,252,0.08)',
              },
              transition: 'all 0.2s',
            }}
          >
            ← Voltar
          </Button>
        </Box>

        {/* ── Footer note ───────────────────────────────────────────────── */}
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 20,
            color: 'rgba(255,255,255,0.2)',
            fontSize: '0.75rem',
            zIndex: 1,
          }}
        >
          GiraHub © {new Date().getFullYear()} — a plataforma dos terreiros
        </Typography>
      </Box>
    </>
  );
}
