/**
 * T044: useGiraCountdown Hook
 * Countdown timer for gira emission window
 * Updates every second to show time remaining until emission opens/closes
 */

import { useState, useEffect } from 'react';


interface UseGiraCountdownReturn {
  timeRemaining: number; // seconds
  isOpen: boolean;
  isClosed: boolean;
  percentRemaining: number; // 0-100
  status: 'unconfigured' | 'upcoming' | 'open' | 'closed';
}


export function useGiraCountdown(
  releaseStartAt: string | null,
  releaseEndAt: string | null,
): UseGiraCountdownReturn {
  /**
   * Hook to track countdown until gira emission window
   *
   * Features:
   * - Real-time countdown (updates every second)
   * - Status tracking (upcoming, open, closed)
   * - Percentage calculation for progress bars
   * - Handles timezone conversion to UTC
   *
   * Usage:
   * const { timeRemaining, isOpen, status } = useGiraCountdown(
   *   '2026-03-15T18:00:00Z',
   *   '2026-03-15T23:59:59Z'
   * );
   *
   * Args:
   * - releaseStartAt: ISO 8601 timestamp when emission opens
   * - releaseEndAt: ISO 8601 timestamp when emission closes
   *
   * Returns:
   * - timeRemaining: Seconds until next state change
   * - isOpen: True if can emit now
   * - isClosed: True if already closed
   * - percentRemaining: % of total emission window remaining
   * - status: 'upcoming' | 'open' | 'closed'
   */

  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [status, setStatus] = useState<'unconfigured' | 'upcoming' | 'open' | 'closed'>('upcoming');

  // Sem janela de emissão configurada (null ou timestamp inválido): estado
  // próprio, distinto de "encerrado" — new Date('') seria Invalid Date e
  // cairia silenciosamente no branch de closed.
  const hasWindow =
    !!releaseStartAt &&
    !!releaseEndAt &&
    !Number.isNaN(new Date(releaseStartAt).getTime()) &&
    !Number.isNaN(new Date(releaseEndAt).getTime());

  useEffect(() => {
    if (!hasWindow) {
      setTimeRemaining(0);
      setIsOpen(false);
      setIsClosed(false);
      setStatus('unconfigured');
      return;
    }

    const calculateCountdown = () => {
      const now = new Date();
      const startTime = new Date(releaseStartAt as string);
      const endTime = new Date(releaseEndAt as string);

      // Determine current status
      if (now < startTime) {
        // Emission not yet open
        const difference = Math.floor((startTime.getTime() - now.getTime()) / 1000);
        setTimeRemaining(Math.max(0, difference));
        setIsOpen(false);
        setIsClosed(false);
        setStatus('upcoming');
      } else if (now >= startTime && now < endTime) {
        // Emission is open
        const windowDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        const remaining = Math.max(0, windowDuration - elapsed);

        setTimeRemaining(remaining);
        setIsOpen(true);
        setIsClosed(false);
        setStatus('open');
      } else {
        // Emission has closed
        setTimeRemaining(0);
        setIsOpen(false);
        setIsClosed(true);
        setStatus('closed');
      }
    };

    // Initial calculation
    calculateCountdown();

    // Update every second
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [releaseStartAt, releaseEndAt, hasWindow]);

  // Calculate percentage of emission window
  let percentRemaining = 0;
  if (hasWindow) {
    const startTime = new Date(releaseStartAt as string);
    const endTime = new Date(releaseEndAt as string);
    const totalDuration = (endTime.getTime() - startTime.getTime()) / 1000;
    percentRemaining =
      totalDuration > 0 ? Math.max(0, Math.min(100, (timeRemaining / totalDuration) * 100)) : 0;
  }

  return {
    timeRemaining,
    isOpen,
    isClosed,
    percentRemaining,
    status,
  };
}

/**
 * Helper formatter for display — includes days when > 24h
 */
export function formatCountdownDisplay(seconds: number): string {
  if (seconds <= 0) {
    return 'Inativo';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Parse countdown seconds into individual components
 */
export function parseCountdownParts(seconds: number) {
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}
