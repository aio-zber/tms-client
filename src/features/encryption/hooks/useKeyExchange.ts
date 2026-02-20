/**
 * useKeyExchange Hook
 * Manages X3DH key exchange and sender key distribution via WebSocket
 *
 * Handles:
 * - Key bundle requests/responses
 * - Sender key distribution for groups
 * - Session establishment events
 */

import { useEffect, useCallback } from 'react';
import { socketClient } from '@/lib/socket';
import { useEncryptionStore } from '../stores/keyStore';
import {
  establishSession,
  receiveSenderKeyDistribution,
  distributeSenderKey,
} from '../services/encryptionService';

import { log } from '@/lib/logger';

interface UseKeyExchangeOptions {
  conversationId?: string;
  memberIds?: string[];
  isGroup?: boolean;
  currentUserId?: string;
}

interface UseKeyExchangeReturn {
  requestKeyBundle: (userId: string) => void;
  requestSenderKeys: (memberIds: string[]) => void;
  distributeMySenderKey: () => Promise<void>;
}

export function useKeyExchange(options: UseKeyExchangeOptions = {}): UseKeyExchangeReturn {
  const { conversationId, memberIds = [], currentUserId } = options;

  const {
    addPendingKeyExchange,
    removePendingKeyExchange,
    isPendingKeyExchange,
    setConversationState,
  } = useEncryptionStore();

  // Setup WebSocket listeners for key exchange
  useEffect(() => {
    if (!conversationId) return;

    // Handle key bundle response
    const handleKeyBundleResponse = async (data: Record<string, unknown>) => {
      const userId = data.user_id as string;
      log.encryption.debug('Received key bundle for user:', userId);

      try {
        // Establish session with received key bundle
        await establishSession(conversationId, userId);

        removePendingKeyExchange(userId);

        // Update conversation state
        setConversationState(conversationId, {
          status: 'active',
          enabled: true,
        });
      } catch (error) {
        log.encryption.error('Failed to establish session from key bundle:', error);
        removePendingKeyExchange(userId);
        setConversationState(conversationId, {
          status: 'error',
          error: (error as Error).message,
        });
      }
    };

    // Handle sender key distribution (for groups)
    const handleSenderKeyDistribution = async (data: Record<string, unknown>) => {
      const convId = data.conversation_id as string;

      // Only process for our conversation
      if (convId !== conversationId) return;

      log.encryption.debug('Received sender key distribution:', data);

      try {
        await receiveSenderKeyDistribution(data as {
          conversation_id: string;
          sender_id: string;
          key_id: string;
          chain_key: string;
          public_signing_key: string;
        });

        // Update conversation state
        setConversationState(conversationId, {
          status: 'active',
          enabled: true,
        });
      } catch (error) {
        log.encryption.error('Failed to process sender key distribution:', error);
      }
    };

    // Handle sender key request (someone asking for our sender key)
    const handleSenderKeyRequest = async (data: Record<string, unknown>) => {
      const convId = data.conversation_id as string;
      const requesterId = data.requester_id as string;

      if (convId !== conversationId || !currentUserId) return;

      log.encryption.debug('Received sender key request from:', requesterId);

      try {
        // Distribute the shared group key to the requester via the server endpoint
        await distributeSenderKey(conversationId, currentUserId, [requesterId]);
      } catch (error) {
        log.encryption.error('Failed to respond to sender key request:', error);
      }
    };

    // Attach listeners
    socketClient.onKeyBundleResponse(handleKeyBundleResponse);
    socketClient.onSenderKeyDistribution(handleSenderKeyDistribution);
    socketClient.onSenderKeyRequest(handleSenderKeyRequest);

    // Cleanup
    return () => {
      socketClient.off('key_bundle_response', handleKeyBundleResponse);
      socketClient.off('sender_key_distribution', handleSenderKeyDistribution);
      socketClient.off('sender_key_request', handleSenderKeyRequest);
    };
  }, [
    conversationId,
    currentUserId,
    removePendingKeyExchange,
    setConversationState,
  ]);

  // Request a user's key bundle
  const requestKeyBundle = useCallback(
    (userId: string) => {
      if (isPendingKeyExchange(userId)) {
        log.encryption.debug('Key exchange already pending for user:', userId);
        return;
      }

      addPendingKeyExchange(userId);
      socketClient.requestKeyBundle(userId);
      log.encryption.debug('Requested key bundle for user:', userId);
    },
    [addPendingKeyExchange, isPendingKeyExchange]
  );

  // Request sender keys from group members
  const requestSenderKeys = useCallback(
    (memberIds: string[]) => {
      if (!conversationId) return;

      socketClient.requestSenderKeys(conversationId, memberIds);
      log.encryption.debug('Requested sender keys from members:', memberIds);
    },
    [conversationId]
  );

  // Distribute our sender key to group members
  const distributeMySenderKey = useCallback(async () => {
    if (!conversationId || !currentUserId || memberIds.length === 0) {
      return;
    }

    try {
      await distributeSenderKey(conversationId, currentUserId, memberIds);
      log.encryption.info('Distributed sender key to group members');
    } catch (error) {
      log.encryption.error('Failed to distribute sender key:', error);
      throw error;
    }
  }, [conversationId, currentUserId, memberIds]);

  return {
    requestKeyBundle,
    requestSenderKeys,
    distributeMySenderKey,
  };
}

export default useKeyExchange;
