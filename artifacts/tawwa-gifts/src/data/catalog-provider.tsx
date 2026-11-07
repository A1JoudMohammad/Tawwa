import { createContext, useContext, type ReactNode } from 'react';
import { useGetCatalog, type Catalog } from '@workspace/api-client-react';

const CatalogContext = createContext<Catalog | null>(null);

export function useCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error('Catalog is not loaded');
  return { ...catalog, availableOccasions: catalog.occasions };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch } = useGetCatalog({
    query: { queryKey: ['/api/catalog'], staleTime: 30_000, refetchInterval: 60_000, retry: 1 },
  });
  const arabic = document.documentElement.lang === 'ar';
  if (!data) return <main className="container"><div className="empty-state" role={isError ? 'alert' : 'status'} aria-live="polite">
    <h1 style={{ fontSize: 32 }}>{isPending
      ? (arabic ? 'نجهز لك الهدايا…' : 'Loading the gift boxes…')
      : (arabic ? 'الهدايا غير متاحة مؤقتاً.' : 'The gift boxes are temporarily unavailable.')}</h1>
    {isError && <><p>{arabic ? 'تعذر تحميل الهدايا. حاول مرة أخرى.' : 'We couldn’t load the catalog. Please try again.'}</p><button className="button" onClick={() => void refetch()}>{arabic ? 'حاول مرة أخرى' : 'Try again'}</button></>}
  </div></main>;
  return <CatalogContext.Provider value={data}>
    {isError && <div role="alert" style={{ padding: 12, textAlign: 'center' }}>
      {arabic ? 'تعذر تحديث الهدايا. قد تكون التفاصيل المعروضة قديمة.' : 'Catalog refresh failed. The details shown may be out of date.'}
      {' '}<button className="remove" onClick={() => void refetch()}>{arabic ? 'حاول مرة أخرى' : 'Try again'}</button>
    </div>}
    {children}
  </CatalogContext.Provider>;
}
