/**
 * Conversation Settings Dialog
 * Manage conversation details, members, and settings
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { UserMinus, LogOut, X, UserPlus, Camera, Bell, BellOff, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConversationActions } from '../hooks/useConversationActions';
import { useConversationEvents } from '../hooks/useConversationEvents';
import { useConversationQuery } from '../hooks/useConversationsQuery';
import { useUserSearch } from '@/features/users/hooks/useUserSearch';
import { UserProfileDialog } from '@/features/users/components/UserProfileDialog';
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences';
import { useNotificationStore } from '@/store/notificationStore';
import { uploadConversationAvatar } from '../services/conversationService';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { Conversation, ConversationMember } from '@/types/conversation';
import type { UserSearchResult } from '@/types/user';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { MediaHistoryTab } from './MediaHistoryTab';

const SecurityTab = lazy(() => import('@/features/encryption/components/SecurityTab'));

interface ConversationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  currentUserId: string;
  onUpdate: () => void;
  onLeave?: () => void;
}

export default function ConversationSettingsDialog({
  open,
  onOpenChange,
  conversation,
  currentUserId,
  onUpdate,
  onLeave,
}: ConversationSettingsDialogProps) {
  const [conversationName, setConversationName] = useState(conversation.name || '');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedUserData, setSelectedUserData] = useState<Map<string, UserSearchResult>>(new Map());
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<string | undefined>(undefined);
  const [selectedMemberData, setSelectedMemberData] = useState<ConversationMember['user'] | undefined>(undefined);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    updateConversation,
    addMembers,
    removeMember,
    leaveConversation,
    isUpdating,
    isAddingMembers,
    isRemovingMember,
    isLeaving,
  } = useConversationActions();

  const { query, results, isSearching, search, clearSearch } = useUserSearch();

  // Load all users when Add Members is opened (same pattern as NewConversationDialog)
  const [allUsers, setAllUsers] = useState<UserSearchResult[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const loadAllUsers = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const { tmsApi } = await import('@/lib/tmsApi');
      const tmsUsers = await tmsApi.searchUsers('', 100);
      const transformedUsers: UserSearchResult[] = tmsUsers.map((user) => ({
        id: user.id,
        tmsUserId: user.tmsUserId || user.id,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        image: user.image,
        positionTitle: user.positionTitle,
        division: user.division,
        department: user.department,
        section: user.section,
        customTeam: user.customTeam,
        isActive: user.isActive,
      }));
      setAllUsers(transformedUsers);
    } catch {
      search('a');
    } finally {
      setLoadingInitial(false);
    }
  }, [search]);

  useEffect(() => {
    if (showAddMembers && allUsers.length === 0) {
      loadAllUsers();
    }
  }, [showAddMembers, allUsers.length, loadAllUsers]);

  // Show search results when searching, all users otherwise
  const displayUsers = useMemo(() => {
    return query ? results : allUsers;
  }, [query, results, allUsers]);

  // Mute conversation (Messenger pattern)
  const { muteConversation, unmuteConversation, isMutingConversation, isUnmutingConversation } = useNotificationPreferences();
  const mutedConversations = useNotificationStore((state) => state.mutedConversations);
  const isMuted = mutedConversations.has(conversation.id);

  const handleToggleMute = () => {
    if (isMuted) {
      unmuteConversation(conversation.id);
    } else {
      muteConversation(conversation.id);
    }
  };

  // Fetch live conversation data with TanStack Query (real-time updates via cache invalidation)
  const { conversation: liveConversation } = useConversationQuery(conversation.id, true);

  // Use live data if available, fallback to prop
  const currentConversation = liveConversation || conversation;

  // Listen for real-time conversation updates (member_added, member_removed, member_left, conversation_updated)
  useConversationEvents({
    conversationId: conversation.id,
    showNotifications: false  // Avoid duplicate toasts - we show our own in action handlers
  });

  // Real-time updates handled automatically via:
  // 1. useConversationEvents - triggers query invalidation for conversation_updated events
  // 2. useMessages - triggers query invalidation for system messages (member changes)
  // 3. useConversationActions - triggers query invalidation after mutations
  // No polling needed!

  useEffect(() => {
    setConversationName(conversation.name || '');
  }, [conversation.name]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpdateName = () => {
    if (!conversationName.trim() || conversationName === conversation.name) {
      return;
    }

    // Toast notifications now handled by the hook
    updateConversation(conversation.id, {
      name: conversationName.trim(),
    });

    onUpdate();
  };

  const handleAddMembers = () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    // Toast notifications now handled by the hook
    addMembers(conversation.id, selectedUsers);

    setSelectedUsers([]);
    setSelectedUserData(new Map());
    setShowAddMembers(false);
    clearSearch();
    onUpdate();
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this conversation?`)) return;

    // Toast notifications now handled by the hook
    removeMember(conversation.id, memberId);

    onUpdate();
  };

  const handleLeaveConversation = () => {
    if (!confirm('Are you sure you want to leave this conversation?')) return;

    // Toast notifications now handled by the hook
    leaveConversation(conversation.id);

    onOpenChange(false);
    onLeave?.();
  };

  const handleUserToggle = useCallback((tmsUserId: string, user?: UserSearchResult) => {
    setSelectedUsers((prev) => {
      if (prev.includes(tmsUserId)) {
        setSelectedUserData((prevData) => {
          const newData = new Map(prevData);
          newData.delete(tmsUserId);
          return newData;
        });
        return prev.filter((id) => id !== tmsUserId);
      } else {
        if (user) {
          setSelectedUserData((prevData) => new Map(prevData).set(tmsUserId, user));
        }
        return [...prev, tmsUserId];
      }
    });
  }, []);

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const updatedConversation = await uploadConversationAvatar(conversation.id, file);

      // Immediately update the cache with the new avatar URL (Messenger/Telegram pattern)
      // This ensures the sidebar updates instantly without waiting for refetch
      queryClient.setQueryData(
        queryKeys.conversations.detail(conversation.id),
        updatedConversation
      );

      // Also invalidate the conversations list to trigger a refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });

      toast.success('Group avatar updated successfully');
      onUpdate();
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      toast.error('Failed to upload avatar. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      // Reset the input so the same file can be selected again
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const isGroup = currentConversation.type === 'group';
  const members = currentConversation.members || [];
  const currentUserIsMember = members.some((m: ConversationMember) => m.userId === currentUserId);
  const currentUserMember = members.find((m: ConversationMember) => m.userId === currentUserId);
  const currentUserIsAdmin = currentUserMember?.role === 'admin';

  // Security tab: only for DMs (safety numbers are per-pair), not groups
  const [isE2EEReady, setIsE2EEReady] = useState(false);
  useEffect(() => {
    import('@/features/encryption')
      .then(({ encryptionService }) => {
        setIsE2EEReady(encryptionService.isInitialized());
      })
      .catch(() => setIsE2EEReady(false));
  }, [open]);
  const showSecurityTab = isE2EEReady && !isGroup;
  // tabCount: Details + (Members if group) + Media + (Security if DM + E2EE ready)
  const tabCount = (isGroup ? 2 : 1) + 1 + (showSecurityTab ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Conversation Settings</DialogTitle>
          <DialogDescription>
            Manage conversation details and members
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className={`grid w-full grid-cols-${tabCount}`}>
            <TabsTrigger value="details">Details</TabsTrigger>
            {isGroup && <TabsTrigger value="members">Members ({members.length})</TabsTrigger>}
            <TabsTrigger value="media">Media</TabsTrigger>
            {showSecurityTab && (
              <TabsTrigger value="security" className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Security
              </TabsTrigger>
            )}
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
            {/* Group Avatar */}
            {isGroup && (
              <div className="space-y-2">
                <Label>Group Avatar</Label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Avatar className="w-20 h-20 cursor-pointer" onClick={handleAvatarClick}>
                      <AvatarImage src={currentConversation.avatarUrl} />
                      <AvatarFallback className="bg-viber-purple text-white text-xl">
                        {getInitials(currentConversation.name || 'Group')}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      onClick={handleAvatarClick}
                      disabled={isUploadingAvatar}
                      className="absolute bottom-0 right-0 bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full p-1.5 shadow-md transition-colors disabled:opacity-50"
                    >
                      {isUploadingAvatar ? (
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
                    <p>Click to change the group avatar</p>
                    <p className="text-xs">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* Conversation Name */}
            {isGroup && (
              <div className="space-y-2">
                <Label htmlFor="conv-name">Group Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="conv-name"
                    value={conversationName}
                    onChange={(e) => setConversationName(e.target.value)}
                    placeholder="Enter group name..."
                  />
                  <Button
                    onClick={handleUpdateName}
                    disabled={isUpdating || !conversationName.trim() || conversationName === conversation.name}
                    className="bg-viber-purple hover:bg-viber-purple-dark text-white"
                  >
                    Update
                  </Button>
                </div>
              </div>
            )}

            {/* Conversation Info */}
            <div className="space-y-2">
              <Label>Type</Label>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {isGroup ? 'Group Conversation' : 'Direct Message'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Created</Label>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                {new Date(conversation.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Mute Notifications (Messenger-style) */}
            <div className="pt-4 border-t dark:border-dark-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isMuted ? (
                    <BellOff className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
                  ) : (
                    <Bell className="w-5 h-5 text-viber-purple" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Mute Notifications</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {isMuted
                        ? 'You won\'t be notified except for @mentions'
                        : 'Receive all notifications for this conversation'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleMute}
                  disabled={isMutingConversation || isUnmutingConversation}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-viber-purple focus:ring-offset-2 disabled:opacity-50 ${
                    isMuted ? 'bg-viber-purple' : 'bg-gray-300 dark:bg-dark-border'
                  }`}
                  role="switch"
                  aria-checked={isMuted}
                  aria-label="Mute notifications"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isMuted ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Leave Conversation Button */}
            {isGroup && currentUserIsMember && (
              <div className="pt-4 border-t dark:border-dark-border">
                <Button
                  variant="destructive"
                  onClick={handleLeaveConversation}
                  disabled={isLeaving}
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Leave Conversation
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Members Tab */}
          {isGroup && (
            <TabsContent value="members" className="space-y-4">
              {/* Add Members Section - Only show to admins */}
              {currentUserIsAdmin && (
                <>
                  {!showAddMembers ? (
                    <Button
                      onClick={() => setShowAddMembers(true)}
                      className="w-full bg-viber-purple hover:bg-viber-purple-dark text-white"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Members
                    </Button>
                  ) : (
                <div className="space-y-3 p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Add Members</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddMembers(false);
                        setSelectedUsers([]);
                        setSelectedUserData(new Map());
                        clearSearch();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Selected Users */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((userId) => {
                        const user = selectedUserData.get(userId);
                        if (!user) return null;
                        return (
                          <div
                            key={userId}
                            className="bg-viber-purple/10 border border-viber-purple rounded-full px-3 py-1 text-sm flex items-center gap-2"
                          >
                            {user.name || user.email}
                            <button onClick={() => handleUserToggle(userId)}>
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Search Input */}
                  <Input
                    placeholder="Search users..."
                    value={query}
                    onChange={(e) => search(e.target.value)}
                  />

                  {/* Search Results / All Users */}
                  <ScrollArea className="h-40 border dark:border-dark-border rounded-lg bg-white dark:bg-dark-surface">
                    {isSearching || loadingInitial ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
                          {loadingInitial ? 'Loading users...' : 'Searching...'}
                        </div>
                      </div>
                    ) : displayUsers.filter((u) => !members.some((m: ConversationMember) => m.userId === u.tmsUserId)).length > 0 ? (
                      <div className="p-2">
                        {displayUsers
                          .filter((u) => !members.some((m: ConversationMember) => m.userId === u.tmsUserId))
                          .map((user) => {
                            const isSelected = selectedUsers.includes(user.tmsUserId);
                            return (
                              <button
                                key={user.tmsUserId}
                                onClick={() => handleUserToggle(user.tmsUserId, user)}
                                className={`w-full flex items-center gap-3 p-2 rounded transition-colors ${
                                  isSelected
                                    ? 'bg-viber-purple/10 border border-viber-purple'
                                    : 'border border-transparent hover:bg-gray-50 dark:hover:bg-dark-border'
                                }`}
                              >
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={user.image} />
                                  <AvatarFallback className="bg-viber-purple text-white text-xs">
                                    {getInitials(user.name || user.email)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 text-left text-sm">
                                  <div className="font-medium">{user.name || user.email}</div>
                                  <div className="text-xs text-gray-500 dark:text-dark-text-secondary">{user.email}</div>
                                </div>
                                {isSelected && (
                                  <div className="text-viber-purple">✓</div>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    ) : query ? (
                      <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-dark-text-secondary">
                        No users found
                      </div>
                    ) : null}
                  </ScrollArea>

                  {/* Add Button */}
                  <Button
                    onClick={handleAddMembers}
                    disabled={selectedUsers.length === 0 || isAddingMembers}
                    className="w-full bg-viber-purple hover:bg-viber-purple-dark text-white"
                  >
                    Add Selected Members
                  </Button>
                </div>
                  )}
                </>
              )}

              {/* Members List */}
              <div className="space-y-2">
                <Label>Members</Label>
                <ScrollArea className="h-60 border dark:border-dark-border rounded-lg">
                  <div className="p-2">
                    {members.map((member: ConversationMember) => {
                      const isCurrentUser = member.userId === currentUserId;
                      const displayName = member.user?.name || member.user?.email || member.userId;
                      const userImage = member.user?.image;

                      return (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-border transition"
                        >
                          <div
                            className="flex items-center gap-3 flex-1 cursor-pointer"
                            onClick={() => {
                              setSelectedMemberProfile(member.userId);
                              setSelectedMemberData(member.user);
                              setShowProfileDialog(true);
                            }}
                          >
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={userImage} />
                              <AvatarFallback className="bg-viber-purple text-white">
                                {getInitials(displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">
                                {displayName}
                                {isCurrentUser && ' (You)'}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-dark-text-secondary capitalize">
                                {member.role || 'member'}
                              </div>
                            </div>
                          </div>

                          {!isCurrentUser && currentUserIsAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveMember(member.userId, displayName);
                              }}
                              disabled={isRemovingMember}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          )}

          {/* Media History Tab */}
          <TabsContent value="media">
            <MediaHistoryTab conversationId={conversation.id} />
          </TabsContent>

          {/* Security Tab */}
          {showSecurityTab && (
            <TabsContent value="security">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-viber-purple" />
                  </div>
                }
              >
                <SecurityTab
                  conversation={currentConversation}
                  currentUserId={currentUserId}
                />
              </Suspense>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>

      {/* User Profile Dialog */}
      <UserProfileDialog
        userId={selectedMemberProfile}
        userData={selectedMemberData}
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        showSendMessageButton={selectedMemberProfile !== currentUserId}
      />
    </Dialog>
  );
}
