import { useState, useCallback } from 'react';
import { api } from '../api';

export function useSettings() {
  const [settings, setSettings] = useState({});

  const loadSettings = useCallback(async () => {
    const s = await api.get("/api/settings");
    if (s) setSettings(s);
  }, []);

  const saveSettings = useCallback(async (s) => {
    await api.put("/api/settings", s);
    setSettings(s);
  }, []);

  return { settings, loadSettings, saveSettings };
}
