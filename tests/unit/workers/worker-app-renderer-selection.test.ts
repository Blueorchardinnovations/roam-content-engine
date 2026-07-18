import { describe, expect, it, vi } from 'vitest';

import { HtmlPassthroughRenderer } from '../../../src/application/rendering/html-passthrough-renderer.js';
import { createWorkerApp } from '../../../src/worker/app.js';

function createDependencies(overrides?: Partial<Parameters<typeof createWorkerApp>[0]>): Parameters<typeof createWorkerApp>[0] {
  return {
    workerConfig: {
      workerId: 'worker_test',
      pollIntervalMs: 10,
      leaseDurationMs: 100,
      heartbeatIntervalMs: 10,
      maxAttempts: 2,
      concurrency: 1,
      shutdownTimeoutMs: 100,
      staleRecoveryIntervalMs: 1000,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 100
    },
    sourceVersionRepository: {
      createImmutable: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
      findByHash: vi.fn(),
      listByProject: vi.fn()
    } as any,
    jobSource: {
      acquireNext: vi.fn(),
      renewLease: vi.fn(),
      markStage: vi.fn(),
      markCompleted: vi.fn(),
      scheduleRetry: vi.fn(),
      markFailed: vi.fn(),
      listStaleProcessingJobs: vi.fn(async () => []),
      recoverStaleJob: vi.fn()
    } as any,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    ...overrides
  };
}

describe('worker app renderer selection', () => {
  it('supports explicit structured-json selection', () => {
    const app = createWorkerApp(createDependencies({
      rendererSelection: 'structured-json',
      createRenderArtifactId: () => 'artifact_worker_1'
    }));

    expect(app.state.started).toBe(false);
  });

  it('supports explicit html-markup selection', () => {
    const app = createWorkerApp(createDependencies({
      rendererSelection: 'html-markup',
      createRenderArtifactId: () => 'artifact_worker_2'
    }));

    expect(app.state.started).toBe(false);
  });

  it('rejects ambiguous renderer configuration', () => {
    expect(() => createWorkerApp(createDependencies({
      rendererSelection: 'structured-json',
      publicationRenderer: new HtmlPassthroughRenderer({
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        createArtifactId: () => 'artifact_worker_3'
      })
    }))).toThrow('Renderer configuration is ambiguous: provide either publicationRenderer or rendererSelection, not both.');
  });

  it('rejects invalid renderer selection values', () => {
    expect(() => createWorkerApp(createDependencies({
      rendererSelection: 'invalid-selection' as never
    }))).toThrow('Renderer selection is invalid. Supported values: structured-json, html-markup.');
  });
});
