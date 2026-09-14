'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SearchParamSync({ onSearch }) {
  const searchParams = useSearchParams();
  const querySearch = searchParams?.get('search') || '';
  useEffect(() => {
    onSearch(querySearch);
  }, [querySearch, onSearch]);
  return null;
}