using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §9 — the built client is served from the API's wwwroot, so there is a
// single origin and no CORS surface at all.
//
// Governance-Ref: SECTION-9
[GovernanceRef("SECTION-9")]
public class SpaHostingTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SpaHostingTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task Unknown_client_route_falls_back_to_the_spa_rather_than_404()
    {
        // A deep link the client routes internally must not 404 on refresh. The server
        // knows nothing about client routes, so anything that is not /api and not a real
        // file has to return the shell.
        var response = await _factory.CreateClient().GetAsync("/some/client/route");

        Assert.NotEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_api_route_still_404s()
    {
        // The fallback must not swallow API mistakes: a typo'd endpoint returning the HTML
        // shell with a 200 is far harder to diagnose than a 404.
        var response = await _factory.CreateClient().GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Api_routes_are_unaffected_by_the_fallback()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("Content-Security-Policy")]
    [InlineData("X-Content-Type-Options")]
    [InlineData("Referrer-Policy")]
    [InlineData("X-Frame-Options")]
    public async Task Security_headers_are_present(string header)
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.True(response.Headers.Contains(header), $"missing {header}");
    }

    [Fact]
    public async Task Content_security_policy_forbids_inline_script()
    {
        // The receipt never leaves the browser, so an injected script is the only realistic
        // route to exfiltrating it. Blocking inline script is the control that matters.
        var response = await _factory.CreateClient().GetAsync("/api/health");
        var csp = string.Join(' ', response.Headers.GetValues("Content-Security-Policy"));

        Assert.Contains("default-src 'self'", csp);
        Assert.DoesNotContain("unsafe-inline", csp);
        Assert.DoesNotContain("unsafe-eval", csp);
    }

    [Fact]
    public async Task Content_security_policy_forbids_framing()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");
        var csp = string.Join(' ', response.Headers.GetValues("Content-Security-Policy"));

        Assert.Contains("frame-ancestors 'none'", csp);
    }

    [Fact]
    public async Task Does_not_advertise_the_server_implementation()
    {
        // §1's fail-closed posture applies to headers too: the less a prober learns about
        // what is running, the less useful a future CVE is against it.
        var response = await _factory.CreateClient().GetAsync("/api/health");

        Assert.False(response.Headers.Contains("X-Powered-By"));
        Assert.False(response.Headers.Contains("X-AspNet-Version"));
    }
}
