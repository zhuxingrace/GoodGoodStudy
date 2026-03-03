import {
  CODE_LANGUAGE_LABELS,
  CODE_LANGUAGES,
  DIFFICULTIES,
  ENTRY_TYPES,
  JOURNAL_MOODS,
  ROUND_TYPES,
  type Block,
  type CodeBlock,
  type CodeLanguage,
  type Difficulty,
  type EntryType,
  type ExportPayload,
  type InterviewPrepEntry,
  type JournalEntry,
  type JournalMood,
  type LibraryFilters,
  type LeetCodeEntry,
  type RoundType,
  type StudyEntry,
  type SystemDesignEntry,
  type TextBlock,
} from '../types';
import { createUuid } from './id';
import { normalizeImportedTimeSessions, type TimeSession } from './timeTracker';

const STORAGE_KEY = 'study-tracker.entries.v1';
const JOURNAL_STORAGE_KEY = 'study-tracker.journal.v1';
const LAST_CODE_LANGUAGE_KEY = 'study-tracker.last-code-language.v1';
const EXPORT_VERSION = 3;

export const SYSTEM_DESIGN_TEMPLATE = `Prompt/Goal

Functional requirements

Non-functional (QPS/latency/availability/consistency)

API sketch

High-level architecture

Data model

Core flows

Trade-offs

Failure modes & mitigations

Metrics/observability

Follow-up Qs + answers`;

export const INTERVIEW_CODING_TEMPLATE = `Problem (1 sentence)

Clarifying Qs

Approach + DS

Implementation notes / edge cases

Complexity

Follow-ups (Q -> short A)

Testing ideas

Redo plan`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isEntryType = (value: unknown): value is EntryType =>
  typeof value === 'string' && (ENTRY_TYPES as readonly string[]).includes(value);

const isDifficulty = (value: unknown): value is Difficulty =>
  typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);

const isRoundType = (value: unknown): value is RoundType =>
  typeof value === 'string' && (ROUND_TYPES as readonly string[]).includes(value);

const isJournalMood = (value: unknown): value is JournalMood =>
  typeof value === 'string' && (JOURNAL_MOODS as readonly string[]).includes(value);

const LEGACY_JOURNAL_MOOD_MAP: Record<string, JournalMood> = {
  Calm: '😌',
  Focused: '🎯',
  Good: '😊',
  Tired: '😴',
  Stressed: '😵',
};

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => trimString(item))
    .filter((item): item is string => Boolean(item));
};

const toMinutes = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
};

const toProblemNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }

  return undefined;
};

const normalizeCodeLanguage = (value: unknown, fallback: CodeLanguage = 'java'): CodeLanguage => {
  const raw = trimString(value);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();

  if ((CODE_LANGUAGES as readonly string[]).includes(normalized)) {
    return normalized as CodeLanguage;
  }

  if (normalized === 'js') {
    return 'javascript';
  }

  if (normalized === 'ts') {
    return 'typescript';
  }

  if (normalized === 'c++') {
    return 'cpp';
  }

  if (
    normalized === 'other' ||
    normalized === 'plain' ||
    normalized === 'plain text' ||
    normalized === 'text' ||
    normalized === 'txt'
  ) {
    return 'plaintext';
  }

  return 'plaintext';
};

export const createId = () => {
  return createUuid();
};

export const createTextBlock = (content = ''): TextBlock => ({
  id: createId(),
  type: 'text',
  content,
});

export const createCodeBlock = (language?: CodeLanguage, code = ''): CodeBlock => ({
  id: createId(),
  type: 'code',
  language: language ?? getDefaultCodeLanguage(),
  code,
});

export const createFollowUpBlock = (question = '', answer = ''): Block => ({
  id: createId(),
  type: 'followup',
  question,
  answer,
});

export const todayISO = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseISODate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseISODate(value));

export const addDaysISO = (value: string, days: number) => {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return todayISO(date);
};

export const startOfWeekISO = (reference = new Date()) => {
  const date = new Date(reference);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return todayISO(date);
};

export const getDefaultCodeLanguage = (): CodeLanguage => {
  if (typeof window === 'undefined') {
    return 'java';
  }

  const stored = window.localStorage.getItem(LAST_CODE_LANGUAGE_KEY);
  return normalizeCodeLanguage(stored ?? undefined, 'java');
};

