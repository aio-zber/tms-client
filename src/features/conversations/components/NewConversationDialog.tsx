/**
 * New Conversation Dialog
 * Modal for creating new conversations with user search
 */

'use client';

import { useState, useMemo } from 'react';
import { Search, X, Users, MessageCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserSearch } from '@/features/users/hooks/useUserSearch';
import { useConversationActions } from '@/features/conversations';
import toast from 'react-hot-toast';

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (conversationId: string) => void;
}

export default function NewConversationDialog({
  open,
  onOpenChange,
  onSuccess,
}: NewConversationDialogProps) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [conversationType, setConversationType] = useState<'dm' | 'group'>('dm');

  const { query, results, isSearching, search, clearSearch } = useUserSearch();
  const { createConversation, loading } = useConversationActions();

  // Show selected users' details
  const selectedUserDetails = useMemo(() => {
    return results.filter((user) => selectedUsers.includes(user.id));
  }, [selectedUsers, results]);

  const handleUserToggle = (userId: string) => {
    setSelectedUsers((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return;
    }

    if (conversationType === 'group' && !groupName.trim()) {
      toast.error('Please enter a group name');
      return;
    }

    try {
      const conversation = await createConversation({
        type: conversationType,
        member_ids: selectedUsers,
        name: conversationType === 'group' ? groupName.trim() : undefined,
      });

      if (conversation) {
        toast.success(
          conversationType === 'group'
            ? 'Group created successfully'
            : 'Conversation started'
        );
        handleClose();
        onSuccess?.(conversation.id);
      } else {
        toast.error('Failed to create conversation');
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast.error('Failed to create conversation');
    }
  };

  const handleClose = () => {
    setSelectedUsers([]);
    setGroupName('');
    setConversationType('dm');
    clearSearch();
    onOpenChange(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Automatically switch to group if more than 1 user selected
  const effectiveType = selectedUsers.length > 1 ? 'group' : conversationType;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Search and select users from GCGC Team Management System
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Conversation Type Selection */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={effectiveType === 'dm' ? 'default' : 'outline'}
              onClick={() => setConversationType('dm')}
              disabled={selectedUsers.length > 1}
              className="flex-1"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Direct Message
            </Button>
            <Button
              type="button"
              variant={effectiveType === 'group' ? 'default' : 'outline'}
              onClick={() => setConversationType('group')}
              className="flex-1"
            >
              <Users className="h-4 w-4 mr-2" />
              Group Chat
            </Button>
          </div>

          {/* Group Name Input (if group) */}
          {effectiveType === 'group' && (
            <div>
              <Input
                placeholder="Enter group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
          )}

          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
              {selectedUserDetails.map((user) => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="pl-2 pr-1 py-1"
                >
                  {user.name}
                  <button
                    onClick={() => handleUserToggle(user.id)}
                    className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users by name, email, or department..."
              className="pl-9"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </div>

          {/* User Results */}
          <ScrollArea className="h-80 border rounded-lg">
            {isSearching ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-viber-purple mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Searching users...</p>
                </div>
              </div>
            ) : results.length === 0 && query ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No users found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try a different search term
                  </p>
                </div>
              </div>
            ) : !query ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <Search className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Start typing to search users
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Search by name, email, or department
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2">
                {results.map((user) => {
                  const isSelected = selectedUsers.includes(user.id);

                  return (
                    <button
                      key={user.id}
                      onClick={() => handleUserToggle(user.id)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-viber-purple-bg border border-viber-purple' : ''
                      }`}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={user.image} />
                        <AvatarFallback className="bg-viber-purple text-white">
                          {getInitials(user.name || user.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {user.email}
                        </div>
                        {user.department && (
                          <div className="text-xs text-gray-400 truncate">
                            {user.division} • {user.department}
                          </div>
                        )}
                      </div>

                      {isSelected && (
                        <div className="flex-shrink-0">
                          <div className="h-5 w-5 rounded-full bg-viber-purple flex items-center justify-center">
                            <svg
                              className="h-3 w-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={selectedUsers.length === 0 || loading}
              className="bg-viber-purple hover:bg-viber-purple-dark"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  {effectiveType === 'group' ? 'Create Group' : 'Start Chat'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
