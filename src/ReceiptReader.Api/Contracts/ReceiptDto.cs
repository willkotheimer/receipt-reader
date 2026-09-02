namespace ReceiptReader.Api.Contracts;

/// <summary>
/// The extracted receipt, in strict 1:1 parity with the fields governance.md §2 names:
/// MerchantName, TransactionDate, Total, Tax, Items.
/// </summary>
/// <remarks>
/// This type is the contract. The schema differ added in PR7 compares it against the
/// TypeScript interface field for field, so adding a property here without adding it there
/// fails the build.
/// <para>
/// Confidence scores are deliberately absent. §1 requires the API to fail closed on
/// low-confidence extraction, but confidence is not a prebuilt-receipt field and belongs on
/// an internal result type rather than widening the wire contract §2 governs.
/// </para>
/// </remarks>
public sealed class ReceiptDto
{
    public string? MerchantName { get; init; }

    /// <summary>Date only — the model reports a calendar date, not an instant.</summary>
    public DateOnly? TransactionDate { get; init; }

    public decimal? Total { get; init; }

    public decimal? Tax { get; init; }

    /// <summary>
    /// Line items. Never null: an empty array lets the client render a table without a
    /// null check, and "no items found" is a real outcome rather than a missing field.
    /// </summary>
    public IReadOnlyList<ReceiptItemDto> Items { get; init; } = [];
}
