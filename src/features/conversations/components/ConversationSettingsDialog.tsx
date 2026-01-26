/**
 * Conversation Settings Dialog
 * Manage conversation details, members, and settings
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { UserMinus, LogOut, X, UserPlus, Camera } from 'lucide-react';
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
import { uploadConversationAvatar } from '../services/conversationService';
import type { Conversation, ConversationMember } from '@/types/conversation';
import toast from 'react-hot-toast';

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
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<string | undefined>(undefined);
  const [selectedMemberData, setSelectedMemberData] = useState<ConversationMember['user'] | undefined>(undefined);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  const handleUserToggle = (tmsUserId: string) => {
    setSelectedUsers((prev) => {
      if (prev.includes(tmsUserId)) {
        return prev.filter((id) => id !== tmsUserId);
      } else {
        return [...prev, tmsUserId];
      }
    });
  };

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
      await uploadConversationAvatar(conversation.id, file);
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Details</TabsTrigger>
            {isGroup && <TabsTrigger value="members">Members ({members.length})</TabsTrigger>}
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
                  <div className="text-sm text-gray-500">
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
                  >
                    Update
                  </Button>
                </div>
              </div>
            )}

            {/* Conversation Info */}
            <div className="space-y-2">
              <Label>Type</Label>
              <p className="text-sm text-gray-600">
                {isGroup ? 'Group Conversation' : 'Direct Message'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Created</Label>
              <p className="text-sm text-gray-600">
                {new Date(conversation.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Leave Conversation Button */}
            {isGroup && currentUserIsMember && (
              <div className="pt-4 border-t">
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
                      className="w-full bg-viber-purple hover:bg-viber-purple-dark"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Members
                    </Button>
                  ) : (
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label>Add Members</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddMembers(false);
                        setSelectedUsers([]);
                        clearSearch();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Selected Users */}
                  {selectedUsers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {results
                        .filter((u) => selectedUsers.includes(u.tmsUserId))
                        .map((user) => (
                          <div
                            key={user.tmsUserId}
                            className="bg-white border rounded-full px-3 py-1 text-sm flex items-center gap-2"
                          >
                            {user.name || user.email}
                            <button onClick={() => handleUserToggle(user.tmsUserId)}>
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Search Input */}
                  <Input
                    placeholder="Search users..."
                    value={query}
                    onChange={(e) => search(e.target.value)}
                  />

                  {/* Search Results */}
                  <ScrollArea className="h-40 border rounded-lg bg-white">
                    {isSearching ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-sm text-gray-500">Searching...</div>
                      </div>
                    ) : results.length > 0 ? (
                      <div className="p-2">
                        {results
                          .filter((u) => !members.some((m: ConversationMember) => m.userId === u.tmsUserId))
                          .map((user) => (
                            <button
                              key={user.tmsUserId}
                              onClick={() => handleUserToggle(user.tmsUserId)}
                              className={`w-full flex items-center gap-3 p-2 rounded hover:bg-gray-50 ${
                                selectedUsers.includes(user.tmsUserId) ? 'bg-viber-purple-bg' : ''
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
                                <div className="text-xs text-gray-500">{user.email}</div>
                              </div>
                              {selectedUsers.includes(user.tmsUserId) && (
                                <div className="text-viber-purple">✓</div>
                              )}
                            </button>
                          ))}
                      </div>
                    ) : query ? (
                      <div className="flex items-center justify-center h-full text-sm text-gray-500">
                        No users found
                      </div>
                    ) : null}
                  </ScrollArea>

                  {/* Add Button */}
                  <Button
                    onClick={handleAddMembers}
                    disabled={selectedUsers.length === 0 || isAddingMembers}
                    className="w-full"
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
                <ScrollArea className="h-60 border rounded-lg">
                  <div className="p-2">
                    {members.map((member: ConversationMember) => {
                      const isCurrentUser = member.userId === currentUserId;
                      const displayName = member.user?.name || member.user?.email || member.userId;
                      const userImage = member.user?.image;

                      return (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition"
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
                              <div className="text-xs text-gray-500 capitalize">
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
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
