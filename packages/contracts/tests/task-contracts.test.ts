import {
  apiErrorEnvelopeSchema,
  fileInspectionInputSchema,
  taskInputSchema,
  taskStatusSchema,
} from '../src/task';

describe('task wire contracts', () => {
  it('accepts every documented public task status', () => {
    const statuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

    expect(statuses.every((status) => taskStatusSchema.safeParse(status).success)).toBe(true);
  });

  it('accepts valid text work and rejects unsupported task types', () => {
    expect(
      taskInputSchema.safeParse({
        type: 'TEXT_PROCESSING',
        input: { text: 'Summarize this deterministic text.' },
      }).success,
    ).toBe(true);

    expect(
      taskInputSchema.safeParse({
        type: 'SHELL_EXECUTION',
        input: { command: 'echo unsafe' },
      }).success,
    ).toBe(false);
  });

  it('keeps file bytes and storage metadata outside versioned task input', () => {
    expect(fileInspectionInputSchema.parse({})).toEqual({ schemaVersion: 1 });
    expect(
      fileInspectionInputSchema.safeParse({
        schemaVersion: 2,
        storageKey: '../private/file.pdf',
      }).success,
    ).toBe(false);
  });

  it('requires the stable public error-envelope fields', () => {
    expect(
      apiErrorEnvelopeSchema.safeParse({
        error: {
          code: 'TASK_INVALID_TRANSITION',
          message: 'The task cannot be updated while it is processing.',
        },
        requestId: '8e178dd1-606c-4bb7-a37d-78f10bb06fcb',
      }).success,
    ).toBe(true);

    expect(
      apiErrorEnvelopeSchema.safeParse({
        error: { message: 'Missing stable code.' },
        requestId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});
