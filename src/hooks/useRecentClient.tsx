import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface RecentClient {
  id: string;
  name: string;
  initial: string;
}

interface RecentClientContextType {
  recentClient: RecentClient | null;
  setRecentClient: (client: RecentClient | null) => void;
  clearRecentClient: () => void;
}

const RecentClientContext = createContext<RecentClientContextType | null>(null);

const STORAGE_KEY = 'ab_recent_client';

export function RecentClientProvider({ children }: { children: ReactNode }) {
  const [recentClient, setRecentClientState] = useState<RecentClient | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentClientState(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent client:', e);
    }
  }, []);

  const setRecentClient = (client: RecentClient | null) => {
    setRecentClientState(client);
    if (client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(client));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const clearRecentClient = () => {
    setRecentClientState(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <RecentClientContext.Provider value={{ recentClient, setRecentClient, clearRecentClient }}>
      {children}
    </RecentClientContext.Provider>
  );
}

export function useRecentClient() {
  const context = useContext(RecentClientContext);
  if (!context) {
    throw new Error('useRecentClient must be used within a RecentClientProvider');
  }
  return context;
}
