/**
 * Key Store
 * Zustand store for managing E2EE encryption state in memory
 *
 * This store tracks:
 * - Encryption initialization status
 * - Session states per conversation
 * - Key bundle cache
 * - Encryption errors
 */

import { create } from 'zustand';
import type {
  EncryptionInitStatus,
  ConversationEncryptionState,
} from '../types';

interface EncryptionState {
  // Global initialization status
  initStatus: EncryptionInitStatus;
  initError: string | null;

  // Per-conversation encryption state
  conversationStates: Map<string, ConversationEncryptionState>;

  // Pending key exchanges (waiting for key bundle response)
  pendingKeyExchanges: Set<string>; // Set of userIds

  // Actions
  setInitStatus: (status: EncryptionInitStatus, error?: string) => void;
  setConversationState: (conversationId: string, state: Partial<ConversationEncryptionState>) => void;
  getConversationState: (conversationId: string) => ConversationEncryptionState | undefined;
  addPendingKeyExchange: (userId: string) => void;
  removePendingKeyExchange: (userId: string) => void;
  isPendingKeyExchange: (userId: string) => boolean;
  reset: () => void;
}

const initialState = {
  initStatus: 'uninitialized' as EncryptionInitStatus,
  initError: null,
  conversationStates: new Map<string, ConversationEncryptionState>(),
  pendingKeyExchanges: new Set<string>(),
};

export const useEncryptionStore = create<EncryptionState>((set, get) => ({
  ...initialState,

  setInitStatus: (status, error) => {
    set({
      initStatus: status,
      initError: error || null,
    });
  },

  setConversationState: (conversationId, partialState) => {
    const current = get().conversationStates.get(conversationId);
    const newState: ConversationEncryptionState = {
      conversationId,
      enabled: partialState.enabled ?? current?.enabled ?? false,
      status: partialState.status ?? current?.status ?? 'none',
      sessionId: partialState.sessionId ?? current?.sessionId,
      lastKeyRotation: partialState.lastKeyRotation ?? current?.lastKeyRotation,
      error: partialState.error ?? current?.error,
    };

    set((state) => {
      const newMap = new Map(state.conversationStates);
      newMap.set(conversationId, newState);
      return { conversationStates: newMap };
    });
  },

  getConversationState: (conversationId) => {
    return get().conversationStates.get(conversationId);
  },

  addPendingKeyExchange: (userId) => {
    set((state) => {
      const newSet = new Set(state.pendingKeyExchanges);
      newSet.add(userId);
      return { pendingKeyExchanges: newSet };
    });
  },

  removePendingKeyExchange: (userId) => {
    set((state) => {
      const newSet = new Set(state.pendingKeyExchanges);
      newSet.delete(userId);
      return { pendingKeyExchanges: newSet };
    });
  },

  isPendingKeyExchange: (userId) => {
    return get().pendingKeyExchanges.has(userId);
  },

  reset: () => {
    set(initialState);
  },
}));

// Selectors for common use cases
export const selectInitStatus = (state: EncryptionState) => state.initStatus;
export const selectInitError = (state: EncryptionState) => state.initError;
export const selectIsInitialized = (state: EncryptionState) => state.initStatus === 'ready';
export const selectIsInitializing = (state: EncryptionState) => state.initStatus === 'initializing';

export const selectConversationEncryption = (conversationId: string) => (state: EncryptionState) =>
  state.conversationStates.get(conversationId);

export const selectIsConversationEncrypted = (conversationId: string) => (state: EncryptionState) =>
  state.conversationStates.get(conversationId)?.enabled ?? false;

export const selectConversationSessionStatus = (conversationId: string) => (state: EncryptionState) =>
  state.conversationStates.get(conversationId)?.status ?? 'none';
