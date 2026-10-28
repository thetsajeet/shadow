export interface Viewer {
  id: string;
}

export interface AccessSubject {
  visibility: "public" | "private";
  ownerUserId: string | null;
}

/** Public wikis are open to everyone; private ones only to their owner. */
export function canView(repo: AccessSubject, viewer: Viewer | null): boolean {
  return repo.visibility === "public" || (!!viewer && repo.ownerUserId === viewer.id);
}

/** Only the owner may generate, sync or delete. */
export function canManage(repo: AccessSubject, viewer: Viewer | null): boolean {
  return !!viewer && repo.ownerUserId === viewer.id;
}
