// localStorage read/write of the single save blob, with debounced writes and a
// migration pass on load. Never throws: a corrupt blob falls back to defaults.
import { SAVE_KEY, migrate, defaultState } from '../data/schema.js';

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return migrate(defaultState());
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('Save corrupt or unreadable, starting fresh:', err);
    return migrate(defaultState());
  }
}

let saveTimer = null;

// Persist immediately. Stamps lastSeenTs and createdTs.
export function saveNow(state) {
  try {
    const now = Date.now();
    if (!state.createdTs) state.createdTs = now;
    state.lastSeenTs = now;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Save failed:', err);
    return false;
  }
}

// Debounced save for hot paths; coalesces rapid changes.
export function saveDebounced(state, ms = 500) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(state), ms);
}

export function flushSave(state) {
  clearTimeout(saveTimer);
  saveNow(state);
}

export function wipeSave() {
  clearTimeout(saveTimer);
  localStorage.removeItem(SAVE_KEY);
}
