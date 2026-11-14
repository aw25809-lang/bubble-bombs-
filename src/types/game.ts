export type GameState =
  | 'TITLE_MENU'
  | 'PASS_DEVICE'
  | 'PLAYING'
  | 'ROUND_REVEAL'
  | 'GAME_OVER';

export type TurnPhase = 'READY' | 'POURING' | 'LOCKED' | 'OVERFLOWED';

export interface Player {
  id: string;
  name: string;
  color: string;
  isEliminated: boolean;
  survivedTurns: number;
  roundsWon: number;
}

export interface PourSegment {
  playerId: string;
  playerName: string;
  color: string;
  startRatio: number;
  endRatio: number;
}

export interface BottleConfig {
  roundNumber: number;
  initialRatio: number;
  capacityMs: number;
  bottleLabel: string;
  widthScale: number;
}

export interface RoundOutcome {
  roundNumber: number;
  loserId: string;
  loserName: string;
  finalRatio: number;
  initialRatio: number;
  segments: PourSegment[];
  survivingCount: number;
}

export const PLAYER_PALETTE = [
  '#38BDF8', // Ramune Cyan
  '#F59E0B', // Lantern Amber
  '#FB7185', // Strawberry Fizz
  '#34D399', // Melon Soda
  '#A78BFA', // Grape Pop
  '#FBBF24', // Yuzu Gold
] as const;

export const MIN_POUR_MS = 400;
