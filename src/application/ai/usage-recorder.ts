import type { AIUsage } from '../../domain/ai/ai-usage.js';
import { AIValidationError } from '../../domain/ai/ai-provider-error.js';

export function mergeUsageTotals(values: readonly AIUsage[]): AIUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;

  for (const [index, usage] of values.entries()) {
    const normalizedInput = validateNonNegativeSafeInteger(usage.inputTokens, `values[${index}].inputTokens`);
    const normalizedOutput = validateNonNegativeSafeInteger(usage.outputTokens, `values[${index}].outputTokens`);
    const normalizedLatency = validateNonNegativeSafeInteger(usage.latencyMs, `values[${index}].latencyMs`);

    inputTokens = checkedAdd(inputTokens, normalizedInput, 'inputTokens');
    outputTokens = checkedAdd(outputTokens, normalizedOutput, 'outputTokens');
    latencyMs = checkedAdd(latencyMs, normalizedLatency, 'latencyMs');
  }

  const totalCost = values.every((usage) => usage.estimatedCostUsd !== null)
    ? values.reduce((accumulator, usage, index) => {
      if (
        typeof usage.estimatedCostUsd !== 'number'
        || !Number.isFinite(usage.estimatedCostUsd)
        || usage.estimatedCostUsd < 0
      ) {
        throw new AIValidationError('Usage aggregation failed due to invalid estimated cost.', {
          field: `values[${index}].estimatedCostUsd`
        });
      }

      return accumulator + usage.estimatedCostUsd;
    }, 0)
    : null;

  const totalTokens = checkedAdd(inputTokens, outputTokens, 'totalTokens');

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: totalCost,
    latencyMs
  };
}

function validateNonNegativeSafeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AIValidationError('Usage aggregation failed due to invalid token accounting.', {
      field
    });
  }

  return value;
}

function checkedAdd(left: number, right: number, field: string): number {
  const sum = left + right;

  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new AIValidationError('Usage aggregation overflowed safe integer range.', {
      field
    });
  }

  return sum;
}
