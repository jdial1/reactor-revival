import { StorageUtils, StorageAdapter, serializeSave, deserializeSave } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

export async function findSaveFile(service) {
  if (!service.isSignedIn) return false;
  try {
    const searchQuery = encodeURIComponent("name contains 'reactor-revival-save'");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&orderBy=createdTime desc&spaces=drive`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const mostRecent = data.files[0];
        service.saveFileId = mostRecent.id;
        StorageUtils.set("google_drive_save_file_id", mostRecent.id);
        return true;
      }
    }
    if (service.saveFileId) {
      const verifyResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
        { headers: { Authorization: `Bearer ${service.authToken}` } }
      );
      if (verifyResponse.ok) return true;
      service.saveFileId = null;
      StorageUtils.remove("google_drive_save_file_id");
    }
    return false;
  } catch (err) {
    logger.log('error', 'game', 'Error finding save file:', err);
    return false;
  }
}

export async function load(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file available");
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${service.saveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${service.authToken}` } }
    );
    if (!response.ok) throw new Error(`Failed to download save file: ${response.status}`);
    const encryptedData = await response.arrayBuffer();
    return await decompressAndDecrypt(service, encryptedData);
  } catch (err) {
    logger.error("Failed to load from Google Drive:", err);
    throw err;
  }
}

export async function loadZipLibrary(service) {
  if (typeof pako === "undefined") {
    throw new Error("pako library not loaded. Check that lib/pako.min.js is included in HTML.");
  }
  if (typeof window.zip === "undefined") {
    throw new Error("zip.js library not loaded. Check that lib/zip.min.js is included in HTML.");
  }
  if (window.zip) {
    window.zip.configure({ useWebWorkers: false });
  }
}

export async function compressAndEncrypt(service, saveData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  const password = "reactor-revival-secure-save-2024";
  const zipWriter = new window.zip.ZipWriter(new window.zip.BlobWriter("application/zip"), {
    password,
    zipCrypto: true,
  });
  const text = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await zipWriter.add("save.json", new window.zip.TextReader(text));
  return await zipWriter.close();
}

export async function decompressAndDecrypt(service, encryptedData) {
  await loadZipLibrary(service);
  if (!window.zip) throw new Error("zip.js library failed to load");
  try {
    const blob = new Blob([encryptedData], { type: "application/zip" });
    const zipReader = new window.zip.ZipReader(new window.zip.BlobReader(blob));
    const password = "reactor-revival-secure-save-2024";
    const entries = await zipReader.getEntries({ password });
    if (entries.length > 0) {
      const writer = new window.zip.TextWriter();
      const jsonText = await entries[0].getData(writer, { password });
      await zipReader.close();
      return deserializeSave(jsonText);
    }
    await zipReader.close();
    throw new Error("No data found in save file.");
  } catch (err) {
    if (err.message && err.message.includes("password")) {
      return decompressAndDecryptLegacy(service, encryptedData);
    }
    throw err;
  }
}

export async function decompressAndDecryptLegacy(service, encryptedData) {
  if (!(encryptedData instanceof ArrayBuffer)) throw new Error("Encrypted data must be an ArrayBuffer.");
  const key = "a_very_secure_key";
  const encryptedBytes = new Uint8Array(encryptedData);
  const decryptedBytes = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decryptedBytes[i] = encryptedBytes[i] ^ key.charCodeAt(i % key.length);
  }
  if (typeof pako === "undefined") throw new Error("pako is not defined");
  const decompressedData = pako.inflate(decryptedBytes, { to: "string" });
  return deserializeSave(decompressedData);
}

async function uploadToExistingFile(service, fileId, encryptedBlob) {
  return await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/zip" },
      body: encryptedBlob,
    }
  );
}

async function createNewSaveFile(service) {
  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const fileName = `reactor-revival-save-${timestamp}.zip`;
  const metadataResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${service.authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: fileName, description: "Reactor Revival game save (encrypted)" }),
  });
  if (!metadataResponse.ok) throw new Error(`File creation failed: ${metadataResponse.status}`);
  return await metadataResponse.json();
}

