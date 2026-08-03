// Port: the current time, as a seam. Anything time-dependent (session
// expiry, ledger timestamps, future SLA-timer logic) depends on this
// interface instead of calling `new Date()` directly, so tests can supply a
// fixed/fake clock instead of racing the real one.
export interface Clock {
  now(): Date;
}
