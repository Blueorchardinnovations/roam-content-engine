import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export type TransactionContext = {
  readonly tx: Transaction;
};

export interface TransactionManager {
  run<TValue>(
    work: (context: TransactionContext) => Promise<TValue>
  ): Promise<TValue>;
}

export class DrizzleTransactionManager
  implements TransactionManager {
  public constructor(
    private readonly database: Database
  ) {}

  public run<TValue>(
    work: (context: TransactionContext) => Promise<TValue>
  ): Promise<TValue> {
    return this.database.transaction((tx) => work({ tx }));
  }
}
