using Azure;
using Azure.AI.DocumentIntelligence;
using ReceiptReader.Api.Contracts;

namespace ReceiptReader.Api.Analysis;

/// <summary>
/// Extracts receipts using the Azure Document Intelligence <c>prebuilt-receipt</c> model.
/// </summary>
/// <remarks>
/// Authenticates with the app's user-assigned managed identity — the account has
/// <c>disableLocalAuth</c> set, so no key exists to fall back to (§8).
/// <para>
/// The document is passed as in-memory bytes and nothing is written to disk (§1).
/// </para>
/// </remarks>
public sealed class DocumentIntelligenceReceiptAnalyzer : IReceiptAnalyzer
{
    private const string ModelId = "prebuilt-receipt";

    private readonly DocumentIntelligenceClient _client;
    private readonly ILogger<DocumentIntelligenceReceiptAnalyzer> _logger;

    public DocumentIntelligenceReceiptAnalyzer(
        DocumentIntelligenceClient client,
        ILogger<DocumentIntelligenceReceiptAnalyzer> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task<ReceiptAnalysisResult> AnalyzeAsync(
        Stream content, string contentType, CancellationToken cancellationToken)
    {
        // The SDK takes no content type: the service determines format from the bytes. The
        // declared type is still validated at the endpoint, so an unsupported upload is
        // refused before it reaches the network (§8).
        _logger.LogDebug("Analyzing a {ContentType} document", contentType);

        var operation = await _client.AnalyzeDocumentAsync(
            WaitUntil.Completed,
            ModelId,
            await BinaryData.FromStreamAsync(content, cancellationToken),
            cancellationToken);

        var document = operation.Value.Documents.FirstOrDefault();

        // No document at all means the model found nothing receipt-shaped.
        if (document is null)
        {
            _logger.LogInformation("prebuilt-receipt returned no documents");
            return ReceiptAnalysisResult.NotAReceipt();
        }

        var confidence = document.Confidence;
        if (confidence < ReceiptAnalysisResult.MinimumConfidence)
        {
            _logger.LogInformation("Extraction confidence {Confidence} below threshold", confidence);
            return ReceiptAnalysisResult.LowConfidence(confidence);
        }

        return ReceiptAnalysisResult.Success(Map(document.Fields), confidence);
    }

    private static ReceiptDto Map(IReadOnlyDictionary<string, DocumentField> fields) => new()
    {
        MerchantName = String(fields, "MerchantName"),
        TransactionDate = Date(fields, "TransactionDate"),
        Total = Money(fields, "Total"),
        Tax = Money(fields, "TotalTax"),
        Items = Items(fields),
    };

    private static IReadOnlyList<ReceiptItemDto> Items(IReadOnlyDictionary<string, DocumentField> fields)
    {
        if (!fields.TryGetValue("Items", out var items) || items.FieldType != DocumentFieldType.List)
        {
            // Absent items is a normal outcome, not an error: an empty list lets the client
            // render without a null check (§2).
            return [];
        }

        return [.. items.ValueList
            .Where(item => item.FieldType == DocumentFieldType.Dictionary)
            .Select(item => new ReceiptItemDto
            {
                Description = String(item.ValueDictionary, "Description"),
                Quantity = Number(item.ValueDictionary, "Quantity"),
                Price = Money(item.ValueDictionary, "Price"),
                TotalPrice = Money(item.ValueDictionary, "TotalPrice"),
            })];
    }

    private static string? String(IReadOnlyDictionary<string, DocumentField> fields, string name) =>
        fields.TryGetValue(name, out var field) && field.FieldType == DocumentFieldType.String
            ? field.ValueString
            : null;

    private static DateOnly? Date(IReadOnlyDictionary<string, DocumentField> fields, string name) =>
        fields.TryGetValue(name, out var field)
        && field.FieldType == DocumentFieldType.Date
        && field.ValueDate.HasValue
            ? DateOnly.FromDateTime(field.ValueDate.Value.Date)
            : null;

    private static decimal? Number(IReadOnlyDictionary<string, DocumentField> fields, string name) =>
        fields.TryGetValue(name, out var field)
        && field.FieldType == DocumentFieldType.Double
        && field.ValueDouble.HasValue
            ? (decimal)field.ValueDouble.Value
            : null;

    /// <summary>
    /// Reads a currency field, falling back to a plain number.
    /// </summary>
    /// <remarks>
    /// The model reports a bare double when it cannot identify a currency symbol, which is
    /// common on faded thermal receipts. Treating that as "no total" would send an otherwise
    /// good extraction down the fail-closed path.
    /// <para>
    /// DocumentFieldType is an extensible enum (a struct with static members), not a real
    /// enum, so these are equality comparisons rather than a switch over constants.
    /// </para>
    /// </remarks>
    private static decimal? Money(IReadOnlyDictionary<string, DocumentField> fields, string name)
    {
        if (!fields.TryGetValue(name, out var field)) return null;

        if (field.FieldType == DocumentFieldType.Currency && field.ValueCurrency is not null)
        {
            return (decimal)field.ValueCurrency.Amount;
        }

        if (field.FieldType == DocumentFieldType.Double && field.ValueDouble.HasValue)
        {
            return (decimal)field.ValueDouble.Value;
        }

        return null;
    }
}
