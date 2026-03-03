export const ENTRY_TYPES = ['LeetCode', 'SystemDesign', 'InterviewPrep'] as const;
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export const ROUND_TYPES = ['Coding', 'SystemDesign', 'Behavioral', 'Mock'] as const;
export const JOURNAL_MOODS = ['😌', '🎯', '😊', '😴', '😵'] as const;
export const BLOCK_TYPES = ['text', 'code', 'followup'] as const;
export const CODE_LANGUAGES = ['java', 'python', 'cpp', 'javascript', 'typescript', 'go', 'sql', 'plaintext'] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type RoundType = (typeof ROUND_TYPES)[number];
export type JournalPresetMood = (typeof JOURNAL_MOODS)[number];
export type JournalMood = string;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const CODE_LANGUAGE_OPTIONS: Array<{ value: CodeLanguage; label: string }> = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'plaintext', label: 'Plain text' },
];

export const JOURNAL_MOOD_LABELS: Record<JournalPresetMood, string> = {
  '😌': 'Calm',
  '🎯': 'Focused',
  '😊': 'Good',
  '😴': 'Tired',
  '😵': 'Stressed',
};

export const CODE_LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  java: 'Java',
  python: 'Python',
  cpp: 'C++',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  sql: 'SQL',
  plaintext: 'Plain text',
};

export interface TextBlock {
  id: string;
  type: 'text';
  content: string;
}

export interface CodeBlock {
  id: string;
  type: 'code';
  code: string;
  language: CodeLanguage;
}

export interface FollowUpBlock {
  id: string;
  type: 'followup';
  question: string;
  answer: string;
}

export type Block = TextBlock | CodeBlock | FollowUpBlock;
export type RichContentJson = Record<string, unknown>;

export interface EntryAttachment {
  id: string;
  name: string;
  bucket: string;
  path: string;
  mime: string;
  size: number;
  created_at: string;
}

export interface EntryBase {
  id: string;
  dateISO: string;
  type: EntryType;
  title: string;
  link?: string;
  starred: boolean;
  blocks: Block[];
}

export interface LeetCodeEntry extends EntryBase {
  type: 'LeetCode';
  difficulty?: Difficulty;
  problemNumber?: number;
  tags: string[];
  minutes?: number;
  solved?: boolean;
  needReview: boolean;
  nextReviewDate?: string;
}

export interface SystemDesignEntry extends EntryBase {
  type: 'SystemDesign';
  tags: string[];
  minutes?: number;
  needReview?: boolean;
  nextReviewDate?: string;
  templateMode?: boolean;
}

export interface InterviewPrepEntry extends EntryBase {
  type: 'InterviewPrep';
  company: string;
  roundType: RoundType;
  tags: string[];
  minutes?: number;
  contentJson?: RichContentJson | null;
  attachments?: EntryAttachment[];
}

export type StudyEntry = LeetCodeEntry | SystemDesignEntry | InterviewPrepEntry;

export interface JournalEntry {
  dateISO: string;
  note?: string;
  mood?: JournalMood;
  journal?: string;
}

export interface LibraryFilters {
  query: string;
  type?: EntryType;
  dateFrom?: string;
  dateTo?: string;
  starredOnly: boolean;
  needReviewOnly: boolean;
  difficulty?: Difficulty;
  company?: string;
  roundType?: RoundType;
}

export interface ExportPayload {
  version: number;
  exportedAt: string;
  entries: StudyEntry[];
  journalEntries?: JournalEntry[];
  timeSessions?: Array<{
    id: string;
    category: string;
    type: 'LeetCode' | 'SystemDesign' | 'InterviewPrep' | 'Other';
    mode: 'focus' | 'break';
    dateISO: string;
    minutes: number;
    startAtISO: string;
    endAtISO: string;
    durationMinutes: number;
  }>;
}
