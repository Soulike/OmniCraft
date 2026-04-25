import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Label,
  ListBox,
  Select,
  Spinner,
  TextArea,
  TextField,
} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Brain, FileText, FolderCode, Rocket} from 'lucide-react';
import {Link} from 'react-router';

import {ThinkingLevelSelect} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import styles from './styles.module.css';
import type {TaskDispatchErrors} from './types.js';

interface TaskDispatchCardViewProps {
  readonly workspaces: readonly Workspace[];
  readonly isLoadingWorkspaces: boolean;
  readonly hasWorkspaceLoadError: boolean;
  readonly hasConfiguredWorkspaces: boolean;
  readonly selectedWorkspace: string | undefined;
  readonly task: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly errors: TaskDispatchErrors;
  readonly submitError: string | null;
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
  hasWorkspaceLoadError,
  hasConfiguredWorkspaces,
  selectedWorkspace,
  task,
  thinkingLevel,
  errors,
  submitError,
  canSubmit,
  isStarting,
  onWorkspaceChange,
  onTaskChange,
  onThinkingLevelChange,
  onSubmit,
}: TaskDispatchCardViewProps) {
  const showNoWorkspacesWarning =
    !isLoadingWorkspaces && !hasWorkspaceLoadError && !hasConfiguredWorkspaces;
  const showMissingWorkspaceWarning =
    hasConfiguredWorkspaces && selectedWorkspace === undefined;
  const shouldShowAlerts =
    hasWorkspaceLoadError ||
    showNoWorkspacesWarning ||
    showMissingWorkspaceWarning ||
    submitError !== null;

  return (
    <div className={styles.cardShell}>
      <Card>
        <Card.Header>
          <div className={styles.headerContent}>
            <div className={styles.titleRow}>
              <span className={styles.titleEmoji} aria-hidden='true'>
                ✨
              </span>
              <Card.Title>Start coding task</Card.Title>
            </div>
            <Card.Description>
              Choose the workspace and describe the task. After it starts, use
              chat for follow-up adjustments.
            </Card.Description>
          </div>
        </Card.Header>
        <Form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Card.Content>
            <div className={styles.contentLayout}>
              <div className={styles.settingsGrid}>
                <div className={styles.field}>
                  <Select
                    isRequired
                    isInvalid={errors.workspace !== undefined}
                    isDisabled={
                      isLoadingWorkspaces ||
                      workspaces.length === 0 ||
                      isStarting
                    }
                    value={selectedWorkspace ?? ''}
                    onChange={(value) => {
                      onWorkspaceChange(value ? String(value) : undefined);
                    }}
                  >
                    <Label>
                      <span className={styles.labelContent}>
                        <FolderCode size={16} />
                        Workspace
                      </span>
                    </Label>
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
                    {errors.workspace && (
                      <FieldError className={styles.fieldError}>
                        {errors.workspace}
                      </FieldError>
                    )}
                  </Select>
                </div>
                <div className={styles.field}>
                  <Label>
                    <span className={styles.labelContent}>
                      <Brain size={16} />
                      Thinking level
                    </span>
                  </Label>
                  <ThinkingLevelSelect
                    value={thinkingLevel}
                    isDisabled={isStarting}
                    onChange={onThinkingLevelChange}
                  />
                </div>
              </div>

              <TextField
                className={styles.field}
                isRequired
                isInvalid={errors.task !== undefined}
                isDisabled={isStarting}
                value={task}
                onChange={onTaskChange}
              >
                <Label>
                  <span className={styles.labelContent}>
                    <FileText size={16} />
                    Task
                  </span>
                </Label>
                <TextArea
                  aria-label='Task'
                  className={styles.taskInput}
                  placeholder='Describe the coding task: files, expected behavior, constraints, and how to verify.'
                  rows={8}
                />
                {errors.task && (
                  <FieldError className={styles.fieldError}>
                    {errors.task}
                  </FieldError>
                )}
              </TextField>

              {shouldShowAlerts && (
                <div className={styles.alerts}>
                  {hasWorkspaceLoadError && (
                    <Alert status='danger'>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>
                          Failed to load workspaces from settings.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                  {showNoWorkspacesWarning && (
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
                  {showMissingWorkspaceWarning && (
                    <Alert status='warning'>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>
                          Select a workspace before starting a coding task.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                  {submitError !== null && (
                    <Alert status='danger'>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{submitError}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </Card.Content>

          <Card.Footer>
            <div className={styles.footerActions}>
              <Button type='submit' variant='primary' isDisabled={!canSubmit}>
                {isStarting ? (
                  <Spinner size='sm' />
                ) : (
                  <span className={styles.buttonContent}>
                    <Rocket size={16} />
                    Start task
                  </span>
                )}
              </Button>
            </div>
          </Card.Footer>
        </Form>
      </Card>
    </div>
  );
}
