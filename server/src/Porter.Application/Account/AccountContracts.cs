using System.ComponentModel.DataAnnotations;

namespace Porter.Application.Account;

public sealed class RegisterRequest
{
    [Required, StringLength(60, MinimumLength = 1)] public string DisplayName { get; init; } = string.Empty;
    [Required, EmailAddress, StringLength(256)] public string Email { get; init; } = string.Empty;
    [Required, StringLength(128, MinimumLength = 8)] public string Password { get; init; } = string.Empty;
}

public sealed class LoginRequest
{
    [Required, EmailAddress] public string Email { get; init; } = string.Empty;
    [Required] public string Password { get; init; } = string.Empty;
    /// <summary>When false the refresh cookie is a session cookie.</summary>
    public bool RememberMe { get; init; } = true;
}

public sealed class ForgotPasswordRequest
{
    [Required, EmailAddress] public string Email { get; init; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [Required, EmailAddress] public string Email { get; init; } = string.Empty;
    [Required] public string Token { get; init; } = string.Empty;
    [Required, StringLength(128, MinimumLength = 8)] public string Password { get; init; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    [Required] public string CurrentPassword { get; init; } = string.Empty;
    [Required, StringLength(128, MinimumLength = 8)] public string NewPassword { get; init; } = string.Empty;
}

public sealed class UpdateAccountRequest
{
    [StringLength(60, MinimumLength = 1)] public string? DisplayName { get; init; }
    /// <summary>Links the "This is me" player used for personal statistics.</summary>
    public Guid? MePlayerId { get; init; }
    /// <summary>Set true to unlink the "This is me" player.</summary>
    public bool ClearMePlayer { get; init; }
}

public sealed class DeleteAccountRequest
{
    [Required] public string Password { get; init; } = string.Empty;
}

public sealed record AccountDto(Guid Id, string Email, string DisplayName, Guid? MePlayerId);

/// <summary>Returned on login/refresh. The refresh token travels only in an HttpOnly cookie, never in the body.</summary>
public sealed record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, AccountDto User);

/// <summary>Internal result of an auth operation: response body plus a refresh token for the API to set as a cookie.</summary>
public sealed record AuthSession(AuthResponse Response, string RefreshToken, DateTimeOffset RefreshExpiresAt, bool Persistent);

public interface IAuthService
{
    Task<AuthSession> RegisterAsync(RegisterRequest request, CancellationToken ct = default);
    Task<AuthSession?> LoginAsync(LoginRequest request, CancellationToken ct = default);
    Task<AuthSession?> RefreshAsync(string refreshToken, CancellationToken ct = default);
    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);
    Task RequestPasswordResetAsync(string email, string resetUrlBase, CancellationToken ct = default);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
}

public interface IAccountService
{
    Task<AccountDto> GetAsync(CancellationToken ct = default);
    Task<AccountDto> UpdateAsync(UpdateAccountRequest request, CancellationToken ct = default);
    Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct = default);
    Task DeleteAsync(DeleteAccountRequest request, CancellationToken ct = default);
}
