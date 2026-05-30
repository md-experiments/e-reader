'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    getDoc(doc(getFirebaseDb(), 'admins', user.uid))
      .then((snap) => setIsAdmin(snap.exists()))
      .catch(() => setIsAdmin(false));
  }, [user]);

  return isAdmin;
}
