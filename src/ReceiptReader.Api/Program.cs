using ReceiptReader.Api.Contracts;
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

var app = builder.Build();

// governance.md §1 — the API is publicly reachable and returns nothing informative about
// itself. The health endpoint reports liveness and no more: no version, no hostname, no
// configuration. App Service is configured to probe this path.
app.MapGet("/api/health", () => Results.Ok(new HealthResponse("healthy")))
    .WithMetadata(new GovernanceRefAttribute("SECTION-9"))
    .WithName("Health");

app.Run();

internal sealed record HealthResponse(string Status);

/// <summary>
/// Exposed so <c>WebApplicationFactory&lt;Program&gt;</c> can boot the real pipeline in
/// tests. Top-level statements generate an internal Program class, which the test project
/// cannot reference.
/// </summary>
public partial class Program;
