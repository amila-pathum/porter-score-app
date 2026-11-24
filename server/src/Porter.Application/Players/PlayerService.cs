using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Porter.Application.Abstractions;
using Porter.Application.Common;
using Porter.Application.Statistics;
using Porter.Domain.Players;

namespace Porter.Application.Players;

public sealed record PlayerDto(Guid Id, string Name, string AvatarColor, DateTimeOffset CreatedAt,
    int GamesPlayed, int Wins, bool IsMe, bool CanDelete);

public sealed class CreatePlayerRequest
{
    public Guid? Id { get; init; }
    [Required, StringLength(40)] public string Name { get; init; } = string.Empty;
    public string? AvatarColor { get; init; }
}

public sealed class UpdatePlayerRequest
{
    [StringLength(40)] public string? Name { get; init; }
    public string? AvatarColor { get; init; }
}

public sealed class PlayerService(
    IPorterDbContext db,
    ICurrentUser user,
    IUserDirectory users,
    StatisticsService stats,
    TimeProvider clock,
    ILogger<PlayerService> logger)
{
    public async Task<IReadOnlyList<PlayerDto>> ListAsync(string? q, CancellationToken ct = default)
    {
        var query = db.Players.AsNoTracking().Where(p => p.OwnerUserId == user.UserId);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var pattern = $"%{q.Trim().ToLowerInvariant().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";
            query = query.Where(p => EF.Functions.Like(p.Name.ToLower(), pattern, "\\"));
        }

        var players = await query.ToListAsync(ct);
        var records = await stats.GetRecordsAsync(ct);
        var inGames = await PlayersInAnyGameAsync(players.Select(p => p.Id).ToList(), ct);
        var meId = (await users.FindAsync(user.UserId, ct))?.MePlayerId;

        return players
            .Select(p => ToDto(p, records, inGames, meId))
            .OrderByDescending(p => p.GamesPlayed).ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<PlayerDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var player = await FindOwnedAsync(id, tracking: false, ct);
        var records = await stats.GetRecordsAsync(ct);
        var inGames = await PlayersInAnyGameAsync([id], ct);
        var meId = (await users.FindAsync(user.UserId, ct))?.MePlayerId;
        return ToDto(player, records, inGames, meId);
    }

    /// <returns>The player and whether it was newly created (false = idempotent replay of the same id).</returns>
    public async Task<(PlayerDto Player, bool Created)> CreateAsync(CreatePlayerRequest request, CancellationToken ct = default)
    {
        if (request.Id is { } existingId &&
            await db.Players.AnyAsync(p => p.Id == existingId && p.OwnerUserId == user.UserId, ct))
            return (await GetAsync(existingId, ct), false);

        var player = Player.Create(request.Id ?? Guid.NewGuid(), user.UserId, request.Name, request.AvatarColor, clock.GetUtcNow());
        await EnsureUniqueNameAsync(player.NormalizedName, player.Name, exceptId: null, ct);

        db.Players.Add(player);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Player {PlayerId} created", player.Id);
        return (await GetAsync(player.Id, ct), true);
    }

    public async Task<PlayerDto> UpdateAsync(Guid id, UpdatePlayerRequest request, CancellationToken ct = default)
    {
        var player = await FindOwnedAsync(id, tracking: true, ct);
        if (request.Name is not null)
        {
            player.Rename(request.Name, clock.GetUtcNow());
            await EnsureUniqueNameAsync(player.NormalizedName, player.Name, exceptId: id, ct);
        }

        if (request.AvatarColor is not null) player.SetAvatarColor(request.AvatarColor);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    /// <summary>Deletes a player who has never been in a game. Players with history are kept so results stay intact.</summary>
    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var player = await FindOwnedAsync(id, tracking: true, ct);
        if ((await PlayersInAnyGameAsync([id], ct)).Contains(id))
            throw new ConflictException(ConflictCodes.PlayerHasGames,
                $"{player.Name} is part of saved games, so they can't be deleted. You can rename them instead.");

        var profile = await users.FindAsync(user.UserId, ct);
        if (profile?.MePlayerId == id) await users.SetMePlayerAsync(user.UserId, null, ct);

        db.Players.Remove(player);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Player {PlayerId} deleted", id);
    }

    private async Task<Player> FindOwnedAsync(Guid id, bool tracking, CancellationToken ct)
    {
        var query = db.Players.Where(p => p.Id == id && p.OwnerUserId == user.UserId);
        if (!tracking) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Player not found.");
    }

    private async Task EnsureUniqueNameAsync(string normalized, string name, Guid? exceptId, CancellationToken ct)
    {
        var taken = await db.Players.AnyAsync(p =>
            p.OwnerUserId == user.UserId && p.NormalizedName == normalized && (exceptId == null || p.Id != exceptId), ct);
        if (taken)
            throw new ConflictException(ConflictCodes.DuplicatePlayerName, $"You already have a player called {name}.");
    }

    /// <summary>Includes soft-deleted games: their rows still reference the player.</summary>
    private async Task<HashSet<Guid>> PlayersInAnyGameAsync(List<Guid> playerIds, CancellationToken ct) =>
        (await db.Games.IgnoreQueryFilters()
            .Where(g => g.OwnerUserId == user.UserId)
            .SelectMany(g => g.Players)
            .Where(gp => playerIds.Contains(gp.PlayerId))
            .Select(gp => gp.PlayerId)
            .Distinct()
            .ToListAsync(ct)).ToHashSet();

    private static PlayerDto ToDto(Player p, IReadOnlyDictionary<Guid, PlayerRecord> records, HashSet<Guid> inGames, Guid? meId)
    {
        var record = records.GetValueOrDefault(p.Id) ?? new PlayerRecord(0, 0);
        return new PlayerDto(p.Id, p.Name, p.AvatarColor, p.CreatedAt, record.GamesPlayed, record.Wins,
            meId == p.Id, !inGames.Contains(p.Id));
    }
}
