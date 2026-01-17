
export enum GameStatus {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER'
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  jumpHeld: boolean;
  speed: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'normal' | 'moving' | 'vanishing';
  direction?: number;
}

export interface GameState {
  score: number;
  bestScore: number;
  height: number;
  maxHeight: number;
  combo: number;
  comboTimer: number; // 0.0 to 1.0 representing remaining combo time
  maxSpeed: number; // Track peak momentum
  status: GameStatus;
  speedMultiplier: number;
  isMuted: boolean;
  actionText?: {
    text: string;
    opacity: number;
    x: number;
    y: number;
  };
}
