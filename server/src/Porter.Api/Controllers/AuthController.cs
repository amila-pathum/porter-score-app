using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Porter.Application.Account;

namespace Porter.Api.Controllers;

/// <summary>
/// Authentication. Access tokens are returned in the body (client keeps them in memory);
/// refresh tokens are only ever sent as an HttpOnly, SameSite=Strict cookie scoped to /api/auth.
/// </summary>
[ApiController]
[Route("api/auth")]
[AllowAnonymous]
[EnableRateLimiting(RateLimitPolicies.Auth)]
public sealed class AuthController(IAuthService auth, IConfiguration config, IWebHostEnvironment env) : ControllerBase
{
    public const string RefreshCookie = "porter_refresh";

    [HttpPost("register")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request, CancellationToken ct)
    {
        var session = await auth.RegisterAsync(request, ct);
        SetRefreshCookie(session);
        return StatusCode(StatusCodes.Status201Created, session.Response);
    }

    [HttpPost("login")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken ct)
    {
        var session = await auth.LoginAsync(request, ct);
        if (session is null)
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Login failed",
                detail: "That email and password don't match. Check both and try again.");
        SetRefreshCookie(session);
        return session.Response;
    }

    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.Refresh)]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Refresh(CancellationToken ct)
    {
        var token = Request.Cookies[RefreshCookie];
        var session = string.IsNullOrEmpty(token) ? null : await auth.RefreshAsync(token, ct);
        if (session is null)
        {
            ClearRefreshCookie();
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Session expired", detail: "Please log in again.");
        }

        SetRefreshCookie(session);
        return session.Response;
    }

    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await auth.LogoutAsync(Request.Cookies[RefreshCookie], ct);
        ClearRefreshCookie();
        return NoContent();
    }

    /// <summary>Always 202, whether or not the account exists.</summary>
    [HttpPost("forgot-password")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        var publicUrl = (config["App:PublicUrl"] ?? $"{Request.Scheme}://{Request.Host}").TrimEnd('/');
        await auth.RequestPasswordResetAsync(request.Email, $"{publicUrl}/reset-password", ct);
        return Accepted();
    }

    [HttpPost("reset-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return NoContent();
    }

    private bool SecureCookies => config.GetValue("Auth:SecureCookies", !env.IsDevelopment());

    private void SetRefreshCookie(AuthSession session) =>
        Response.Cookies.Append(RefreshCookie, session.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = SecureCookies,
            SameSite = SameSiteMode.Strict,
            Path = "/api/auth",
            IsEssential = true,
            Expires = session.Persistent ? session.RefreshExpiresAt : null,
        });

    private void ClearRefreshCookie() =>
        Response.Cookies.Delete(RefreshCookie, new CookieOptions
        {
            HttpOnly = true, Secure = SecureCookies, SameSite = SameSiteMode.Strict, Path = "/api/auth",
        });
}
