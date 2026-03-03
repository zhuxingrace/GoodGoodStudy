import { Badge, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { getEntryTags, startOfWeekISO, todayISO } from '../lib/studyData';
import { FOCUS_SESSION_TYPES, type TimeSession } from '../lib/timeTracker';
import type { StudyEntry } from '../types';

interface StatsPanelProps {
  entries: StudyEntry[];
  timeSessions: TimeSession[];
}

const sumSessionMinutes = (sessions: TimeSession[]) =>
  sessions.reduce((total, session) => total + session.minutes, 0);

const buildTypeTotals = (sessions: TimeSession[]) => {
  const totalMinutes = sumSessionMinutes(sessions);
  const base = {
    LeetCode: 0,
    SystemDesign: 0,
    InterviewPrep: 0,
  };

  sessions.forEach((session) => {
    if (session.type === 'LeetCode' || session.type === 'SystemDesign' || session.type === 'InterviewPrep') {
      base[session.type] += session.minutes;
    }
  });

  const otherMinutes = Math.max(0, totalMinutes - (base.LeetCode + base.SystemDesign + base.InterviewPrep));

  return [
    { type: 'LeetCode', minutes: base.LeetCode },
    { type: 'SystemDesign', minutes: base.SystemDesign },
    { type: 'InterviewPrep', minutes: base.InterviewPrep },
    { type: 'Other', minutes: otherMinutes },
  ] as const;
};

const buildEntryTypeCounts = (entries: StudyEntry[]) => {
  const base = {
    LeetCode: 0,
    SystemDesign: 0,
    InterviewPrep: 0,
  };

  entries.forEach((entry) => {
    if (entry.type === 'LeetCode' || entry.type === 'SystemDesign' || entry.type === 'InterviewPrep') {
      base[entry.type] += 1;
    }
  });

  const otherCount = Math.max(0, entries.length - (base.LeetCode + base.SystemDesign + base.InterviewPrep));

  return [
    { type: 'LeetCode', count: base.LeetCode },
    { type: 'SystemDesign', count: base.SystemDesign },
    { type: 'InterviewPrep', count: base.InterviewPrep },
    { type: 'Other', count: otherCount },
  ] as const;
};

export default function StatsPanel({ entries, timeSessions }: StatsPanelProps) {
  const today = todayISO();
  const weekStart = startOfWeekISO();
  const monthPrefix = today.slice(0, 7);

  const thisWeek = entries.filter((entry) => entry.dateISO >= weekStart && entry.dateISO <= today);
  const thisMonth = entries.filter((entry) => entry.dateISO.startsWith(monthPrefix) && entry.dateISO <= today);
  const entriesByType = buildEntryTypeCounts(entries);
  const focusSessions = timeSessions.filter((session) => session.mode === 'focus');
  const todaySessions = focusSessions.filter((session) => session.dateISO === today);
  const weekSessions = focusSessions.filter((session) => session.dateISO >= weekStart);
  const monthSessions = focusSessions.filter((session) => session.dateISO.startsWith(monthPrefix));
  const focusByType = FOCUS_SESSION_TYPES.map((type) => {
    const sessionsForType =
      type === 'Other'
        ? focusSessions.filter(
            (session) =>
              session.type !== 'LeetCode' && session.type !== 'SystemDesign' && session.type !== 'InterviewPrep',
          )
        : focusSessions.filter((session) => session.type === type);

    return {
      type,
      count: sessionsForType.length,
      minutes: sumSessionMinutes(sessionsForType),
    };
  });

  const leetCodeEntries = entries.filter(
    (entry): entry is Extract<StudyEntry, { type: 'LeetCode' }> => entry.type === 'LeetCode',
  );
  const difficultyCounts = ['Easy', 'Medium', 'Hard'].map((difficulty) => ({
    difficulty,
    count: leetCodeEntries.filter((entry) => entry.difficulty === difficulty).length,
  }));
  const reviewCount = leetCodeEntries.filter((entry) => entry.needReview).length;

  const topTags = Object.entries(
    entries.reduce<Record<string, number>>((accumulator, entry) => {
      getEntryTags(entry).forEach((tag) => {
        accumulator[tag] = (accumulator[tag] ?? 0) + 1;
      });
      return accumulator;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8);
  const focusTotal = sumSessionMinutes(focusSessions);
  const breakTotal = sumSessionMinutes(timeSessions.filter((session) => session.mode === 'break'));

  const timeBuckets = [
    { label: 'Today', sessions: todaySessions },
    { label: 'This week', sessions: weekSessions },
    { label: 'This month', sessions: monthSessions },
  ];

  return (
    <Stack spacing="md">
      <SimpleGrid
        cols={4}
        spacing="md"
        breakpoints={[
          { maxWidth: 'lg', cols: 2, spacing: 'md' },
          { maxWidth: 'sm', cols: 1, spacing: 'sm' },
        ]}
      >
        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text size="sm" c="dimmed">
            This week
          </Text>
          <Title order={2}>{thisWeek.length}</Title>
          <Text size="sm">Entries created this week</Text>
        </Card>

        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text size="sm" c="dimmed">
            This month
          </Text>
          <Title order={2}>{thisMonth.length}</Title>
          <Text size="sm">Entries created this month</Text>
        </Card>

        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text size="sm" c="dimmed">
            LeetCode review queue
          </Text>
          <Title order={2}>{reviewCount}</Title>
          <Text size="sm">Marked for review</Text>
        </Card>

        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text size="sm" c="dimmed">
            Total library
          </Text>
          <Title order={2}>{entries.length}</Title>
          <Text size="sm">All saved entries</Text>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={2} spacing="md" breakpoints={[{ maxWidth: 'md', cols: 1, spacing: 'sm' }]}>
        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text fw={700}>Breakdown by type</Text>
          <Stack spacing="sm" mt="md">
            {entriesByType.map((item) => (
              <Group key={item.type} position="apart">
                <Badge color="sage" variant="light">
                  {item.type}
                </Badge>
                <Text size="sm">{item.count} entries</Text>
              </Group>
            ))}
          </Stack>
        </Card>

        <Card withBorder radius="lg" shadow="sm" className="section-card">
          <Text fw={700}>LeetCode difficulty mix</Text>
          <Stack spacing="sm" mt="md">
            {difficultyCounts.map((item) => (
              <Group key={item.difficulty} position="apart">
                <Badge color="gray" variant="light">
                  {item.difficulty}
                </Badge>
                <Text size="sm">{item.count}</Text>
              </Group>
            ))}
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Time spent</Text>
        <SimpleGrid cols={3} spacing="md" mt="md" breakpoints={[{ maxWidth: 'md', cols: 1, spacing: 'sm' }]}>
          {timeBuckets.map((bucket) => {
            const totals = buildTypeTotals(bucket.sessions);

            return (
              <Card key={bucket.label} withBorder radius="md">
                <Text fw={600}>{bucket.label}</Text>
                <Text size="sm" c="dimmed" mt={2}>
                  {sumSessionMinutes(bucket.sessions)} total minutes
                </Text>
                <Stack spacing={6} mt="sm">
                  {sumSessionMinutes(bucket.sessions) > 0 ? (
                    totals.map((item) => (
                      <Group key={`${bucket.label}-${item.type}`} position="apart">
                        <Badge color="sage" variant="light">
                          {item.type}
                        </Badge>
                        <Text size="sm">{item.minutes} min</Text>
                      </Group>
                    ))
                  ) : (
                    <Text size="sm" c="dimmed">
                      No timer sessions yet.
                    </Text>
                  )}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>

        <Group mt="md">
          <Badge color="sage" variant="light">
            Focus: {focusTotal} min
          </Badge>
          <Badge color="gray" variant="light">
            Break: {breakTotal} min
          </Badge>
        </Group>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Top tags</Text>
        <Group spacing={8} mt="md">
          {topTags.length > 0 ? (
            topTags.map(([tag, count]) => (
              <Badge key={tag} color="sage" variant="dot">
                {tag} ({count})
              </Badge>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              Add a few tagged sessions to see patterns here.
            </Text>
          )}
        </Group>
      </Card>
    </Stack>
  );
}
