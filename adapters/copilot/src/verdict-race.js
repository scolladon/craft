// Timer and worker race; the first to settle wins, the loser is ignored.
class VerdictRace {
  #settled = false;

  settle(conclude) {
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    conclude();
  }
}

/**
 * Waits for a worker's verdict against a deadline; exactly one handler runs.
 * @param {{ once: Function, terminate: Function }} worker
 * @param {{ deadlineMs: number, startTimer: Function, clearTimer: Function,
 *   onVerdict: Function, onTimeout: Function, onCrash: Function, onExit: Function }} options
 */
export function awaitVerdict(worker, options) {
  const { deadlineMs, startTimer, clearTimer, onVerdict, onTimeout, onCrash, onExit } = options;
  const race = new VerdictRace();
  const timer = startTimer(() => {
    race.settle(() => {
      worker.terminate();
      onTimeout();
    });
  }, deadlineMs);
  const settleWith = conclude => race.settle(() => {
    clearTimer(timer);
    conclude();
  });
  worker.once('message', outcome => settleWith(() => onVerdict(outcome)));
  // No verdict, by error or exit, is a crash: same exit-2 path as every other.
  worker.once('error', err => settleWith(() => onCrash(err)));
  worker.once('exit', () => settleWith(onExit));
}