export const persistLastUsedCodeLanguage = (entries: StudyEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  const latestLanguage = sortEntries(entries)
    .flatMap((entry) => entry.blocks)
    .find((block): block is CodeBlock => block.type === 'code' && Boolean(trimString(block.language)))
    ?.language;

  if (latestLanguage) {
    window.localStorage.setItem(LAST_CODE_LANGUAGE_KEY, latestLanguage);
  }
};

export const createDefaultBlocks = (type: EntryType): Block[] => {
  if (type === 'LeetCode') {
    return [createCodeBlock(), createTextBlock()];
  }

  if (type === 'SystemDesign') {
    return [createTextBlock()];
  }

  return [createTextBlock(), createCodeBlock(), createFollowUpBlock()];
};

export const createEmptyEntry = (type: EntryType, dateISO = todayISO()): StudyEntry => {
  const base = {
    id: createId(),
    dateISO,
    type,
    title: '',
    link: '',
    starred: false,
    blocks: createDefaultBlocks(type),
  };

  if (type === 'LeetCode') {
    return {
      ...base,
      type,
      tags: [],
      solved: true,
      needReview: false,
    };
  }

  if (type === 'SystemDesign') {
    return {
      ...base,
      type,
      tags: [],
      templateMode: false,
      needReview: false,
    };
  }

  return {
    ...base,
    type,
    company: '',
    roundType: 'Coding',
    tags: [],
  };
};

export const duplicateStudyEntry = (entry: StudyEntry): StudyEntry => {
  const duplicated = structuredClone(entry);
  duplicated.id = createId();
  duplicated.starred = false;
  duplicated.blocks = duplicated.blocks.map((block) => ({
    ...block,
    id: createId(),
  }));
  return duplicated;
};

