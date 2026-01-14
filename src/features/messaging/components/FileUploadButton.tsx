'use client';

import React, { useRef, useCallback } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// File type and size constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_FILE_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Videos
  'video/mp4',
  'video/quicktime',
  'video/webm',
  // Audio
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Accept attribute for file input
const ACCEPT_ATTRIBUTE = [
  'image/*',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
].join(',');

interface FileUploadButtonProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * File upload button component.
 * Handles file selection with validation for type and size.
 * Follows Telegram/Messenger patterns.
 */
export function FileUploadButton({
  onFileSelect,
  disabled = false,
  className,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Validate file type
  const isValidFileType = useCallback((file: File): boolean => {
    // Check exact MIME type
    if (ALLOWED_FILE_TYPES.includes(file.type)) {
      return true;
    }

    // Check generic types (image/*, audio/*, video/*)
    const genericTypes = ['image/', 'audio/', 'video/'];
    for (const type of genericTypes) {
      if (file.type.startsWith(type)) {
        return true;
      }
    }

    return false;
  }, []);

  // Handle file selection
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0) {
        return;
      }

      const file = files[0];

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(
          `File too large (${formatFileSize(file.size)}). Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`
        );
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Validate file type
      if (!isValidFileType(file)) {
        toast.error(`File type not supported: ${file.type || 'unknown'}`);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // File is valid - pass to parent
      onFileSelect(file);

      // Reset input for next selection
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onFileSelect, isValidFileType]
  );

  // Trigger file input click
  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        data-testid="file-input"
      />

      {/* Upload button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        aria-label="Upload file"
        title="Attach file (images, videos, documents)"
      >
        <Paperclip className="h-5 w-5" />
      </Button>
    </>
  );
}

export default FileUploadButton;
