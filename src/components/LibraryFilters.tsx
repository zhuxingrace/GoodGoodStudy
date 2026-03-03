import { Button, Card, Group, SegmentedControl, Select, SimpleGrid, Switch, Text, TextInput } from '@mantine/core';
import { DIFFICULTIES, ENTRY_TYPES, ROUND_TYPES, type LibraryFilters as LibraryFiltersShape } from '../types';

interface LibraryFiltersProps {
  filters: LibraryFiltersShape;
  companies: string[];
  onChange: (next: LibraryFiltersShape) => void;
}

export default function LibraryFilters({ filters, companies, onChange }: LibraryFiltersProps) {
  const update = (changes: Partial<LibraryFiltersShape>) => onChange({ ...filters, ...changes });
  const setType = (value: string) => {
    const nextType = value === 'All' ? undefined : (value as LibraryFiltersShape['type']);

    onChange({
      ...filters,
      type: nextType,
      needReviewOnly: nextType === 'LeetCode' ? filters.needReviewOnly : false,
      difficulty: nextType === 'LeetCode' ? filters.difficulty : undefined,
      company: nextType === 'InterviewPrep' ? filters.company : undefined,
      roundType: nextType === 'InterviewPrep' ? filters.roundType : undefined,
    });
  };

  return (
    <Card withBorder radius="lg" shadow="sm" className="section-card">
      <SimpleGrid
        cols={5}
        spacing="md"
        breakpoints={[
          { maxWidth: 'lg', cols: 3, spacing: 'md' },
          { maxWidth: 'sm', cols: 1, spacing: 'sm' },
        ]}
      >
        <TextInput
          label="Search"
          placeholder="Title, blocks, tags, follow-ups"
          value={filters.query}
          onChange={(event) => update({ query: event.currentTarget.value })}
        />

        <div>
          <Text size="sm" fw={600} mb={8}>
            Type
          </Text>
          <SegmentedControl
            fullWidth
            value={filters.type ?? 'All'}
            onChange={setType}
            data={['All', ...ENTRY_TYPES]}
          />
        </div>

        <TextInput
          label="From"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(event) => update({ dateFrom: event.currentTarget.value || undefined })}
        />

        <TextInput
          label="To"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(event) => update({ dateTo: event.currentTarget.value || undefined })}
        />

        <Switch
          label="Starred only"
          checked={filters.starredOnly}
          onChange={(event) => update({ starredOnly: event.currentTarget.checked })}
          mt={28}
        />

        <Group align="end">
          <Button
            variant="light"
            onClick={() =>
              onChange({
                query: '',
                type: undefined,
                dateFrom: undefined,
                dateTo: undefined,
                starredOnly: false,
                needReviewOnly: false,
                difficulty: undefined,
                company: undefined,
                roundType: undefined,
              })
            }
          >
            Reset filters
          </Button>
        </Group>
      </SimpleGrid>

      {filters.type === 'LeetCode' ? (
        <SimpleGrid
          cols={3}
          spacing="md"
          mt="md"
          breakpoints={[
            { maxWidth: 'md', cols: 2, spacing: 'sm' },
            { maxWidth: 'sm', cols: 1, spacing: 'sm' },
          ]}
        >
          <Switch
            label="Need review only"
            checked={filters.needReviewOnly}
            onChange={(event) => update({ needReviewOnly: event.currentTarget.checked })}
            mt={28}
          />
          <Select
            label="Difficulty"
            placeholder="All difficulties"
            clearable
            data={[...DIFFICULTIES]}
            value={filters.difficulty ?? null}
            onChange={(value) => update({ difficulty: value as LibraryFiltersShape['difficulty'] })}
          />
        </SimpleGrid>
      ) : null}

      {filters.type === 'InterviewPrep' ? (
        <SimpleGrid
          cols={3}
          spacing="md"
          mt="md"
          breakpoints={[
            { maxWidth: 'md', cols: 2, spacing: 'sm' },
            { maxWidth: 'sm', cols: 1, spacing: 'sm' },
          ]}
        >
          <Select
            label="Company"
            placeholder="All companies"
            clearable
            searchable
            data={companies}
            value={filters.company ?? null}
            onChange={(value) => update({ company: value ?? undefined })}
          />
          <Select
            label="Round Type"
            placeholder="All rounds"
            clearable
            data={[...ROUND_TYPES]}
            value={filters.roundType ?? null}
            onChange={(value) => update({ roundType: value as LibraryFiltersShape['roundType'] })}
          />
        </SimpleGrid>
      ) : null}
    </Card>
  );
}
