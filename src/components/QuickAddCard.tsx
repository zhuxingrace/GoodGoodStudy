import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { DIFFICULTIES, ROUND_TYPES, type EntryType, type InterviewPrepEntry, type LeetCodeEntry, type StudyEntry, type SystemDesignEntry } from '../types';
import { addDaysISO, createEmptyEntry, insertTemplateIntoEntry } from '../lib/studyData';

interface QuickAddCardProps {
  entryType: EntryType;
  companies: string[];
  tagOptions: string[];
  onCreate: (entry: StudyEntry) => void;
}

export default function QuickAddCard({
  entryType,
  companies,
  tagOptions,
  onCreate,
}: QuickAddCardProps) {
  const [draft, setDraft] = useState<StudyEntry>(() => createEmptyEntry(entryType));
  const [activeReviewPreset, setActiveReviewPreset] = useState<number | null>(null);

  useEffect(() => {
    setDraft(createEmptyEntry(entryType));
    setActiveReviewPreset(null);
  }, [entryType]);

  const updateBase = (changes: Partial<StudyEntry>) => {
    setDraft((current) => ({ ...current, ...changes }) as StudyEntry);
  };

  const updateLeetCode = (changes: Partial<LeetCodeEntry>) => {
    setDraft((current) => (current.type === 'LeetCode' ? { ...current, ...changes } : current));
  };

  const updateSystemDesign = (changes: Partial<SystemDesignEntry>) => {
    setDraft((current) => (current.type === 'SystemDesign' ? { ...current, ...changes } : current));
  };

  const updateInterviewPrep = (changes: Partial<InterviewPrepEntry>) => {
    setDraft((current) => (current.type === 'InterviewPrep' ? { ...current, ...changes } : current));
  };

  const setTags = (tags: string[]) => {
    if (draft.type === 'LeetCode') {
      updateLeetCode({ tags });
      return;
    }

    if (draft.type === 'SystemDesign') {
      updateSystemDesign({ tags });
      return;
    }

    updateInterviewPrep({ tags });
  };

  const applyReviewPreset = (days: number) => {
    if (draft.type !== 'LeetCode') {
      return;
    }

    updateLeetCode({
      needReview: true,
      nextReviewDate: addDaysISO(draft.dateISO, days),
    });
    setActiveReviewPreset(days);
  };

  const insertTemplate = () => {
    setDraft((current) => insertTemplateIntoEntry(current));
  };

  const canSubmit = draft.title.trim().length > 0;

  const submitDraft = () => {
    if (!canSubmit) {
      return;
    }

    const nextEntry = {
      ...draft,
      title: draft.title.trim(),
      link: draft.link?.trim() || undefined,
    } as StudyEntry;

    onCreate(nextEntry);
    setDraft(createEmptyEntry(entryType, draft.dateISO));
    setActiveReviewPreset(null);
  };

  return (
    <Card withBorder radius="lg" shadow="sm" className="section-card">
      <Stack spacing="md">
        <Group position="apart">
          <div>
            <Text fw={700}>Quick add</Text>
            <Text size="sm" c="dimmed">
              Create the shell for a new study entry. Detailed editing continues in the drawer.
            </Text>
          </div>
          <Badge color="sage" variant="light">
            {entryType}
          </Badge>
        </Group>

        <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'sm', cols: 1, spacing: 'sm' }]}>
          <TextInput
            label="Date"
            type="date"
            value={draft.dateISO}
            onChange={(event) => updateBase({ dateISO: event.currentTarget.value })}
          />
          <TextInput
            label="Title"
            placeholder="What did you study?"
            value={draft.title}
            onChange={(event) => updateBase({ title: event.currentTarget.value })}
          />
          <TextInput
            label="Link"
            placeholder="https://..."
            value={draft.link ?? ''}
            onChange={(event) => updateBase({ link: event.currentTarget.value })}
          />
          <Switch
            label="Starred"
            checked={draft.starred}
            onChange={(event) => updateBase({ starred: event.currentTarget.checked })}
            mt={28}
          />
        </SimpleGrid>

        {draft.type === 'LeetCode' ? (
          <>
            <SimpleGrid
              cols={3}
              spacing="md"
              breakpoints={[
                { maxWidth: 'lg', cols: 2, spacing: 'sm' },
                { maxWidth: 'sm', cols: 1, spacing: 'sm' },
              ]}
            >
              <Select
                label="Difficulty"
                placeholder="Select"
                clearable
                data={[...DIFFICULTIES]}
                value={draft.difficulty ?? null}
                onChange={(value) =>
                  updateLeetCode({ difficulty: (value ?? undefined) as LeetCodeEntry['difficulty'] })
                }
              />
              <NumberInput
                label="Problem #"
                placeholder="146"
                min={1}
                value={draft.problemNumber ?? ''}
                onChange={(value) =>
                  updateLeetCode({ problemNumber: typeof value === 'number' ? value : undefined })
                }
              />
              <MultiSelect
                label="Tags"
                placeholder="Add tags"
                searchable
                creatable
                data={tagOptions}
                value={draft.tags}
                getCreateLabel={(query) => `+ Create ${query}`}
                onChange={setTags}
                onCreate={(query) => query}
              />
              <Switch
                label="Solved"
                checked={Boolean(draft.solved)}
                onChange={(event) => updateLeetCode({ solved: event.currentTarget.checked })}
                mt={28}
              />
              <Switch
                label="Need review"
                checked={draft.needReview}
                onChange={(event) => updateLeetCode({ needReview: event.currentTarget.checked })}
                mt={28}
              />
              <TextInput
                label="Next review"
                type="date"
                value={draft.nextReviewDate ?? ''}
                onChange={(event) => updateLeetCode({ nextReviewDate: event.currentTarget.value || undefined })}
              />
            </SimpleGrid>

            <Group spacing="sm">
              <Text size="sm" c="dimmed">
                Review quick set:
              </Text>
              {[3, 7, 14].map((days) => (
                <Chip
                  key={days}
                  checked={activeReviewPreset === days}
                  onChange={(checked) => {
                    if (checked) {
                      applyReviewPreset(days);
                    } else {
                      setActiveReviewPreset(null);
                    }
                  }}
                >
                  +{days}d
                </Chip>
              ))}
            </Group>
          </>
        ) : null}

        {draft.type === 'SystemDesign' ? (
          <SimpleGrid
            cols={4}
            spacing="md"
            breakpoints={[
              { maxWidth: 'lg', cols: 2, spacing: 'sm' },
              { maxWidth: 'sm', cols: 1, spacing: 'sm' },
            ]}
          >
            <MultiSelect
              label="Tags"
              placeholder="Add tags"
              searchable
              creatable
              data={tagOptions}
              value={draft.tags}
              getCreateLabel={(query) => `+ Create ${query}`}
              onChange={setTags}
              onCreate={(query) => query}
            />
            <NumberInput
              label="Minutes"
              min={0}
              value={draft.minutes ?? ''}
              onChange={(value) =>
                updateSystemDesign({ minutes: typeof value === 'number' ? value : undefined })
              }
            />
            <Switch
              label="Need review"
              checked={Boolean(draft.needReview)}
              onChange={(event) => updateSystemDesign({ needReview: event.currentTarget.checked })}
              mt={28}
            />
            <Button variant="light" mt={26} onClick={insertTemplate}>
              Insert SD Template
            </Button>
          </SimpleGrid>
        ) : null}

        {draft.type === 'InterviewPrep' ? (
          <SimpleGrid
            cols={4}
            spacing="md"
            breakpoints={[
              { maxWidth: 'lg', cols: 2, spacing: 'sm' },
              { maxWidth: 'sm', cols: 1, spacing: 'sm' },
            ]}
          >
            <Autocomplete
              label="Company (optional)"
              placeholder="Airbnb"
              data={companies}
              value={draft.company}
              onChange={(value) => updateInterviewPrep({ company: value })}
            />
            <Select
              label="Round type"
              data={[...ROUND_TYPES]}
              value={draft.roundType}
              onChange={(value) =>
                updateInterviewPrep({ roundType: (value ?? 'Coding') as InterviewPrepEntry['roundType'] })
              }
            />
            <MultiSelect
              label="Tags"
              placeholder="Add tags"
              searchable
              creatable
              data={tagOptions}
              value={draft.tags}
              getCreateLabel={(query) => `+ Create ${query}`}
              onChange={setTags}
              onCreate={(query) => query}
            />
            <NumberInput
              label="Minutes"
              min={0}
              value={draft.minutes ?? ''}
              onChange={(value) =>
                updateInterviewPrep({ minutes: typeof value === 'number' ? value : undefined })
              }
            />
          </SimpleGrid>
        ) : null}

        <Group position="right">
          <Button onClick={submitDraft} disabled={!canSubmit}>
            Create and Open
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
