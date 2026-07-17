import type {
  ContentJobStage,
  TranscriptProcessingResult
} from '../content-jobs/types.js';

import type { WorkerLeasedJob } from './worker-types.js';

export interface JobProcessor {
  readonly jobType: 'transcript-processing';

  process(input: {
    readonly job: WorkerLeasedJob;
    readonly signal: AbortSignal;
    readonly reportStage: (stage: ContentJobStage) => Promise<void>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<TranscriptProcessingResult>;
}
