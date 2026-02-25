export function createSupabaseProvider(supabaseSaveInstance) {
  return {
    async getSaves() {
      return supabaseSaveInstance.getSaves();
    },
    async saveGame(slotId, saveData) {
      return supabaseSaveInstance.saveGame(slotId, saveData);
    },
    isSignedIn() {
      return typeof window !== 'undefined' && window.supabaseAuth?.isSignedIn?.() === true;
    }
  };
}

export function createGoogleDriveProvider(googleDriveSaveInstance) {
  const DEFAULT_SLOT = 1;
  return {
    async getSaves() {
      if (!googleDriveSaveInstance?.isSignedIn) return [];
      try {
        const data = await googleDriveSaveInstance.load();
        if (!data) return [];
        return [{ slot_id: DEFAULT_SLOT, save_data: data, timestamp: Date.now() }];
      } catch {
        return [];
      }
    },
    async saveGame(slotId, saveData) {
      if (slotId !== DEFAULT_SLOT) return;
      await googleDriveSaveInstance.save(saveData, true);
    },
    isSignedIn() {
      return googleDriveSaveInstance?.isSignedIn === true;
    }
  };
}

