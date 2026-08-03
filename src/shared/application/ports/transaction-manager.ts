// Port: run a unit of work atomically. `TxContext` is the transaction handle
// a concrete adapter passes into `work` (e.g. the Drizzle transaction object
// from utils/db/txClient.ts) — use-cases stay adapter-agnostic by treating it
// as an opaque token to hand to their repository calls, never inspecting it.
export interface TransactionManager<TxContext = unknown> {
  run<T>(work: (tx: TxContext) => Promise<T>): Promise<T>;
}
