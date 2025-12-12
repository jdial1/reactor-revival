import { LEADERBOARD_CONFIG } from './leaderboard-config.js';

export class SupabaseSave {
    constructor() {
        this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
    }

    async saveGame(slotId, saveData) {
        if (!window.supabaseAuth?.isSignedIn()) throw new Error("Not signed in");
        
        const userId = window.supabaseAuth.getUserId();
        const payload = {
            user_id: userId,
            slot_id: slotId,
            save_data: JSON.stringify(saveData),
            timestamp: Date.now()
        };

        const response = await fetch(`${this.apiBaseUrl}/api/saves`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Failed to save to cloud");
        return await response.json();
    }

    async getSaves() {
        if (!window.supabaseAuth?.isSignedIn()) return [];
        
        const userId = window.supabaseAuth.getUserId();
        const response = await fetch(`${this.apiBaseUrl}/api/saves/${userId}`);
        
        if (!response.ok) throw new Error("Failed to fetch saves");
        const json = await response.json();
        return json.success ? json.data : [];
    }
}

export const supabaseSave = new SupabaseSave();

