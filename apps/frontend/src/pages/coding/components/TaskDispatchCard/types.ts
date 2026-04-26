export interface TaskDispatchValues {
  readonly task: string;
}

export interface TaskDispatchErrors {
  readonly workspace?: string;
  readonly task?: string;
}
