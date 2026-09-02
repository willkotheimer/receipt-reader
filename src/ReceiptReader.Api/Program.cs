using Azure.AI.DocumentIntelligence;
using Azure.Identity;
using ReceiptReader.Api.Analysis;
using ReceiptReader.Api.Contracts;
using ReceiptReader.Api.Endpoints;
using ReceiptReader.Api.Governance;

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

// governance.md §1 — the API is publicly reachable and returns nothing informative about
// itself. The health endpoint reports liveness and no more: no version, no hostname, no
// configuration. App Service is configured to probe this path.
app.MapGet("/api/health", () => Results.Ok(new HealthResponse("healthy")))
    .WithMetadata(new GovernanceRefAttribute("SECTION-9"))
    .WithName("Health");

app.MapReceiptEndpoints();

app.Run();

internal sealed record HealthResponse(string Status);

/// <summary>
/// Exposed so <c>WebApplicationFactory&lt;Program&gt;</c> can boot the real pipeline in
/// tests. Top-level statements generate an internal Program class, which the test project
/// cannot reference.
/// </summary>
public partial class Program;
