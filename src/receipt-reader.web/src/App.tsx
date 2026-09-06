import { Alert } from 'reactstrap';
import { ReceiptUpload } from './components/ReceiptUpload';
import { ReceiptTable } from './components/ReceiptTable';
import { useAnalyzeReceipt } from './hooks/useAnalyzeReceipt';
import { useReceiptStore } from './hooks/useReceiptStore';

export function App() {
  const store = useReceiptStore();
  const analyze = useAnalyzeReceipt();

  const handleSelect = (file: File) => {
    analyze.mutate(file, { onSuccess: (receipt) => store.add(receipt) });
  };

  const handleClear = () => {
    analyze.reset();
    store.clear();
  };

  return (
    <div className="rr-app">
      {/* The bar gives the page a top edge and carries the one genuinely unusual thing
          about this app, which was previously buried in body text. */}
      <header className="rr-bar">
        <div className="rr-bar-inner">
          <h1 className="rr-wordmark">Receipt Reader</h1>
          <p className="rr-barnote">processed in memory · never stored on the server</p>
        </div>
      </header>

      <main className="rr-main">
        <ReceiptUpload
          onSelect={handleSelect}
          onClear={handleClear}
          isPending={analyze.isPending}
          error={analyze.error?.message ?? null}
          hasReceipts={store.receipts.length > 0}
        />

        {!store.persisted && (
          <Alert color="warning" className="mb-0">
            Receipts could not be saved to this browser, so they will be lost on reload.
          </Alert>
        )}

        <ReceiptTable receipts={store.receipts} onRemove={store.remove} />
      </main>
    </div>
  );
}
