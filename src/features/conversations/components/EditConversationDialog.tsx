/**
 * Edit Conversation Dialog
 * Quick edit for conversation name and avatar
 */

'use client';

import { useState, useEffect } from 'react';
import { Edit2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConversationActions } from '../hooks/useConversationActions';
import type { Conversation } from '@/types/conversation';
import toast from 'react-hot-toast';

interface EditConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  onUpdate: () => void;
}

export default function EditConversationDialog({
  open,
  onOpenChange,
  conversation,
  onUpdate,
}: EditConversationDialogProps) {
  const [name, setName] = useState(conversation.name || '');
  const { updateConversation, isUpdating } = useConversationActions();

  useEffect(() => {
    setName(conversation.name || '');
  }, [conversation.name]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Please enter a conversation name');
      return;
    }

    if (name.trim() === conversation.name) {
      onOpenChange(false);
      return;
    }

    // Toast notifications now handled by the hook
    updateConversation(conversation.id, {
      name: name.trim(),
    });

    onOpenChange(false);
    onUpdate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Conversation</DialogTitle>
          <DialogDescription>
            Update the conversation name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="conversation-name">Conversation Name</Label>
            <Input
              id="conversation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter conversation name..."
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdating || !name.trim() || name.trim() === conversation.name}
            className="bg-viber-purple hover:bg-viber-purple-dark"
          >
            {isUpdating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Edit2 className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
