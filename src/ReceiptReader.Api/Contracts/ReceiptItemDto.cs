namespace ReceiptReader.Api.Contracts;

/// <summary>
/// A single line item, mirroring the <c>Items</c> array of the Azure Document Intelligence
/// <c>prebuilt-receipt</c> model.
/// </summary>
/// <remarks>
/// Every field is nullable: the model reports what it could read, and a receipt that is
/// creased, faded or partially cropped legitimately yields a line with a description and
/// nothing else. Non-nullable fields here would force the API to invent values.
/// <para>governance.md §2 — the TypeScript interface in PR6 mirrors this exactly.</para>
/// </remarks>
public sealed class ReceiptItemDto
{
    public string? Description { get; init; }

    public decimal? Quantity { get; init; }

    /// <summary>Unit price.</summary>
    public decimal? Price { get; init; }

    /// <summary>Line total. Not derived from Quantity × Price — it is what the model read.</summary>
    public decimal? TotalPrice { get; init; }
}
