import { describe, it, expect, beforeEach, vi, mockGoogleDriveArrayBufferResponse, mockSupabaseSaveSuccessPayload } from "../../helpers/setup.js";
import { GoogleDriveSave, SupabaseAuth, SupabaseSave } from "@app/services.js";
import { StorageUtils } from "@app/utils.js";

describe("Group 11: Cloud Sync & Authentication", () => {
  beforeEach(() => {
    StorageUtils.remove("supabase_auth_session");
  });

  it("falls back to legacy decrypt path when zip password decode fails", async () => {
    const savedOnline = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const pakoMod = await import("pako");
    global.pako = pakoMod.default || pakoMod;
    window.zip = {
      configure: vi.fn(),
      BlobReader: class {
        constructor(blob) {
          this.blob = blob;
        }
      },
      ZipReader: class {
        async getEntries() {
          throw new Error("password mismatch");
        }
        async close() {}
      },
    };
    const save = { version: "1.0.0", run_id: "cloud-test", objectives: { current_objective_index: 0 } };
    const json = JSON.stringify(save);
    const key = "a_very_secure_key";
    const compressed = global.pako.deflate(json);
    const encrypted = new Uint8Array(compressed.length);
    for (let i = 0; i < compressed.length; i++) {
      encrypted[i] = compressed[i] ^ key.charCodeAt(i % key.length);
    }
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockGoogleDriveArrayBufferResponse(encrypted.buffer));
    const drive = new GoogleDriveSave();
    drive.isSignedIn = true;
    drive.authToken = "token";
    drive.saveFileId = "file-1";
    const loaded = await drive.load();
    expect(loaded.version).toBe("1.0.0");
    expect(loaded.run_id).toBe("cloud-test");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
    Object.defineProperty(navigator, "onLine", { value: savedOnline, configurable: true });
  });

  it("locks expired auth session to trigger silent refresh and valid session to skip refresh", () => {
    const auth = new SupabaseAuth();
    const refreshSpy = vi.spyOn(auth, "refreshAccessToken").mockImplementation(async () => {
      auth.token = "new-token";
      auth.expiresAt = Date.now() + 60_000;
      return true;
    });

    auth.token = "expired-token";
    auth.expiresAt = Date.now() - 1000;
    auth.refreshToken = "refresh-token";
    expect(auth.isSignedIn()).toBe(true);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    refreshSpy.mockClear();

    auth.token = "valid-token";
    auth.expiresAt = Date.now() + 60_000;
    auth.refreshToken = "refresh-token";
    expect(auth.isSignedIn()).toBe(true);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("requires auth for SupabaseSave and emits expected save payload when signed in", async () => {
    const cloud = new SupabaseSave();
    delete window.supabaseAuth;
    await expect(cloud.saveGame(2, { version: "1.0.0" })).rejects.toThrow("Not signed in");
    window.supabaseAuth = {
      token: "abc",
      isSignedIn: () => true,
      getUserId: () => "user-1",
    };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(mockSupabaseSaveSuccessPayload());
    await cloud.saveGame(2, { version: "1.0.0", run_id: "slot-test" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.user_id).toBe("user-1");
    expect(body.slot_id).toBe(2);
    expect(typeof body.save_data).toBe("string");
    fetchSpy.mockRestore();
  });
});
