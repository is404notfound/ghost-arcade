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
    
    // settings가 null이거나 객체가 아닌 경우 처리
    if (!settings || typeof settings !== 'object') {
      return DEFAULT_SETTINGS;
    }

    // 누락된 속성이 있을 경우 DEFAULT_SETTINGS와 병합하여 반환
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
      audio: {
        ...DEFAULT_SETTINGS.audio,
        ...(settings.audio || {}),
      },
    };
  } catch {
    // 파싱 에러 (예: 깨진 JSON 데이터) 발생 시 기본값 반환
    return DEFAULT_SETTINGS;
  }
}

export function resetUserSettings(): void {
  saveUserSettings(DEFAULT_SETTINGS);
}
