export type Couple = {
  id: string;
  league_id: string;
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

export type AllowedEmail = {
  email: string;
  league_id: string;
  display_name: string | null;
  is_commissioner: boolean;
  is_player: boolean;
  user_id: string | null;
};
