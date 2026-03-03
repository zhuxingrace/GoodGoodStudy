import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Drawer,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { Prism } from '@mantine/prism';
import Editor from '@monaco-editor/react';
import InterviewPrepEditor from './InterviewPrepEditor';
import {
  createCodeBlock,
  createFollowUpBlock,
  createTextBlock,
  insertTemplateIntoEntry,
} from '../lib/studyData';
import {
  CODE_LANGUAGE_LABELS,
  CODE_LANGUAGE_OPTIONS,
  DIFFICULTIES,
  ROUND_TYPES,
  type Block,
  type CodeLanguage,
  type InterviewPrepEntry,
  type LeetCodeEntry,
  type StudyEntry,
  type SystemDesignEntry,
} from '../types';

interface EntryDrawerProps {
  entry: StudyEntry | null;
  opened: boolean;
  companies: string[];
  tagOptions: string[];
  currentUserId?: string;
  onClose: () => void;
  onSave: (entry: StudyEntry) => void;
}

const cloneEntry = (entry: StudyEntry) => JSON.parse(JSON.stringify(entry)) as StudyEntry;

const getPrismLanguage = (language: CodeLanguage) => {
  if (language === 'javascript') {
    return 'js';
  }

  if (language === 'typescript') {
    return 'ts';
  }

  if (language === 'plaintext') {
    return 'markup';
  }

  return language;
};

