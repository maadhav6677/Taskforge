import { executeTextTask, TextExecutionError } from '../../src/modules/tasks/text.executor.js';

describe('text task executor', () => {
  it('returns deterministic normalized analysis', () => {
    expect(executeTextTask({ text: '  TaskForge   stays truthful.  ' })).toEqual({
      schemaVersion: 1,
      normalized: 'TaskForge stays truthful.',
      uppercase: 'TASKFORGE STAYS TRUTHFUL.',
      wordCount: 3,
      characterCount: 25,
      sha256: 'c20d07aa2e1687434c5e855ae7328871dcccce5b6891e4e3d9cacc5de1db8161',
    });
  });

  it('rejects invalid input and exposes the deterministic failure fixture', () => {
    expect(() => executeTextTask({ text: 'Trigger [[FAIL]] safely.' })).toThrow(TextExecutionError);
    expect(() => executeTextTask({ text: '' })).toThrow();
  });
});
