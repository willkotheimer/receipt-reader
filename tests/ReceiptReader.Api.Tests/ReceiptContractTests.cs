using System.Text.Json;
using ReceiptReader.Api.Contracts;
using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §2 Data Scaffold:
//   "The client data shape and the C# API response DTOs must maintain strict 1:1 parity
//    with the Azure Document Intelligence prebuilt-receipt contract fields (MerchantName,
//    TransactionDate, Total, Tax, Items)."
//
// These tests pin the wire shape exactly, because the schema differ in PR7 treats this
// contract as the source of truth. A loose assertion here would let the two sides drift
// while the differ still reported parity.
//
// Governance-Ref: SECTION-2
[GovernanceRef("SECTION-2")]
public class ReceiptContractTests
{
    private static readonly JsonSerializerOptions Options = ReceiptJson.Options;

    private static ReceiptDto Sample() => new()
    {
        MerchantName = "Contoso Coffee",
        TransactionDate = new DateOnly(2026, 9, 1),
        Total = 12.34m,
        Tax = 1.02m,
        Items =
        [
            new ReceiptItemDto
            {
                Description = "Flat white",
                Quantity = 2m,
                Price = 4.50m,
                TotalPrice = 9.00m,
            },
        ],
    };

    [Fact]
    public void Receipt_exposes_exactly_the_five_contract_fields()
    {
        // §2 names five fields. Adding a sixth silently breaks 1:1 parity with the client,
        // so the count is asserted rather than assumed.
        var names = typeof(ReceiptDto).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray();

        Assert.Equal(["Items", "MerchantName", "Tax", "Total", "TransactionDate"], names);
    }

    [Fact]
    public void Receipt_item_exposes_exactly_the_prebuilt_receipt_item_fields()
    {
        var names = typeof(ReceiptItemDto).GetProperties().Select(p => p.Name).OrderBy(n => n).ToArray();

        Assert.Equal(["Description", "Price", "Quantity", "TotalPrice"], names);
    }

    [Fact]
    public void Serializes_with_camel_case_names()
    {
        var json = JsonSerializer.Serialize(Sample(), Options);
        using var document = JsonDocument.Parse(json);

        var names = document.RootElement.EnumerateObject().Select(p => p.Name).OrderBy(n => n).ToArray();

        Assert.Equal(["items", "merchantName", "tax", "total", "transactionDate"], names);
    }

    [Fact]
    public void Serializes_the_transaction_date_as_an_iso_8601_date()
    {
        var json = JsonSerializer.Serialize(Sample(), Options);
        using var document = JsonDocument.Parse(json);

        Assert.Equal("2026-09-01", document.RootElement.GetProperty("transactionDate").GetString());
    }

    [Fact]
    public void Serializes_money_as_numbers_not_strings()
    {
        // The client formats currency itself. Emitting a string would force it to parse,
        // and would let a locale-formatted value through unnoticed.
        var json = JsonSerializer.Serialize(Sample(), Options);
        using var document = JsonDocument.Parse(json);

        Assert.Equal(JsonValueKind.Number, document.RootElement.GetProperty("total").ValueKind);
        Assert.Equal(JsonValueKind.Number, document.RootElement.GetProperty("tax").ValueKind);
        Assert.Equal(12.34m, document.RootElement.GetProperty("total").GetDecimal());
    }

    [Fact]
    public void Serializes_item_fields_with_camel_case_names()
    {
        var json = JsonSerializer.Serialize(Sample(), Options);
        using var document = JsonDocument.Parse(json);

        var item = document.RootElement.GetProperty("items")[0];
        var names = item.EnumerateObject().Select(p => p.Name).OrderBy(n => n).ToArray();

        Assert.Equal(["description", "price", "quantity", "totalPrice"], names);
    }

    [Fact]
    public void Items_defaults_to_an_empty_array_never_null()
    {
        // A null array forces every consumer to null-check. An empty one does not, and the
        // client renders a table over it directly.
        var json = JsonSerializer.Serialize(new ReceiptDto(), Options);
        using var document = JsonDocument.Parse(json);

        var items = document.RootElement.GetProperty("items");

        Assert.Equal(JsonValueKind.Array, items.ValueKind);
        Assert.Equal(0, items.GetArrayLength());
    }

    [Fact]
    public void Emits_null_for_a_field_the_model_could_not_extract()
    {
        // Absent and null are different: a missing key would read to the client as "field
        // not in the contract", where null means "the model did not find it on this
        // receipt". §2 parity requires the key to be present either way.
        var json = JsonSerializer.Serialize(new ReceiptDto(), Options);
        using var document = JsonDocument.Parse(json);

        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("merchantName").ValueKind);
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("transactionDate").ValueKind);
        Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("total").ValueKind);
    }

    [Fact]
    public void Round_trips_without_loss()
    {
        var json = JsonSerializer.Serialize(Sample(), Options);

        var restored = JsonSerializer.Deserialize<ReceiptDto>(json, Options);

        Assert.NotNull(restored);
        Assert.Equal("Contoso Coffee", restored!.MerchantName);
        Assert.Equal(new DateOnly(2026, 9, 1), restored.TransactionDate);
        Assert.Equal(12.34m, restored.Total);
        Assert.Equal(1.02m, restored.Tax);
        Assert.Single(restored.Items);
        Assert.Equal("Flat white", restored.Items[0].Description);
        Assert.Equal(9.00m, restored.Items[0].TotalPrice);
    }

    [Fact]
    public void Deserializes_a_payload_whose_optional_fields_are_absent()
    {
        var restored = JsonSerializer.Deserialize<ReceiptDto>("""{"merchantName":"Corner Shop"}""", Options);

        Assert.NotNull(restored);
        Assert.Equal("Corner Shop", restored!.MerchantName);
        Assert.Null(restored.Total);
        Assert.Empty(restored.Items);
    }
}
