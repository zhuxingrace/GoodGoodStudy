import { useMemo } from 'react';
import { Badge, Button, Card, Group, Select, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { JOURNAL_MOOD_LABELS, JOURNAL_MOODS, type JournalEntry, type JournalMood } from '../types';

interface JournalPanelProps {
  selectedDateISO: string;
  entry: JournalEntry | null;
  onSelectDate: (dateISO: string) => void;
  onChange: (entry: JournalEntry) => void;
  onClear: (dateISO: string) => void;
}

const JOURNAL_TEMPLATE = `Wins
- 

Challenges
- 

Tomorrow
- `;

export default function JournalPanel({
  selectedDateISO,
  entry,
  onSelectDate,
  onChange,
  onClear,
}: JournalPanelProps) {
  const journalValue = entry?.journal ?? '';
  const moodValue = entry?.mood ?? null;
  const moodOptions = useMemo(() => {
    const baseOptions = JOURNAL_MOODS.map((mood) => ({ value: mood, label: `${mood} ${JOURNAL_MOOD_LABELS[mood]}` }));

    if (!moodValue || JOURNAL_MOODS.includes(moodValue as (typeof JOURNAL_MOODS)[number])) {
      return baseOptions;
    }

    return [{ value: moodValue, label: moodValue }, ...baseOptions];
  }, [moodValue]);
  const moodLabel = useMemo(
    () =>
      entry?.mood
        ? JOURNAL_MOODS.includes(entry.mood as (typeof JOURNAL_MOODS)[number])
          ? `${entry.mood} ${JOURNAL_MOOD_LABELS[entry.mood as (typeof JOURNAL_MOODS)[number]]}`
          : entry.mood
        : null,
    [entry?.mood],
  );

  const updateEntry = (changes: Partial<JournalEntry>) => {
    onChange({
      dateISO: selectedDateISO,
      note: entry?.note,
      mood: entry?.mood,
      journal: entry?.journal,
      ...changes,
    });
  };

  const insertTemplate = () => {
    const nextJournal = journalValue.trim()
      ? `${journalValue.replace(/\s+$/, '')}\n\n${JOURNAL_TEMPLATE}`
      : JOURNAL_TEMPLATE;
    updateEntry({ journal: nextJournal });
  };

  const clearJournal = () => {
    modals.openConfirmModal({
      title: 'Clear journal for this day?',
      centered: true,
      labels: { confirm: 'Clear', cancel: 'Cancel' },
      confirmProps: { color: 'danger' },
      onConfirm: () => onClear(selectedDateISO),
    });
  };

  return (
    <Stack spacing="md" className="page-stack">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Group position="apart" align="flex-start">
          <div>
            <Title order={2}>Journal</Title>
            <Text size="sm" c="dimmed" mt={4}>
              Capture the day in long form and keep one journal entry per date.
            </Text>
          </div>

          {moodLabel ? (
            <Badge color="sage" variant="light">
              {moodLabel}
            </Badge>
          ) : null}
        </Group>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Stack spacing="md">
          <Group grow align="flex-end">
            <TextInput
              label="Date"
              type="date"
              value={selectedDateISO}
              onChange={(event) => onSelectDate(event.currentTarget.value)}
            />

            <Select
              label="Mood"
              placeholder="Optional (emoji or text)"
              clearable
              searchable
              creatable
              getCreateLabel={(query) => `+ Use "${query}"`}
              data={moodOptions}
              value={moodValue}
              onChange={(value) => updateEntry({ mood: (value as JournalMood | null) ?? undefined })}
              onCreate={(query) => {
                const nextMood = query.trim();
                if (!nextMood) {
                  return '';
                }
                updateEntry({ mood: nextMood });
                return nextMood;
              }}
            />
          </Group>

          <Textarea
            label="Journal"
            autosize
            minRows={16}
            placeholder="What happened today? What worked, what felt hard, what matters tomorrow?"
            value={journalValue}
            onChange={(event) => updateEntry({ journal: event.currentTarget.value })}
            styles={{
              input: {
                padding: '1rem 1rem 1.25rem',
                lineHeight: 1.7,
              },
            }}
          />

          <Group>
            <Button variant="light" onClick={insertTemplate}>
              Insert template
            </Button>
            <Button variant="light" color="danger" onClick={clearJournal}>
              Clear
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
