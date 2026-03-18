import { fromError } from "zod-validation-error";
import { z } from "zod";
import { QueryClient } from "@tanstack/query-core";
import { logger } from "../utils/utils_constants.js";
import {
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TechTreeSchema,
  ObjectiveListSchema,
  DifficultyPresetSchema,
  HelpTextSchema,
} from "../utils/utils_constants.js";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

export const queryKeys = {
  gameData: (resource) => (resource ? ["gameData", resource] : ["gameData"]),
  leaderboard: (sortBy, limit) => ["leaderboard", "top", sortBy, limit],
  saves: {
    resolved: () => ["saves", "resolved"],
    local: (slot) => ["saves", "local", slot],
    cloud: (provider) => ["saves", "cloud", provider],
  },
};

const fetchAndValidate = async (path, schema) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const json = await response.json();
  const data = json.default ?? json;
  try {
    return schema.parse(data);
  } catch (err) {
    const msg = `Data corruption in ${path}: ${fromError(err).toString()}`;
    logger.log("error", "data", msg);
    throw new Error(msg);
  }
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const json = await response.json();
  return json.default ?? json;
}

const prefetchOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
  networkMode: "offlineFirst",
};

class DataService {
  _getQuery(key, path, schema) {
    return queryClient.fetchQuery({
      queryKey: queryKeys.gameData(key),
      queryFn: () => fetchAndValidate(path, schema),
      ...prefetchOptions,
    });
  }

  async ensureAllGameDataLoaded() {
    const results = await Promise.all([
      this._getQuery("parts", "./data/part_list.json", z.array(PartDefinitionSchema)),
      this._getQuery("upgrades", "./data/upgrade_list.json", z.array(UpgradeDefinitionSchema)),
      this._getQuery("techTree", "./data/tech_tree.json", TechTreeSchema),
      this._getQuery("objectives", "./data/objective_list.json", ObjectiveListSchema),
      this._getQuery("difficulty", "./data/difficulty_curves.json", z.record(z.string(), DifficultyPresetSchema)),
      this._getQuery("helpText", "./data/help_text.json", HelpTextSchema),
    ]);
    return {
      parts: results[0],
      upgrades: results[1],
      techTree: results[2],
      objectives: results[3],
      difficulty: results[4],
      helpText: results[5],
    };
  }

  async loadData(filePath) {
    return queryClient.fetchQuery({
      queryKey: [...queryKeys.gameData(), "raw", filePath],
      queryFn: () => fetchJson(filePath),
      ...prefetchOptions,
    });
  }

  async loadFlavorText() {
    return this._getQuery("flavorText", "./data/flavor_text.json", z.array(z.string()));
  }

  async loadHelpText() {
    return this._getQuery("helpText", "./data/help_text.json", HelpTextSchema);
  }

  async loadSettingsHelp() {
    return this._getQuery("settingsHelp", "./data/settings_help.json", z.record(z.string(), z.string()));
  }

  async loadObjectiveList() {
    return this._getQuery("objectives", "./data/objective_list.json", ObjectiveListSchema);
  }

  async loadPartList() {
    return this._getQuery("parts", "./data/part_list.json", z.array(PartDefinitionSchema));
  }

  async loadUpgradeList() {
    return this._getQuery("upgrades", "./data/upgrade_list.json", z.array(UpgradeDefinitionSchema));
  }

  async loadTechTree() {
    return this._getQuery("techTree", "./data/tech_tree.json", TechTreeSchema);
  }

  async loadDifficultyCurves() {
    return this._getQuery("difficulty", "./data/difficulty_curves.json", z.record(z.string(), DifficultyPresetSchema));
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
