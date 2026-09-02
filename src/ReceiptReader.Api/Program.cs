using Azure.AI.DocumentIntelligence;
using Azure.Identity;
using ReceiptReader.Api.Analysis;
using ReceiptReader.Api.Contracts;
using ReceiptReader.Api.Endpoints;
using ReceiptReader.Api.Governance;
using ReceiptReader.Api.Hosting;

var builder = WebApplication.CreateBuilder(args);

// The receipt contract is serialized identically everywhere — the pipeline and the contract
// tests share one options instance, so §2 parity is asserted against what is actually
// emitted rather than against a second, drifting configuration.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = ReceiptJson.Options.PropertyNamingPolicy;
    options.SerializerOptions.DefaultIgnoreCondition = ReceiptJson.Options.DefaultIgnoreCondition;
});

// §8 — the runtime authenticates with its user-assigned managed identity. The Document
// Intelligence account has disableLocalAuth set, so there is no key to fall back to: if the
// identity is misconfigured this fails loudly rather than silently using a secret.
//
// Registered only when an endpoint is configured, so the test host can substitute its own
// analyzer without needing Azure credentials to start.
var documentIntelligenceEndpoint = builder.Configuration["DocumentIntelligence:Endpoint"];

if (!string.IsNullOrWhiteSpace(documentIntelligenceEndpoint))
{
    builder.Services.AddSingleton(_ => new DocumentIntelligenceClient(
        new Uri(documentIntelligenceEndpoint),
        new DefaultAzureCredential(new DefaultAzureCredentialOptions
        {
            // Set by Bicep to the user-assigned identity's client id. Without it,
            // DefaultAzureCredential would look for a system-assigned identity that does not
            // exist and fail at runtime rather than at startup.
            ManagedIdentityClientId = builder.Configuration["AZURE_CLIENT_ID"],
        })));

    builder.Services.AddSingleton<IReceiptAnalyzer, DocumentIntelligenceReceiptAnalyzer>();
}

var app = builder.Build();

// First in the pipeline, so the headers apply to static files and error responses too —
// not only to the endpoints below.
app.UseSecurityHeaders();

// §9 — the built Vite bundle is served from wwwroot. One origin, so there is no CORS
// surface to configure and no preflight to get wrong.
app.UseDefaultFiles();
app.UseStaticFiles();

// governance.md §1 — the API is publicly reachable and returns nothing informative about
// itself. The health endpoint reports liveness and no more: no version, no hostname, no
// configuration. App Service is configured to probe this path.
app.MapGet("/api/health", () => Results.Ok(new HealthResponse("healthy")))
    .WithMetadata(new GovernanceRefAttribute("SECTION-9"))
    .WithName("Health");

app.MapReceiptEndpoints();

// SPA fallback, scoped to exclude /api.
//
// A deep client route must return the shell rather than 404 on refresh, since the server
// knows nothing about client routing. But an unknown /api path must still 404: an endpoint
// typo answering 200 with an HTML shell is far harder to diagnose than a missing route, and
// the client would try to JSON.parse the shell.
app.MapFallback(async context =>
{
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var index = Path.Combine(app.Environment.WebRootPath ?? string.Empty, "index.html");

    if (!File.Exists(index))
    {
        // No client build present — the API is running on its own, which is the normal
        // state in tests and during API development. Say so plainly rather than 404ing,
        // which would look like the fallback itself was broken.
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/plain";
        await context.Response.WriteAsync("The Receipt Reader API is running. No client build is present.");
        return;
    }

    context.Response.ContentType = "text/html";
    await context.Response.SendFileAsync(index);
});

app.Run();

internal sealed record HealthResponse(string Status);

/// <summary>
/// Exposed so <c>WebApplicationFactory&lt;Program&gt;</c> can boot the real pipeline in
/// tests. Top-level statements generate an internal Program class, which the test project
/// cannot reference.
/// </summary>
public partial class Program;
