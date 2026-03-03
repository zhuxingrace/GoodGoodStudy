export const TIMER_PRESET_CATEGORIES = ['LeetCode', 'SystemDesign', 'InterviewPrep'] as const;
export const FOCUS_SESSION_TYPES = ['LeetCode', 'SystemDesign', 'InterviewPrep', 'Other'] as const;

const TIME_SESSIONS_KEY = 'study-tracker.time-sessions.v1';
const TIMER_CATEGORIES_KEY = 'study-tracker.timer-categories.v1';
const ACTIVE_TIMER_KEY = 'study-tracker.active-timer.v1';
const WIDGET_POSITION_KEY = 'study-tracker.pomodoro-position.v1';
const LAST_FOCUS_SESSION_TYPE_KEY = 'study-tracker.last-focus-session-type.v1';

export type TimerMode = 'focus' | 'break';
export type FocusSessionType = (typeof FOCUS_SESSION_TYPES)[number];

export interface TimeSession {
  id: string;
  category: string;
  type: FocusSessionType;
  mode: TimerMode;
  dateISO: string;
  minutes: number;
  startAtISO: string;
  endAtISO: string;
  durationMinutes: number;
}

export interface ActiveTimerState {
  isRunning: boolean;
  isPaused: boolean;
  mode: TimerMode;
  category: string;
  startedAtMs?: number;
  phaseStartedAtMs?: number;
  focusMinutes: number;
  breakMinutes: number;
  durationSeconds: number;
  phaseTotalSeconds: number;
  pausedRemainingSeconds?: number;
  autoStartBreak: boolean;
  lastCompletedAtISO?: string;
}

export interface WidgetPosition {
  x: number;
  y: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFocusSessionType = (value: unknown): value is FocusSessionType =>
  typeof value === 'string' && (FOCUS_SESSION_TYPES as readonly string[]).includes(value);

const trimString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toPositiveMinutes = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return fallback;
};

const toNonNegativeSeconds = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  return fallback;
};

const toTimestampMs = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const direct = Number(trimmed);
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct);
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const toLocalDateISO = (value: number | string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const ensureTimerCategories = (categories: string[]) => {
  const normalized = categories.map((item) => item.trim()).filter(Boolean);
  const merged = [...TIMER_PRESET_CATEGORIES, ...normalized];
  return Array.from(new Set(merged));
};

export const createDefaultActiveTimer = (category: string = TIMER_PRESET_CATEGORIES[0]): ActiveTimerState => ({
  isRunning: false,
  isPaused: false,
  mode: 'focus',
  category,
  focusMinutes: 25,
  breakMinutes: 5,
  durationSeconds: 25 * 60,
  phaseTotalSeconds: 25 * 60,
  pausedRemainingSeconds: 25 * 60,
  autoStartBreak: true,
});

export const getPhaseDurationSeconds = (timer: ActiveTimerState) =>
  Math.max(
    1,
    timer.phaseTotalSeconds || (timer.mode === 'focus' ? timer.focusMinutes : timer.breakMinutes) * 60,
  );

export const getDisplayRemainingSeconds = (timer: ActiveTimerState, now = Date.now()) => {
  if (timer.isRunning && typeof timer.startedAtMs === 'number') {
    const elapsedSeconds = Math.floor((now - timer.startedAtMs) / 1000);
    return Math.max(0, timer.durationSeconds - elapsedSeconds);
  }

  if (timer.isPaused) {
    return Math.max(0, timer.pausedRemainingSeconds ?? timer.durationSeconds);
  }

  return Math.max(0, timer.durationSeconds);
};

export const loadTimeSessions = (): TimeSession[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(TIME_SESSIONS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => isObject(item))
      .map((item) => {
        const endAtISO = trimString(item.endAtISO) ?? new Date().toISOString();
        const minutes = toPositiveMinutes(item.minutes, toPositiveMinutes(item.durationMinutes, 1));

        return {
          id: trimString(item.id) ?? `session-${Date.now()}`,
          category: trimString(item.category) ?? TIMER_PRESET_CATEGORIES[0],
          type: isFocusSessionType(item.type) ? item.type : 'Other',
          mode: (item.mode === 'break' ? 'break' : 'focus') as TimerMode,
          dateISO: trimString(item.dateISO) ?? toLocalDateISO(endAtISO),
          minutes,
          startAtISO: trimString(item.startAtISO) ?? new Date().toISOString(),
          endAtISO,
          durationMinutes: minutes,
        };
      })
      .sort((left, right) => right.endAtISO.localeCompare(left.endAtISO));
  } catch {
    return [];
  }
};

export const saveTimeSessions = (sessions: TimeSession[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    TIME_SESSIONS_KEY,
    JSON.stringify([...sessions].sort((left, right) => right.endAtISO.localeCompare(left.endAtISO))),
  );
};

export const loadLastFocusSessionType = (): FocusSessionType => {
  if (typeof window === 'undefined') {
    return 'Other';
  }

  const raw = window.localStorage.getItem(LAST_FOCUS_SESSION_TYPE_KEY);
  return isFocusSessionType(raw) ? raw : 'Other';
};

export const saveLastFocusSessionType = (value: FocusSessionType) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LAST_FOCUS_SESSION_TYPE_KEY, value);
};

export const loadTimerCategories = (): string[] => {
  if (typeof window === 'undefined') {
    return [...TIMER_PRESET_CATEGORIES];
  }

  const raw = window.localStorage.getItem(TIMER_CATEGORIES_KEY);
  if (!raw) {
    return [...TIMER_PRESET_CATEGORIES];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...TIMER_PRESET_CATEGORIES];
    }

    return ensureTimerCategories(
      parsed.filter((item): item is string => typeof item === 'string'),
    );
  } catch {
    return [...TIMER_PRESET_CATEGORIES];
  }
};

