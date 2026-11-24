using Microsoft.EntityFrameworkCore;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Application.Abstractions;

/// <summary>
/// Persistence boundary used by application services. Implemented by the EF Core DbContext in
/// Infrastructure; exposing DbSets keeps queries expressive without a repository per entity.
/// </summary>
public interface IPorterDbContext
{
    DbSet<Game> Games { get; }
    DbSet<Player> Players { get; }
    DbSet<Deal> Deals { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

/// <summary>The authenticated caller. Every query is scoped to <see cref="UserId"/>.</summary>
public interface ICurrentUser
{
    Guid UserId { get; }
}

public sealed record UserProfile(Guid Id, string Email, string DisplayName, Guid? MePlayerId);

/// <summary>Read/write access to account data owned by the identity store.</summary>
public interface IUserDirectory
{
    Task<UserProfile?> FindAsync(Guid userId, CancellationToken ct = default);
    Task SetMePlayerAsync(Guid userId, Guid? playerId, CancellationToken ct = default);
}
