// src/services/dataService.js
// Service for loading and managing game data from JSON files

// Dynamic imports for Node.js compatibility
let fs, path, fileURLToPath, __filename, __dirname;

// Initialize Node.js modules only when needed
const initNodeModules = async () => {
    if (!fs) {
        try {
            const fsModule = await import('fs');
            const pathModule = await import('path');
            const urlModule = await import('url');

            fs = fsModule.default;
            path = pathModule.default;
            fileURLToPath = urlModule.fileURLToPath;

            __filename = fileURLToPath(import.meta.url);
            __dirname = path.dirname(__filename);
        } catch (error) {
            console.warn('Node.js modules not available:', error.message);
        }
    }
};

class DataService {
    constructor() {
        this.cache = new Map();
    }

    async loadData(filePath) {
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath);
        }

        try {
            // Check if we're in a Node.js environment (like tests)
            if (typeof process !== 'undefined' && process.versions && process.versions.node) {
                // Node.js environment - use file system
                await initNodeModules();
                if (fs && path && __dirname) {
                    // Try multiple possible paths for the data files
                    const possiblePaths = [
                        path.resolve(__dirname, '../../public', filePath.replace('./', '')),
                        path.resolve(__dirname, '../../../public', filePath.replace('./', '')),
                        path.resolve(process.cwd(), 'public', filePath.replace('./', '')),
                        path.resolve(process.cwd(), filePath.replace('./', ''))
                    ];

                    for (const absolutePath of possiblePaths) {
                        try {
                            const content = fs.readFileSync(absolutePath, 'utf-8');
                            const data = JSON.parse(content);
                            this.cache.set(filePath, data);
                            console.log(`Successfully loaded ${filePath} from ${absolutePath}`);
                            return data;
                        } catch (error) {
                            // Continue to next path
                        }
                    }

                    throw new Error(`Could not find ${filePath} in any of the expected locations`);
                }
            }

            // Browser environment - use fetch
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${filePath}: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.cache.set(filePath, data);
            return data;
        } catch (error) {
            console.error(`Error loading data from ${filePath}:`, error);
            throw error;
        }
    }

    async loadFlavorText() {
        return this.loadData('./data/flavor_text.json');
    }

    async loadHelpText() {
        return this.loadData('./data/help_text.json');
    }

    async loadObjectiveList() {
        return this.loadData('./data/objective_list.json');
    }

    async loadPartList() {
        return this.loadData('./data/part_list.json');
    }

    async loadUpgradeList() {
        console.log("Loading upgrade list...");
        const data = await this.loadData('./data/upgrade_list.json');
        console.log("Upgrade list loaded:", data?.length, "items");
        return data;
    }

    // Clear cache if needed
    clearCache() {
        this.cache.clear();
    }

    // Get cached data without loading
    getCachedData(filePath) {
        return this.cache.get(filePath);
    }
}

// Create singleton instance
const dataService = new DataService();

export default dataService; 