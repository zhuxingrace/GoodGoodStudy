import { useEffect, useState, type ChangeEvent } from 'react';
import { Button, Card, Group, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { StorageMode } from '../lib/persistence';
import { TIMER_PRESET_CATEGORIES } from '../lib/timeTracker';

interface SettingsPanelProps {
  entryCount: number;
  storageMode: StorageMode;
  fileStorageSupported: boolean;
  hasConnectedFile: boolean;
  storageStatus: string;
  lastBackupLabel: string;
  timerCategories: string[];
  onQuickExport: () => void;
  onChooseDataFile: () => void;
  onStorageModeChange: (enabled: boolean) => void;
  onImportMerge: (raw: string) => void;
  onImportReplace: (raw: string) => void;
  onRenameTimerCategory: (previousName: string, nextName: string) => void;
  onDeleteTimerCategory: (name: string) => void;
  onClear: () => void;
}

export default function SettingsPanel({
  entryCount,
  storageMode,
  fileStorageSupported,
  hasConnectedFile,
  storageStatus,
  lastBackupLabel,
  timerCategories,
  onQuickExport,
  onChooseDataFile,
  onStorageModeChange,
  onImportMerge,
  onImportReplace,
  onRenameTimerCategory,
  onDeleteTimerCategory,
  onClear,
}: SettingsPanelProps) {
  const [importText, setImportText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [status, setStatus] = useState<string>('No import file loaded yet.');
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setRenameDrafts(
      timerCategories.reduce<Record<string, string>>((accumulator, category) => {
        accumulator[category] = category;
        return accumulator;
      }, {}),
    );
  }, [timerCategories]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    try {
      const nextText = await file.text();
      setImportText(nextText);
      setFileName(file.name);
      setStatus(`Loaded ${file.name}. Choose merge or replace.`);
    } catch {
      setStatus('Unable to read that file.');
    }
  };

  const runImport = (mode: 'merge' | 'replace') => {
    if (!importText) {
      setStatus('Choose a JSON file first.');
      return;
    }

    try {
      if (mode === 'merge') {
        onImportMerge(importText);
      } else {
        onImportReplace(importText);
      }

      setStatus(`${mode === 'merge' ? 'Submitted merge for' : 'Submitted replace for'} ${fileName}.`);
      setImportText('');
      setFileName('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    }
  };

  return (
    <Stack spacing="md">
      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Backups</Text>
        <Text size="sm" c="dimmed" mt={4}>
          {entryCount} entries tracked. Last backup: {lastBackupLabel}.
        </Text>

        <Group mt="md">
          <Button onClick={onQuickExport}>Quick Export</Button>
        </Group>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Pomodoro categories</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Preset categories stay locked. Custom categories can be renamed or removed.
        </Text>

        <Stack spacing="sm" mt="md">
          {timerCategories.map((category) => {
            const isPreset = (TIMER_PRESET_CATEGORIES as readonly string[]).includes(category);

            return (
              <Group key={category} align="flex-end">
                <TextInput
                  label={isPreset ? 'Preset' : 'Custom'}
                  value={renameDrafts[category] ?? category}
                  onChange={(event) =>
                    setRenameDrafts((current) => ({
                      ...current,
                      [category]: event.currentTarget.value,
                    }))
                  }
                  disabled={isPreset}
                  style={{ flex: 1 }}
                />
                {!isPreset ? (
                  <Button
                    variant="light"
                    onClick={() => onRenameTimerCategory(category, renameDrafts[category] ?? category)}
                  >
                    Rename
                  </Button>
                ) : null}
                <Button
                  variant="light"
                  color={isPreset ? 'gray' : 'danger'}
                  disabled={isPreset}
                  onClick={() => onDeleteTimerCategory(category)}
                >
                  Delete
                </Button>
              </Group>
            );
          })}
        </Stack>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Storage mode</Text>
        <Text size="sm" c="dimmed" mt={4}>
          LocalStorage stays the default. File mode writes your data into a chosen JSON file instead.
        </Text>

        <Switch
          mt="md"
          label="Store data in a local file (advanced)"
          checked={storageMode === 'file'}
          disabled={!fileStorageSupported}
          onChange={(event) => onStorageModeChange(event.currentTarget.checked)}
        />

        <Group mt="md">
          <Button variant="light" onClick={onChooseDataFile} disabled={!fileStorageSupported || storageMode !== 'file'}>
            Choose data file
          </Button>
        </Group>

        <Text size="sm" c={fileStorageSupported ? 'dimmed' : 'danger'} mt="sm">
          {fileStorageSupported
            ? `${storageStatus} ${
                storageMode === 'file'
                  ? hasConnectedFile
                    ? '(file connected)'
                    : '(using local fallback)'
                  : '(default mode)'
              }`
            : 'This browser does not support the File System Access API, so the app will keep using localStorage.'}
        </Text>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Import and restore</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Import a previously exported JSON file.
        </Text>

        <Stack spacing="sm" mt="md">
          <input type="file" accept="application/json,.json" onChange={handleFileChange} />
          <Group>
            <Button variant="light" onClick={() => runImport('merge')}>
              Import and Merge
            </Button>
            <Button color="danger" variant="light" onClick={() => runImport('replace')}>
              Import and Replace
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            {status}
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="lg" shadow="sm" className="section-card">
        <Text fw={700}>Danger zone</Text>
        <Text size="sm" c="dimmed" mt={4}>
          Remove every stored entry and reset to an empty state in the current storage mode.
        </Text>
        <Group mt="md">
          <Button color="danger" variant="light" onClick={onClear}>
            Clear all data
          </Button>
        </Group>
      </Card>
    </Stack>
  );
}
