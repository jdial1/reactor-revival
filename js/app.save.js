export class LocalSaver {
    constructor(game) {
        this.game = game;
        this.name = "LocalSaver";
        this.save_key = "reactor_knockoff_save";
    }

    save(data_string) {
        if (this.game.save_debug) console.log("LocalSave: Saving data...", data_string ? data_string.substring(0,100) + "..." : "null");
        try {
            localStorage.setItem(this.save_key, data_string);
        } catch (e) {
            console.error("Error saving to localStorage:", e);
            // Potentially notify UI or user
        }
    }

    load(callback) {
        if (this.game.save_debug) console.log("LocalSave: Loading data...");
        try {
            const saved_data = localStorage.getItem(this.save_key);
            if (saved_data) {
                callback(saved_data);
            } else {
                console.log("No local save data found. Initializing new game state.");
                callback(null); // Indicate no save data
            }
        } catch (e) {
            console.error("Error loading from localStorage:", e);
            callback(null); // Indicate error or no data
        }
    }
}

export class GoogleSaver { // Stub - full implementation needs Google API integration
    constructor(game) {
        this.game = game;
        this.name = "GoogleSaver (Stub)";
        // this.isAuthorized = false; // Example state
        // this.fileId = null; // Store Google Drive file ID
    }

    // authorize(callback) { /* ... gapi.auth2 ... */ }
    // saveFile(data_string) { /* ... gapi.client.drive.files.update ... or .create ... */ }
    // loadFile(callback) { /* ... gapi.client.drive.files.get ... or .list ... */ }

    save(data_string) {
        console.warn("GoogleSaver: Save method not implemented.", data_string ? data_string.substring(0,100) + "..." : "null");
        // if (this.isAuthorized) { this.saveFile(data_string); }
        // else { console.warn("GoogleSaver: Not authorized to save."); }
    }

    load(callback) {
        console.warn("GoogleSaver: Load method not implemented. Falling back to local.");
        // if (this.isAuthorized) { this.loadFile(callback); }
        // else {
        //   console.warn("GoogleSaver: Not authorized to load. Falling back.");
        const localSaver = new LocalSaver(this.game);
        localSaver.load(callback);
        // }
    }
}

export class SaveManager {
    constructor(game) {
        this.game = game;
        this.active_saver = new LocalSaver(game); // Default to local
        this.save_interval_id = null;
    }

    setSaver(saverInstance) {
        this.active_saver = saverInstance;
        console.log("Save manager active_saver changed to:", this.active_saver.name);
        // If auto-save was running, restart it with the new saver
        if (this.save_interval_id) {
            this.disable(); // Clear old interval
            this.enable();  // Start with new saver
        }
    }

    enable() {
        if (!this.active_saver) {
            console.warn("SaveManager: No active saver set. Cannot enable auto-save.");
            return;
        }
        console.log("Save manager enabled. Current saver:", this.active_saver.name);
        this.scheduleAutoSave();
    }

    disable() {
        if (this.save_interval_id) {
            clearInterval(this.save_interval_id);
            this.save_interval_id = null;
        }
        console.log("Save manager disabled.");
    }

    scheduleAutoSave() {
        if (this.save_interval_id) clearInterval(this.save_interval_id); // Clear existing interval

        this.save_interval_id = setInterval(() => {
            if (!this.game.paused && this.active_saver) {
                this.active_saver.save(this.game.saves());
                if (this.game.save_debug) console.log("Game autosaved by " + this.active_saver.name);
            }
        }, this.game.save_interval);
    }

    load(loadDataFunction) {
        if (this.active_saver) {
            this.active_saver.load(loadDataFunction);
        } else {
            console.error("No active saver to load from.");
            loadDataFunction(null); // Ensure callback is always called
        }
    }

    manualSave() {
        if (!this.active_saver) {
            console.warn("Cannot save: No active saver.");
            return false;
        }
        if (this.game.paused) { // Some games might allow saving while paused, some not.
            console.warn("Cannot save while paused (game rule).");
            return false;
        }
        this.active_saver.save(this.game.saves());
        console.log("Game manually saved by " + this.active_saver.name);
        // Optionally provide feedback to the UI
        // this.game.ui.showNotification("Game Saved!");
        return true;
    }
}

// Make classes available on window if they are used by non-module scripts or for debugging
window.SaveManager = SaveManager;
window.LocalSaver = LocalSaver;
window.GoogleSaver = GoogleSaver; // For potential later integration