using ReceiptReader.Api.Contracts;

namespace ReceiptReader.Api.Analysis;

/// <summary>Why an analysis did not yield a usable receipt.</summary>
public enum AnalysisOutcome
{
    Success,
    NotAReceipt,
    LowConfidence,
}

/// <summary>
/// The internal result of an analysis, carrying the confidence score the API needs to fail
/// closed.
/// </summary>
/// <remarks>
/// Confidence lives here rather than on <see cref="ReceiptDto"/> on purpose. §1 requires the
/// API to reject low-confidence extractions, but confidence is not a prebuilt-receipt field,
/// and adding it to the DTO would widen the wire contract §2 governs and break 1:1 parity
/// with the TypeScript interface.
/// <para>
/// It also must not reach the client: telling a caller "we found a receipt but only scored
/// 0.31" is precisely the reverse-engineering signal §1 exists to withhold.
/// </para>
/// </remarks>
public sealed record ReceiptAnalysisResult
{
    /// <summary>
    /// Below this, an extraction is treated as a failure. Document Intelligence reports
    /// per-field confidence and will happily return a near-empty receipt from a photograph
    /// of a wall; §1 requires that to be refused rather than surfaced.
    /// </summary>
    public const float MinimumConfidence = 0.50f;

    private ReceiptAnalysisResult(AnalysisOutcome outcome, ReceiptDto? receipt, float confidence)
    {
        Outcome = outcome;
        Receipt = receipt;
        Confidence = confidence;
    }

    public AnalysisOutcome Outcome { get; }

    public ReceiptDto? Receipt { get; }

    public float Confidence { get; }

    public bool IsSuccess => Outcome == AnalysisOutcome.Success;

    public static ReceiptAnalysisResult Success(ReceiptDto receipt, float confidence)
    {
        ArgumentNullException.ThrowIfNull(receipt);

        // Confidence is checked here rather than trusted from the caller, so a mistake at a
        // call site cannot smuggle a low-confidence extraction past §1.
        return confidence < MinimumConfidence
            ? LowConfidence(confidence)
            : new ReceiptAnalysisResult(AnalysisOutcome.Success, receipt, confidence);
    }

    public static ReceiptAnalysisResult NotAReceipt() =>
        new(AnalysisOutcome.NotAReceipt, null, 0f);

    public static ReceiptAnalysisResult LowConfidence(float confidence) =>
        new(AnalysisOutcome.LowConfidence, null, confidence);
}
