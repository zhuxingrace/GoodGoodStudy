import { useState, type MouseEvent } from 'react';
import { Anchor, Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import {
  countBlocks,
  formatDateLabel,
  getCombinedText,
  getEntryTags,
  getReviewState,
  supportsReview,
} from '../lib/studyData';
import type { StudyEntry } from '../types';

interface EntryCardProps {
  entry: StudyEntry;
  onOpen?: (entry: StudyEntry) => void;
  onEdit: (entry: StudyEntry) => void;
  onDelete: (entry: StudyEntry) => void;
  onDuplicate: (entry: StudyEntry) => void;
  onToggleStar: (entry: StudyEntry) => void;
  onToggleReview: (entry: StudyEntry) => void;
  openOnCardClick?: boolean;
}

export default function EntryCard({
  entry,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStar,
  onToggleReview,
  openOnCardClick = false,
}: EntryCardProps) {
  const [contentOpen, setContentOpen] = useState(false);
  const previewText = getCombinedText(entry);
  const nextReviewDate = entry.type !== 'InterviewPrep' ? entry.nextReviewDate : undefined;

  const handleAction = (callback: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    callback();
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  const handleCardClick = () => {
    if (openOnCardClick && onOpen) {
      onOpen(entry);
    }
  };

  return (
    <Card
      withBorder
      radius="lg"
      shadow="sm"
      className="section-card"
      onClick={handleCardClick}
      style={openOnCardClick ? { cursor: 'pointer' } : undefined}
    >
      <Stack spacing="md">
        <Group position="apart" align="flex-start">
          <div>
            <Text fw={700}>{entry.title}</Text>
            <Text size="sm" c="dimmed">
              {formatDateLabel(entry.dateISO)}
            </Text>
          </div>

          <Group spacing={6}>
            <Badge color="sage" variant="light">
              {entry.type}
            </Badge>
            {entry.starred ? (
              <Badge color="sage" variant="light">
                Starred
              </Badge>
            ) : null}
            {entry.type === 'LeetCode' && entry.difficulty ? (
              <Badge color="gray" variant="light">
                {entry.difficulty}
              </Badge>
            ) : null}
            {entry.type === 'LeetCode' && entry.problemNumber ? (
              <Badge color="gray" variant="outline">
                #{entry.problemNumber}
              </Badge>
            ) : null}
            {entry.type === 'InterviewPrep' && entry.company ? (
              <Badge color="gray" variant="light">
                {entry.company}
              </Badge>
            ) : null}
            {entry.type === 'InterviewPrep' ? (
              <Badge color="gray" variant="outline">
                {entry.roundType}
              </Badge>
            ) : null}
          </Group>
        </Group>

        {entry.link ? (
          <Anchor href={entry.link} target="_blank" rel="noreferrer" size="sm" onClick={handleLinkClick}>
            Open reference
          </Anchor>
        ) : null}

        <Group spacing={8}>
          {entry.type !== 'LeetCode' && typeof entry.minutes === 'number' ? (
            <Badge color="gray" variant="outline">
              {entry.minutes} min
            </Badge>
          ) : null}
          {supportsReview(entry) && getReviewState(entry) ? (
            <Badge color="gray" variant="light">
              Need review
            </Badge>
          ) : null}
          {supportsReview(entry) && nextReviewDate ? (
            <Badge color="gray" variant="outline">
              Review {nextReviewDate}
            </Badge>
          ) : null}
          {entry.type === 'LeetCode' && typeof entry.solved === 'boolean' ? (
            <Badge color={entry.solved ? 'sage' : 'gray'} variant="light">
              {entry.solved ? 'Solved' : 'Unsolved'}
            </Badge>
          ) : null}
          {countBlocks(entry, 'code') > 0 ? (
            <Badge color="gray" variant="light">
              {countBlocks(entry, 'code')} code
            </Badge>
          ) : null}
          {countBlocks(entry, 'followup') > 0 ? (
            <Badge color="gray" variant="light">
              {countBlocks(entry, 'followup')} follow-up
            </Badge>
          ) : null}
        </Group>

        {getEntryTags(entry).length > 0 ? (
          <Group spacing={6}>
            {getEntryTags(entry).map((tag) => (
              <Badge key={tag} color="sage" variant="dot">
                {tag}
              </Badge>
            ))}
          </Group>
        ) : null}

        {previewText ? (
          <div>
            <Button variant="subtle" compact onClick={handleAction(() => setContentOpen((current) => !current))}>
              {contentOpen ? 'Hide content' : 'Show content'}
            </Button>
            {contentOpen ? (
              <Text size="sm" className="entry-notes" mt="xs">
                {previewText}
              </Text>
            ) : null}
          </div>
        ) : null}

        <Divider />

        <Group spacing={8}>
          <Button
            size="xs"
            color="sage"
            variant={entry.starred ? 'filled' : 'light'}
            onClick={handleAction(() => onToggleStar(entry))}
          >
            {entry.starred ? 'Unstar' : 'Star'}
          </Button>
          {supportsReview(entry) ? (
            <Button
              size="xs"
              variant="light"
              color={getReviewState(entry) ? 'sage' : 'gray'}
              onClick={handleAction(() => onToggleReview(entry))}
            >
              {getReviewState(entry) ? 'Clear Review' : 'Need Review'}
            </Button>
          ) : null}
          <Button size="xs" variant="light" onClick={handleAction(() => onEdit(entry))}>
            Open
          </Button>
          <Button size="xs" variant="light" onClick={handleAction(() => onDuplicate(entry))}>
            Duplicate
          </Button>
          <Button size="xs" variant="light" color="danger" onClick={handleAction(() => onDelete(entry))}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
