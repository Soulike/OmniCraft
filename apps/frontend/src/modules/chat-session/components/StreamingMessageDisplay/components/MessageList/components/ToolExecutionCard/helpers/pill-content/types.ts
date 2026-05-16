export interface ToolExecutionPillContent {
  target: string;
  targetKind: 'code' | 'text';
  detail: string | null;
}
