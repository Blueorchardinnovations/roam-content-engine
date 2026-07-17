export type Sleep = (delayMs: number) => Promise<void>;

export const sleep: Sleep = async (delayMs) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
};
