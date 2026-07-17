import type { WorkerRuntimeState } from '../../domain/workers/worker-types.js';

import { WorkerLoop } from './worker-loop.js';

export class WorkerRunner {
  private runPromise: Promise<void> | null = null;

  public constructor(
    private readonly loop: WorkerLoop,
    private readonly state: WorkerRuntimeState,
    private readonly logger: {
      info: (payload: Record<string, unknown>, message: string) => void;
    }
  ) {}

  public start(signal: AbortSignal): Promise<void> {
    if (this.runPromise) {
      return this.runPromise;
    }

    this.state.started = true;
    this.state.stopped = false;

    this.logger.info(
      {},
      'Worker runner started.'
    );

    this.runPromise = this.loop.run(signal).finally(() => {
      this.state.stopped = true;
      this.state.stopping = false;
      this.state.activeJobCount = 0;
      this.logger.info({}, 'Worker runner stopped.');
    });

    return this.runPromise;
  }

  public async stop(): Promise<void> {
    this.state.stopping = true;

    if (this.runPromise) {
      await this.runPromise;
    }
  }
}
