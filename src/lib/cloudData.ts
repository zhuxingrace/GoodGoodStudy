import { DIFFICULTIES, ENTRY_TYPES, ROUND_TYPES, type JournalEntry, type StudyEntry } from '../types';
import type { EntryAttachment } from '../types';
import {
  createEmptyRichDoc,
  createCodeBlock,
  createDefaultBlocks,
  createFollowUpBlock,
  createTextBlock,
  migrateInterviewPrepBlocksToContentJson,
  sortEntries,
  sortJournalEntries,
  todayISO,
} from './studyData';
import { ensureUuid } from './id';
import { sortTimeSessions, type TimeSession } from './timeTracker';
import { supabase } from './supabase';

export interface CloudAppData {
  entries: StudyEntry[];
  journalEntries: JournalEntry[];
  timeSessions: TimeSession[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const trimString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

const toPositiveInt = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return fallback;
};

const buildFallbackBlocks = (type: StudyEntry['type'], value: unknown) => {
  if (!Array.isArray(value)) {
    return createDefaultBlocks(type);
  }

  const blocks = value
    .map((item) => {
      if (!isObject(item) || typeof item.type !== 'string') {
        return null;
      }

      if (item.type === 'text') {
        return createTextBlock(typeof item.content === 'string' ? item.content : '');
      }

      if (item.type === 'code') {
        return createCodeBlock(undefined, typeof item.code === 'string' ? item.code : '');
      }

      if (item.type === 'followup') {
        return createFollowUpBlock(
          typeof item.question === 'string' ? item.question : '',
          typeof item.answer === 'string' ? item.answer : '',
        );
      }

      return null;
    })
    .filter((item): item is StudyEntry['blocks'][number] => Boolean(item));

  return blocks.length > 0 ? blocks : createDefaultBlocks(type);
};

const normalizeCloudEntry = (value: unknown): StudyEntry | null => {
  if (!isObject(value) || typeof value.type !== 'string' || !(ENTRY_TYPES as readonly string[]).includes(value.type)) {
    return null;
  }

  const type = value.type as StudyEntry['type'];
  const base = {
    id: ensureUuid(trimString(value.id)),
    dateISO: trimString(value.date_iso) ?? trimString(value.dateISO) ?? todayISO(),
    type,
    title: trimString(value.title) ?? 'Untitled session',
    link: trimString(value.link),
    starred: Boolean(value.starred),
    blocks: buildFallbackBlocks(type, value.blocks),
  };

  if (type === 'LeetCode') {
    return {
      ...base,
      type,
      tags: toStringArray(value.tags),
      problemNumber: toPositiveInt(value.problem_number, 0) || undefined,
      difficulty:
        typeof value.difficulty === 'string' && (DIFFICULTIES as readonly string[]).includes(value.difficulty)
          ? (value.difficulty as (typeof DIFFICULTIES)[number])
          : undefined,
      needReview: Boolean(value.need_review),
      minutes: toPositiveInt(value.minutes, 0) || undefined,
    };
  }

  if (type === 'SystemDesign') {
    return {
      ...base,
      type,
      tags: toStringArray(value.tags),
      needReview: Boolean(value.need_review),
      minutes: toPositiveInt(value.minutes, 0) || undefined,
    };
  }

  return {
    ...base,
    type,
    company: trimString(value.company) ?? '',
    roundType:
      typeof value.round_type === 'string' && (ROUND_TYPES as readonly string[]).includes(value.round_type)
        ? (value.round_type as (typeof ROUND_TYPES)[number])
        : 'Coding',
    tags: toStringArray(value.tags),
    minutes: toPositiveInt(value.minutes, 0) || undefined,
    contentJson:
      (isObject(value.content_json) ? value.content_json : isObject(value.contentJson) ? value.contentJson : null) ??
      migrateInterviewPrepBlocksToContentJson(base.blocks),
    attachments: Array.isArray(value.attachments) ? (value.attachments as EntryAttachment[]) : [],
  };
};

const normalizeCloudJournalEntry = (value: unknown): JournalEntry | null => {
  if (!isObject(value)) {
    return null;
  }

  const dateISO = trimString(value.date_iso) ?? trimString(value.dateISO);
  if (!dateISO) {
    return null;
  }

  return {
    dateISO,
    note: trimString(value.note),
    journal: trimString(value.journal),
    mood: trimString(value.mood),
  };
};

const normalizeCloudTimeSession = (value: unknown): TimeSession | null => {
  if (!isObject(value)) {
    return null;
  }

  const startedAt = trimString(value.started_at) ?? trimString(value.startAtISO);
  const endedAt = trimString(value.ended_at) ?? trimString(value.endAtISO);

  if (!startedAt || !endedAt) {
    return null;
  }

  const type = trimString(value.type);
  const normalizedType =
    type === 'LeetCode' || type === 'SystemDesign' || type === 'InterviewPrep' || type === 'Other' ? type : 'Other';

  return {
    id: ensureUuid(trimString(value.id)),
    category: trimString(value.label) ?? trimString(value.category) ?? 'Focus',
    type: normalizedType,
    mode: (trimString(value.mode) ?? 'focus') === 'break' ? 'break' : 'focus',
    dateISO: trimString(value.date_iso) ?? trimString(value.dateISO) ?? todayISO(new Date(endedAt)),
    minutes: Math.max(1, toPositiveInt(value.minutes, 1)),
    startAtISO: startedAt,
    endAtISO: endedAt,
    durationMinutes: Math.max(1, toPositiveInt(value.minutes ?? value.durationMinutes, 1)),
  };
};

const ensureClient = () => {
  if (!supabase) {
    throw new Error('Supabase env vars are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  return supabase;
};

const syncDeleteByIds = async (table: 'entries' | 'focus_sessions', userId: string, keepIds: string[]) => {
  const client = ensureClient();
  const { data, error } = await client.from(table).select('id').eq('user_id', userId);

  if (error) {
    throw error;
  }

  const idsToDelete = (data ?? [])
    .map((row) => trimString((row as Record<string, unknown>).id))
    .filter((id): id is string => {
      if (!id) {
        return false;
      }

      return !keepIds.includes(id);
    });

  if (idsToDelete.length === 0) {
    return;
  }

  const { error: deleteError } = await client.from(table).delete().eq('user_id', userId).in('id', idsToDelete);

  if (deleteError) {
    throw deleteError;
  }
};

const syncDeleteDayNotes = async (userId: string, keepDates: string[]) => {
  const client = ensureClient();
  const { data, error } = await client.from('day_notes').select('date_iso').eq('user_id', userId);

  if (error) {
    throw error;
  }

  const datesToDelete = (data ?? [])
    .map((row) => trimString((row as Record<string, unknown>).date_iso))
    .filter((value): value is string => {
      if (!value) {
        return false;
      }

      return !keepDates.includes(value);
    });

  if (datesToDelete.length === 0) {
    return;
  }

  const { error: deleteError } = await client.from('day_notes').delete().eq('user_id', userId).in('date_iso', datesToDelete);

  if (deleteError) {
    throw deleteError;
  }
};

const normalizeEntriesForSync = (entries: StudyEntry[]) =>
  sortEntries(
    entries.map((entry) => ({
      ...entry,
      id: ensureUuid(entry.id),
    })),
  );

const normalizeTimeSessionsForSync = (timeSessions: TimeSession[]) =>
  sortTimeSessions(
    timeSessions.map((session) => ({
      ...session,
      id: ensureUuid(session.id),
    })),
  );

export const loadCloudAppData = async (userId: string): Promise<CloudAppData> => {
  const client = ensureClient();
  const [{ data: entryRows, error: entriesError }, { data: dayNoteRows, error: notesError }, { data: sessionRows, error: sessionsError }] =
    await Promise.all([
      client.from('entries').select('*').eq('user_id', userId).order('date_iso', { ascending: false }),
      client.from('day_notes').select('*').eq('user_id', userId).order('date_iso', { ascending: false }),
      client.from('focus_sessions').select('*').eq('user_id', userId).order('ended_at', { ascending: false }),
    ]);

  if (entriesError) {
    throw entriesError;
  }

  if (notesError) {
    throw notesError;
  }

  if (sessionsError) {
    throw sessionsError;
  }

  return {
    entries: sortEntries((entryRows ?? []).map(normalizeCloudEntry).filter((entry): entry is StudyEntry => Boolean(entry))),
    journalEntries: sortJournalEntries(
      (dayNoteRows ?? []).map(normalizeCloudJournalEntry).filter((entry): entry is JournalEntry => Boolean(entry)),
    ),
    timeSessions: sortTimeSessions(
      (sessionRows ?? []).map(normalizeCloudTimeSession).filter((session): session is TimeSession => Boolean(session)),
    ),
  };
};

export const replaceCloudAppData = async (
  userId: string,
  appData: CloudAppData,
): Promise<CloudAppData> => {
  const client = ensureClient();
  const timestamp = new Date().toISOString();
  const entries = normalizeEntriesForSync(appData.entries);
  const journalEntries = sortJournalEntries(appData.journalEntries);
  const timeSessions = normalizeTimeSessionsForSync(appData.timeSessions);

  if (entries.length > 0) {
    const { error } = await client.from('entries').upsert(
      entries.map((entry) => ({
        id: entry.id,
        user_id: userId,
        date_iso: entry.dateISO,
        type: entry.type,
        title: entry.title,
        link: entry.link ?? null,
        starred: entry.starred,
        tags: entry.tags,
        problem_number: entry.type === 'LeetCode' ? entry.problemNumber ?? null : null,
        difficulty: entry.type === 'LeetCode' ? entry.difficulty ?? null : null,
        need_review: entry.type === 'LeetCode' || entry.type === 'SystemDesign' ? Boolean(entry.needReview) : false,
        language: null,
        company: entry.type === 'InterviewPrep' ? entry.company || null : null,
        round_type: entry.type === 'InterviewPrep' ? entry.roundType || null : null,
        blocks: entry.blocks,
        content_json:
          entry.type === 'InterviewPrep'
            ? entry.contentJson ?? createEmptyRichDoc()
            : null,
        attachments: entry.type === 'InterviewPrep' ? entry.attachments ?? [] : null,
        updated_at: timestamp,
      })),
      { onConflict: 'id' },
    );

    if (error) {
      throw error;
    }
  }

  await syncDeleteByIds('entries', userId, entries.map((entry) => entry.id));

  if (journalEntries.length > 0) {
    const { error } = await client.from('day_notes').upsert(
      journalEntries.map((entry) => ({
        user_id: userId,
        date_iso: entry.dateISO,
        note: entry.note ?? null,
        journal: entry.journal ?? null,
        mood: entry.mood ?? null,
        updated_at: timestamp,
      })),
      { onConflict: 'user_id,date_iso' },
    );

    if (error) {
      throw error;
    }
  }

  await syncDeleteDayNotes(userId, journalEntries.map((entry) => entry.dateISO));

  if (timeSessions.length > 0) {
    const { error } = await client.from('focus_sessions').upsert(
      timeSessions.map((session) => ({
        id: session.id,
        user_id: userId,
        date_iso: session.dateISO,
        started_at: session.startAtISO,
        ended_at: session.endAtISO,
        minutes: session.minutes,
        type: session.type,
        label: session.category,
        mode: session.mode,
      })),
      { onConflict: 'id' },
    );

    if (error) {
      throw error;
    }
  }

  await syncDeleteByIds('focus_sessions', userId, timeSessions.map((session) => session.id));

  return {
    entries,
    journalEntries,
    timeSessions,
  };
};
