import {subAgentTypeSchema} from '@omnicraft/api-schema';
import {z} from 'zod';

export const subagentRecordSchema = z.object({
  id: z.uuid(),
  agentType: subAgentTypeSchema,
});

const subagentIdSchema = subagentRecordSchema.shape.id;

export type SubagentRecord = z.infer<typeof subagentRecordSchema>;

export class SubagentRegistry {
  private readonly records = new Map<string, SubagentRecord>();

  constructor(records: readonly SubagentRecord[] = []) {
    for (const record of records) {
      this.register(record);
    }
  }

  register(record: SubagentRecord): void {
    const parsed = subagentRecordSchema.parse(record);
    this.records.set(parsed.id, parsed);
  }

  get(id: string): SubagentRecord | undefined {
    const parsedId = subagentIdSchema.parse(id);
    const record = this.records.get(parsedId);
    return record ? {...record} : undefined;
  }

  list(): SubagentRecord[] {
    return [...this.records.values()].map((record) => ({...record}));
  }
}
