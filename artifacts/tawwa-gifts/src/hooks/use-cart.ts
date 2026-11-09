import { useCallback, useEffect, useState } from 'react';

export type CartItem = { productId: string; quantity: number; message?: string; date?: string; acknowledgedPrice?: number };
const CART_KEY = 'tawwa-cart';

function readCart(): CartItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(value) ? value as CartItem[] : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>(readCart);

  useEffect(() => {
    // Always read the latest storage, not an event snapshot that may be stale.
    // Incoming updates never write back, so two tabs cannot echo writes forever.
    const sync = () => setCart(readCart());
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === CART_KEY || event.key === null)) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('tawwa-cart-update', sync);
    sync(); // Close the gap between the initial read and subscribing.
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('tawwa-cart-update', sync);
    };
  }, []);

  const updateCart = useCallback((update: (current: CartItem[]) => CartItem[]) => {
    // A background tab's storage event may still be queued when the user acts.
    // Apply edits to storage's current cart rather than resurrecting stale items.
    const next = update(readCart());
    const serialized = JSON.stringify(next);
    if (localStorage.getItem(CART_KEY) !== serialized) localStorage.setItem(CART_KEY, serialized);
    setCart(next);
    window.dispatchEvent(new Event('tawwa-cart-update'));
  }, []);

  return [cart, updateCart] as const;
}
