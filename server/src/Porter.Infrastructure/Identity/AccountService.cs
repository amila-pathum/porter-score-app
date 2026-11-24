using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Porter.Application.Abstractions;
using Porter.Application.Account;
using Porter.Application.Common;
using Porter.Infrastructure.Persistence;

namespace Porter.Infrastructure.Identity;

public sealed class AccountService(
    UserManager<AppUser> users,
    PorterDbContext db,
    ICurrentUser current,
    TimeProvider clock,
    ILogger<AccountService> logger) : IAccountService
{
    public async Task<AccountDto> GetAsync(CancellationToken ct = default) => ToDto(await LoadAsync());

    public async Task<AccountDto> UpdateAsync(UpdateAccountRequest request, CancellationToken ct = default)
    {
        var user = await LoadAsync();
        if (request.DisplayName is not null) user.DisplayName = request.DisplayName.Trim();

        if (request.ClearMePlayer)
        {
            user.MePlayerId = null;
        }
        else if (request.MePlayerId is { } playerId)
        {
            var owns = await db.Players.AnyAsync(p => p.Id == playerId && p.OwnerUserId == user.Id, ct);
            if (!owns) throw RequestValidationException.For("mePlayerId", "Player not found.");
            user.MePlayerId = playerId;
        }

        await users.UpdateAsync(user);
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken ct = default)
    {
        var user = await LoadAsync();
        var result = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code == "PasswordMismatch"))
                throw RequestValidationException.For("currentPassword", "Your current password is incorrect.");
            var errors = IdentityErrorMapper.ToFieldErrors(result.Errors);
            if (errors.Remove("password", out var pw)) errors["newPassword"] = pw;
            throw new RequestValidationException(errors);
        }

        logger.LogInformation("User {UserId} changed password", user.Id);
    }

    /// <summary>Deletes the account and everything it owns, after re-checking the password.</summary>
    public async Task DeleteAsync(DeleteAccountRequest request, CancellationToken ct = default)
    {
        var user = await LoadAsync();
        if (!await users.CheckPasswordAsync(user, request.Password))
            throw RequestValidationException.For("password", "Your password is incorrect.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        user.MePlayerId = null;
        await users.UpdateAsync(user);
        await db.Games.IgnoreQueryFilters().Where(g => g.OwnerUserId == user.Id).ExecuteDeleteAsync(ct);
        await db.Players.Where(p => p.OwnerUserId == user.Id).ExecuteDeleteAsync(ct);
        await db.RefreshTokens.Where(t => t.UserId == user.Id).ExecuteDeleteAsync(ct);
        await users.DeleteAsync(user);
        await tx.CommitAsync(ct);
        logger.LogInformation("User {UserId} deleted their account at {At}", user.Id, clock.GetUtcNow());
    }

    private async Task<AppUser> LoadAsync() =>
        await users.FindByIdAsync(current.UserId.ToString()) ?? throw new NotFoundException("Account not found.");

    private static AccountDto ToDto(AppUser u) => new(u.Id, u.Email!, u.DisplayName, u.MePlayerId);
}

public sealed class UserDirectory(PorterDbContext db) : IUserDirectory
{
    public async Task<UserProfile?> FindAsync(Guid userId, CancellationToken ct = default) =>
        await db.Users.AsNoTracking().Where(u => u.Id == userId)
            .Select(u => new UserProfile(u.Id, u.Email!, u.DisplayName, u.MePlayerId))
            .FirstOrDefaultAsync(ct);

    public async Task SetMePlayerAsync(Guid userId, Guid? playerId, CancellationToken ct = default) =>
        await db.Users.Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.MePlayerId, playerId), ct);
}
