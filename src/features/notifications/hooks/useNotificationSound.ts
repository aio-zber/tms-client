/**
 * useNotificationSound Hook
 * Plays notification sound with volume control and rate limiting.
 * Uses Web Audio API to synthesize a short chime — no external files needed.
 * Per-type gating: sound only plays when a notification is actually created,
 * which already respects the enableXNotifications preference flags.
 */

import { useCallback, useRef } from 'react';
import type { NotificationPreferences } from '../types';
import { checkDndActive } from './useDndStatus';
import { log } from '@/lib/logger';

// Rate limiting: Max 1 sound per 2 seconds
const SOUND_RATE_LIMIT_MS = 2000;

/**
 * Synthesize a short Messenger-style notification chime via Web Audio API.
 * Two-tone: high note (880 Hz) fades into a lower note (660 Hz).
 */
function playChime(volume: number, audioCtx: AudioContext): void {
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);

  const tones = [
    { freq: 880, start: 0, duration: 0.12 },
    { freq: 660, start: 0.1, duration: 0.2 },
  ];

  for (const { freq, start, duration } of tones) {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    const now = audioCtx.currentTime;
    oscGain.gain.setValueAtTime(0, now + start);
    oscGain.gain.linearRampToValueAtTime(volume, now + start + 0.01);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

    osc.connect(oscGain);
    oscGain.connect(gain);

    osc.start(now + start);
    osc.stop(now + start + duration + 0.05);
  }
}

/**
 * Hook for playing notification sounds.
 * Sound respects per-type notification toggles implicitly — this hook is
 * called only when a notification is actually created (after type filtering).
 */
export function useNotificationSound(preferences: NotificationPreferences) {
  const lastPlayedRef = useRef<number>(0);
  // Lazily created — avoids "AudioContext not allowed before user gesture" issues
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(() => {
    if (!preferences.soundEnabled) return;

    if (checkDndActive(preferences)) {
      log.notification.debug('DND active - skipping sound');
      return;
    }

    const now = Date.now();
    if (now - lastPlayedRef.current < SOUND_RATE_LIMIT_MS) {
      log.notification.debug('Sound rate limit - skipping');
      return;
    }

    try {
      // Create AudioContext on first use (requires prior user gesture to unlock)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }

      const ctx = audioCtxRef.current;

      // Resume context if suspended (browser autoplay policy)
      const run = () => {
        playChime((preferences.soundVolume || 75) / 100, ctx);
        lastPlayedRef.current = Date.now();
        log.notification.debug('Notification sound played');
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(run).catch((err) => {
          log.notification.warn('AudioContext resume failed:', err);
        });
      } else {
        run();
      }
    } catch (error) {
      log.notification.error('Failed to play notification sound:', error);
    }
  }, [preferences]);

  return { playSound };
}
