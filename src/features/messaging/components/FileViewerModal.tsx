'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText, FileSpreadsheet, File, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileViewerModalProps {
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  onClose: () => void;
}

/**
 * File viewer modal following Telegram/Messenger patterns:
 * - Images: Display inline with zoom controls
 * - PDFs/Documents: Show file card with view/download options
 * - Uses browser's native viewers (open in new tab) for reliability
 */
export function FileViewerModal({
  fileUrl,
  fileName,
  mimeType = '',
  onClose,
}: FileViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Determine file type
  const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isImage = mimeType.startsWith('image/');
  const isExcel =
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    fileName.toLowerCase().endsWith('.xls') ||
    fileName.toLowerCase().endsWith('.xlsx');
  const isWord =
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    fileName.toLowerCase().endsWith('.doc') ||
    fileName.toLowerCase().endsWith('.docx');
  const isDocument = isPdf || isExcel || isWord;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Get file icon based on type
  const getFileIcon = () => {
    if (isPdf) return <FileText className="h-20 w-20 text-red-500" />;
    if (isWord) return <FileText className="h-20 w-20 text-blue-600" />;
    if (isExcel) return <FileSpreadsheet className="h-20 w-20 text-green-600" />;
    return <File className="h-20 w-20 text-gray-400" />;
  };

  // Get file type label
  const getFileTypeLabel = () => {
    if (isPdf) return 'PDF Document';
    if (isExcel) return 'Excel Spreadsheet';
    if (isWord) return 'Word Document';
    return 'File';
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Handle download - fetch and save with proper filename
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(fileUrl, '_blank');
    }
  };

  // Open file in browser's native viewer (new tab)
  const handleViewInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  };

  // Open in Google Docs/Sheets viewer (for office documents)
  const handleViewInGoogle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=false`;
    window.open(googleViewerUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={handleBackdropClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3 text-white min-w-0 flex-1">
          <span className="text-sm font-medium truncate">
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Download"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-10 w-10 text-white hover:bg-white/20"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {/* Image Viewer */}
        {isImage && !hasError && (
          <>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-12 w-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <img
              src={fileUrl}
              alt={fileName}
              className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${
                isLoading ? 'opacity-0' : 'opacity-100'
              }`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              draggable={false}
            />
          </>
        )}

        {/* Document Viewer Card (PDF, Word, Excel) */}
        {(isDocument || (!isImage && !hasError)) && (
          <div className="flex flex-col items-center gap-6 text-white p-8 bg-gray-800/60 rounded-2xl max-w-sm w-full backdrop-blur-sm">
            {getFileIcon()}

            <div className="text-center w-full">
              <p className="text-lg font-medium mb-1 truncate px-2" title={fileName}>
                {fileName}
              </p>
              <p className="text-sm text-gray-400">
                {getFileTypeLabel()}
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full">
              {/* Primary action: View in browser */}
              <Button
                onClick={handleViewInBrowser}
                className="w-full bg-viber-purple hover:bg-viber-purple-dark h-11"
              >
                <Eye className="h-4 w-4 mr-2" />
                {isPdf ? 'View PDF' : 'Open File'}
              </Button>

              {/* Secondary: Google Viewer for Office docs */}
              {(isExcel || isWord) && (
                <Button
                  onClick={handleViewInGoogle}
                  variant="outline"
                  className="w-full border-white/30 text-white hover:bg-white/10 h-11"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View in Google {isExcel ? 'Sheets' : 'Docs'}
                </Button>
              )}

              {/* Download */}
              <Button
                onClick={handleDownload}
                variant="ghost"
                className="w-full text-gray-300 hover:text-white hover:bg-white/10 h-11"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="flex flex-col items-center gap-6 text-white p-8 bg-gray-800/60 rounded-2xl max-w-sm">
            <File className="h-20 w-20 text-gray-400" />
            <div className="text-center">
              <p className="text-lg font-medium mb-2">{fileName}</p>
              <p className="text-sm text-gray-400">
                Unable to preview this file
              </p>
            </div>
            <Button
              onClick={handleDownload}
              className="bg-viber-purple hover:bg-viber-purple-dark"
            >
              <Download className="h-4 w-4 mr-2" />
              Download File
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileViewerModal;
