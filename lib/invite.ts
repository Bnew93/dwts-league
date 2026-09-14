/** Invite token parked across the OAuth round-trip (15 min, httpOnly). Never in the OAuth state or redirectTo. */
export const INVITE_COOKIE = "ff_invite";
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
