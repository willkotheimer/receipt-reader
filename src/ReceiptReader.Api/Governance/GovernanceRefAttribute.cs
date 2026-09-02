namespace ReceiptReader.Api.Governance;

/// <summary>
/// Links a declaration back to the clause of <c>governance.md</c> it serves.
/// </summary>
/// <remarks>
/// governance.md §4 Traceability requires every API route and test class to reference a
/// governance section. This attribute is that reference, and the Roslyn analyzer added in
/// PR7 flags public endpoints and test classes that lack one.
/// <para>
/// The constructor validates rather than accepting anything, because a blank reference
/// satisfies the letter of §4 while carrying no information — which is worse than no
/// attribute at all, since it reads as compliance.
/// </para>
/// </remarks>
[AttributeUsage(
    AttributeTargets.Class | AttributeTargets.Method | AttributeTargets.Delegate,
    AllowMultiple = true,
    Inherited = false)]
public sealed class GovernanceRefAttribute : Attribute
{
    /// <param name="section">
    /// The clause served, as <c>SECTION-N</c> — for example <c>SECTION-2</c>.
    /// </param>
    public GovernanceRefAttribute(string section)
    {
        ArgumentNullException.ThrowIfNull(section);

        if (string.IsNullOrWhiteSpace(section))
        {
            throw new ArgumentException(
                "A governance reference must name a clause, e.g. \"SECTION-2\".",
                nameof(section));
        }

        Section = section;
    }

    /// <summary>The clause this declaration serves.</summary>
    public string Section { get; }
}