const normalizeBlock = (value: unknown): Block | null => {
  if (!isObject(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'text') {
    return {
      id: trimString(value.id) ?? createId(),
      type: 'text',
      content: typeof value.content === 'string' ? value.content : '',
    };
  }

  if (value.type === 'code') {
    return {
      id: trimString(value.id) ?? createId(),
      type: 'code',
      code: typeof value.code === 'string' ? value.code : '',
      language: normalizeCodeLanguage(value.language),
    };
  }

  if (value.type === 'followup') {
    return {
      id: trimString(value.id) ?? createId(),
      type: 'followup',
      question: typeof value.question === 'string' ? value.question : '',
      answer: typeof value.answer === 'string' ? value.answer : '',
    };
  }

  return null;
};

const buildMigratedBlocks = (value: Record<string, unknown>, type: EntryType) => {
  const hasBlocksArray = Array.isArray(value.blocks);
  const normalizedBlocks = Array.isArray(value.blocks)
    ? value.blocks
        .map((item) => normalizeBlock(item))
        .filter((item): item is Block => Boolean(item))
    : [];

  if (hasBlocksArray) {
    return normalizedBlocks;
  }

  const migratedBlocks: Block[] = [];
  const notes = typeof value.notes === 'string' ? value.notes : '';
  const code = typeof value.code === 'string' ? value.code : '';
  const language = normalizeCodeLanguage(value.language);

  if (notes.trim()) {
    migratedBlocks.push(createTextBlock(notes));
  }

  if (code.trim()) {
    migratedBlocks.push(createCodeBlock(language, code));
  }

  if (Array.isArray(value.followUps)) {
    value.followUps.forEach((item) => {
      if (!isObject(item)) {
        return;
      }

      migratedBlocks.push(
        createFollowUpBlock(
          typeof item.question === 'string' ? item.question : '',
          typeof item.answer === 'string' ? item.answer : '',
        ),
      );
    });
  }

  return migratedBlocks.length > 0 ? migratedBlocks : createDefaultBlocks(type);
};

const normalizeEntry = (value: unknown): StudyEntry | null => {
  if (!isObject(value) || !isEntryType(value.type)) {
    return null;
  }

  const base = {
    id: trimString(value.id) ?? createId(),
    dateISO: trimString(value.dateISO) ?? todayISO(),
    type: value.type,
    title: trimString(value.title) ?? 'Untitled session',
    link: trimString(value.link),
    starred: Boolean(value.starred),
    blocks: buildMigratedBlocks(value, value.type),
  };

  if (value.type === 'LeetCode') {
    const entry: LeetCodeEntry = {
      ...base,
      type: 'LeetCode',
      difficulty: isDifficulty(value.difficulty) ? value.difficulty : undefined,
      problemNumber: toProblemNumber(value.problemNumber),
      tags: toStringArray(value.tags),
      minutes: toMinutes(value.minutes),
      solved: typeof value.solved === 'boolean' ? value.solved : undefined,
      needReview: Boolean(value.needReview),
      nextReviewDate: trimString(value.nextReviewDate),
    };
    return entry;
  }

  if (value.type === 'SystemDesign') {
    const entry: SystemDesignEntry = {
      ...base,
      type: 'SystemDesign',
      tags: toStringArray(value.tags),
      minutes: toMinutes(value.minutes),
      needReview: typeof value.needReview === 'boolean' ? value.needReview : undefined,
      nextReviewDate: trimString(value.nextReviewDate),
      templateMode: typeof value.templateMode === 'boolean' ? value.templateMode : undefined,
    };
    return entry;
  }

  const entry: InterviewPrepEntry = {
    ...base,
    type: 'InterviewPrep',
    company: trimString(value.company) ?? '',
    roundType: isRoundType(value.roundType) ? value.roundType : 'Coding',
    tags: toStringArray(value.tags),
    minutes: toMinutes(value.minutes),
  };
  return entry;
};

const normalizeJournalEntry = (value: unknown): JournalEntry | null => {
  if (!isObject(value)) {
    return null;
  }

  const dateISO = trimString(value.dateISO);
  if (!dateISO) {
    return null;
  }

  return {
    dateISO,
    note: trimString(value.note),
    mood:
      isJournalMood(value.mood)
        ? value.mood
        : typeof value.mood === 'string'
          ? LEGACY_JOURNAL_MOOD_MAP[value.mood]
          : undefined,
    journal: trimString(value.journal),
  };
};

export const seedEntries = (): StudyEntry[] => {
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const twoDaysAgo = addDaysISO(today, -2);

  return [
    {
      id: createId(),
      dateISO: today,
      type: 'LeetCode',
      title: 'Binary Tree Right Side View',
      link: 'https://leetcode.com/problems/binary-tree-right-side-view/',
      starred: true,
      difficulty: 'Medium',
      problemNumber: 199,
      tags: ['Trees', 'BFS', 'DFS'],
      solved: true,
      needReview: true,
      nextReviewDate: addDaysISO(today, 7),
      blocks: [
        createCodeBlock('java', 'class Solution {\n  public List<Integer> rightSideView(TreeNode root) {\n    return new ArrayList<>();\n  }\n}'),
        createTextBlock('Used BFS first, then rewrote with right-first DFS. Revisit recursion edge cases.'),
      ],
    },
    {
      id: createId(),
      dateISO: today,
      type: 'SystemDesign',
      title: 'Rate limiter patterns',
      starred: false,
      tags: ['Caching', 'Distributed systems', 'API'],
      minutes: 55,
      needReview: true,
      nextReviewDate: addDaysISO(today, 14),
      templateMode: true,
      blocks: [createTextBlock(SYSTEM_DESIGN_TEMPLATE)],
    },
    {
      id: createId(),
      dateISO: yesterday,
      type: 'InterviewPrep',
      title: 'Airbnb cache invalidation mock',
      starred: true,
      company: 'Airbnb',
      roundType: 'SystemDesign',
      tags: ['Caching', 'Consistency'],
      minutes: 70,
      blocks: [
        createTextBlock(INTERVIEW_CODING_TEMPLATE),
        createCodeBlock('python', '# pseudo\n# cache invalidation checkpoints'),
        createFollowUpBlock('How would you handle stale reads?', 'Version keys and async refresh workers.'),
        createFollowUpBlock('What breaks first at higher QPS?', 'Write amplification and fan-out on invalidation.'),
      ],
    },
    {
      id: createId(),
      dateISO: twoDaysAgo,
      type: 'LeetCode',
      title: 'LRU Cache',
      starred: false,
      difficulty: 'Medium',
      problemNumber: 146,
      tags: ['Design', 'Hash Map', 'Linked List'],
      solved: true,
      needReview: true,
      nextReviewDate: addDaysISO(today, 3),
      blocks: [
        createCodeBlock('java', 'class LRUCache {\n  // hashmap + doubly linked list\n}'),
        createTextBlock('Need to rehearse the hashmap + doubly linked list explanation.'),
      ],
    },
    {
      id: createId(),
      dateISO: twoDaysAgo,
      type: 'InterviewPrep',
      title: 'Behavioral stories inventory',
      starred: false,
      company: 'Stripe',
      roundType: 'Behavioral',
      tags: ['STAR', 'Leadership'],
      minutes: 25,
      blocks: [
        createTextBlock('Refined STAR stories for conflict and leadership questions.'),
        createCodeBlock('plaintext', ''),
        createFollowUpBlock('', ''),
      ],
    },
  ];
};

export const sortEntries = (entries: StudyEntry[]) =>
  [...entries].sort((left, right) => {
    if (left.dateISO === right.dateISO) {
      return right.title.localeCompare(left.title);
    }

    return right.dateISO.localeCompare(left.dateISO);
  });

export const sortJournalEntries = (journalEntries: JournalEntry[]) =>
  [...journalEntries].sort((left, right) => right.dateISO.localeCompare(left.dateISO));

export const hasJournalContent = (entry?: JournalEntry | null) =>
  Boolean(entry?.journal?.trim() || entry?.note?.trim() || entry?.mood);

export const hasJournalText = (entry?: JournalEntry | null) => Boolean(entry?.journal?.trim());

export const loadEntries = (): StudyEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = sortEntries(seedEntries());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    const candidateEntries = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];
    const hasRecognizedShape = Array.isArray(parsed) || (isObject(parsed) && Array.isArray(parsed.entries));

    const normalized = candidateEntries
      .map((item) => normalizeEntry(item))
      .filter((item): item is StudyEntry => Boolean(item));

    if (hasRecognizedShape) {
      return sortEntries(normalized);
    }
  } catch {
    // Fall back to seeded data below.
  }

  const seeded = sortEntries(seedEntries());
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
};

