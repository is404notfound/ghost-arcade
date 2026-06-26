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
  const raw = localStorage.getItem(SETTINGS_KEY);
  
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const settings = JSON.parse(raw);
    
    if (!settings || typeof settings !== 'object') {
      return DEFAULT_SETTINGS;
    }

    // 저장된 데이터에 일부 속성이 누락되어 있을 경우를 대비해 기본값과 병합
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      audio: {
        ...DEFAULT_SETTINGS.audio,
        ...(settings.audio || {}),
      },
    };
  } catch {
    // JSON 파싱 실패 시 기본값 반환
    return DEFAULT_SETTINGS;
  }
}

export function resetUserSettings(): void {
  saveUserSettings(DEFAULT_SETTINGS);
}
