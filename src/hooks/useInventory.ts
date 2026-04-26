import { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, where } from '../lib/firebase';
import { User } from 'firebase/auth';
import { PantryItem, ShoppingListItem } from '../types';

export function useInventory(user: User | null) {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);

  useEffect(() => {
    if (!user) {
      setPantryItems([]);
      setShoppingList([]);
      return;
    }

    const uid = user.uid;

    // Pantry Sync: Root collection with allowedUsers
    const qPantryRoot = query(
      collection(db, 'pantryItems'),
      where('allowedUsers', 'array-contains', uid)
    );

    const unsubPantry = onSnapshot(qPantryRoot, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as PantryItem));
      setPantryItems(items);
    }, (error) => {
      console.error(`Pantry Sync error:`, error);
      // Fallback: Owner-only query (if needed, but root should work)
    });

    const unsubShopping = onSnapshot(collection(db, `users/${uid}/shoppingList`), snap => {
      setShoppingList(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShoppingListItem)));
    }, (error) => {
      console.error('Shopping list sync error:', error);
    });

    return () => {
      unsubPantry();
      unsubShopping();
    };
  }, [user]);

  return { pantryItems, shoppingList, setPantryItems, setShoppingList };
}
