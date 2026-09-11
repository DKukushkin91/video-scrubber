export interface IDemoSettings {
  play: boolean;
  loop: boolean;
  invertDirection: boolean;
  sensitivity: number;
}

export const DEFAULT_SETTINGS: IDemoSettings = {
  play: true,
  loop: true,
  invertDirection: false,
  sensitivity: 1,
};
