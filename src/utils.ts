
/**
 * Waits for a DOM mutation on the wrapper element, then runs the callback.
 * Used to ensure Vue has flushed its DOM updates before measuring element positions.
 * Includes a timeout guard to prevent hanging if mutation never fires.
 * 
 * @param wrapper - The element to observe for mutations
 * @param callback - Function to call after mutation is detected
 * @param timeoutMs - Maximum time to wait before giving up (default: 300ms)
 * @returns Cleanup function to stop observing
 */
export function waitForMutation(
  wrapper: HTMLDivElement,
  callback: () => void,
  timeoutMs: number = 300,
  subtree = false
) {
  let settled = false;

  const clean = () => {
    settled = true;
    observer.disconnect();
    clearTimeout(guard);
  };

  const settle = (): void => {
    if (settled) return;
    clean();
    callback();
  };

  const guard = setTimeout(settle, timeoutMs);

  const observer = new MutationObserver(() => {
    settle();
  });

  observer.observe(wrapper, { childList: true, subtree });

  return clean;
}