export default function EntryDrawer({
  entry,
  opened,
  companies,
  tagOptions,
  currentUserId,
  onClose,
  onSave,
}: EntryDrawerProps) {
  const [draft, setDraft] = useState<StudyEntry | null>(entry ? cloneEntry(entry) : null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDraft(entry ? cloneEntry(entry) : null);
    setCollapsedBlocks({});
  }, [entry]);

  const canSave = useMemo(() => {
    if (!draft) {
      return false;
    }

    if (!draft.title.trim()) {
      return false;
    }

    if (draft.type === 'InterviewPrep' && !draft.company.trim()) {
      return false;
    }

    return true;
  }, [draft]);

  const updateBase = (changes: Partial<StudyEntry>) => {
    setDraft((current) => (current ? ({ ...current, ...changes } as StudyEntry) : current));
  };

  const updateLeetCode = (changes: Partial<LeetCodeEntry>) => {
    setDraft((current) => (current?.type === 'LeetCode' ? { ...current, ...changes } : current));
  };

  const updateSystemDesign = (changes: Partial<SystemDesignEntry>) => {
    setDraft((current) => (current?.type === 'SystemDesign' ? { ...current, ...changes } : current));
  };

  const updateInterviewPrep = (changes: Partial<InterviewPrepEntry>) => {
    setDraft((current) => (current?.type === 'InterviewPrep' ? { ...current, ...changes } : current));
  };

  const setTags = (tags: string[]) => {
    if (!draft) {
      return;
    }

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

  const updateBlock = (blockId: string, changes: Partial<Block>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            blocks: current.blocks.map((block) => (block.id === blockId ? ({ ...block, ...changes } as Block) : block)),
          }
        : current,
    );
  };

  const addBlock = (block: Block) => {
    setDraft((current) => (current ? { ...current, blocks: [...current.blocks, block] } : current));
  };

  const removeBlock = (blockId: string) => {
    setDraft((current) =>
      current ? { ...current, blocks: current.blocks.filter((block) => block.id !== blockId) } : current,
    );
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const index = current.blocks.findIndex((block) => block.id === blockId);
      const nextIndex = index + direction;

      if (index === -1 || nextIndex < 0 || nextIndex >= current.blocks.length) {
        return current;
      }

      const blocks = [...current.blocks];
      const [moved] = blocks.splice(index, 1);
      blocks.splice(nextIndex, 0, moved);

      return {
        ...current,
        blocks,
      };
    });
  };

  const toggleCollapsed = (blockId: string) => {
    setCollapsedBlocks((current) => ({
      ...current,
      [blockId]: !current[blockId],
    }));
  };

  const insertTemplate = () => {
    setDraft((current) => (current ? insertTemplateIntoEntry(current) : current));
  };

  const saveDraft = () => {
    if (!draft || !canSave) {
      return;
    }

    onSave({
      ...draft,
      title: draft.title.trim(),
      link: draft.link?.trim() || undefined,
    });
  };

  const renderBlock = (block: Block, index: number, total: number) => {
    const isCollapsed = Boolean(collapsedBlocks[block.id]);

    return (
      <Card key={block.id} withBorder radius="lg" className="section-card">
        <Stack spacing="sm">
          <Group position="apart" align="center">
            <Group spacing={8}>
              <Badge color="sage" variant="light">
                {block.type}
              </Badge>
              <Text size="sm" c="dimmed">
                Block {index + 1}
              </Text>
            </Group>

            <Group spacing={6}>
              <Button size="xs" variant="subtle" onClick={() => moveBlock(block.id, -1)} disabled={index === 0}>
                Up
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => moveBlock(block.id, 1)}
                disabled={index === total - 1}
              >
                Down
              </Button>
              <Button size="xs" variant="subtle" onClick={() => toggleCollapsed(block.id)}>
                {isCollapsed ? 'Expand' : 'Collapse'}
              </Button>
              {block.type === 'code' && !isCollapsed ? (
                <CopyButton value={block.code}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="subtle" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              ) : null}
              <Button size="xs" variant="subtle" color="danger" onClick={() => removeBlock(block.id)}>
                Delete
              </Button>
            </Group>
          </Group>

          {!isCollapsed ? (
            <>
              {block.type === 'text' ? (
                <Textarea
                  label="Text"
                  minRows={6}
                  value={block.content}
                  onChange={(event) => updateBlock(block.id, { content: event.currentTarget.value })}
                />
              ) : null}

              {block.type === 'code' ? (
                <Stack spacing="sm">
                  <Select
                    label="Language"
                    data={CODE_LANGUAGE_OPTIONS}
                    value={block.language}
                    onChange={(value) => updateBlock(block.id, { language: (value ?? 'plaintext') as CodeLanguage })}
                  />
                  <div className="code-area">
                    <Editor
                      height={320}
                      language={block.language || 'plaintext'}
                      theme="vs"
                      value={block.code}
                      onChange={(value) => updateBlock(block.id, { code: value ?? '' })}
                      options={{
                        automaticLayout: true,
                        fontSize: 14,
                        lineNumbers: 'on',
                        minimap: { enabled: false },
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                      }}
                    />
                  </div>
                  <Text size="xs" c="dimmed">
                    {CODE_LANGUAGE_LABELS[block.language]} syntax highlighting enabled.
                  </Text>
                </Stack>
              ) : null}

              {block.type === 'followup' ? (
                <Stack spacing="sm">
                  <TextInput
                    label="Question"
                    value={block.question}
                    onChange={(event) => updateBlock(block.id, { question: event.currentTarget.value })}
                  />
                  <Textarea
                    label="Answer"
                    minRows={4}
                    value={block.answer}
                    onChange={(event) => updateBlock(block.id, { answer: event.currentTarget.value })}
                  />
                </Stack>
              ) : null}
            </>
          ) : null}

          {isCollapsed && block.type === 'code' ? (
            block.code.trim() ? (
              <div className="code-preview">
                <Prism
                  language={getPrismLanguage(block.language) as never}
                  withLineNumbers
                  copyLabel="Copy"
                  copiedLabel="Copied"
                >
                  {block.code}
                </Prism>
              </div>
            ) : (
              <Text size="sm" c="dimmed">
                No code yet.
              </Text>
            )
          ) : null}
        </Stack>
      </Card>
    );
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={draft ? draft.title || 'Untitled entry' : 'Entry editor'}
      padding="lg"
    >
      {draft ? (
        <Stack spacing="md">
          <Card withBorder radius="lg" className="section-card">
            <Stack spacing="md">
              <Group position="apart" align="center">
                <Group spacing={8}>
                  <Badge color="sage" variant="light">
                    {draft.type}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    Notion-like entry editor
                  </Text>
                </Group>

                <Group spacing="sm">
                  {draft.type === 'SystemDesign' ||
                  (draft.type === 'InterviewPrep' && draft.roundType === 'Coding') ? (
                    <Button variant="light" size="xs" onClick={insertTemplate}>
                      {draft.type === 'SystemDesign' ? 'Insert SD Template' : 'Insert Coding Template'}
                    </Button>
                  ) : null}
                  <Button variant="light" size="xs" onClick={onClose}>
                    Close
                  </Button>
                  <Button size="xs" onClick={saveDraft} disabled={!canSave}>
                    Save
                  </Button>
                </Group>
              </Group>

              <SimpleGrid cols={3} spacing="md" breakpoints={[{ maxWidth: 'md', cols: 1, spacing: 'sm' }]}>
                <TextInput
                  label="Title"
                  value={draft.title}
                  onChange={(event) => updateBase({ title: event.currentTarget.value })}
                />
                <TextInput
                  label="Date"
                  type="date"
                  value={draft.dateISO}
                  onChange={(event) => updateBase({ dateISO: event.currentTarget.value })}
                />
                <TextInput
                  label="Link"
                  placeholder="https://..."
                  value={draft.link ?? ''}
                  onChange={(event) => updateBase({ link: event.currentTarget.value })}
                />
              </SimpleGrid>

              <SimpleGrid cols={4} spacing="md" breakpoints={[{ maxWidth: 'lg', cols: 2 }, { maxWidth: 'sm', cols: 1 }]}>
                <Switch
                  label="Starred"
                  checked={draft.starred}
                  onChange={(event) => updateBase({ starred: event.currentTarget.checked })}
                  mt={28}
                />

                {draft.type === 'LeetCode' ? (
                  <>
                    <Switch
                      label="Need review"
                      checked={draft.needReview}
                      onChange={(event) => updateLeetCode({ needReview: event.currentTarget.checked })}
                      mt={28}
                    />
                    <Select
                      label="Difficulty"
                      clearable
                      data={[...DIFFICULTIES]}
                      value={draft.difficulty ?? null}
                      onChange={(value) =>
                        updateLeetCode({ difficulty: (value ?? undefined) as LeetCodeEntry['difficulty'] })
                      }
                    />
                    <NumberInput
                      label="Problem #"
                      min={1}
                      value={draft.problemNumber ?? ''}
                      onChange={(value) =>
                        updateLeetCode({ problemNumber: typeof value === 'number' ? value : undefined })
                      }
                    />
                  </>
                ) : null}

                {draft.type === 'InterviewPrep' ? (
                  <>
                    <Select
                      label="Company"
                      searchable
                      creatable
                      data={companies}
                      value={draft.company || null}
                      getCreateLabel={(query) => `+ Create ${query}`}
                      onChange={(value) => updateInterviewPrep({ company: value ?? '' })}
                      onCreate={(query) => query}
                    />
                    <Select
                      label="Round Type"
                      data={[...ROUND_TYPES]}
                      value={draft.roundType}
                      onChange={(value) =>
                        updateInterviewPrep({
                          roundType: (value ?? 'Coding') as InterviewPrepEntry['roundType'],
                        })
                      }
                    />
                  </>
                ) : null}

                {draft.type === 'SystemDesign' ? (
                  <>
                    <Switch
                      label="Need review"
                      checked={Boolean(draft.needReview)}
                      onChange={(event) => updateSystemDesign({ needReview: event.currentTarget.checked })}
                      mt={28}
                    />
                    <NumberInput
                      label="Minutes"
                      min={0}
                      value={draft.minutes ?? ''}
                      onChange={(value) =>
                        updateSystemDesign({ minutes: typeof value === 'number' ? value : undefined })
                      }
                    />
                    <TextInput
                      label="Next review"
                      type="date"
                      value={draft.nextReviewDate ?? ''}
                      onChange={(event) =>
                        updateSystemDesign({ nextReviewDate: event.currentTarget.value || undefined })
                      }
                    />
                  </>
                ) : null}
              </SimpleGrid>

              <SimpleGrid cols={3} spacing="md" breakpoints={[{ maxWidth: 'lg', cols: 1 }]}>
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

                {draft.type === 'LeetCode' ? (
                  <>
                    <Switch
                      label="Solved"
                      checked={Boolean(draft.solved)}
                      onChange={(event) => updateLeetCode({ solved: event.currentTarget.checked })}
                      mt={28}
                    />
                    <TextInput
                      label="Next review"
                      type="date"
                      value={draft.nextReviewDate ?? ''}
                      onChange={(event) =>
                        updateLeetCode({ nextReviewDate: event.currentTarget.value || undefined })
                      }
                    />
                  </>
                ) : null}

                {draft.type === 'InterviewPrep' ? (
                  <NumberInput
                    label="Minutes"
                    min={0}
                    value={draft.minutes ?? ''}
                    onChange={(value) =>
                      updateInterviewPrep({ minutes: typeof value === 'number' ? value : undefined })
                    }
                  />
                ) : null}
              </SimpleGrid>
            </Stack>
          </Card>

          {draft.type === 'InterviewPrep' ? (
            <InterviewPrepEditor
              entryId={draft.id}
              userId={currentUserId}
              value={draft.contentJson}
              attachments={draft.attachments}
              onChange={(contentJson, attachments) =>
                updateInterviewPrep({
                  contentJson,
                  attachments,
                })
              }
            />
          ) : (
            <Card withBorder radius="lg" className="section-card">
              <Stack spacing="md">
                <Group position="apart">
                  <div>
                    <Text fw={700}>Blocks</Text>
                    <Text size="sm" c="dimmed">
                      Add, reorder, collapse, and edit content blocks like a lightweight Notion page.
                    </Text>
                  </div>
                  <Group spacing={8}>
                    <Button size="xs" variant="light" onClick={() => addBlock(createTextBlock())}>
                      Add text
                    </Button>
                    <Button size="xs" variant="light" onClick={() => addBlock(createCodeBlock())}>
                      Add code
                    </Button>
                    <Button size="xs" variant="light" onClick={() => addBlock(createFollowUpBlock())}>
                      Add follow-up
                    </Button>
                  </Group>
                </Group>

                <Divider />

                <Stack spacing="sm">
                  {draft.blocks.map((block, index) => renderBlock(block, index, draft.blocks.length))}
                </Stack>
              </Stack>
            </Card>
          )}
        </Stack>
      ) : null}
    </Drawer>
  );
}
