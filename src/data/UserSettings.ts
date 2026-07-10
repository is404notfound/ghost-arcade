const SETTINGS_KEY = 'user_settings';

export interface AudioSettings {
  volume: number;
  muted: boolean;
}

export interface UserSettings {
  audio: AudioSettings;
  showFps: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  audio: { volume: 0.8, muted: false },
  showFps: false,
};

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 저장 실패는 무시 (쿼터 초과 등)
  }
}

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        showFps: DEFAULT_SETTINGS.showFps,
        audio: { ...DEFAULT_SETTINGS.audio },
      };
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      showFps:
        typeof parsed.showFps === "boolean"
          ? parsed.showFps
          : DEFAULT_SETTINGS.showFps,
      audio: {
        volume:
          typeof parsed.audio?.volume === "number"
            ? parsed.audio.volume
            : DEFAULT_SETTINGS.audio.volume,
        muted:
          typeof parsed.audio?.muted === "boolean"
            ? parsed.audio.muted
            : DEFAULT_SETTINGS.audio.muted,
      },
    };
  } catch {
    return {
      showFps: DEFAULT_SETTINGS.showFps,
      audio: { ...DEFAULT_SETTINGS.audio },
    };
  }
}

export function resetUserSettings(): void {
  saveUserSettings(DEFAULT_SETTINGS);
}
