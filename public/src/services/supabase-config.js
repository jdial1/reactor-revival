import { getBasePath } from '../utils/util.js';

function getStableRedirectUri() {
    if (typeof window === 'undefined' || !window.location) return '';
    const basePath = getBasePath();
    return window.location.origin + (basePath || '/');
}

export const SUPABASE_CONFIG = {
    PROJECT_URL: "https://znfamffcymyvsihpnfpk.supabase.co",
    ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuZmFtZmZjeW15dnNpaHBuZnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzY1MTUsImV4cCI6MjA4MTA1MjUxNX0.L8fcstwsxNExnYNjEG_lC9emrnOPlnQQc2th8rhmb6A",
    get REDIRECT_URI() { return getStableRedirectUri(); }
};

