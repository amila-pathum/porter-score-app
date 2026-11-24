using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Porter.Application.Account;
using Porter.Application.Common;
using Porter.Infrastructure.Email;
using Porter.Infrastructure.Persistence;

namespace Porter.Infrastructure.Identity;

public sealed class AuthService(
    UserManager<AppUser> users,
    PorterDbContext db,
    TokenService tokens,
    IOptions<JwtOptions> jwt,
    IEmailSender email,
    TimeProvider clock,
    ILogger<AuthService> logger) : IAuthService
{
    public async Task<AuthSession> RegisterAsync(RegisterRequest request, CancellationToken ct = default)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            Email = request.Email.Trim(),
            UserName = request.Email.Trim(),
            DisplayName = request.DisplayName.Trim(),
            CreatedAt = clock.GetUtcNow(),
        };

        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code is "DuplicateUserName" or "DuplicateEmail"))
                throw new ConflictException("account.email_taken", "An account with this email already exists. Try logging in.");
            throw new RequestValidationException(IdentityErrorMapper.ToFieldErrors(result.Errors));
        }

        logger.LogInformation("User {UserId} registered", user.Id);
        return await IssueSessionAsync(user, persistent: true, ct);
    }

    public async Task<AuthSession?> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null) return null;
        if (await users.IsLockedOutAsync(user))
        {
            logger.LogWarning("Login attempt for locked-out user {UserId}", user.Id);
            return null;
        }

        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            await users.AccessFailedAsync(user);
            return null;
        }

        await users.ResetAccessFailedCountAsync(user);
        return await IssueSessionAsync(user, request.RememberMe, ct);
    }

    public async Task<AuthSession?> RefreshAsync(string refreshToken, CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var hash = TokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
        if (stored is null) return null;

        if (stored.RevokedAt is not null)
        {
            // A rotated token was presented again: treat as theft and revoke every session for the user.
            logger.LogWarning("Refresh token reuse detected for user {UserId}; revoking all sessions", stored.UserId);
            await db.RefreshTokens.Where(t => t.UserId == stored.UserId && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), ct);
            return null;
        }

        if (!stored.IsActive(now)) return null;

        var user = await users.FindByIdAsync(stored.UserId.ToString());
        if (user is null) return null;

        var session = await IssueSessionAsync(user, stored.Persistent, ct, replacing: stored);
        return session;
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(refreshToken)) return;
        var hash = TokenService.Hash(refreshToken);
        await db.RefreshTokens.Where(t => t.TokenHash == hash && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, clock.GetUtcNow()), ct);
    }

    public async Task RequestPasswordResetAsync(string emailAddress, string resetUrlBase, CancellationToken ct = default)
    {
        // Always behaves the same for unknown emails so the response can't reveal which accounts exist.
        var user = await users.FindByEmailAsync(emailAddress.Trim());
        if (user is null)
        {
            logger.LogInformation("Password reset requested for an unknown email");
            return;
        }

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var link = QueryHelpers.AddQueryString(resetUrlBase, new Dictionary<string, string?>
        {
            ["email"] = user.Email,
            ["token"] = token,
        });
        await email.SendAsync(user.Email!, "Reset your Porter password",
            $"Hi {user.DisplayName},\n\nUse this link to choose a new password. It expires in 30 minutes:\n{link}\n\n" +
            "If you didn't ask for this, you can ignore this email.", ct);
        logger.LogInformation("Password reset email issued for user {UserId}", user.Id);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        var result = user is null
            ? IdentityResult.Failed(new IdentityError { Code = "InvalidToken" })
            : await users.ResetPasswordAsync(user, request.Token, request.Password);

        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == "InvalidToken"))
                throw RequestValidationException.For("token", "This reset link has expired or was already used.");
            throw new RequestValidationException(IdentityErrorMapper.ToFieldErrors(result.Errors));
        }

        // A password reset ends every existing session.
        await db.RefreshTokens.Where(t => t.UserId == user!.Id && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, clock.GetUtcNow()), ct);
        await users.SetLockoutEndDateAsync(user!, null);
        logger.LogInformation("Password reset completed for user {UserId}", user!.Id);
    }

    private async Task<AuthSession> IssueSessionAsync(AppUser user, bool persistent, CancellationToken ct, RefreshToken? replacing = null)
    {
        var now = clock.GetUtcNow();
        var raw = TokenService.NewRefreshToken();
        var refresh = new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = TokenService.Hash(raw),
            CreatedAt = now,
            ExpiresAt = now.AddDays(jwt.Value.RefreshTokenDays),
            Persistent = persistent,
        };

        if (replacing is not null)
        {
            replacing.RevokedAt = now;
            replacing.ReplacedByHash = refresh.TokenHash;
        }

        db.RefreshTokens.Add(refresh);
        await db.SaveChangesAsync(ct);

        var (access, expires) = tokens.CreateAccessToken(user);
        var account = new AccountDto(user.Id, user.Email!, user.DisplayName, user.MePlayerId);
        return new AuthSession(new AuthResponse(access, expires, account), raw, refresh.ExpiresAt, persistent);
    }
}

internal static class IdentityErrorMapper
{
    public static Dictionary<string, string[]> ToFieldErrors(IEnumerable<IdentityError> errors) =>
        errors
            .GroupBy(e => e.Code switch
            {
                var c when c.StartsWith("Password", StringComparison.Ordinal) => "password",
                var c when c.Contains("Email", StringComparison.Ordinal) || c.Contains("UserName", StringComparison.Ordinal) => "email",
                _ => string.Empty,
            })
            .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
}

/// <summary>Requires at least one letter (Identity's built-in options only cover digits/case/symbols).</summary>
public sealed class LetterPasswordValidator : IPasswordValidator<AppUser>
{
    public Task<IdentityResult> ValidateAsync(UserManager<AppUser> manager, AppUser user, string? password) =>
        Task.FromResult(password is not null && password.Any(char.IsLetter)
            ? IdentityResult.Success
            : IdentityResult.Failed(new IdentityError { Code = "PasswordRequiresLetter", Description = "Use at least one letter." }));
}