async function uploadToNewFile(service, encryptedBlob) {
  const fileMetadata = await createNewSaveFile(service);
  return await uploadToExistingFile(service, fileMetadata.id, encryptedBlob);
}

export async function performSave(service, saveData) {
  const encryptedBlob = await compressAndEncrypt(service, saveData);
  
  let response;
  if (service.saveFileId) {
    response = await uploadToExistingFile(service, service.saveFileId, encryptedBlob);
  } else {
    response = await uploadToNewFile(service, encryptedBlob);
  }

  if (!response.ok) {
    if (response.status === 404 && service.saveFileId) {
      service.saveFileId = null;
      return await performSave(service, saveData);
    }
    throw new Error(`Save failed: ${response.status}`);
  }
  
  const result = await response.json();
  service.saveFileId = result.id;
  StorageUtils.set("google_drive_save_file_id", result.id);
  return true;
}

export async function save(service, saveData, immediate = false) {
  if (!service.isSignedIn) throw new Error("Not signed in to Google Drive");
  if (!immediate) {
    service.pendingSaveData = saveData;
    if (service.saveTimeoutId) clearTimeout(service.saveTimeoutId);
    service.saveTimeoutId = setTimeout(() => {
      if (service.pendingSaveData) {
        const data = service.pendingSaveData;
        service.pendingSaveData = null;
        performSave(service, data);
      }
    }, 2000);
    return true;
  }
  return await performSave(service, saveData);
}

export async function uploadLocalSave(service, saveDataString) {
  if (!service.isSignedIn) throw new Error("User is not signed in to Google Drive");
  const success = await performSave(service, saveDataString);
  if (success) {
    try {
      const localSave = deserializeSave(saveDataString);
      localSave.isCloudSynced = true;
      localSave.cloudUploadedAt = new Date().toISOString();
      await StorageAdapter.set("reactorGameSave", localSave);
    } catch (e) {
      logger.log('error', 'game', 'Failed to mark local save as synced after upload.', e);
    }
  }
  return success;
}

export async function canUploadLocalSave(service) {
  if (!service.isSignedIn) return { showUpload: false };
  const localSave = await StorageAdapter.get("reactorGameSave");
  if (!localSave) return { showUpload: false };
  try {
    if (localSave.isCloudSynced) return { showUpload: false };
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { showUpload: false };
    return { showUpload: true, gameState: localSave };
  } catch {
    return { showUpload: false };
  }
}

export async function offerLocalSaveUpload(service) {
  if (!service.isSignedIn) return { hasLocalSave: false };
  const gameState = await StorageAdapter.get("reactorGameSave");
  if (!gameState) return { hasLocalSave: false };
  try {
    const saveSize = `${(serializeSave(gameState).length / 1024).toFixed(1)}KB`;
    const hasCloudSave = await findSaveFile(service);
    if (hasCloudSave) return { hasLocalSave: false };
    if (gameState.isCloudSynced) {
      delete gameState.isCloudSynced;
      delete gameState.cloudUploadedAt;
      await StorageAdapter.set("reactorGameSave", gameState);
    }
    return { hasLocalSave: true, gameState, saveSize };
  } catch {
    return { hasLocalSave: false };
  }
}

export async function flushPendingSave(service) {
  if (service.pendingSaveData && service.isSignedIn) {
    const dataToSave = service.pendingSaveData;
    service.pendingSaveData = null;
    if (service.saveTimeoutId) {
      clearTimeout(service.saveTimeoutId);
      service.saveTimeoutId = null;
    }
    return await performSave(service, dataToSave);
  }
  return true;
}

export async function testBasicFileOperations(service) {
  if (!service.isSignedIn) return false;
  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${service.authToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteSave(service) {
  if (!service.isSignedIn || !service.saveFileId) throw new Error("No save file to delete");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${service.saveFileId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${service.authToken}` } }
  );
  if (response.ok) {
    service.saveFileId = null;
    return true;
  }
  throw new Error(`Failed to delete save file: ${response.status}`);
}
