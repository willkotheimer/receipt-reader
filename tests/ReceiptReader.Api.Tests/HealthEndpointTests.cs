using System.Net;
using System.Net.Mime;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §9 — the ASP.NET Core layer, exercised through WebApplicationFactory so
// the real pipeline runs rather than a hand-built stub.
//
// Governance-Ref: SECTION-9
[GovernanceRef("SECTION-9")]
public class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HealthEndpointTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task Health_returns_200()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Health_returns_json()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(MediaTypeNames.Application.Json, response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Health_reports_healthy()
    {
        var client = _factory.CreateClient();

        var body = await _factory.CreateClient().GetStringAsync("/api/health");
        using var document = JsonDocument.Parse(body);

        Assert.Equal("healthy", document.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Health_does_not_leak_environment_detail()
    {
        // The health endpoint is unauthenticated and publicly reachable. It must not become
        // a reconnaissance surface by reporting versions, hostnames or configuration.
        var body = await _factory.CreateClient().GetStringAsync("/api/health");
        using var document = JsonDocument.Parse(body);

        var properties = document.RootElement.EnumerateObject().Select(p => p.Name).ToArray();

        Assert.Equal(["status"], properties);
    }

    [Fact]
    public void Every_api_endpoint_carries_a_governance_reference()
    {
        // §4 is mechanical in PR7 via a Roslyn analyzer. Until then this test enforces the
        // same rule at runtime over the real endpoint table, so a route added without a
        // reference fails the build rather than waiting for the analyzer to exist.
        using var scope = _factory.Services.CreateScope();
        var dataSource = scope.ServiceProvider.GetRequiredService<EndpointDataSource>();

        var apiEndpoints = dataSource.Endpoints
            .OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText?.StartsWith("/api", StringComparison.Ordinal) == true)
            .ToArray();

        Assert.NotEmpty(apiEndpoints);

        var untagged = apiEndpoints
            .Where(e => e.Metadata.GetMetadata<GovernanceRefAttribute>() is null)
            .Select(e => e.RoutePattern.RawText)
            .ToArray();

        Assert.Empty(untagged);
    }
}
