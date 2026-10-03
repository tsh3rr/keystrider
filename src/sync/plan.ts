import type { CurriculumState } from '../drill';

/**
 * Sync decisions, kept free of I/O so they are easy to test.
 *
 * Each practice round is compared three ways: what this device has, what
 * the server has, and what both had after the last sync (its signature, see
 * codec.ts). Whichever side changed since then wins. Rounds deleted on the
 * server (the learner cleared their history on another device) are deleted
 * here too; rounds missing here are only ever fetched again, never deleted
 * on the server, because a browser can lose its storage by itself.
 */

export type Signatures = ReadonlyMap<string, string>;

export interface SyncPlan {
  upload: string[];
  download: string[];
  deleteLocal: string[];
}

const countOf = (sig: string) => Number(sig.split('|')[0]) || 0;

export function planSync(local: Signatures, remote: Signatures, synced: Signatures): SyncPlan {
  const plan: SyncPlan = { upload: [], download: [], deleteLocal: [] };
  for (const [id, l] of local) {
    const r = remote.get(id);
    const s = synced.get(id);
    if (r === undefined) {
      if (s === undefined) plan.upload.push(id);
      else plan.deleteLocal.push(id);
    } else if (l !== r) {
      const localChanged = l !== s;
      const remoteChanged = r !== s;
      if (remoteChanged && !localChanged) plan.download.push(id);
      else if (localChanged && !remoteChanged) plan.upload.push(id);
      // Both changed: keep the copy with more keystrokes, this device's on a tie.
      else if (countOf(r) > countOf(l)) plan.download.push(id);
      else plan.upload.push(id);
    }
  }
  for (const id of remote.keys()) if (!local.has(id)) plan.download.push(id);
  return plan;
}

/** Local changes to push without asking the server first: rounds new or changed since the last sync. */
export function pendingUploads(local: Signatures, synced: Signatures): string[] {
  return [...local].filter(([id, sig]) => synced.get(id) !== sig).map(([id]) => id);
}

export type Curricula = Record<string, CurriculumState>;

/** The curriculum that has seen more practice; this device's on a tie. */
function further(local: CurriculumState, remote: CurriculumState): CurriculumState {
  if (remote.coreDrills !== local.coreDrills) return remote.coreDrills > local.coreDrills ? remote : local;
  return remote.unlocked.length > local.unlocked.length ? remote : local;
}

/**
 * Merges curricula per language and layout. Returns the merged set, the
 * keys whose local copy must be replaced, and whether the server's copy is
 * out of date.
 */
export function mergeCurricula(local: Curricula, remote: Curricula): { merged: Curricula; takeRemote: string[]; pushRemote: boolean } {
  const merged: Curricula = { ...remote };
  const takeRemote: string[] = [];
  let pushRemote = false;
  for (const [key, l] of Object.entries(local)) {
    const r = remote[key];
    const pick = r ? further(l, r) : l;
    merged[key] = pick;
    if (pick === l && JSON.stringify(l) !== JSON.stringify(r)) pushRemote = true;
  }
  for (const [key, r] of Object.entries(remote)) {
    if (merged[key] === r && JSON.stringify(local[key]) !== JSON.stringify(r)) takeRemote.push(key);
  }
  return { merged, takeRemote, pushRemote };
}
