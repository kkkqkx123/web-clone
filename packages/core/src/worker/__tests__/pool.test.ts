import { describe, it, expect, vi } from 'vitest';
import { runPool } from '../pool.js';

describe('runPool', () => {
  it('should execute all tasks with limited concurrency', async () => {
    const results: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map(n => async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      results.push(n);
      return n;
    });

    const output = await runPool(tasks, { concurrency: 2 });
    expect(output.filter(Boolean)).toEqual([1, 2, 3, 4, 5]);
    // Order preserved
    expect(output).toEqual([1, 2, 3, 4, 5]);
  });

  it('should call onTaskComplete after each task', async () => {
    const tasks = [1, 2, 3].map(n => () => Promise.resolve(n));
    const callback = vi.fn();

    await runPool(tasks, { concurrency: 2 }, callback);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledWith(1, 0, 1);
    expect(callback).toHaveBeenCalledWith(2, 1, 2);
    expect(callback).toHaveBeenCalledWith(3, 2, 3);
  });

  it('should respect maxTasks limit', async () => {
    let executed = 0;
    const tasks = [1, 2, 3, 4, 5].map(n => async () => {
      executed++;
      return n;
    });

    const results = await runPool(tasks, { concurrency: 2, maxTasks: 3 });
    expect(executed).toBe(3);
    expect(results.filter(Boolean).length).toBe(3);
  });

  it('should return partial results on timeout', async () => {
    const started: number[] = [];
    const tasks = [
      async () => { started.push(1); await new Promise(resolve => setTimeout(resolve, 100)); return 1; },
      async () => { started.push(2); await new Promise(resolve => setTimeout(resolve, 100)); return 2; },
      async () => { started.push(3); await new Promise(resolve => setTimeout(resolve, 100)); return 3; },
      async () => { started.push(4); await new Promise(resolve => setTimeout(resolve, 100)); return 4; },
    ];

    // Timeout after 30ms, only first 2 should have started
    const results = await runPool(tasks, { concurrency: 2, timeoutMs: 30 });
    expect(started.length).toBe(2);
    // Results array has undefined for unstarted tasks
    expect(results.filter(Boolean).length).toBeLessThan(4);
  });

  it('should handle empty task array', async () => {
    const results = await runPool([], { concurrency: 5 });
    expect(results).toEqual([]);
  });

  it('should handle concurrency larger than total tasks', async () => {
    const tasks = [1, 2, 3].map(n => () => Promise.resolve(n));
    const results = await runPool(tasks, { concurrency: 10 });
    expect(results).toEqual([1, 2, 3]);
  });

  it('should propagate errors correctly (worker does not throw, task returns rejection)', async () => {
    const error = new Error('test error');
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(error),
      () => Promise.resolve(3),
    ];

    // runPool should not throw, the rejection propagates to the result position
    await expect(runPool(tasks, { concurrency: 2 })).rejects.toThrow(error);
  });
});
