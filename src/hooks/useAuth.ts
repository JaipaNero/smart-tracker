import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, auth } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingSession(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, loadingSession };
}
