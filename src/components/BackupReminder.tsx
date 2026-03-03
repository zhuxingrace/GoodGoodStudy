import { Alert, Button, Group, Text } from '@mantine/core';

interface BackupReminderProps {
  lastBackupLabel: string;
  onQuickExport: () => void;
  onDismiss: () => void;
}

export default function BackupReminder({
  lastBackupLabel,
  onQuickExport,
  onDismiss,
}: BackupReminderProps) {
  return (
    <Alert
      color="sage"
      variant="light"
      title="Backup reminder"
      withCloseButton
      onClose={onDismiss}
    >
      <Text size="sm">Your last backup was {lastBackupLabel}. Export a fresh JSON backup to avoid local data loss.</Text>
      <Group mt="sm">
        <Button size="xs" variant="light" color="sage" onClick={onQuickExport}>
          Quick Export
        </Button>
      </Group>
    </Alert>
  );
}
