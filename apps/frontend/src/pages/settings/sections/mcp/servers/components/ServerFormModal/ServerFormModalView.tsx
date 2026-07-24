import {
  Button,
  Description,
  FieldError,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@heroui/react';

import {AnimateHeight} from '@/components/AnimateHeight/index.js';
import {KeyValueEditor} from '@/components/KeyValueEditor/index.js';
import {StringListEditor} from '@/components/StringListEditor/index.js';

import type {UseServerForm} from './hooks/useServerForm.js';
import styles from './styles.module.css';

interface ServerFormModalViewProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  isSaving: boolean;
  form: UseServerForm;
  onSubmit: () => void;
  onClose: () => void;
}

export function ServerFormModalView({
  isOpen,
  mode,
  isSaving,
  form,
  onSubmit,
  onClose,
}: ServerFormModalViewProps) {
  return (
    <Modal.Backdrop
      isOpen={isOpen}
      isDismissable={!isSaving}
      isKeyboardDismissDisabled={isSaving}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className={styles.dialog}>
          {!isSaving && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>
              {mode === 'add' ? 'Add MCP server' : 'Edit MCP server'}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className={styles.body}>
              <TextField
                className={styles.field}
                value={form.name}
                isInvalid={form.errors.name !== undefined}
                isDisabled={mode === 'edit' || isSaving}
                onChange={form.setName}
              >
                <Label>Name</Label>
                <Input placeholder='filesystem' />
                <Description>
                  Lowercase letters, digits, and dashes. Namespaces its tools as
                  mcp__&lt;name&gt;__.
                </Description>
                {form.errors.name !== undefined && (
                  <FieldError>{form.errors.name}</FieldError>
                )}
              </TextField>

              <div className={styles.field}>
                <Label>Transport</Label>
                <ToggleButtonGroup
                  aria-label='Transport'
                  selectionMode='single'
                  disallowEmptySelection
                  isDisabled={isSaving}
                  selectedKeys={new Set([form.transportType])}
                  onSelectionChange={(keys) => {
                    const next = [...keys][0];
                    if (next === 'stdio' || next === 'http') {
                      form.setTransportType(next);
                    }
                  }}
                >
                  <ToggleButton id='stdio'>stdio</ToggleButton>
                  <ToggleButton id='http'>Streamable HTTP</ToggleButton>
                </ToggleButtonGroup>
              </div>

              <AnimateHeight>
                {form.transportType === 'stdio' ? (
                  <div className={styles.transportFields}>
                    <TextField
                      className={styles.field}
                      value={form.command}
                      isInvalid={form.errors.command !== undefined}
                      isDisabled={isSaving}
                      onChange={form.setCommand}
                    >
                      <Label>Command</Label>
                      <Input placeholder='npx' />
                      {form.errors.command !== undefined && (
                        <FieldError>{form.errors.command}</FieldError>
                      )}
                    </TextField>

                    <div className={styles.field}>
                      <Label>Arguments</Label>
                      <StringListEditor
                        items={form.args}
                        onChange={form.setArgs}
                        addLabel='Add argument'
                        itemLabel='Argument'
                        placeholder='-y'
                        isDisabled={isSaving}
                      />
                    </div>

                    <div className={styles.field}>
                      <Label>Environment variables</Label>
                      <KeyValueEditor
                        entries={form.envEntries}
                        onChange={form.setEnvEntries}
                        addLabel='Add variable'
                        keyPlaceholder='NAME'
                        valuePlaceholder='value'
                        isDisabled={isSaving}
                      />
                    </div>
                  </div>
                ) : (
                  <div className={styles.transportFields}>
                    <TextField
                      className={styles.field}
                      value={form.url}
                      isInvalid={form.errors.url !== undefined}
                      isDisabled={isSaving}
                      onChange={form.setUrl}
                    >
                      <Label>URL</Label>
                      <Input placeholder='https://mcp.example.com/mcp' />
                      {form.errors.url !== undefined && (
                        <FieldError>{form.errors.url}</FieldError>
                      )}
                    </TextField>

                    <div className={styles.field}>
                      <Label>Headers</Label>
                      <KeyValueEditor
                        entries={form.headerEntries}
                        onChange={form.setHeaderEntries}
                        addLabel='Add header'
                        keyPlaceholder='Authorization'
                        valuePlaceholder='Bearer …'
                        isDisabled={isSaving}
                      />
                      <p className={styles.note}>
                        Static headers only (bearer token / API key). No OAuth.
                      </p>
                    </div>
                  </div>
                )}
              </AnimateHeight>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot='close' variant='ghost' isDisabled={isSaving}>
              Cancel
            </Button>
            <Button variant='primary' isDisabled={isSaving} onPress={onSubmit}>
              {isSaving ? (
                <Spinner size='sm' />
              ) : mode === 'add' ? (
                'Add'
              ) : (
                'Save'
              )}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
