/** Wire types mirroring the ASP.NET Core DTOs (camelCase JSON). */

export type GameStatus = 'draft' | 'active' | 'completed';
export type AvatarColor = 'teal' | 'amber' | 'olive' | 'slate' | 'plum' | 'clay';
export const AVATAR_COLORS: AvatarColor[] = ['teal', 'amber', 'olive', 'slate', 'plum', 'clay'];

export interface Account {
  id: string;
  email: string;
  displayName: string;
  mePlayerId: string | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: Account;
}

export interface PlayerRef {
  id: string;
  name: string;
  avatarColor: AvatarColor;
}

export interface GamePlayerState {
  playerId: string;
  name: string;
  avatarColor: AvatarColor;
  seat: number;
  total: number;
  rank: number;
  isTied: boolean;
}

export interface Standing {
  playerId: string;
  name: string;
  avatarColor: AvatarColor;
  total: number;
  rank: number;
  isTied: boolean;
  behindLeader: number;
}

export interface DealScore {
  playerId: string;
  score: number;
}

export interface Deal {
  number: number;
  wildCard: string;
  scores: DealScore[];
  sum: number;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
}

export interface GameState {
  id: string;
  name: string;
  status: GameStatus;
  version: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  dealsPerGame: number;
  completedDeals: number;
  nextDealNumber: number | null;
  nextWildCard: string | null;
  players: GamePlayerState[];
  standings: Standing[];
  deals: Deal[];
  winnerIds: string[];
}

export interface SaveDealResult {
  game: GameState;
  outcome: 'created' | 'corrected' | 'unchanged';
}

export interface GameLeader {
  names: string[];
  total: number;
}

export interface GameSummary {
  id: string;
  name: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedDeals: number;
  nextDealNumber: number | null;
  players: PlayerRef[];
  leader: GameLeader | null;
}

export interface GameStatusCounts {
  all: number;
  draft: number;
  active: number;
  completed: number;
}

export interface GameList {
  items: GameSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  counts: GameStatusCounts;
}

export interface GameListQuery {
  status?: GameStatus | null;
  q?: string | null;
  sort?: 'activity' | 'newest' | 'oldest' | 'name';
  page?: number;
  pageSize?: number;
}

export interface Player {
  id: string;
  name: string;
  avatarColor: AvatarColor;
  createdAt: string;
  gamesPlayed: number;
  wins: number;
  isMe: boolean;
  canDelete: boolean;
}

export interface FinishCount {
  position: number;
  count: number;
}

export interface PlayerGameResult {
  gameId: string;
  gameName: string;
  completedAt: string;
  playerCount: number;
  rank: number;
  isTied: boolean;
  total: number;
  won: boolean;
}

export interface PlayedWith {
  playerId: string;
  name: string;
  avatarColor: AvatarColor;
  games: number;
}

export interface PlayerStats {
  playerId: string;
  gamesPlayed: number;
  wins: number;
  winRate: number | null;
  averageFinalScore: number | null;
  bestFinalScore: number | null;
  dealsPlayed: number;
  zeroScoreDeals: number;
  finishes: FinishCount[];
  recentGames: PlayerGameResult[];
  trend: PlayerGameResult[];
  playedWith: PlayedWith[];
}

export interface MyStats {
  mePlayer: PlayerRef | null;
  stats: PlayerStats | null;
}

export type ActivityKind = 'deal_saved' | 'deal_corrected' | 'game_started' | 'game_completed' | 'game_created' | 'player_added';

export interface Activity {
  kind: ActivityKind;
  at: string;
  gameId: string | null;
  gameName: string | null;
  dealNumber: number | null;
  playerName: string | null;
}

export interface Dashboard {
  displayName: string;
  activeGames: GameSummary[];
  draftGames: GameSummary[];
  recentGames: GameSummary[];
  my: MyStats;
  totalGames: number;
  playerCount: number;
  activity: Activity[];
}
