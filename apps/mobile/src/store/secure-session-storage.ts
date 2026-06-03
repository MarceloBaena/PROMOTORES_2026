import type { StateStorage } from 'zustand/middleware';

const memoryStore = new Map<string, string>();

const memoryStorage: StateStorage = {
  getItem: (name) => Promise.resolve(memoryStore.get(name) ?? null),
  setItem: (name, value) => {
    memoryStore.set(name, value);
    return Promise.resolve();
  },
  removeItem: (name) => {
    memoryStore.delete(name);
    return Promise.resolve();
  },
};

const isReactNativeRuntime = () =>
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

export const secureSessionStorage: StateStorage = {
  async getItem(name) {
    if (!isReactNativeRuntime()) {
      return memoryStorage.getItem(name);
    }

    const SecureStore = await import('expo-secure-store');
    return (await SecureStore.getItemAsync(name)) ?? null;
  },

  async setItem(name, value) {
    if (!isReactNativeRuntime()) {
      return memoryStorage.setItem(name, value);
    }

    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(name, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async removeItem(name) {
    if (!isReactNativeRuntime()) {
      return memoryStorage.removeItem(name);
    }

    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(name);
  },
};
