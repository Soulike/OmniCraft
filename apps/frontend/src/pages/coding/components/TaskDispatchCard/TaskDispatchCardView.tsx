import {
  Alert,
  Button,
  Card,
  Form,
  Label,
  ListBox,
  Select,
  Spinner,
  TextArea,
} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Link} from 'react-router';

import {ThinkingLevelSelect} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import styles from './styles.module.css';
import type {TaskDispatchErrors} from './types.js';

interface TaskDispatchCardViewProps {
  readonly workspaces: readonly Workspace[];
  readonly isLoadingWorkspaces: boolean;
  readonly loadError: unknown;
  readonly hasConfiguredWorkspaces: boolean;
  readonly selectedWorkspace: string | undefined;
  readonly task: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly errors: TaskDispatchErrors;
  readonly canSubmit: boolean;
  readonly isStarting: boolean;
  readonly onWorkspaceChange: (workspace: string | undefined) => void;
  readonly onTaskChange: (task: string) => void;
  readonly onThinkingLevelChange: (level: ThinkingLevel) => void;
  readonly onSubmit: () => void;
}

export function TaskDispatchCardView({
  workspaces,
  isLoadingWorkspaces,
  loadError,
  hasConfiguredWorkspaces,
  selectedWorkspace,
  task,
  thinkingLevel,
  errors,
  canSubmit,
  isStarting,
  onWorkspaceChange,
  onTaskChange,
  onThinkingLevelChange,
  onSubmit,
}: TaskDispatchCardViewProps) {
  return (
    <Card className={styles.card}>
      <Card.Header className={styles.header}>
        <Card.Title className={styles.title}>Start coding task</Card.Title>
        <Card.Description className={styles.description}>
          Choose the workspace and describe the task. After it starts, use chat
          for follow-up adjustments.
        </Card.Description>
      </Card.Header>
      <Form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Card.Content className={styles.content}>
          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <Label isRequired>Workspace</Label>
              <Select
                isDisabled={
                  isLoadingWorkspaces || workspaces.length === 0 || isStarting
                }
                value={selectedWorkspace ?? ''}
                onChange={(value) => {
                  onWorkspaceChange(value ? String(value) : undefined);
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {workspaces.map((entry) => (
                      <ListBox.Item
                        key={entry.path}
                        id={entry.path}
                        textValue={entry.path}
                      >
                        {entry.path}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {errors.workspace && (
                <p className={styles.fieldError}>{errors.workspace}</p>
              )}
            </div>
            <div className={styles.field}>
              <Label>Thinking level</Label>
              <ThinkingLevelSelect
                value={thinkingLevel}
                isDisabled={isStarting}
                onChange={onThinkingLevelChange}
              />
            </div>
          </div>

          <div className={styles.field}>
            <Label isRequired>Task</Label>
            <TextArea
              aria-label='Task'
              className={styles.taskInput}
              disabled={isStarting}
              placeholder='Describe the coding task: files, expected behavior, constraints, and how to verify.'
              rows={8}
              value={task}
              onChange={(event) => {
                onTaskChange(event.target.value);
              }}
            />
            {errors.task && <p className={styles.fieldError}>{errors.task}</p>}
          </div>

          <div className={styles.alerts}>
            {loadError !== null && (
              <Alert status='danger'>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Failed to load workspaces from settings.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {!isLoadingWorkspaces &&
              loadError === null &&
              !hasConfiguredWorkspaces && (
                <Alert status='warning'>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      No workspaces configured.{' '}
                      <Link
                        className={styles.settingsLink}
                        to={ROUTES.settings['file-access'].workspaces()}
                      >
                        Configure workspaces in Settings
                      </Link>
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            {hasConfiguredWorkspaces && selectedWorkspace === undefined && (
              <Alert status='warning'>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Select a workspace before starting a coding task.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
        </Card.Content>

        <Card.Footer className={styles.footer}>
          <Button type='submit' variant='primary' isDisabled={!canSubmit}>
            {isStarting ? <Spinner size='sm' /> : 'Start task'}
          </Button>
        </Card.Footer>
      </Form>
    </Card>
  );
}
