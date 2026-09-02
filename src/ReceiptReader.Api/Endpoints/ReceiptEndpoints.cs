using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;
using ReceiptReader.Api.Analysis;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Endpoints;

/// <summary>
/// The receipt analysis endpoint.
/// </summary>
/// <remarks>
/// governance.md §1 governs almost everything here: the upload is streamed and never
/// written to disk, and every failure returns one indistinguishable response.
/// </remarks>
public static class ReceiptEndpoints
{
    /// <summary>
    /// The only response any failure produces. A single constant rather than several
    /// equivalent literals, so no future edit can make one path distinguishable from
    /// another — which is the actual §1 requirement.
    /// </summary>
    private const string FailureJson = """{"error":"Unable to process document."}""";

    /// <summary>
    /// 4 MB. The F0 tier of Document Intelligence rejects larger documents anyway, and the
    /// cap bounds how much a single request can make the server allocate.
    /// </summary>
    private const long MaxUploadBytes = 4 * 1024 * 1024;

    private static readonly string[] SupportedContentTypes =
    [
        "image/jpeg", "image/png", "image/tiff", "image/bmp", "image/heif", "application/pdf",
    ];

    public static IEndpointRouteBuilder MapReceiptEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/receipts/analyze", AnalyzeAsync)
            .WithMetadata(new GovernanceRefAttribute("SECTION-1"))
            .WithName("AnalyzeReceipt");

        return app;
    }

    private static async Task<IResult> AnalyzeAsync(
        HttpContext context,
        IReceiptAnalyzer analyzer,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var logger = loggerFactory.CreateLogger("ReceiptReader.Api.Analyze");

        try
        {
            // MultipartReader rather than IFormFile. Model binding spools any upload over
            // FormOptions.MemoryBufferThreshold (64 KB by default) into a temp file, which
            // would write receipt bytes to disk and violate §1 without a single explicit
            // file-write anywhere in this codebase.
            if (!MediaTypeHeaderValue.TryParse(context.Request.ContentType, out var contentType)
                || !contentType.MediaType.HasValue
                || !contentType.MediaType.Value!.StartsWith("multipart/", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrEmpty(contentType.Boundary.Value))
            {
                return Failure(logger, "request was not multipart");
            }

            var boundary = HeaderUtilities.RemoveQuotes(contentType.Boundary).Value!;
            var reader = new MultipartReader(boundary, context.Request.Body);

            for (var section = await reader.ReadNextSectionAsync(cancellationToken);
                 section is not null;
                 section = await reader.ReadNextSectionAsync(cancellationToken))
            {
                if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition)
                    || !disposition.IsFileDisposition())
                {
                    continue;
                }

                var declaredType = section.ContentType ?? string.Empty;
                if (!SupportedContentTypes.Contains(declaredType, StringComparer.OrdinalIgnoreCase))
                {
                    return Failure(logger, "unsupported content type");
                }

                // Bounded copy into memory. §1 permits in-memory processing; the cap stops a
                // single request from exhausting the process, and reading through a limiting
                // stream means an oversized upload is refused rather than absorbed first.
                using var buffer = new MemoryStream();
                var copied = await CopyBoundedAsync(section.Body, buffer, MaxUploadBytes, cancellationToken);
                if (copied is null)
                {
                    return Failure(logger, "payload exceeded the size cap");
                }

                buffer.Position = 0;
                var result = await analyzer.AnalyzeAsync(buffer, declaredType, cancellationToken);

                return result.IsSuccess
                    ? Results.Ok(result.Receipt)
                    : Failure(logger, $"analysis outcome {result.Outcome}");
            }

            return Failure(logger, "no file section in the request");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The caller went away. Not a failure to report, and not something to dress up
            // as a 400.
            throw;
        }
        catch (Exception exception)
        {
            // Every unexpected failure collapses into the same response. The detail goes to
            // the log, which is the one place §1 permits it to exist.
            logger.LogError(exception, "Receipt analysis failed");
            return Failure(logger, "unhandled exception");
        }
    }

    /// <summary>
    /// Copies at most <paramref name="limit"/> bytes, returning null if the source exceeds it.
    /// </summary>
    private static async Task<long?> CopyBoundedAsync(
        Stream source, Stream destination, long limit, CancellationToken cancellationToken)
    {
        var buffer = new byte[81920];
        long total = 0;

        while (true)
        {
            var read = await source.ReadAsync(buffer, cancellationToken);
            if (read == 0) return total;

            total += read;
            if (total > limit) return null;

            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }

    /// <summary>
    /// The single exit for every failure path.
    /// </summary>
    /// <remarks>
    /// The reason is logged and never returned. §1 requires that a caller cannot distinguish
    /// a non-receipt from a low-confidence match, an oversized payload or an upstream
    /// outage — so this writes the response bytes directly rather than going through
    /// <c>Results.BadRequest</c>, which would let a future change introduce ProblemDetails
    /// and its traceId without anyone noticing.
    /// </remarks>
    private static IResult Failure(ILogger logger, string reason)
    {
        logger.LogInformation("Rejecting document: {Reason}", reason);

        return Results.Text(FailureJson, "application/json", statusCode: StatusCodes.Status400BadRequest);
    }
}
