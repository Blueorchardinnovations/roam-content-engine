export type PromptInput = {
  readonly transcriptText: string;
  readonly metadataTitle?: string;
  readonly summaryText?: string;
  readonly keywords?: readonly string[];
};
