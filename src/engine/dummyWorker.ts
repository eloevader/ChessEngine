/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent) => {
  const cmd = typeof e.data === 'string' ? e.data : '';
  if (cmd) postMessage(cmd);
};
