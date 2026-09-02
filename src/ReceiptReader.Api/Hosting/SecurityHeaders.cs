namespace ReceiptReader.Api.Hosting;

/// <summary>
/// Response headers applied to everything the app serves.
/// </summary>
/// <remarks>
/// governance.md §1. The receipt never leaves the browser, so an injected script is the
/// only realistic route to exfiltrating it — which makes the content security policy the
/// control that actually matters here, not a formality.
/// <para>
/// The policy is deliberately strict enough that it would break the app if the app needed
/// inline script. It does not: Vite emits external bundles, and Reactstrap ships real CSS
/// rather than inline styles.
/// </para>
/// </remarks>
public static class SecurityHeaders
{
    private const string ContentSecurityPolicy =
        "default-src 'self'; " +
        // Stated explicitly rather than inherited from default-src. Script is the directive
        // that matters, and leaving it implicit means a later edit to default-src could
        // relax it without anyone noticing.
        "script-src 'self'; " +
        "style-src 'self'; " +
        // The single relaxation, and scoped as narrowly as CSP allows. React and Reactstrap
        // set element style attributes at runtime for spinners and transitions, which
        // style-src alone blocks. style-src-attr covers only the style="" attribute — it
        // does not permit inline <style> blocks, and it has no bearing on script.
        "style-src-attr 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self'; " +
        // The client talks only to its own origin: same-origin hosting means there is no
        // legitimate cross-origin request to permit.
        "connect-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'";

    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;

            headers["Content-Security-Policy"] = ContentSecurityPolicy;
            headers["X-Content-Type-Options"] = "nosniff";
            headers["X-Frame-Options"] = "DENY";
            headers["Referrer-Policy"] = "no-referrer";

            // Nothing here needs a camera, microphone or location. Denying them costs
            // nothing and shrinks what a successful injection could reach.
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

            // Kestrel does not send X-Powered-By, but a reverse proxy or a future middleware
            // might. Removing them here means the guarantee holds regardless.
            headers.Remove("X-Powered-By");
            headers.Remove("X-AspNet-Version");
            headers.Remove("Server");

            await next();
        });
    }
}
