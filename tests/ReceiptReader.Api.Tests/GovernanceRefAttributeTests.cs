using ReceiptReader.Api.Governance;

namespace ReceiptReader.Api.Tests;

// governance.md §4 Traceability:
//   "Every API route, TanStack Query hook, and xUnit test class must link back to a
//    specific governance section or user story ID via inline attributes/docstrings."
//
// The attribute this exercises is what the Roslyn analyzer in PR7 enforces. It has to
// reject malformed input here, because an analyzer that accepts [GovernanceRef("")] proves
// nothing about traceability.
[GovernanceRef("SECTION-4")]
public class GovernanceRefAttributeTests
{
    [Fact]
    public void Section_returns_the_value_it_was_constructed_with()
    {
        var attribute = new GovernanceRefAttribute("SECTION-9");

        Assert.Equal("SECTION-9", attribute.Section);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t")]
    public void Rejects_a_blank_section(string section)
    {
        // A blank reference satisfies the letter of §4 while carrying no information.
        // Failing loudly here is the difference between traceability and decoration.
        Assert.Throws<ArgumentException>(() => new GovernanceRefAttribute(section));
    }

    [Fact]
    public void Rejects_a_null_section()
    {
        Assert.Throws<ArgumentNullException>(() => new GovernanceRefAttribute(null!));
    }

    [Fact]
    public void Can_be_applied_more_than_once_because_code_may_serve_several_clauses()
    {
        var usage = typeof(GovernanceRefAttribute)
            .GetCustomAttributes(typeof(AttributeUsageAttribute), inherit: false)
            .Cast<AttributeUsageAttribute>()
            .Single();

        Assert.True(usage.AllowMultiple);
    }

    [Fact]
    public void Targets_the_declarations_section_4_names()
    {
        var usage = typeof(GovernanceRefAttribute)
            .GetCustomAttributes(typeof(AttributeUsageAttribute), inherit: false)
            .Cast<AttributeUsageAttribute>()
            .Single();

        // §4 names API routes (methods/delegates) and test classes.
        Assert.True(usage.ValidOn.HasFlag(AttributeTargets.Class));
        Assert.True(usage.ValidOn.HasFlag(AttributeTargets.Method));
    }

    [Fact]
    public void Is_discoverable_by_reflection_so_an_analyzer_can_enforce_it()
    {
        var attribute = typeof(GovernanceRefAttributeTests)
            .GetCustomAttributes(typeof(GovernanceRefAttribute), inherit: false)
            .Cast<GovernanceRefAttribute>()
            .SingleOrDefault();

        Assert.NotNull(attribute);
        Assert.Equal("SECTION-4", attribute!.Section);
    }
}
