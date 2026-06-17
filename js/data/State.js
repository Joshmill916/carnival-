// GameState singleton: wraps the save blob and the load/save plumbing so every
// system reads and mutates one shared object.
import { loadState, saveNow, saveDebounced, flushSave, wipeSave } from '../core/Storage.js';
import { freshState } from './schema.js';
import { bus } from '../core/EventBus.js';

class GameState {
  constructor() {
    this.data = loadState();
  }
  get s() {
    return this.data;
  }
  save() {
    saveDebounced(this.data);
  }
  saveNow() {
    saveNow(this.data);
  }
  flush() {
    flushSave(this.data);
  }
  reset() {
    this.data = freshState();
    saveNow(this.data);
    bus.emit('state:reset');
    bus.emit('wallet:changed');
    bus.emit('progress:changed');
  }
  reload() {
    this.data = loadState();
  }
  wipe() {
    wipeSave();
  }
}

export const State = new GameState();
