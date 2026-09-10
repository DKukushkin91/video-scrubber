export interface IDemoSettings {
  play: boolean;
  loop: boolean;
  sensitivity: number;
}

export const DEFAULT_SETTINGS: IDemoSettings = { play: true, loop: true, sensitivity: 1 };
