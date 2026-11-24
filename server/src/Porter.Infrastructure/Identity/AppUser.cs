using Microsoft.AspNetCore.Identity;

namespace Porter.Infrastructure.Identity;

/// <summary>A Porter account. Owns games and saved players.</summary>
public sealed class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;
    /// <summary>The saved player that represents this user ("This is me"), used for personal stats.</summary>
    public Guid? MePlayerId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

/// <summary>
/// A rotating refresh token. Only a SHA-256 hash is stored; the raw value lives in the user's
/// HttpOnly cookie. Re-use of a revoked token revokes the whole family (theft detection).
/// </summary>
public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByHash { get; set; }
    /// <summary>"Keep me logged in": persistent cookie vs. browser-session cookie.</summary>
    public bool Persistent { get; set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}
