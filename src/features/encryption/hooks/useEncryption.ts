/**
 * useEncryption Hook
 * React hook for managing E2EE encryption state and operations
 *
 * Provides:
 * - Initialization status
 * - Encryption/decryption functions
 * - Session management
 * - Error handling
 */

import { useEffect, useCallback, useState } from 'react';
import { useEncryptionStore } from '../stores/keyStore';
import {
  initialize,
  isInitialized,
  establishSession,
  encryptDirectMessage,
  decryptDirectMessage,
  encryptGroupMessageContent,
  decryptGroupMessageContent,
  encryptFile,
  decryptFile,
  clearEncryptionData,
} from '../services/encryptionService';
import { hasSession } from '../services/sessionService';
import type { EncryptionInitStatus } from '../types';
import { EncryptionError } from '../types';
import { log } from '@/lib/logger';

interface UseEncryptionOptions {
  autoInitialize?: boolean;
}

interface UseEncryptionReturn {
  // Status
  initStatus: EncryptionInitStatus;
  isReady: boolean;
  error: string | null;

  // Actions
  init: () => Promise<void>;
  encryptMessage: (
    conversationId: string,
    recipientId: string,
    content: string,
    isGroup: boolean
  ) => Promise<string>;
  decryptMessage: (
    conversationId: string,
    senderId: string,
    encryptedContent: string,
    isGroup: boolean,
    encryptionMetadata?: Record<string, unknown>
  ) => Promise<string>;
  encryptFileContent: (file: File) => Promise<{
    encryptedBlob: Blob;
    metadata: { fileKey: string; nonce: string; originalSize: number; mimeType: string };
  }>;
  decryptFileContent: (
    encryptedData: ArrayBuffer,
    fileKey: string,
    nonce: string,
    mimeType: string
  ) => Promise<Blob>;
  checkSession: (conversationId: string, userId: string) => Promise<boolean>;
  setupSession: (conversationId: string, userId: string) => Promise<void>;
  clearData: () => Promise<void>;
}

export function useEncryption(options: UseEncryptionOptions = {}): UseEncryptionReturn {
  const { autoInitialize = false } = options;

  const { initStatus, initError, setInitStatus } = useEncryptionStore();
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto-initialize on mount if requested
  useEffect(() => {
    if (autoInitialize && initStatus === 'uninitialized') {
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInitialize, initStatus]);

  // Initialize encryption
  const init = useCallback(async () => {
    if (initStatus === 'ready' || initStatus === 'initializing') {
      return;
    }

    setInitStatus('initializing');
    setLocalError(null);

    try {
      await initialize();
      setInitStatus('ready');
      log.encryption.info('E2EE hook initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      setInitStatus('error', errorMessage);
      setLocalError(errorMessage);
      log.encryption.error('E2EE hook initialization failed:', error);
    }
  }, [initStatus, setInitStatus]);

  // Encrypt a message
  const encryptMessage = useCallback(
    async (
      conversationId: string,
      recipientId: string,
      content: string,
      isGroup: boolean
    ): Promise<string> => {
      if (!isInitialized()) {
        await init();
      }

      try {
        if (isGroup) {
          return await encryptGroupMessageContent(conversationId, recipientId, content);
        } else {
          const { encryptedContent } = await encryptDirectMessage(
            conversationId,
            recipientId,
            content
          );
          return encryptedContent;
        }
      } catch (error) {
        const errorMessage = error instanceof EncryptionError
          ? error.message
          : 'Encryption failed';
        setLocalError(errorMessage);
        throw error;
      }
    },
    [init]
  );

  // Decrypt a message
  const decryptMessage = useCallback(
    async (
      conversationId: string,
      senderId: string,
      encryptedContent: string,
      isGroup: boolean,
      encryptionMetadata?: Record<string, unknown>
    ): Promise<string> => {
      if (!isInitialized()) {
        await init();
      }

      try {
        if (isGroup) {
          return await decryptGroupMessageContent(conversationId, senderId, encryptedContent);
        } else {
          // Extract X3DH header from metadata if present
          const { deserializeX3DHHeader } = await import('../services/encryptionService');
          const x3dhHeader = encryptionMetadata?.x3dhHeader
            ? deserializeX3DHHeader(encryptionMetadata.x3dhHeader as string)
            : undefined;

          return await decryptDirectMessage(
            conversationId,
            senderId,
            encryptedContent,
            x3dhHeader
          );
        }
      } catch (error) {
        const errorMessage = error instanceof EncryptionError
          ? error.message
          : 'Decryption failed';
        setLocalError(errorMessage);
        throw error;
      }
    },
    [init]
  );

  // Encrypt a file
  const encryptFileContent = useCallback(
    async (file: File) => {
      if (!isInitialized()) {
        await init();
      }

      try {
        const { encryptedBlob, fileKey, nonce, metadata } = await encryptFile(file);

        // Convert keys to base64 for storage
        const { toBase64 } = await import('../services/cryptoService');

        return {
          encryptedBlob,
          metadata: {
            fileKey: toBase64(fileKey),
            nonce: toBase64(nonce),
            originalSize: metadata.originalSize,
            mimeType: metadata.mimeType,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof EncryptionError
          ? error.message
          : 'File encryption failed';
        setLocalError(errorMessage);
        throw error;
      }
    },
    [init]
  );

  // Decrypt a file
  const decryptFileContent = useCallback(
    async (
      encryptedData: ArrayBuffer,
      fileKey: string,
      nonce: string,
      mimeType: string
    ) => {
      if (!isInitialized()) {
        await init();
      }

      try {
        const { fromBase64 } = await import('../services/cryptoService');

        return await decryptFile(
          encryptedData,
          fromBase64(fileKey),
          fromBase64(nonce),
          mimeType
        );
      } catch (error) {
        const errorMessage = error instanceof EncryptionError
          ? error.message
          : 'File decryption failed';
        setLocalError(errorMessage);
        throw error;
      }
    },
    [init]
  );

  // Check if a session exists
  const checkSession = useCallback(
    async (conversationId: string, userId: string): Promise<boolean> => {
      return hasSession(conversationId, userId);
    },
    []
  );

  // Setup a session
  const setupSession = useCallback(
    async (conversationId: string, userId: string): Promise<void> => {
      if (!isInitialized()) {
        await init();
      }

      try {
        await establishSession(conversationId, userId);
      } catch (error) {
        const errorMessage = error instanceof EncryptionError
          ? error.message
          : 'Session setup failed';
        setLocalError(errorMessage);
        throw error;
      }
    },
    [init]
  );

  // Clear all encryption data
  const clearData = useCallback(async () => {
    await clearEncryptionData();
    useEncryptionStore.getState().reset();
    setLocalError(null);
  }, []);

  return {
    initStatus,
    isReady: initStatus === 'ready',
    error: localError || initError,
    init,
    encryptMessage,
    decryptMessage,
    encryptFileContent,
    decryptFileContent,
    checkSession,
    setupSession,
    clearData,
  };
}

export default useEncryption;
