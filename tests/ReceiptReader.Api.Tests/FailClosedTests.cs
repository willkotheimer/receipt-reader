using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using ReceiptReader.Api.Analysis;
using ReceiptReader.Api.Contracts;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §1 Graceful Fail-Closed Error Handling:
//   "Non-receipt payloads or low-confidence parsing attempts return a uniform 400 Bad
//    Request with an uninformative 'Unable to process document.' string to mitigate reverse
//    engineering and trolling attempts."
//
// "Uniform" is the whole requirement. If a caller can tell a low-confidence receipt from an
// unsupported content type, the endpoint has leaked how it works — so these tests compare
// responses to each other byte for byte, not merely to an expected shape.
//
// Governance-Ref: SECTION-1
[GovernanceRef("SECTION-1")]
public class FailClosedTests
{
    private const string ExpectedBody = """{"error":"Unable to process document."}""";

    private static WebApplicationFactory<Program> FactoryWith(IReceiptAnalyzer analyzer) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IReceiptAnalyzer>();
                services.AddSingleton(analyzer);
            }));

    private static MultipartFormDataContent Upload(byte[] bytes, string contentType = "image/jpeg")
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { content, "file", "receipt.jpg" } };
    }

    private static byte[] Payload(int size = 4096)
    {
        var bytes = new byte[size];
        bytes[0] = 0xFF; bytes[1] = 0xD8;
        return bytes;
    }

    private static IReceiptAnalyzer AnalyzerReturning(ReceiptAnalysisResult result)
    {
        var mock = new Mock<IReceiptAnalyzer>();
        mock.Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(result);
        return mock.Object;
    }

    private static IReceiptAnalyzer AnalyzerThrowing(Exception exception)
    {
        var mock = new Mock<IReceiptAnalyzer>();
        mock.Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(exception);
        return mock.Object;
    }

    private static async Task<(HttpStatusCode Status, string Body, string? ContentType)> Post(
        IReceiptAnalyzer analyzer, HttpContent content)
    {
        using var factory = FactoryWith(analyzer);
        var response = await factory.CreateClient().PostAsync("/api/receipts/analyze", content);
        return (response.StatusCode, await response.Content.ReadAsStringAsync(),
            response.Content.Headers.ContentType?.MediaType);
    }

    public static TheoryData<string, Func<Task<(HttpStatusCode, string, string?)>>> FailureModes() => new()
    {
        {
            "not a receipt",
            () => Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), Upload(Payload()))
        },
        {
            "confidence below threshold",
            () => Post(AnalyzerReturning(ReceiptAnalysisResult.LowConfidence(0.21f)), Upload(Payload()))
        },
        {
            "unsupported content type",
            () => Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), Upload(Payload(), "application/zip"))
        },
        {
            "payload over the size cap",
            () => Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), Upload(Payload(8 * 1024 * 1024)))
        },
        {
            "upstream failure",
            () => Post(AnalyzerThrowing(new InvalidOperationException(
                "Azure.RequestFailedException: 401 Unauthorized at cog-rcpt-dev.cognitiveservices.azure.com")),
                Upload(Payload()))
        },
        {
            "no file in the request",
            () => Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), new MultipartFormDataContent())
        },
    };

    [Theory]
    [MemberData(nameof(FailureModes))]
    public async Task Every_failure_mode_returns_400(string mode, Func<Task<(HttpStatusCode, string, string?)>> act)
    {
        var (status, _, _) = await act();

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.NotEqual(HttpStatusCode.InternalServerError, status);
        _ = mode;
    }

    [Theory]
    [MemberData(nameof(FailureModes))]
    public async Task Every_failure_mode_returns_the_identical_body(string mode, Func<Task<(HttpStatusCode, string, string?)>> act)
    {
        var (_, body, _) = await act();

        Assert.Equal(ExpectedBody, body);
        _ = mode;
    }

    [Fact]
    public async Task Failure_responses_are_indistinguishable_from_one_another()
    {
        // The strongest form of the §1 requirement: not "each looks right" but "none can be
        // told apart". A caller probing the endpoint learns nothing about why it refused.
        var results = new List<(HttpStatusCode, string, string?)>();
        foreach (var entry in FailureModes())
        {
            var act = (Func<Task<(HttpStatusCode, string, string?)>>)entry[1];
            results.Add(await act());
        }

        Assert.All(results, r => Assert.Equal(results[0], r));
    }

    [Fact]
    public async Task Failure_response_leaks_no_upstream_detail()
    {
        var (_, body, _) = await Post(
            AnalyzerThrowing(new InvalidOperationException(
                "Azure.RequestFailedException: 401 Unauthorized at cog-rcpt-dev.cognitiveservices.azure.com")),
            Upload(Payload()));

        foreach (var leak in new[] { "Azure", "cognitiveservices", "401", "Unauthorized", "Exception", "at Receipt" })
        {
            Assert.DoesNotContain(leak, body, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Failure_response_is_json_so_the_client_parses_it_uniformly()
    {
        var (_, _, contentType) = await Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), Upload(Payload()));

        Assert.Equal("application/json", contentType);
    }

    [Fact]
    public async Task Does_not_emit_problem_details()
    {
        // ProblemDetails would add type, title, status and traceId - each a small
        // disclosure, and traceId correlates a caller's probes across requests.
        var (_, body, _) = await Post(AnalyzerReturning(ReceiptAnalysisResult.NotAReceipt()), Upload(Payload()));

        foreach (var field in new[] { "traceId", "title", "type", "status", "detail" })
        {
            Assert.DoesNotContain(field, body, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task A_receipt_just_above_the_confidence_threshold_still_succeeds()
    {
        // Guards against the fail-closed path swallowing legitimate receipts: the gate has
        // to reject what is below the threshold and nothing more.
        var receipt = new ReceiptDto { MerchantName = "Corner Shop", Total = 4.20m };
        var (status, _, _) = await Post(
            AnalyzerReturning(ReceiptAnalysisResult.Success(receipt, ReceiptAnalysisResult.MinimumConfidence)),
            Upload(Payload()));

        Assert.Equal(HttpStatusCode.OK, status);
    }
}
