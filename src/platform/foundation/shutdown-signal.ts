export type ShutdownController = {
  readonly signal: AbortSignal;
  requestShutdown: () => void;
};

export function createShutdownController(): ShutdownController {
  const controller = new AbortController();

  return {
    signal: controller.signal,
    requestShutdown: () => {
      controller.abort();
    }
  };
}
