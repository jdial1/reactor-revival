import { z } from "../../lib/zod.js";
import { logger } from "../utils/logger.js";
import { PartDefinitionSchema, UpgradeDefinitionSchema, DifficultyPresetSchema } from "../core/schemas.js";

function failSafeParse(schema, data, context) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = `Data validation failed for ${context}: ${result.error.message}`;
    logger.log("error", "data", msg, result.error.issues);
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`Failed to load game data. See console for details.`);
    }
    throw new Error(msg);
  }
  return result.data;
}

// Dynamic imports for Node.js compatibility
let fs, path, fileURLToPath, __filename, __dirname;

// Initialize Node.js modules only when needed
const initNodeModules = async () => {
    if (!fs) {
        try {
            const [fsModule, pathModule, urlModule] = await Promise.all([
                import('fs'),
                import('path'),
                import('url')
            ]);

            fs = fsModule.default;
            path = pathModule.default;
            fileURLToPath = urlModule.fileURLToPath;

            __filename = fileURLToPath(import.meta.url);
            __dirname = path.dirname(__filename);
        } catch (error) {
            logger.log('warn', 'data', 'Node.js modules not available:', error.message);
        }
    }
};

class DataService {
    constructor() {
        this.cache = new Map();
        this._allDataLoadedPromise = null;
    }

    async ensureAllGameDataLoaded() {
        if (!this._allDataLoadedPromise) {
            this._allDataLoadedPromise = Promise.all([
                this.loadPartList(),
                this.loadUpgradeList(),
                this.loadTechTree(),
                this.loadObjectiveList(),
                this.loadHelpText()
            ]).then(([parts, upgrades, techTree, objectives, helpText]) => ({
                parts,
                upgrades,
                techTree,
                objectives,
                helpText
            }));
        }
        return this._allDataLoadedPromise;
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
                    const absolutePath = path.resolve(__dirname, '../../../public/', filePath.replace('./', ''));
                    try {
                        const content = fs.readFileSync(absolutePath, 'utf-8');
                        const data = JSON.parse(content);
                        this.cache.set(filePath, data);
                        return data;
                    } catch (error) {
                        throw new Error(`Could not find ${filePath} at ${absolutePath}: ${error.message}`);
                    }
                }
            }

            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${filePath}: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            this.cache.set(filePath, data);
            return data;
        } catch (error) {
            logger.log('error', 'data', `Error loading data from ${filePath}:`, error);
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
        const data = await this.loadData('./data/objective_list.json');
        // Handle ES module format where data might be in the 'default' property
        return data?.default || data;
    }

    async loadPartList() {
        const raw = await this.loadData('./data/part_list.json');
        const schema = z.union([
            z.array(PartDefinitionSchema),
            z.object({ default: z.array(PartDefinitionSchema) }),
        ]).transform((v) => ("default" in v ? v.default : v));
        return failSafeParse(schema, raw, "part_list.json");
    }

    async loadUpgradeList() {
        const raw = await this.loadData('./data/upgrade_list.json');
        const schema = z.union([
            z.array(UpgradeDefinitionSchema),
            z.object({ default: z.array(UpgradeDefinitionSchema) }),
        ]).transform((v) => ("default" in v ? v.default : v));
        return failSafeParse(schema, raw, "upgrade_list.json");
    }

    async loadTechTree() {
        try {
            const data = await this.loadData('./data/tech_tree.json');
            const actualData = data?.default || data;
            return actualData;
        } catch (error) {
            logger.log('error', 'data', 'Error loading tech tree data:', error);
            throw error;
        }
    }

    async loadDifficultyCurves() {
        const raw = await this.loadData('./data/difficulty_curves.json');
        return failSafeParse(z.record(z.string(), DifficultyPresetSchema), raw, "difficulty_curves.json");
    }

    clearCache() {
        this.cache.clear();
        this._allDataLoadedPromise = null;
    }

    // Get cached data without loading
    getCachedData(filePath) {
        return this.cache.get(filePath);
    }
}

// Create singleton instance
const dataService = new DataService();

export default dataService; 