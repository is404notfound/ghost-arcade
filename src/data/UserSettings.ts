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
    
    // 저장된 설정이 없으면 기본 설정 반환
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const settings = JSON.parse(raw);
    
    // 파싱된 값이 올바른 객체가 아니면 기본 설정 반환
    if (!settings || typeof settings !== 'object') {
      return DEFAULT_SETTINGS;
    }

    // 누락된 속성이 있을 경우 기본값으로 안전하게 대체 (Optional chaining & Nullish coalescing 사용)
    return {
      audio: {
        volume: settings.audio?.volume ?? DEFAULT_SETTINGS.audio.volume,
        muted: settings.audio?.muted ?? DEFAULT_SETTINGS.audio.muted,
      },
      showFps: settings.showFps ?? DEFAULT_SETTINGS.showFps,
    };
  } catch {
    // JSON 파싱 에러(데이터 손상 등) 발생 시 기본 설정 반환
    return DEFAULT_SETTINGS;
  }
}

export function resetUserSettings(): void {
  saveUserSettings(DEFAULT_SETTINGS);
}
