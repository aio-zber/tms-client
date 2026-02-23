/**
 * Conversation Settings Dialog
 * Groups: Members tab (avatar, name, add/remove, mute, leave) + Media tab
 * DMs: Media tab only (profile info is in UserProfileDialog)
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { UserMinus, LogOut, X, UserPlus, Camera, Bell, BellOff } from 'lucide-react';
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
    addMembers(conversation.id, selectedUsers);
    setSelectedUsers([]);
    setSelectedUserData(new Map());
    setShowAddMembers(false);
    clearSearch();
    onUpdate();
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this conversation?`)) return;
    removeMember(conversation.id, memberId);
    onUpdate();
  };

  const handleLeaveConversation = () => {
    if (!confirm('Are you sure you want to leave this conversation?')) return;
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

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const updatedConversation = await uploadConversationAvatar(conversation.id, file);

      queryClient.setQueryData(
        queryKeys.conversations.detail(conversation.id),
        updatedConversation
      );
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isGroup ? 'Group Settings' : 'Conversation'}
          </DialogTitle>
          <DialogDescription>
            {isGroup ? 'Manage group members and settings' : 'Shared media and files'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={isGroup ? 'members' : 'media'} className="w-full">
          <TabsList className={`grid w-full ${isGroup ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isGroup && <TabsTrigger value="members">Members ({members.length})</TabsTrigger>}
            <TabsTrigger value="media">Media &amp; Files</TabsTrigger>
          </TabsList>

          {/* Members Tab (groups only) — includes group name, avatar, mute, leave */}
          {isGroup && (
            <TabsContent value="members">
              <ScrollArea className="max-h-[55vh]">
              <div className="space-y-4 pr-1">
              {/* Group Identity: Avatar + Name */}
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <Avatar className="w-16 h-16 cursor-pointer" onClick={handleAvatarClick}>
                    <AvatarImage src={currentConversation.avatarUrl} />
                    <AvatarFallback className="bg-viber-purple text-white text-lg">
                      {getInitials(currentConversation.name || 'Group')}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={handleAvatarClick}
                    disabled={isUploadingAvatar}
                    className="absolute bottom-0 right-0 bg-viber-purple hover:bg-viber-purple-dark text-white rounded-full p-1.5 shadow-md transition-colors disabled:opacity-50"
                  >
                    {isUploadingAvatar ? (
                      <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2">
                    <Input
                      value={conversationName}
                      onChange={(e) => setConversationName(e.target.value)}
                      placeholder="Group name..."
                      className="flex-1"
                    />
                    <Button
                      onClick={handleUpdateName}
                      disabled={isUpdating || !conversationName.trim() || conversationName === conversation.name}
                      className="bg-viber-purple hover:bg-viber-purple-dark text-white flex-shrink-0"
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">JPEG, PNG, GIF, or WebP (max 5MB)</p>
                </div>
              </div>

              {/* Mute toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border dark:border-dark-border">
                <div className="flex items-center gap-3">
                  {isMuted ? (
                    <BellOff className="w-5 h-5 text-gray-400" />
                  ) : (
                    <Bell className="w-5 h-5 text-viber-purple" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Mute Notifications</p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {isMuted ? "Won't be notified except @mentions" : 'Receive all notifications'}
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

              {/* Add Members (admin only) */}
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

                      <Input
                        placeholder="Search users..."
                        value={query}
                        onChange={(e) => search(e.target.value)}
                      />

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
              <div className="space-y-1">
                <Label className="text-xs uppercase text-gray-400 tracking-wide">
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </Label>
                <ScrollArea className="h-52 border dark:border-dark-border rounded-lg">
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

              {/* Leave Conversation */}
              {currentUserIsMember && (
                <div className="pt-2 border-t dark:border-dark-border">
                  <Button
                    variant="destructive"
                    onClick={handleLeaveConversation}
                    disabled={isLeaving}
                    className="w-full"
                  >
                    {isLeaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4 mr-2" />
                    )}
                    Leave Conversation
                  </Button>
                </div>
              )}
              </div>
              </ScrollArea>
            </TabsContent>
          )}

          {/* Media History Tab */}
          <TabsContent value="media">
            <MediaHistoryTab conversationId={conversation.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* User Profile Dialog (from member list click) */}
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
