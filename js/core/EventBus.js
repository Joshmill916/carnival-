// Tiny pub/sub used for cross-module signals (e.g. economy/upgrade changes → HUD).

class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this.listeners.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`EventBus listener for "${event}" threw:`, err);
      }
    });
  }
}

// Single shared bus for the whole app.
export const bus = new EventBus();
