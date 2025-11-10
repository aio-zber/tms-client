/**
 * Conversation Settings Dialog
 * Manage conversation details, members, and settings
 */

'use client';

import { useState, useEffect } from 'react';
import { UserMinus, LogOut, X, UserPlus } from 'lucide-react';
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
import { useUserSearch } from '@/features/users/hooks/useUserSearch';
import type { Conversation } from '@/types/conversation';
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

  const {
    updateConversation,
    addMembers,
    removeMember,
    leaveConversation,
    loading
  } = useConversationActions();

  const { query, results, isSearching, search, clearSearch } = useUserSearch();

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

  const handleUpdateName = async () => {
    if (!conversationName.trim() || conversationName === conversation.name) {
      return;
    }

    const updated = await updateConversation(conversation.id, {
      name: conversationName.trim(),
    });

    if (updated) {
      toast.success('Conversation name updated');
      onUpdate();
    } else {
      toast.error('Failed to update conversation name');
    }
  };

  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    const success = await addMembers(conversation.id, selectedUsers);
    if (success) {
      toast.success('Members added successfully');
      setSelectedUsers([]);
      setShowAddMembers(false);
      clearSearch();
      onUpdate();
    } else {
      toast.error('Failed to add members');
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this conversation?`)) return;

    const success = await removeMember(conversation.id, memberId);
    if (success) {
      toast.success('Member removed');
      onUpdate();
    } else {
      toast.error('Failed to remove member');
    }
  };

  const handleLeaveConversation = async () => {
    if (!confirm('Are you sure you want to leave this conversation?')) return;

    const success = await leaveConversation(conversation.id);
    if (success) {
      toast.success('Left conversation');
      onOpenChange(false);
      onLeave?.();
    } else {
      toast.error('Failed to leave conversation');
    }
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

  const isGroup = conversation.type === 'group';
  const members = conversation.members || [];
  const currentUserIsMember = members.some(m => m.userId === currentUserId);
  const currentUserMember = members.find(m => m.userId === currentUserId);
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
                    disabled={loading || !conversationName.trim() || conversationName === conversation.name}
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
                  disabled={loading}
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
                          .filter((u) => !members.some((m) => m.userId === u.tmsUserId))
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
                    disabled={selectedUsers.length === 0 || loading}
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
                    {members.map((member) => {
                      const isCurrentUser = member.userId === currentUserId;

                      return (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={undefined} />
                              <AvatarFallback className="bg-viber-purple text-white">
                                {getInitials(member.userId)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">
                                {member.userId}
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
                              onClick={() => handleRemoveMember(member.userId, member.userId)}
                              disabled={loading}
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
    </Dialog>
  );
}