export const loadExistingLocalEntries = (): StudyEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    const candidateEntries = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

    return sortEntries(
      candidateEntries
        .map((item) => normalizeEntry(item))
        .filter((item): item is StudyEntry => Boolean(item)),
    );
  } catch {
    return [];
  }
};

export const loadJournalEntries = (): JournalEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const source = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.journalEntries)
        ? parsed.journalEntries
        : [];

    return sortJournalEntries(
      source
        .map((item) => normalizeJournalEntry(item))
        .filter((item): item is JournalEntry => Boolean(item)),
    );
  } catch {
    return [];
  }
};

export const saveEntries = (entries: StudyEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sortEntries(entries)));
};

export const saveJournalEntries = (journalEntries: JournalEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(sortJournalEntries(journalEntries)));
};

export const clearLocalEntries = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
};

export const clearLocalJournalEntries = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify([]));
};

export const buildExportPayload = (
  entries: StudyEntry[],
  journalEntries: JournalEntry[] = [],
  timeSessions: TimeSession[] = [],
): ExportPayload => ({
  version: EXPORT_VERSION,
  exportedAt: new Date().toISOString(),
  entries: sortEntries(entries),
  journalEntries: sortJournalEntries(journalEntries),
  timeSessions: [...timeSessions].sort((left, right) => right.endAtISO.localeCompare(left.endAtISO)),
});

export const parseImportBundle = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  const entrySource = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed.entries)
      ? parsed.entries
      : null;

  if (!entrySource) {
    throw new Error('Import file must contain an entries array.');
  }

  const entries = entrySource
    .map((item) => normalizeEntry(item))
    .filter((item): item is StudyEntry => Boolean(item));

  if (entrySource.length > 0 && entries.length === 0) {
    throw new Error('No valid entries found in the import file.');
  }

  const journalSource = isObject(parsed) && Array.isArray(parsed.journalEntries) ? parsed.journalEntries : [];
  const journalEntries = journalSource
    .map((item) => normalizeJournalEntry(item))
    .filter((item): item is JournalEntry => Boolean(item));

  const timeSessionSource = isObject(parsed) ? parsed.timeSessions : [];

  return {
    entries: sortEntries(entries),
    journalEntries: sortJournalEntries(journalEntries),
    timeSessions: normalizeImportedTimeSessions(timeSessionSource),
  };
};

export const parseImportPayload = (raw: string): StudyEntry[] => parseImportBundle(raw).entries;

export const mergeEntries = (current: StudyEntry[], incoming: StudyEntry[]) => {
  const merged = new Map<string, StudyEntry>();

  current.forEach((entry) => {
    merged.set(entry.id, entry);
  });

  incoming.forEach((entry) => {
    const nextEntry = merged.has(entry.id) ? { ...entry, id: createId() } : entry;
    merged.set(nextEntry.id, nextEntry);
  });

  return sortEntries(Array.from(merged.values()));
};

export const mergeJournalEntries = (current: JournalEntry[], incoming: JournalEntry[]) => {
  const merged = new Map<string, JournalEntry>();

  current.forEach((entry) => {
    merged.set(entry.dateISO, entry);
  });

  incoming.forEach((entry) => {
    merged.set(entry.dateISO, entry);
  });

  return sortJournalEntries(Array.from(merged.values()));
};

