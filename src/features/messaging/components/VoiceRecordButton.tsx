'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { messageService } from '../services/messageService';
import { log } from '@/lib/logger';

interface VoiceRecordButtonProps {
  conversationId: string;
  replyToId?: string;
  onRecordingStart?: () => void;
  onRecordingEnd?: () => void;
  onSendSuccess?: () => void;
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

      await messageService.sendVoiceMessage({
        conversationId,
        audioFile,
        duration,
        replyToId,
        onProgress: (progress) => setUploadProgress(progress),
      });

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
  }, [audioBlob, conversationId, duration, replyToId, clearRecording, onSendSuccess]);

  // Create audio URL for preview
  const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;

  // Clean up audio URL on unmount or when blob changes
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Preview state: show audio player with send/discard buttons
  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1.5">
        {/* Audio preview */}
        <audio
          ref={audioRef}
          src={audioUrl}
          controls
          className="h-8 w-32"
        />

        {/* Duration */}
        <span className="text-xs text-gray-500 min-w-[40px]">
          {formatDuration(duration)}
        </span>

        {/* Discard button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDiscardPreview}
          disabled={isUploading}
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
          aria-label="Discard voice message"
          title="Discard"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        {/* Send button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSend}
          disabled={isUploading}
          className="h-8 w-8 text-viber-purple hover:text-viber-purple-dark hover:bg-viber-purple/10"
          aria-label="Send voice message"
          title="Send"
        >
          {isUploading ? (
            <div className="h-4 w-4 border-2 border-viber-purple border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>

        {/* Upload progress indicator */}
        {isUploading && uploadProgress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 rounded-full overflow-hidden">
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
      <div className="flex items-center gap-2 bg-red-50 rounded-full px-3 py-1.5">
        {/* Recording indicator */}
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-600 font-medium min-w-[40px]">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Cancel button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleCancelRecording}
          className="h-8 w-8 text-gray-500 hover:text-gray-600 hover:bg-gray-100"
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
          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-100"
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
