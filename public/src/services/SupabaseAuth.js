import { getBasePath, StorageUtils } from '../utils/util.js';
import { getSupabaseUrl, getSupabaseAnonKey } from './appConfig.js';

function getStableRedirectUri() {
    if (typeof window === 'undefined' || !window.location) return '';
    const basePath = getBasePath();
    return window.location.origin + (basePath || '/');
}

export class SupabaseAuth {
    constructor() {
        this.token = null;
        this.user = null;
        this.expiresAt = 0;
        this.refreshToken = null;
        this.init();
    }

    init() {
        const session = StorageUtils.get('supabase_auth_session');
        if (session) {
            try {
                if (session.expires_at > Date.now()) {
                    this.token = session.access_token;
                    this.user = session.user;
                    this.expiresAt = session.expires_at;
                    this.refreshToken = session.refresh_token;
                } else if (session.refresh_token) {
                    this.refreshToken = session.refresh_token;
                    this.user = session.user;
                    this.refreshAccessToken();
                } else {
                    this.signOut();
                }
            } catch {
                this.signOut();
            }
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken || !getSupabaseAnonKey()) {
            return false;
        }

        try {
            const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey()
                },
                body: JSON.stringify({ refresh_token: this.refreshToken })
            });

            const data = await response.json();
            
            if (response.ok && data.access_token) {
                this.setSession(data);
                return true;
            } else {
                this.signOut();
                return false;
            }
        } catch (error) {
            this.signOut();
            return false;
        }
    }

    async signUp(email, password) {
        try {
            if (!getSupabaseAnonKey()) {
                throw new Error('Supabase ANON_KEY is not configured');
            }

            const response = await fetch(`${getSupabaseUrl()}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey()
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || data.msg || 'Sign up failed');
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message || 'Sign up failed' };
        }
    }

    async signInWithPassword(email, password) {
        try {
            if (!getSupabaseAnonKey()) {
                throw new Error('Supabase ANON_KEY is not configured');
            }

            const response = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey()
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || data.msg || 'Sign in failed');
            }

            this.setSession(data);
            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message || 'Sign in failed' };
        }
    }

    async resetPasswordForEmail(email) {
        try {
            if (!getSupabaseAnonKey()) {
                throw new Error('Supabase ANON_KEY is not configured');
            }

            const response = await fetch(`${getSupabaseUrl()}/auth/v1/recover`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey()
                },
                body: JSON.stringify({
                    email: email,
                    redirect_to: `${getStableRedirectUri()}?type=recovery`
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || data.msg || 'Password reset failed');
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message || 'Password reset failed' };
        }
    }

    async updatePassword(newPassword) {
        try {
            if (!this.token) {
                throw new Error('Not authenticated');
            }

            if (!getSupabaseAnonKey()) {
                throw new Error('Supabase ANON_KEY is not configured');
            }

            const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey(),
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    password: newPassword
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || data.msg || 'Password update failed');
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message || 'Password update failed' };
        }
    }

    async handleEmailConfirmation(tokenHash, type) {
        try {
            if (!getSupabaseAnonKey()) {
                throw new Error('Supabase ANON_KEY is not configured');
            }

            const response = await fetch(`${getSupabaseUrl()}/auth/v1/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getSupabaseAnonKey()
                },
                body: JSON.stringify({
                    token_hash: tokenHash,
                    type: type
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error_description || data.msg || 'Verification failed');
            }

            if (data.access_token) {
                this.setSession(data);
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message || 'Verification failed' };
        }
    }

    setSession(data) {
        this.token = data.access_token;
        this.refreshToken = data.refresh_token;
        this.user = data.user || { id: data.user_id, email: data.email };
        this.expiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
        
        StorageUtils.set('supabase_auth_session', {
            access_token: this.token,
            refresh_token: this.refreshToken,
            user: this.user,
            expires_at: this.expiresAt
        });
    }

    signOut() {
        this.token = null;
        this.user = null;
        this.expiresAt = 0;
        this.refreshToken = null;
        StorageUtils.remove('supabase_auth_session');
    }

    isSignedIn() {
        if (this.token && this.expiresAt > Date.now()) {
            return true;
        }
        if (this.refreshToken && this.expiresAt <= Date.now()) {
            this.refreshAccessToken();
            return !!this.token && this.expiresAt > Date.now();
        }
        return false;
    }

    getUser() {
        return this.user;
    }

    getUserId() {
        return this.user ? this.user.id : null;
    }
}