export const collectCompanies = (entries: StudyEntry[]) =>
  Array.from(
    new Set(
      entries
        .filter((entry): entry is InterviewPrepEntry => entry.type === 'InterviewPrep')
        .map((entry) => entry.company)
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));

export const getEntryTags = (entry: StudyEntry) => entry.tags;

export const collectTags = (entries: StudyEntry[]) =>
  Array.from(new Set(entries.flatMap((entry) => getEntryTags(entry)))).sort((left, right) =>
    left.localeCompare(right),
  );

export const getTextBlocks = (entry: StudyEntry) =>
  entry.blocks.filter((block): block is TextBlock => block.type === 'text');

export const getPrimaryText = (entry: StudyEntry) => getTextBlocks(entry)[0]?.content ?? '';

export const getCombinedText = (entry: StudyEntry) =>
  getTextBlocks(entry)
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n');

export const countBlocks = (entry: StudyEntry, type: Block['type']) =>
  entry.blocks.filter((block) => block.type === type).length;

export const insertTemplateIntoEntry = (entry: StudyEntry): StudyEntry => {
  const template = entry.type === 'SystemDesign' ? SYSTEM_DESIGN_TEMPLATE : INTERVIEW_CODING_TEMPLATE;
  const firstTextIndex = entry.blocks.findIndex((block) => block.type === 'text');

  if (firstTextIndex === -1) {
    return {
      ...entry,
      blocks: [createTextBlock(template), ...entry.blocks],
    };
  }

  return {
    ...entry,
    blocks: entry.blocks.map((block, index) =>
      index === firstTextIndex && block.type === 'text'
        ? {
            ...block,
            content: block.content.trim() ? `${block.content}\n\n${template}` : template,
          }
        : block,
    ),
  };
};

export const entryMatchesSearch = (entry: StudyEntry, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const blockText = entry.blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.content;
      }

      if (block.type === 'code') {
        return `${CODE_LANGUAGE_LABELS[block.language]} ${block.language} ${block.code}`;
      }

      return `${block.question} ${block.answer}`;
    })
    .join(' ');

  const searchParts = [entry.title, entry.link ?? '', ...getEntryTags(entry), blockText];

  if (entry.type === 'InterviewPrep') {
    searchParts.push(entry.company, entry.roundType);
  }

  if (entry.type === 'LeetCode') {
    searchParts.push(entry.difficulty ?? '', String(entry.problemNumber ?? ''));
  }

  return searchParts.join(' ').toLowerCase().includes(normalizedQuery);
};

export const filterEntries = (entries: StudyEntry[], filters: LibraryFilters) =>
  sortEntries(
    entries.filter((entry) => {
      if (!entryMatchesSearch(entry, filters.query)) {
        return false;
      }

      if (filters.type && entry.type !== filters.type) {
        return false;
      }

      if (filters.dateFrom && entry.dateISO < filters.dateFrom) {
        return false;
      }

      if (filters.dateTo && entry.dateISO > filters.dateTo) {
        return false;
      }

      if (filters.starredOnly && !entry.starred) {
        return false;
      }

      if (filters.needReviewOnly && (!filters.type || filters.type === 'LeetCode')) {
        if (entry.type !== 'LeetCode' || !entry.needReview) {
          return false;
        }
      }

      if (filters.difficulty && entry.type === 'LeetCode' && entry.difficulty !== filters.difficulty) {
        return false;
      }

      if (filters.difficulty && entry.type !== 'LeetCode') {
        return false;
      }

      if (filters.company) {
        if (entry.type !== 'InterviewPrep' || entry.company !== filters.company) {
          return false;
        }
      }

      if (filters.roundType) {
        if (entry.type !== 'InterviewPrep' || entry.roundType !== filters.roundType) {
          return false;
        }
      }

      return true;
    }),
  );

export const getReviewState = (entry: StudyEntry) => {
  if (entry.type === 'LeetCode') {
    return entry.needReview;
  }

  if (entry.type === 'SystemDesign') {
    return Boolean(entry.needReview);
  }

  return false;
};

export const supportsReview = (entry: StudyEntry) => entry.type !== 'InterviewPrep';

export const toggleReview = (entry: StudyEntry): StudyEntry => {
  if (entry.type === 'LeetCode') {
    return { ...entry, needReview: !entry.needReview };
  }

  if (entry.type === 'SystemDesign') {
    return { ...entry, needReview: !entry.needReview };
  }

  return entry;
};
