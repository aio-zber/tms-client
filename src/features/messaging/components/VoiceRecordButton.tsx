'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Mic, Square, Send, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { messageService } from '../services/messageService';
import { transformServerMessage } from '../hooks/useMessages';
import { log } from '@/lib/logger';
import type { Message } from '@/types/message';

// Generate random waveform bars for preview visualization
const generatePreviewBars = (): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < 20; i++) {
    const base = Math.sin(i * 0.3) * 0.3 + 0.5;
    const random = Math.random() * 0.4;
    bars.push(Math.min(1, Math.max(0.2, base + random)));
  }
  return bars;
};

interface VoiceRecordButtonProps {
  conversationId: string;
  replyToId?: string;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  onSendSuccess?: () => void;
  /** Callback when voice message is uploaded - used for optimistic UI updates */
  onVoiceUploaded?: (message: Message) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Voice recording button with recording UI and preview states.
 * Follows Viber/Telegram voice message patterns.
 */
export function VoiceRecordButton({
  conversationId,
  replyToId,
  onRecordingStart,
  onRecordingEnd,
  onSendSuccess,
  onVoiceUploaded,
  disabled = false,
  className,
}: VoiceRecordButtonProps) {
  const {
    isRecording,
    duration,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearRecording,
    permissionStatus,
  } = useVoiceRecorder();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewBars] = useState(() => generatePreviewBars());
  const audioRef = useRef<HTMLAudioElement>(null);

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Notify parent of recording state changes
  useEffect(() => {
    if (isRecording) {
      onRecordingStart?.();
    } else {
      onRecordingEnd?.();
    }
  }, [isRecording, onRecordingStart, onRecordingEnd]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  // Handle start recording
  const handleStartRecording = useCallback(async () => {
    if (disabled || isUploading) return;
    await startRecording();
  }, [disabled, isUploading, startRecording]);

  // Handle stop recording
  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  // Handle cancel recording
  const handleCancelRecording = useCallback(() => {
    cancelRecording();
  }, [cancelRecording]);

  // Handle discard preview
  const handleDiscardPreview = useCallback(() => {
    clearRecording();
  }, [clearRecording]);

  // Handle send voice message
  const handleSend = useCallback(async () => {
    if (!audioBlob) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create a File from the Blob
      const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, {
        type: audioBlob.type || 'audio/webm',
      });

      const rawMessage = await messageService.sendVoiceMessage({
        conversationId,
        audioFile,
        duration,
        replyToId,
        onProgress: (progress) => setUploadProgress(progress),
      });

      // Transform and add to UI immediately (Messenger/Telegram pattern)
      if (rawMessage && onVoiceUploaded) {
        const message = transformServerMessage(rawMessage as unknown as Record<string, unknown>);
        log.info('[VoiceRecordButton] Voice uploaded, adding to UI:', message.id);
        onVoiceUploaded(message);
      }

      // Success
      clearRecording();
      onSendSuccess?.();
      toast.success('Voice message sent');
    } catch (err) {
      log.error('Failed to send voice message:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send voice message');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [audioBlob, conversationId, duration, replyToId, clearRecording, onSendSuccess, onVoiceUploaded]);

  // Create a stable audio URL for preview — only recreated when the blob changes
  // Using useMemo avoids creating a new object URL on every render
  const audioUrl = useMemo(() => {
    if (!audioBlob) return null;
    return URL.createObjectURL(audioBlob);
  }, [audioBlob]);

  // Revoke the object URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Reset playing state whenever a new recording is loaded
  useEffect(() => {
    setIsPreviewPlaying(false);
  }, [audioBlob]);

  // Toggle preview playback
  const togglePreviewPlayback = useCallback(() => {
    if (!audioRef.current) return;

    if (isPreviewPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPreviewPlaying(!isPreviewPlaying);
  }, [isPreviewPlaying]);

  // Preview state: show waveform player with send/discard buttons
  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-2 bg-gray-100 dark:bg-dark-bg rounded-2xl px-3 py-2 relative">
        {/* Hidden audio element — key forces remount when URL changes so the browser loads the new blob */}
        <audio
          key={audioUrl}
          ref={audioRef}
          src={audioUrl ?? undefined}
          onEnded={() => setIsPreviewPlaying(false)}
          preload="auto"
        />

        {/* Play/Pause button */}
        <button
          onClick={togglePreviewPlayback}
          disabled={isUploading}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-viber-purple/10 hover:bg-viber-purple/20 text-viber-purple transition-colors"
          aria-label={isPreviewPlaying ? 'Pause' : 'Play'}
        >
          {isPreviewPlaying ? (
            <Pause className="w-3.5 h-3.5" fill="currentColor" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
          )}
        </button>

        {/* Waveform visualization */}
        <div className="flex items-center gap-[2px] h-6 flex-1">
          {previewBars.map((height, index) => (
            <div
              key={index}
              className="w-[2px] rounded-full bg-viber-purple/60"
              style={{ height: `${height * 100}%`, minHeight: '3px' }}
            />
          ))}
        </div>

        {/* Duration */}
        <span className="text-xs text-gray-500 dark:text-dark-text-secondary min-w-[36px] text-right">
          {formatDuration(duration)}
        </span>

        {/* Discard button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDiscardPreview}
          disabled={isUploading}
          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          aria-label="Discard voice message"
          title="Discard"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        {/* Send button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={isUploading}
          className="h-7 w-7 text-viber-purple hover:text-viber-purple-dark hover:bg-viber-purple/10"
          aria-label="Send voice message"
          title="Send"
        >
          {isUploading ? (
            <div className="h-3.5 w-3.5 border-2 border-viber-purple border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Upload progress indicator */}
        {isUploading && uploadProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-dark-border rounded-full overflow-hidden">
            <div
              className="h-full bg-viber-purple transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // Recording state: show recording indicator with stop/cancel buttons
  if (isRecording) {
    return (
      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 rounded-full px-3 py-1.5">
        {/* Recording indicator */}
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-600 dark:text-red-400 font-medium min-w-[40px]">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Cancel button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCancelRecording}
          className="h-8 w-8 text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-border"
          aria-label="Cancel recording"
          title="Cancel"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {/* Stop button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleStopRecording}
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-950/30"
          aria-label="Stop recording"
          title="Stop"
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      </div>
    );
  }

  // Idle state: show microphone button
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleStartRecording}
      disabled={disabled || permissionStatus === 'denied'}
      className={cn(
        'h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        permissionStatus === 'denied' && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-label="Record voice message"
      title={
        permissionStatus === 'denied'
          ? 'Microphone access denied'
          : 'Record voice message'
      }
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
}

export default VoiceRecordButton;
