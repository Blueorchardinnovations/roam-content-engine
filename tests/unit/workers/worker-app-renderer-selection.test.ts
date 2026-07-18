import { beforeEach, describe, expect, it, vi } from 'vitest';

const rendererMocks = vi.hoisted(() => {
  const createRendererMock = (renderer: string) => vi.fn(function () {
    return {
    getCapabilities: () => ({
      renderer,
      formats: ['html'],
      themes: ['classic'],
      supportedTokenCategories: ['spacing']
    }),
    render: vi.fn(),
    validate: vi.fn(),
    supports: vi.fn(() => true),
    supportedThemes: vi.fn(() => ['classic']),
    supportedFormats: vi.fn(() => ['html'])
    };
  });

  return {
    htmlPassthroughRenderer: createRendererMock('structured-json'),
    htmlMarkupRenderer: createRendererMock('html-markup'),
    styledHtmlRenderer: createRendererMock('styled-html')
  };
});

vi.mock('../../../src/application/rendering/html-passthrough-renderer.js', () => ({
  HtmlPassthroughRenderer: rendererMocks.htmlPassthroughRenderer
}));

vi.mock('../../../src/application/rendering/html-markup-renderer.js', () => ({
  HtmlMarkupRenderer: rendererMocks.htmlMarkupRenderer
}));

vi.mock('../../../src/application/rendering/styled-html-renderer.js', () => ({
  StyledHtmlRenderer: rendererMocks.styledHtmlRenderer
}));

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

beforeEach(() => {
  rendererMocks.htmlPassthroughRenderer.mockClear();
  rendererMocks.htmlMarkupRenderer.mockClear();
  rendererMocks.styledHtmlRenderer.mockClear();
});

describe('worker app renderer selection', () => {
  it('selects structured-json via HtmlPassthroughRenderer', () => {
    const app = createWorkerApp(createDependencies({
      rendererSelection: 'structured-json',
      createRenderArtifactId: () => 'artifact_worker_1'
    }));

    expect(app.state.started).toBe(false);
    expect(rendererMocks.htmlPassthroughRenderer).toHaveBeenCalledTimes(1);
    expect(rendererMocks.htmlMarkupRenderer).not.toHaveBeenCalled();
    expect(rendererMocks.styledHtmlRenderer).not.toHaveBeenCalled();
  });

  it('selects html-markup via HtmlMarkupRenderer', () => {
    const app = createWorkerApp(createDependencies({
      rendererSelection: 'html-markup',
      createRenderArtifactId: () => 'artifact_worker_2'
    }));

    expect(app.state.started).toBe(false);
    expect(rendererMocks.htmlMarkupRenderer).toHaveBeenCalledTimes(1);
    expect(rendererMocks.htmlPassthroughRenderer).not.toHaveBeenCalled();
    expect(rendererMocks.styledHtmlRenderer).not.toHaveBeenCalled();
  });

  it('selects styled-html via StyledHtmlRenderer', () => {
    const app = createWorkerApp(createDependencies({
      rendererSelection: 'styled-html',
      createRenderArtifactId: () => 'artifact_worker_3'
    }));

    expect(app.state.started).toBe(false);
    expect(rendererMocks.styledHtmlRenderer).toHaveBeenCalledTimes(1);
    expect(rendererMocks.htmlPassthroughRenderer).not.toHaveBeenCalled();
    expect(rendererMocks.htmlMarkupRenderer).not.toHaveBeenCalled();
  });

  it('rejects ambiguous renderer configuration', () => {
    expect(() => createWorkerApp(createDependencies({
      rendererSelection: 'structured-json',
      publicationRenderer: {
        getCapabilities: () => ({
          renderer: 'html-passthrough',
          formats: ['html'],
          themes: ['classic'],
          supportedTokenCategories: ['spacing']
        }),
        render: vi.fn(),
        validate: vi.fn(),
        supports: vi.fn(() => true),
        supportedThemes: vi.fn(() => ['classic']),
        supportedFormats: vi.fn(() => ['html'])
      } as any
    }))).toThrow('Renderer configuration is ambiguous: provide either publicationRenderer or rendererSelection, not both.');
  });

  it('rejects invalid renderer selection values', () => {
    expect(() => createWorkerApp(createDependencies({
      rendererSelection: 'invalid-selection' as never
    }))).toThrow('Renderer selection is invalid. Supported values: structured-json, html-markup, styled-html.');
  });
});