export const saveTimerCategories = (categories: string[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TIMER_CATEGORIES_KEY, JSON.stringify(ensureTimerCategories(categories)));
};

export const loadActiveTimerState = (categories: string[]): ActiveTimerState => {
  if (typeof window === 'undefined') {
    return createDefaultActiveTimer(categories[0] ?? TIMER_PRESET_CATEGORIES[0]);
  }

  const raw = window.localStorage.getItem(ACTIVE_TIMER_KEY);
  if (!raw) {
    return createDefaultActiveTimer(categories[0] ?? TIMER_PRESET_CATEGORIES[0]);
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return createDefaultActiveTimer(categories[0] ?? TIMER_PRESET_CATEGORIES[0]);
    }

    const category = trimString(parsed.category) ?? categories[0] ?? TIMER_PRESET_CATEGORIES[0];
    const focusMinutes = toPositiveMinutes(parsed.focusMinutes, 25);
    const breakMinutes = toPositiveMinutes(parsed.breakMinutes, 5);
    const mode: TimerMode = parsed.mode === 'break' ? 'break' : 'focus';
    const phaseDefaultSeconds = (mode === 'focus' ? focusMinutes : breakMinutes) * 60;
    const legacyStartedAtMs = toTimestampMs(parsed.startedAtISO);
    const legacyPhaseStartedAtMs = toTimestampMs(parsed.phaseStartedAtISO);
    const startedAtMs = toTimestampMs(parsed.startedAtMs) ?? legacyStartedAtMs;
    const phaseStartedAtMs = toTimestampMs(parsed.phaseStartedAtMs) ?? legacyPhaseStartedAtMs ?? startedAtMs;
    const legacyStoredRemaining = toNonNegativeSeconds(parsed.remainingSeconds, phaseDefaultSeconds);
    const elapsedBeforeCurrentRun =
      typeof startedAtMs === 'number' && typeof phaseStartedAtMs === 'number' && startedAtMs >= phaseStartedAtMs
        ? Math.floor((startedAtMs - phaseStartedAtMs) / 1000)
        : 0;
    const derivedPhaseTotal = Math.max(
      phaseDefaultSeconds,
      toNonNegativeSeconds(parsed.phaseTotalSeconds, legacyStoredRemaining + elapsedBeforeCurrentRun),
    );
    const pausedRemainingSeconds = toNonNegativeSeconds(
      parsed.pausedRemainingSeconds,
      Boolean(parsed.isPaused) ? legacyStoredRemaining : phaseDefaultSeconds,
    );
    const durationSeconds = toNonNegativeSeconds(
      parsed.durationSeconds,
      Boolean(parsed.isRunning) || Boolean(parsed.isPaused) ? legacyStoredRemaining : phaseDefaultSeconds,
    );
    const base: ActiveTimerState = {
      isRunning: Boolean(parsed.isRunning),
      isPaused: Boolean(parsed.isPaused),
      mode,
      category,
      startedAtMs,
      phaseStartedAtMs,
      focusMinutes,
      breakMinutes,
      durationSeconds,
      phaseTotalSeconds: derivedPhaseTotal,
      pausedRemainingSeconds: Boolean(parsed.isPaused) ? pausedRemainingSeconds : undefined,
      autoStartBreak: typeof parsed.autoStartBreak === 'boolean' ? parsed.autoStartBreak : true,
      lastCompletedAtISO: trimString(parsed.lastCompletedAtISO),
    };

    return base;
  } catch {
    return createDefaultActiveTimer(categories[0] ?? TIMER_PRESET_CATEGORIES[0]);
  }
};

export const saveActiveTimerState = (timer: ActiveTimerState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timer));
};

export const resetTimerState = (timer: ActiveTimerState): ActiveTimerState => ({
  ...timer,
  isRunning: false,
  isPaused: false,
  mode: 'focus',
  startedAtMs: undefined,
  phaseStartedAtMs: undefined,
  durationSeconds: timer.focusMinutes * 60,
  phaseTotalSeconds: timer.focusMinutes * 60,
  pausedRemainingSeconds: timer.focusMinutes * 60,
  lastCompletedAtISO: undefined,
});

export const isPresetTimerCategory = (category: string) =>
  (TIMER_PRESET_CATEGORIES as readonly string[]).includes(category);

export const getDefaultWidgetPosition = (): WidgetPosition => {
  if (typeof window === 'undefined') {
    return { x: 16, y: 16 };
  }

  return {
    x: 16,
    y: Math.max(16, window.innerHeight - 132),
  };
};

export const clampWidgetPosition = (position: WidgetPosition): WidgetPosition => {
  if (typeof window === 'undefined') {
    return position;
  }

  return {
    x: Math.min(Math.max(8, position.x), Math.max(8, window.innerWidth - 96)),
    y: Math.min(Math.max(8, position.y), Math.max(8, window.innerHeight - 120)),
  };
};

export const loadWidgetPosition = (): WidgetPosition => {
  if (typeof window === 'undefined') {
    return getDefaultWidgetPosition();
  }

  const raw = window.localStorage.getItem(WIDGET_POSITION_KEY);
  if (!raw) {
    return getDefaultWidgetPosition();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return getDefaultWidgetPosition();
    }

    const x = typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : undefined;
    const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : undefined;

    if (typeof x !== 'number' || typeof y !== 'number') {
      return getDefaultWidgetPosition();
    }

    return clampWidgetPosition({ x, y });
  } catch {
    return getDefaultWidgetPosition();
  }
};

export const saveWidgetPosition = (position: WidgetPosition) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify(clampWidgetPosition(position)));
};
