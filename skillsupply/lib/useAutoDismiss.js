import { useEffect } from 'react';

export default function useAutoDismiss(value, setValue, delay = 3000) {
  useEffect(() => {
    if (!value) return undefined;

    const timer = setTimeout(() => setValue(''), delay);
    return () => clearTimeout(timer);
  }, [value, setValue, delay]);
}
