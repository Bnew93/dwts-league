export type Couple = {
  id: string;
  show_id: string;
  season: number;
  celebrity: string;
  celebrity_key: string;
  professional: string;
  notability: string | null;
  cast_order: number;
  status: "active" | "eliminated" | "withdrew" | "finalist";
  elimination_week: number | null;
  elimination_date: string | null;
  placement: number | null;
  /** Official couple promo photo (3:4, faces in the top fifth). */
  image_url: string | null;
};

export type DraftPick = {
  id: string;
  league_id: string;
  round: number;
  pick_no: number;
  user_id: string;
  couple_id: string;
  auto: boolean;
  made_at: string;
};

export type Invite = {
  id: string;
  league_id: string;
  token: string;
  created_by: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
};

export type ActivityRow = {
  id: number;
  user_id: string | null;
  league_id: string | null;
  action: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target: Record<string, unknown> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type IngestRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "no_change" | "needs_review" | "error";
  source_url: string | null;
  content_hash: string | null;
  diff: unknown;
  error: string | null;
};
