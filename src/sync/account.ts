import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { KeystrokeStore } from '../store';
import { allCurricula, saveCurriculum } from '../curriculum-store';
import { decodeSession, encodeSession, rowSignature, type SessionRow } from './codec';
import { mergeCurricula, pendingUploads, planSync, type Curricula } from './plan';

/**
 * Optional account: sign in with Google or e-mail and password, and practice rounds
 * and curricula are copied between the learner's devices through Supabase.
 *
 * Everything works without an account. The Supabase library is only loaded
 * for someone who is signed in or is signing in, so nobody else downloads it
 * or talks to Supabase at all.
 */

/** Sign-in providers offered as buttons; each must be enabled in Supabase (docs/accounts-setup.md). */
// Add 'google' once its provider is set up in Supabase (docs/accounts-setup.md, step 4).
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = [];
/**
 * Sign-in by one-time code or link, and password reset, both send e-mail.
 * Off until the project has its own mail server: Supabase's built-in one
 * only delivers to the project's team.
 */
export const EMAIL_LINKS = false;

export type OAuthProvider = 'google' | 'github';

// Same 'typing-trainer.' prefix as every other key this app stores.
const AUTH_KEY = 'typing-trainer.auth';
const SYNC_KEY = 'typing-trainer.sync';
/** Rows per request, to keep each request well under the API's limits. */
const UPLOAD_BATCH = 25;
const DOWNLOAD_BATCH = 50;
const LIST_PAGE = 1000;

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type AccountState =
  | { signedIn: false }
  | { signedIn: true; email: string; sync: SyncStatus; lastSync: number | null; choosePassword: boolean };

export interface AccountDeps {
  store: () => KeystrokeStore;
  /** The round being typed right now, which is not synced until it is finished. */
  activeSession: () => string | null;
  /** Called after a sync changed practice data or curricula on this device. */
  dataChanged: () => void;
  stateChanged: (state: AccountState) => void;
}

interface SyncState {
  user: string;
  /** Signature of each round as both sides had it after the last sync. */
  sessions: Record<string, string>;
  at: number | null;
}

export class Account {
  private client: SupabaseClient | null = null;
  private connecting: Promise<SupabaseClient> | null = null;
  private session: Session | null = null;
  private status: SyncStatus = 'idle';
  /** Signed in by a password-reset link: the learner should pick a new password. */
  private recovery = false;
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly deps: AccountDeps) {}

  /** Restores a saved sign-in, or finishes one coming back from an e-mail link or Google. */
  async init(): Promise<void> {
    if (!hasSavedLogin() && !returningFromLogin()) {
      this.emit();
      return;
    }
    try {
      await this.connect();
    } catch (err) {
      console.error('Sign-in could not be restored', err);
      this.emit();
    }
  }

  get state(): AccountState {
    const email = this.session?.user.email;
    if (!this.session) return { signedIn: false };
    return { signedIn: true, email: email ?? '', sync: this.status, lastSync: loadSyncState(this.session.user.id).at, choosePassword: this.recovery };
  }

  /** Sends a one-time code (and a sign-in link) to `email`. */
  async sendCode(email: string): Promise<void> {
    const client = await this.connect();
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: here() } });
    if (error) throw error;
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const client = await this.connect();
    const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }

  async signInWithProvider(provider: OAuthProvider): Promise<void> {
    const client = await this.connect();
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: here() } });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const client = await this.connect();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** Creates an account. Returns false when it still has to be confirmed by e-mail. */
  async signUp(email: string, password: string): Promise<boolean> {
    const client = await this.connect();
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: here() } });
    if (error) throw error;
    return data.session !== null;
  }

  /** Sends a link to choose a new password (needs EMAIL_LINKS); the link signs in, then `setPassword`. */
  async sendPasswordReset(email: string): Promise<void> {
    const client = await this.connect();
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: here() });
    if (error) throw error;
  }

  async setPassword(password: string): Promise<void> {
    const client = this.requireSignedIn();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    this.recovery = false;
    this.emit();
  }

  /** Signs out on this device. Practice data stays here. */
  async signOut(): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw error;
  }

  /** Deletes the account and everything stored with it on the server. Practice data stays on this device. */
  async deleteAccount(): Promise<void> {
    const client = this.requireSignedIn();
    const { error } = await client.rpc('delete_my_account');
    if (error) throw error;
    await client.auth.signOut({ scope: 'local' });
  }

  /** Deletes the synced rounds on the server, when the learner clears their keystroke log. */
  async clearRemoteSessions(): Promise<void> {
    if (!this.session) return;
    const client = this.requireSignedIn();
    const user = this.session.user.id;
    await this.queue(async () => {
      const { error } = await client.from('practice_sessions').delete().eq('user_id', user);
      if (error) throw error;
      saveSyncState({ ...loadSyncState(user), sessions: {} });
    });
  }

  /** Compares everything with the server and copies what is missing either way. */
  syncNow(): Promise<void> {
    return this.queue(() => this.sync(true));
  }

  /** Sends rounds finished on this device since the last sync; cheaper than a full sync. */
  push(): Promise<void> {
    return this.queue(() => this.sync(false));
  }

  private queue(work: () => Promise<void>): Promise<void> {
    if (!this.session) return Promise.resolve();
    const run = this.running.then(async () => {
      this.status = 'syncing';
      this.emit();
      try {
        await work();
        this.status = 'idle';
      } catch (err) {
        this.status = 'error';
        throw err;
      } finally {
        this.emit();
      }
    });
    this.running = run.catch(() => undefined);
    return run;
  }

  private async sync(full: boolean): Promise<void> {
    const client = this.requireSignedIn();
    const user = this.session!.user.id;
    const store = this.deps.store();
    const saved = loadSyncState(user);
    const synced = new Map(Object.entries(saved.sessions));
    const local = await store.sessionSignatures();
    const active = this.deps.activeSession();
    if (active) local.delete(active);
    let changed = false;

    let upload: string[];
    if (full) {
      const remote = await listRemote(client);
      const plan = planSync(local, remote, synced);
      upload = plan.upload;
      for (let i = 0; i < plan.download.length; i += DOWNLOAD_BATCH) {
        const ids = plan.download.slice(i, i + DOWNLOAD_BATCH);
        const { data, error } = await client.from('practice_sessions').select('id,language,layouts,data').in('id', ids);
        if (error) throw error;
        await store.replaceSessions((data as SessionRow[]).flatMap(decodeSession));
      }
      await store.deleteSessions(plan.deleteLocal);
      changed ||= plan.download.length > 0 || plan.deleteLocal.length > 0;
      // What the server has now: its list, minus what this device is about to replace.
      synced.clear();
      for (const [id, sig] of remote) synced.set(id, sig);
    } else {
      upload = pendingUploads(local, synced);
    }

    for (let i = 0; i < upload.length; i += UPLOAD_BATCH) {
      const ids = upload.slice(i, i + UPLOAD_BATCH);
      const rows = [...(await store.sessions(ids)).values()].map((events) => ({ user_id: user, ...encodeSession(events) }));
      const { error } = await client.from('practice_sessions').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
      for (const row of rows) synced.set(row.id, rowSignature(row));
    }

    changed = (await syncCurricula(client, user)) || changed;
    saveSyncState({ user, sessions: Object.fromEntries(synced), at: Date.now() });
    if (changed) this.deps.dataChanged();
  }

  private requireSignedIn(): SupabaseClient {
    if (!this.client || !this.session) throw new Error('not signed in');
    return this.client;
  }

  private connect(): Promise<SupabaseClient> {
    this.connecting ??= this.open().catch((err) => {
      this.connecting = null;
      throw err;
    });
    return this.connecting;
  }

  private async open(): Promise<SupabaseClient> {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(__SUPABASE_URL__, __SUPABASE_KEY__, {
      auth: { storageKey: AUTH_KEY, flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    });
    this.client = client;
    let ready = false;
    // Listening before the first getSession, so a password-reset link's PASSWORD_RECOVERY is not missed.
    client.auth.onAuthStateChange((event, session) => {
      const wasSignedIn = this.session !== null;
      this.session = session;
      if (event === 'PASSWORD_RECOVERY') this.recovery = true;
      if (!session) {
        this.recovery = false;
        clearSyncState();
      }
      if (!ready) return;
      this.emit();
      // Deferred: supabase-js holds a lock while this callback runs.
      if (session && event === 'SIGNED_IN' && !wasSignedIn) setTimeout(() => this.syncNow().catch(logSyncError), 0);
    });
    const { data } = await client.auth.getSession();
    this.session = data.session;
    ready = true;
    cleanLoginParams();
    this.emit();
    if (this.session) this.syncNow().catch(logSyncError);
    return client;
  }

  private emit(): void {
    this.deps.stateChanged(this.state);
  }
}

