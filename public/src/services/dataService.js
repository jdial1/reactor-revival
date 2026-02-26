import { fromError } from "zod-validation-error";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import { PartDefinitionSchema, UpgradeDefinitionSchema, DifficultyPresetSchema, TechTreeSchema, ObjectiveListSchema } from "../core/schemas.js";
import { queryClient, queryKeys } from "./queryClient.js";

function failSafeParse(schema, data, context) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = `Data validation failed for ${context}: ${fromError(result.error).toString()}`;
    logger.log("error", "data", msg);
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`Failed to load game data. See console for details.`);
    }
    throw new Error(msg);
  }
  return result.data;
}

let fs, path, fileURLToPath, __filename, __dirname;

const initNodeModules = async () => {
  if (!fs) {
    try {
      const [fsModule, pathModule, urlModule] = await Promise.all([
        import("fs"),
        import("path"),
        import("url"),
      ]);
      fs = fsModule.default;
      path = pathModule.default;
      fileURLToPath = urlModule.fileURLToPath;
      __filename = fileURLToPath(import.meta.url);
      __dirname = path.dirname(__filename);
    } catch (error) {
      logger.log("warn", "data", "Node.js modules not available:", error.message);
    }
  }
};

async function fetchData(filePath) {
  if (typeof process !== "undefined" && process.versions?.node) {
    await initNodeModules();
    if (fs && path && __dirname) {
      const absolutePath = path.resolve(__dirname, "../../../public/", filePath.replace("./", ""));
      const content = fs.readFileSync(absolutePath, "utf-8");
      return JSON.parse(content);
    }
  }
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const queryOptions = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  retry: 2,
};

class DataService {
  async ensureAllGameDataLoaded() {
    const [parts, upgrades, techTree, objectives, helpText] = await Promise.all([
      queryClient.ensureQueryData({ queryKey: queryKeys.gameData("parts"), queryFn: () => this._loadPartList(), ...queryOptions }),
      queryClient.ensureQueryData({ queryKey: queryKeys.gameData("upgrades"), queryFn: () => this._loadUpgradeList(), ...queryOptions }),
      queryClient.ensureQueryData({ queryKey: queryKeys.gameData("techTree"), queryFn: () => this._loadTechTree(), ...queryOptions }),
      queryClient.ensureQueryData({ queryKey: queryKeys.gameData("objectives"), queryFn: () => this._loadObjectiveList(), ...queryOptions }),
      queryClient.ensureQueryData({ queryKey: queryKeys.gameData("helpText"), queryFn: () => this._loadHelpText(), ...queryOptions }),
    ]);
    return { parts, upgrades, techTree, objectives, helpText };
  }

  async loadData(filePath) {
    return queryClient.fetchQuery({
      queryKey: [...queryKeys.gameData(), "raw", filePath],
      queryFn: () => fetchData(filePath),
      ...queryOptions,
    });
  }

  async loadFlavorText() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("flavorText"),
      queryFn: () => fetchData("./data/flavor_text.json"),
      ...queryOptions,
    });
  }

  async loadHelpText() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("helpText"),
      queryFn: () => this._loadHelpText(),
      ...queryOptions,
    });
  }

  async _loadHelpText() {
    const data = await fetchData("./data/help_text.json");
    return data?.default ?? data;
  }

  async loadObjectiveList() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("objectives"),
      queryFn: () => this._loadObjectiveList(),
      ...queryOptions,
    });
  }

  async _loadObjectiveList() {
    const raw = await fetchData("./data/objective_list.json");
    const actualData = raw?.default ?? raw;
    return failSafeParse(ObjectiveListSchema, actualData, "objective_list.json");
  }

  async loadPartList() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("parts"),
      queryFn: () => this._loadPartList(),
      ...queryOptions,
    });
  }

  async _loadPartList() {
    const raw = await fetchData("./data/part_list.json");
    const schema = z
      .union([z.array(PartDefinitionSchema), z.object({ default: z.array(PartDefinitionSchema) })])
      .transform((v) => ("default" in v ? v.default : v));
    return failSafeParse(schema, raw, "part_list.json");
  }

  async loadUpgradeList() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("upgrades"),
      queryFn: () => this._loadUpgradeList(),
      ...queryOptions,
    });
  }

  async _loadUpgradeList() {
    const raw = await fetchData("./data/upgrade_list.json");
    const schema = z
      .union([z.array(UpgradeDefinitionSchema), z.object({ default: z.array(UpgradeDefinitionSchema) })])
      .transform((v) => ("default" in v ? v.default : v));
    return failSafeParse(schema, raw, "upgrade_list.json");
  }

  async loadTechTree() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("techTree"),
      queryFn: () => this._loadTechTree(),
      ...queryOptions,
    });
  }

  async _loadTechTree() {
    const raw = await fetchData("./data/tech_tree.json");
    const actualData = raw?.default ?? raw;
    return failSafeParse(TechTreeSchema, actualData, "tech_tree.json");
  }

  async loadDifficultyCurves() {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData("difficultyCurves"),
      queryFn: async () => {
        const raw = await fetchData("./data/difficulty_curves.json");
        return failSafeParse(z.record(z.string(), DifficultyPresetSchema), raw, "difficulty_curves.json");
      },
      ...queryOptions,
    });
  }

  clearCache() {
    queryClient.clear();
  }

  getCachedData(resource) {
    const key = resource ? queryKeys.gameData(resource) : queryKeys.gameData();
    return queryClient.getQueryData(key);
  }
}

const dataService = new DataService();

export default dataService;
