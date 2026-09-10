// A request owns its feedback timer and cancellation guard, including body decoding.
export function searchRequest(onPending: (pending: boolean) => void) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const active = () => !controller.signal.aborted && !finished;
  return {
    signal: controller.signal,
    active,
    start() {
      if (active())
        timer = setTimeout(() => {
          if (active()) onPending(true);
        }, 200);
    },
    finish() {
      clearTimeout(timer);
      if (!active()) return;
      finished = true;
      onPending(false);
    },
    cancel() {
      clearTimeout(timer);
      controller.abort();
      onPending(false);
    },
  };
}
