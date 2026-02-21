'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { log } from '@/lib/logger';

interface VoiceMessagePlayerProps {
  src: string;
  duration?: number;
  isSent: boolean;
  fileName?: string;
}

// Generate random waveform bars for visualization
const generateWaveformBars = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Create a more natural waveform pattern
    const base = Math.sin(i * 0.3) * 0.3 + 0.5;
    const random = Math.random() * 0.4;
    bars.push(Math.min(1, Math.max(0.15, base + random)));
  }
  return bars;
};

/**
 * Messenger-style voice message player with waveform visualization.
 * Features play/pause button, animated waveform, and duration display.
 */
export function VoiceMessagePlayer({
  src,
  duration: initialDuration,
  isSent,
  fileName,
}: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [waveformBars] = useState(() => generateWaveformBars(28));
  const audioRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number | null>(null);

  // Format time as M:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Update current time during playback
  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!audioRef.current.paused) {
        animationRef.current = requestAnimationFrame(updateTime);
      }
    }
  }, []);

  // Handle play/pause toggle
  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    } else {
      audioRef.current.play();
      animationRef.current = requestAnimationFrame(updateTime);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, updateTime]);

  // Handle audio ended
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current && !initialDuration) {
      setDuration(audioRef.current.duration);
    }
  }, [initialDuration]);

  // Handle download
  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || `voice_message.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      log.error('[VoiceMessagePlayer] Download failed:', err);
      // Fallback: open in new tab
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  }, [src, fileName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressBarCount = Math.floor((progress / 100) * waveformBars.length);

  // Display time (show current time when playing, total duration when stopped)
  const displayTime = isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration);

  return (
    <div className="flex flex-col gap-1 min-w-[180px] max-w-[240px]">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
      />

      {/* Main row: play button + waveform */}
      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          onClick={togglePlayPause}
          className={cn(
            'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
            isSent
              ? 'bg-white/20 hover:bg-white/30 text-white'
              : 'bg-viber-purple/10 hover:bg-viber-purple/20 text-viber-purple'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" fill="currentColor" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          )}
        </button>

        {/* Waveform visualization */}
        <div className="flex-1 flex items-center gap-[2px] h-8">
          {waveformBars.map((height, index) => (
            <div
              key={index}
              className={cn(
                'w-[3px] rounded-full transition-all duration-100',
                index < progressBarCount
                  ? isSent
                    ? 'bg-white'
                    : 'bg-viber-purple'
                  : isSent
                    ? 'bg-white/40'
                    : 'bg-viber-purple/40'
              )}
              style={{
                height: `${height * 100}%`,
                minHeight: '4px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom row: duration (left) + download button (right) */}
      <div className="flex items-center justify-between pl-12">
        <span
          className={cn(
            'text-xs font-medium',
            isSent ? 'text-white/80' : 'text-gray-500'
          )}
        >
          {displayTime}
        </span>

        <button
          onClick={handleDownload}
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
            isSent
              ? 'hover:bg-white/20 text-white/70 hover:text-white'
              : 'hover:bg-viber-purple/10 text-gray-400 hover:text-viber-purple'
          )}
          aria-label="Download voice message"
          title="Download"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export default VoiceMessagePlayer;
