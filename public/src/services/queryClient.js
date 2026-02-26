import { QueryClient } from "@tanstack/query-core";

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
