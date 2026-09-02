using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using ReceiptReader.Api.Analysis;
using ReceiptReader.Api.Contracts;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §1 Zero Server Persistence:
//   "Receipts are processed strictly in-memory (Stream). The server-side layer MUST NOT
//    write, cache, or persist image buffers or extracted data payloads to disk, blob
//    storage, or databases."
//
// Governance-Ref: SECTION-1
[GovernanceRef("SECTION-1")]
public class AnalyzeEndpointTests
{
    // Deliberately larger than ASP.NET Core's default 64 KB multipart memory threshold.
    // Below that, model binding keeps the upload in memory and a persistence test passes
    // whether or not the code is correct. Above it, the default IFormFile path spools to a
    // temp file — so this size is what makes the test in this file capable of failing.
    private const int PayloadBytes = 256 * 1024;

    private static byte[] SamplePayload()
    {
        var bytes = new byte[PayloadBytes];
        // A JPEG magic number, so content sniffing sees a plausible image rather than zeros.
        bytes[0] = 0xFF; bytes[1] = 0xD8; bytes[2] = 0xFF; bytes[3] = 0xE0;
        for (var i = 4; i < bytes.Length; i++) bytes[i] = (byte)(i % 251);
        return bytes;
    }

    private static ReceiptDto SampleReceipt() => new()
    {
        MerchantName = "Contoso Coffee",
        TransactionDate = new DateOnly(2026, 9, 1),
        Total = 12.34m,
        Tax = 1.02m,
        Items = [new ReceiptItemDto { Description = "Flat white", Quantity = 1m, Price = 12.34m, TotalPrice = 12.34m }],
    };

    private static WebApplicationFactory<Program> FactoryWith(IReceiptAnalyzer analyzer) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IReceiptAnalyzer>();
                services.AddSingleton(analyzer);
            }));

    private static MultipartFormDataContent Upload(byte[] bytes, string contentType = "image/jpeg", string fieldName = "file")
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { content, fieldName, "receipt.jpg" } };
    }

    [Fact]
    public async Task Returns_the_extracted_receipt_on_success()
    {
        var analyzer = new Mock<IReceiptAnalyzer>();
        analyzer
            .Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ReceiptAnalysisResult.Success(SampleReceipt(), confidence: 0.98f));

        using var factory = FactoryWith(analyzer.Object);
        var response = await factory.CreateClient().PostAsync("/api/receipts/analyze", Upload(SamplePayload()));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Contoso Coffee", document.RootElement.GetProperty("merchantName").GetString());
        Assert.Equal(12.34m, document.RootElement.GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task Passes_the_uploaded_bytes_through_unchanged()
    {
        var payload = SamplePayload();
        byte[]? observed = null;

        var analyzer = new Mock<IReceiptAnalyzer>();
        analyzer
            .Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<Stream, string, CancellationToken>((stream, _, _) =>
            {
                using var buffer = new MemoryStream();
                stream.CopyTo(buffer);
                observed = buffer.ToArray();
            })
            .ReturnsAsync(ReceiptAnalysisResult.Success(SampleReceipt(), 0.98f));

        using var factory = FactoryWith(analyzer.Object);
        await factory.CreateClient().PostAsync("/api/receipts/analyze", Upload(payload));

        Assert.NotNull(observed);
        Assert.Equal(payload.Length, observed!.Length);
        Assert.Equal(payload, observed);
    }

    [Fact]
    public async Task Writes_nothing_to_disk()
    {
        // The §1 assertion. ASP.NET Core's default multipart binding spools uploads over
        // 64 KB into Path.GetTempPath(), so this is a real behaviour to verify rather than
        // a restatement of "we didn't write any File.WriteAllBytes calls".
        var temp = Path.GetTempPath();
        var before = Directory.GetFiles(temp, "*", SearchOption.TopDirectoryOnly).ToHashSet();

        var analyzer = new Mock<IReceiptAnalyzer>();
        analyzer
            .Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ReceiptAnalysisResult.Success(SampleReceipt(), 0.98f));

        using var factory = FactoryWith(analyzer.Object);
        var response = await factory.CreateClient().PostAsync("/api/receipts/analyze", Upload(SamplePayload()));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var after = Directory.GetFiles(temp, "*", SearchOption.TopDirectoryOnly).ToHashSet();
        var created = after.Except(before).ToArray();

        Assert.Empty(created);
    }

    [Fact]
    public async Task Does_not_expose_the_upload_through_a_second_request()
    {
        // Nothing is cached server-side, so there is no handle by which a previously
        // uploaded receipt could be retrieved. §1 permits client-bound storage only.
        var analyzer = new Mock<IReceiptAnalyzer>();
        analyzer
            .Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ReceiptAnalysisResult.Success(SampleReceipt(), 0.98f));

        using var factory = FactoryWith(analyzer.Object);
        var client = factory.CreateClient();
        await client.PostAsync("/api/receipts/analyze", Upload(SamplePayload()));

        foreach (var path in new[] { "/api/receipts", "/api/receipts/analyze", "/api/receipts/latest" })
        {
            var response = await client.GetAsync(path);
            Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task Forwards_the_declared_content_type_to_the_analyzer()
    {
        string? observed = null;

        var analyzer = new Mock<IReceiptAnalyzer>();
        analyzer
            .Setup(a => a.AnalyzeAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Callback<Stream, string, CancellationToken>((_, contentType, _) => observed = contentType)
            .ReturnsAsync(ReceiptAnalysisResult.Success(SampleReceipt(), 0.98f));

        using var factory = FactoryWith(analyzer.Object);
        await factory.CreateClient().PostAsync("/api/receipts/analyze", Upload(SamplePayload(), "image/png"));

        Assert.Equal("image/png", observed);
    }

    [Fact]
    public async Task Endpoint_carries_a_governance_reference()
    {
        var analyzer = new Mock<IReceiptAnalyzer>();
        using var factory = FactoryWith(analyzer.Object);

        using var scope = factory.Services.CreateScope();
        var dataSource = scope.ServiceProvider
            .GetRequiredService<Microsoft.AspNetCore.Routing.EndpointDataSource>();

        var endpoint = dataSource.Endpoints
            .OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>()
            .Single(e => e.RoutePattern.RawText == "/api/receipts/analyze");

        Assert.NotNull(endpoint.Metadata.GetMetadata<GovernanceRefAttribute>());
    }
}
