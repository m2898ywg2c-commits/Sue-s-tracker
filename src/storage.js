// Stands in for the window.storage API that only exists inside Claude artifacts.
// Same shape (get/set/delete/list, all async, same return objects), backed by
// the browser's own localStorage so the app works completely standalone.

const PREFIX = "workout-tracker:";

function fullKey(key) {
  return PREFIX + key;
}

export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      console.error("storage.get failed", e);
      return null;
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(fullKey(key), value);
      return { key, value };
    } catch (e) {
      console.error("storage.set failed", e);
      return null;
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(fullKey(key));
      return { key, deleted: true };
    } catch (e) {
      console.error("storage.delete failed", e);
      return null;
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys, prefix };
    } catch (e) {
      console.error("storage.list failed", e);
      return null;
    }
  },
};
