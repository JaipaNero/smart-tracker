import { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot } from '../lib/firebase';
import { PantryItem } from '../types';

/**
 * Hook to pull personal pantry items where the user is the direct owner.
 */
export function usePersonalPantry(userId: string | undefined) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'pantryItems'),
      where('allowedUsers', 'array-contains', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pantryItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PantryItem));
      setItems(pantryItems);
      setLoading(false);
    }, (error) => {
      console.error('Personal Pantry snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  return { items, loading };
}

/**
 * Hook to pull shared pantry items for a specific household.
 */
export function useSharedPantry(householdId: string | null) {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!householdId) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Note: Querying by sharedWithHouseholdId is supported by rules but 
    // allowedUsers array-contains is generally more efficient for combined views.
    // However, for this specific household view, we use the household ID filter.
    const q = query(
      collection(db, 'pantryItems'),
      where('sharedWithHouseholdId', '==', householdId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pantryItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PantryItem));
      setItems(pantryItems);
      setLoading(false);
    }, (error) => {
      console.error('Shared Pantry snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [householdId]);

  return { items, loading };
}
