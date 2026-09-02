import { Alert, Col, Container, Row } from 'reactstrap';
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

  return (
    <Container className="py-4">
      <Row>
        <Col>
          <h1 className="h3 mb-1">The Receipt Reader</h1>
          <p className="text-muted">
            Receipts are processed in memory and never stored on the server. Extracted data
            stays in this browser.
          </p>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col md={6}>
          <ReceiptUpload
            onSelect={handleSelect}
            isPending={analyze.isPending}
            error={analyze.error?.message ?? null}
          />
        </Col>
      </Row>

      {!store.persisted && (
        <Alert color="warning">
          Receipts could not be saved to this browser, so they will be lost on reload.
        </Alert>
      )}

      <Row>
        <Col>
          <ReceiptTable receipts={store.receipts} onRemove={store.remove} />
        </Col>
      </Row>
    </Container>
  );
}
