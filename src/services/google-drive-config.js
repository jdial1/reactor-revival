/**
 * Google Drive API Configuration
 *
 * To enable Google Drive cloud save functionality:
 * 1. Go to the Google Cloud Console: https://console.cloud.google.com/
 * 2. Create a new project or select an existing one
 * 3. Enable the Google Drive API
 * 4. Create credentials:
 *    - API Key: Go to "APIs & Services" > "Credentials" > "Create Credentials" > "API Key"
 *    - OAuth 2.0 Client ID: Go to "APIs & Services" > "Credentials" > "Create Credentials" > "OAuth 2.0 Client ID"
 *      - Application type: Web application
 *      - Add your domain(s) to "Authorized JavaScript origins"
 *        - For development: http://localhost:8080 (or your dev server)
 *        - For production: https://yourdomain.com
 * 5. Replace the placeholder values below with your actual credentials
 * 6. Import this config in GoogleDriveSave.js
 */

export const GOOGLE_DRIVE_CONFIG = {
  // Replace with your actual API Key from Google Cloud Console
  API_KEY: "AIzaSyCHjpX5ojjVlazZTMygyQ2FvBzA1JxTBiw",

  CLIENT_ID:
    "567623807753-po3aoptgq97jmo22ud60a9mdj18bihmj.apps.googleusercontent.com",

  // Use broader scope to fix 403 permission errors
  // drive.file only allows access to files created by this app
  // Adding drive.appdata allows access to application data folder
  SCOPES:
    "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",

  // Fallback scope for troubleshooting
  FALLBACK_SCOPES: "https://www.googleapis.com/auth/drive.file",

  //   // Legacy credentials from the old system
  //   LEGACY_CLIENT_ID:
  //     "572695445092-svr182bgaass7vt97r5mnnk4phmmjh5u.apps.googleusercontent.com",
  //   LEGACY_SCOPES: ["https://www.googleapis.com/auth/drive.appfolder"],
};

export const ENABLE_GOOGLE_DRIVE = true;
