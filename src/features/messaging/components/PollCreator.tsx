/**
 * PollCreator Component
 * Dialog for creating polls with Viber styling
 */

'use client';

import { log } from '@/lib/logger';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const VIBER_COLORS = {
  primary: '#7360F2',
  accent: '#A18CFF',
  background: '#F5F4F8',
  border: '#E4E3EB',
  textPrimary: '#2D2C3C',
  textSecondary: '#8B8A97',
};

interface PollCreatorProps {
  open: boolean;
  onClose: () => void;
  onCreatePoll: (question: string, options: string[], multipleChoice: boolean) => Promise<void>;
  conversationId?: string;
}

export default function PollCreator({
  open,
  onClose,
  onCreatePoll,
}: PollCreatorProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errors, setErrors] = useState<{ question?: string; options?: string }>({});

  const addOption = () => {
    if (options.length < 10) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const validate = (): boolean => {
    const newErrors: { question?: string; options?: string } = {};

    if (!question.trim()) {
      newErrors.question = 'Question is required';
    } else if (question.trim().length > 255) {
      newErrors.question = 'Question must be 255 characters or less';
    }

    const validOptions = options.filter(opt => opt.trim().length > 0);
    if (validOptions.length < 2) {
      newErrors.options = 'At least 2 options are required';
    }

    const uniqueOptions = new Set(validOptions.map(opt => opt.trim().toLowerCase()));
    if (uniqueOptions.size !== validOptions.length) {
      newErrors.options = 'Options must be unique';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;

    setIsCreating(true);
    try {
      const validOptions = options.filter(opt => opt.trim().length > 0);
      await onCreatePoll(question.trim(), validOptions, multipleChoice);

      // Reset form
      setQuestion('');
      setOptions(['', '']);
      setMultipleChoice(false);
      setErrors({});
      onClose();
    } catch (error) {
      log.error('Failed to create poll:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setQuestion('');
      setOptions(['', '']);
      setMultipleChoice(false);
      setErrors({});
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md"
        style={{
          borderRadius: '16px',
          border: `1px solid ${VIBER_COLORS.border}`,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: VIBER_COLORS.textPrimary }}>
            Create Poll
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Question Input */}
          <div>
            <Label htmlFor="question" style={{ color: VIBER_COLORS.textPrimary }}>
              Question
            </Label>
            <Input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What's your question?"
              maxLength={255}
              className="mt-1"
              style={{
                borderColor: errors.question ? '#ef4444' : VIBER_COLORS.border,
                borderRadius: '12px',
              }}
            />
            {errors.question && (
              <p className="text-sm text-red-500 mt-1">{errors.question}</p>
            )}
            <p className="text-xs mt-1" style={{ color: VIBER_COLORS.textSecondary }}>
              {question.length}/255 characters
            </p>
          </div>

          {/* Options */}
          <div>
            <Label style={{ color: VIBER_COLORS.textPrimary }}>
              Options (2-10)
            </Label>
            <div className="space-y-2 mt-2">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                    style={{
                      borderColor: VIBER_COLORS.border,
                      borderRadius: '12px',
                      flex: 1,
                    }}
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(index)}
                      disabled={isCreating}
                      style={{ color: VIBER_COLORS.textSecondary }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {errors.options && (
              <p className="text-sm text-red-500 mt-1">{errors.options}</p>
            )}
            {options.length < 10 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                disabled={isCreating}
                className="mt-2"
                style={{
                  borderColor: VIBER_COLORS.primary,
                  color: VIBER_COLORS.primary,
                  borderRadius: '12px',
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Option
              </Button>
            )}
          </div>

          {/* Multiple Choice Toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="multipleChoice"
              checked={multipleChoice}
              onChange={(e) => setMultipleChoice(e.target.checked)}
              disabled={isCreating}
              className="rounded"
              style={{
                accentColor: VIBER_COLORS.primary,
              }}
            />
            <Label
              htmlFor="multipleChoice"
              className="cursor-pointer"
              style={{ color: VIBER_COLORS.textPrimary }}
            >
              Allow multiple answers
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
            style={{
              borderRadius: '12px',
              borderColor: VIBER_COLORS.border,
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            style={{
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${VIBER_COLORS.primary}, ${VIBER_COLORS.accent})`,
              color: 'white',
              border: 'none',
            }}
          >
            {isCreating ? 'Creating...' : 'Create Poll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
