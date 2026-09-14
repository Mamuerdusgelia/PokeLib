// UI-only browser preference, shared across anonymous and signed-in visits like
// pokelib-view. Do not put this in the cloud-sync preferences payload.
export const introductionKey = 'pokelib-introduction-dismissed';
let dismissedInMemory = false;

export function introductionDismissed() {
  if (dismissedInMemory) return true;
  try {
    return localStorage.getItem(introductionKey) === 'true';
  } catch {
    return false;
  }
}

export function dismissIntroduction() {
  dismissedInMemory = true;
  try {
    localStorage.setItem(introductionKey, 'true');
  } catch {
    // Restricted storage must never prevent closing or cause an auth-remount loop.
  }
}
