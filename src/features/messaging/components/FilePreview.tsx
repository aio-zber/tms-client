'use client';

import React, { useState, useEffect } from 'react';
import { X, File, FileText, FileSpreadsheet, Image, Video, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Simple progress bar component
function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('w-full bg-gray-200 dark:bg-dark-border rounded-full overflow-hidden', className)}>
      <div
        className="bg-viber-purple h-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

interface FilePreviewProps {
  file: File;
  uploadProgress?: number;
  isUploading?: boolean;
  onRemove: () => void;
  className?: string;
}

/**
 * File preview component shown before sending.
 * Displays image thumbnails or file icons with metadata.
 */
export function FilePreview({
  file,
  uploadProgress = 0,
  isUploading = false,
  onRemove,
  className,
}: FilePreviewProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get file icon based on MIME type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="h-8 w-8 text-blue-500" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Video className="h-8 w-8 text-purple-500" />;
    }
    if (mimeType.startsWith('audio/')) {
      return <Music className="h-8 w-8 text-green-500" />;
    }
    if (mimeType.includes('pdf')) {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return <FileText className="h-8 w-8 text-blue-600" />;
    }
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
      return <FileSpreadsheet className="h-8 w-8 text-green-600" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  // Generate image preview for image files
  useEffect(() => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }

    // Cleanup
    return () => {
      setImagePreview(null);
    };
  }, [file]);

  // Truncate filename if too long
  const truncateFilename = (name: string, maxLength: number = 30): string => {
    if (name.length <= maxLength) return name;

    const ext = name.split('.').pop() || '';
    const nameWithoutExt = name.slice(0, name.length - ext.length - 1);
    const truncatedLength = maxLength - ext.length - 4; // 4 for "..." and "."

    return `${nameWithoutExt.slice(0, truncatedLength)}...${ext}`;
  };

  const isImage = file.type.startsWith('image/');

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      {/* File preview/icon */}
      <div className="flex-shrink-0">
        {isImage && imagePreview ? (
          <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted">
            <img
              src={imagePreview}
              alt={file.name}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-md">
            {getFileIcon(file.type)}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={file.name}>
          {truncateFilename(file.name)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>

        {/* Upload progress */}
        {isUploading && (
          <div className="mt-2">
            <ProgressBar value={uploadProgress} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              Uploading... {Math.round(uploadProgress)}%
            </p>
          </div>
        )}
      </div>

      {/* Remove button */}
      {!isUploading && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-7 w-7 absolute top-1 right-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      {/* Uploading overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-background/50 rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-muted-foreground">
              {Math.round(uploadProgress)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilePreview;
