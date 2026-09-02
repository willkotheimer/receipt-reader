namespace ReceiptReader.Api.Analysis;

/// <summary>
/// Extracts a receipt from an uploaded document.
/// </summary>
/// <remarks>
/// The seam that keeps Azure out of the endpoint tests. Implementations must treat the
/// stream as read-once and must not persist it (§1).
/// </remarks>
public interface IReceiptAnalyzer
{
    /// <param name="content">The document bytes. Read-once; never written to disk.</param>
    /// <param name="contentType">The declared media type, forwarded to the model.</param>
    Task<ReceiptAnalysisResult> AnalyzeAsync(
        Stream content,
        string contentType,
        CancellationToken cancellationToken);
}
