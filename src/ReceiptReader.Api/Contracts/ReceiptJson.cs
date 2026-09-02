using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReceiptReader.Api.Contracts;

/// <summary>
/// The single serialization configuration for the receipt contract.
/// </summary>
/// <remarks>
/// Shared between the API pipeline and the contract tests deliberately: if the tests built
/// their own options, they would pin a shape the API does not actually emit, and §2 parity
/// would be asserted against a fiction.
/// </remarks>
public static class ReceiptJson
{
    public static JsonSerializerOptions Options { get; } = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,

        // Null is meaningful here. Omitting the key would read to the client as "this field
        // is not part of the contract", where null means "the model did not find it on this
        // receipt". §2 parity requires the key to be present either way.
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };
}
