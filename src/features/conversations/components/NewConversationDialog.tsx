/**
 * New Conversation Dialog
 * Modal for creating new conversations with user search
 */

'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { getUserImageUrl } from '@/lib/imageUtils';
import { UserSearchResult } from '@/types/user';
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
  const [allUsers, setAllUsers] = useState<UserSearchResult[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);

  const { query, results, isSearching, search, clearSearch } = useUserSearch();
  const { createConversation, loading } = useConversationActions();

  // Load all users when dialog opens
  const loadAllUsers = useCallback(async () => {
    setLoadingInitial(true);
    try {
      // Use a wildcard search to get all users
      // The search API will return users even with a generic query
      const { tmsApi } = await import('@/lib/tmsApi');
      const tmsUsers = await tmsApi.searchUsers('', 100); // Empty query to get all users

      // Transform TMSUser[] to UserSearchResult[] format
      const transformedUsers: UserSearchResult[] = tmsUsers.map((user) => ({
        id: user.id,
        tmsUserId: user.id, // TMSUser.id is the TMS user ID
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
    } catch (error) {
      console.error('Failed to load users:', error);
      // Fallback: trigger a search with a common letter
      search('a');
    } finally {
      setLoadingInitial(false);
    }
  }, [search]);

  useEffect(() => {
    if (open && allUsers.length === 0) {
      loadAllUsers();
    }
  }, [open, allUsers.length, loadAllUsers]);

  // Display users: show search results if searching, otherwise show all users
  const displayUsers = useMemo(() => {
    return query ? results : allUsers;
  }, [query, results, allUsers]);

  // Show selected users' details
  const selectedUserDetails = useMemo(() => {
    return displayUsers.filter((user) => selectedUsers.includes(user.id));
  }, [selectedUsers, displayUsers]);

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
      const errorMessage = error instanceof Error ? error.message : 'Failed to create conversation';
      toast.error(errorMessage);
    }
  };

  const handleClose = () => {
    setSelectedUsers([]);
    setGroupName('');
    setConversationType('dm');
    setAllUsers([]); // Clear cached users
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
      <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-lg md:text-xl">New Conversation</DialogTitle>
          <DialogDescription className="text-sm md:text-base">
            Search and select users from GCGC Team Management System
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="space-y-4">
            {/* Conversation Type Selection */}
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => setConversationType('dm')}
                disabled={selectedUsers.length > 1}
                className={`flex-1 text-sm md:text-base transition ${
                  effectiveType === 'dm'
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Direct Message</span>
                <span className="sm:hidden">DM</span>
              </Button>
              <Button
                type="button"
                onClick={() => setConversationType('group')}
                className={`flex-1 text-sm md:text-base transition ${
                  effectiveType === 'group'
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Group Chat</span>
                <span className="sm:hidden">Group</span>
              </Button>
            </div>

            {/* Group Name Input (if group) */}
            {effectiveType === 'group' && (
              <div className="space-y-2">
                <Input
                  placeholder="Enter group name..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="text-sm md:text-base"
                />
                <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded flex items-start gap-2">
                  <span className="text-blue-600 font-semibold">ℹ️</span>
                  <span>You'll be added as the group admin automatically</span>
                </div>
              </div>
            )}

            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg max-h-24 overflow-y-auto">
                {selectedUserDetails.map((user) => (
                  <Badge
                    key={user.id}
                    variant="secondary"
                    className="pl-2 pr-1 py-1 text-xs md:text-sm"
                  >
                    <span className="max-w-[120px] truncate">{user.name}</span>
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
              <Search className="absolute left-3 top-2.5 h-4 w-4 md:h-5 md:w-5 text-gray-400" />
              <Input
                placeholder="Search users by name, email, or department..."
                className="pl-9 md:pl-10 text-sm md:text-base"
                value={query}
                onChange={(e) => search(e.target.value)}
                autoFocus
              />
            </div>

            {/* Hint for multi-select */}
            {effectiveType === 'group' && selectedUsers.length === 0 && (
              <p className="text-xs text-viber-purple bg-viber-purple/10 p-2 rounded">
                💡 Click multiple users to add them to the group
              </p>
            )}

            {/* User Results */}
            <ScrollArea className="h-[300px] sm:h-[350px] md:h-[400px] border rounded-lg">
            {(isSearching || loadingInitial) ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-viber-purple mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">
                    {loadingInitial ? 'Loading users...' : 'Searching users...'}
                  </p>
                </div>
              </div>
            ) : displayUsers.length === 0 && query ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No users found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Try a different search term
                  </p>
                </div>
              </div>
            ) : displayUsers.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No users available</p>
                </div>
              </div>
            ) : (
              <div className="p-2">
                {displayUsers.map((user) => {
                  const isSelected = selectedUsers.includes(user.id);

                  return (
                    <button
                      key={user.id}
                      onClick={() => handleUserToggle(user.id)}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-viber-purple/10 border-2 border-viber-purple'
                          : 'border border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={getUserImageUrl(user.image)} />
                        <AvatarFallback className="bg-viber-purple text-white">
                          {getInitials(user.name || user.email)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium text-gray-900 truncate text-sm md:text-base">
                          {user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                        </div>
                        <div className="text-xs md:text-sm text-gray-500 truncate">
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
            <div className="flex gap-2 justify-end pt-4 border-t mt-4">
              <Button 
                variant="outline" 
                onClick={handleClose} 
                disabled={loading}
                className="text-sm md:text-base"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={selectedUsers.length === 0 || loading}
                className="bg-viber-purple hover:bg-viber-purple-dark text-white text-sm md:text-base"
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