const logSyncError = (err: unknown) => console.error('Sync failed', err);

async function listRemote(client: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let from = 0; ; from += LIST_PAGE) {
    const { data, error } = await client.from('practice_sessions')
      .select('id,keystroke_count,layouts').order('id').range(from, from + LIST_PAGE - 1);
    if (error) throw error;
    for (const row of data as Pick<SessionRow, 'id' | 'keystroke_count' | 'layouts'>[]) out.set(row.id, rowSignature(row));
    if (data.length < LIST_PAGE) return out;
  }
}

/** Merges curricula both ways; returns whether this device's copy changed. */
async function syncCurricula(client: SupabaseClient, user: string): Promise<boolean> {
  const { data, error } = await client.from('user_state').select('curricula').eq('user_id', user).maybeSingle();
  if (error) throw error;
  const remote = (data?.curricula ?? {}) as Curricula;
  const { merged, takeRemote, pushRemote } = mergeCurricula(allCurricula(), remote);
  for (const key of takeRemote) saveCurriculum(merged[key]);
  if (pushRemote || !data) {
    const { error: upsertError } = await client.from('user_state').upsert({ user_id: user, curricula: merged });
    if (upsertError) throw upsertError;
  }
  return takeRemote.length > 0;
}

/** This page's address without query or hash, where sign-in links return to. */
function here(): string {
  return location.origin + location.pathname;
}

function hasSavedLogin(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) !== null;
  } catch {
    return false;
  }
}

/** The address carries what an e-mail link or Google sends back: a code, or an error. */
function returningFromLogin(): boolean {
  const q = new URLSearchParams(location.search);
  return q.has('code') || q.has('error_description') || /(^|[#&])(access_token|error_description)=/.test(location.hash);
}

function cleanLoginParams(): void {
  if (!returningFromLogin()) return;
  const url = new URL(location.href);
  for (const p of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(p);
  url.hash = '';
  history.replaceState(history.state, '', url);
}

function loadSyncState(user: string): SyncState {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null') as SyncState | null;
    if (saved?.user === user && saved.sessions && typeof saved.sessions === 'object') return saved;
  } catch {
    // unreadable: start over, which is safe (a full sync compares everything)
  }
  return { user, sessions: {}, at: null };
}

function saveSyncState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(state));
  } catch {
    // not remembered: the next sync compares everything again
  }
}

function clearSyncState(): void {
  try {
    localStorage.removeItem(SYNC_KEY);
  } catch {
    // ignore
  }
}
