using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Porter.Application.Abstractions;
using Porter.Application.Common;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Application.Games;

public sealed class GameService(
    IPorterDbContext db,
    ICurrentUser user,
    TimeProvider clock,
    ILogger<GameService> logger)
{
    public async Task<GameListResult> ListAsync(GameListQuery query, CancellationToken ct = default)
    {
        var owned = db.Games.AsNoTracking().Where(g => g.OwnerUserId == user.UserId);

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var pattern = $"%{EscapeLike(query.Q.Trim().ToLowerInvariant())}%";
            owned = owned.Where(g =>
                EF.Functions.Like(g.Name.ToLower(), pattern, "\\") ||
                g.Players.Any(gp => db.Players.Any(p => p.Id == gp.PlayerId && EF.Functions.Like(p.Name.ToLower(), pattern, "\\"))));
        }

        var countsRaw = await owned.GroupBy(g => g.Status).Select(x => new { x.Key, Count = x.Count() }).ToListAsync(ct);
        int CountOf(GameStatus s) => countsRaw.FirstOrDefault(c => c.Key == s)?.Count ?? 0;
        var counts = new GameStatusCounts(countsRaw.Sum(c => c.Count), CountOf(GameStatus.Draft),
            CountOf(GameStatus.Active), CountOf(GameStatus.Completed));

        var filtered = ParseStatus(query.Status) is { } status ? owned.Where(g => g.Status == status) : owned;
        var total = await filtered.CountAsync(ct);

        filtered = (query.Sort ?? "activity").ToLowerInvariant() switch
        {
            "newest" => filtered.OrderByDescending(g => g.CreatedAt),
            "oldest" => filtered.OrderBy(g => g.CreatedAt),
            "name" => filtered.OrderBy(g => g.Name),
            _ => filtered.OrderByDescending(g => g.UpdatedAt),
        };

        var page = await WithGraph(filtered)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        var players = await LoadPlayersAsync(page, ct);
        return new GameListResult(page.Select(g => GameMapper.ToSummary(g, players)).ToList(),
            query.Page, query.PageSize, total, counts);
    }

    public async Task<GameStateDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var game = await LoadOwnedAsync(id, tracking: false, ct);
        return await ToStateAsync(game, ct);
    }

    /// <returns>The game state and whether a new game was created (false = idempotent replay).</returns>
    public async Task<(GameStateDto Game, bool Created)> CreateAsync(CreateGameRequest request, CancellationToken ct = default)
    {
        var id = request.Id ?? Guid.NewGuid();

        var existing = await db.Games.IgnoreQueryFilters().AsNoTracking()
            .Where(g => g.Id == id).Select(g => new { g.OwnerUserId }).FirstOrDefaultAsync(ct);
        if (existing is not null)
        {
            if (existing.OwnerUserId != user.UserId)
                throw new ConflictException(ConflictCodes.GameIdTaken, "That game id is already in use.");
            logger.LogInformation("Idempotent replay of game creation {GameId}", id);
            return (await GetAsync(id, ct), false);
        }

        await EnsurePlayersOwnedAsync(request.PlayerIds, ct);

        var now = clock.GetUtcNow();
        var name = string.IsNullOrWhiteSpace(request.Name) ? DefaultName(now) : request.Name;
        var game = Game.Create(id, user.UserId, name, request.PlayerIds, now);
        if (request.Start) game.Start(now);

        db.Games.Add(game);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Game {GameId} created with {PlayerCount} players (started: {Started})",
            id, request.PlayerIds.Count, request.Start);

        return (await ToStateAsync(game, ct), true);
    }

    public async Task<GameStateDto> UpdateAsync(Guid id, UpdateGameRequest request, CancellationToken ct = default)
    {
        var game = await LoadOwnedAsync(id, tracking: true, ct);
        EnsureVersion(game, request.ExpectedVersion);
        var now = clock.GetUtcNow();

        if (request.Name is not null) game.Rename(request.Name, now);
        if (request.PlayerIds is not null)
        {
            await EnsurePlayersOwnedAsync(request.PlayerIds, ct);
            game.SetPlayers(request.PlayerIds, now);
        }

        await SaveAsync(ct);
        return await ToStateAsync(game, ct);
    }

    public async Task<GameStateDto> StartAsync(Guid id, CancellationToken ct = default)
    {
        var game = await LoadOwnedAsync(id, tracking: true, ct);
        game.Start(clock.GetUtcNow());
        await SaveAsync(ct);
        logger.LogInformation("Game {GameId} started", id);
        return await ToStateAsync(game, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var game = await LoadOwnedAsync(id, tracking: true, ct);
        game.MarkDeleted(clock.GetUtcNow());
        await SaveAsync(ct);
        logger.LogInformation("Game {GameId} deleted", id);
    }

    /// <summary>
    /// Creates the next deal or corrects an existing one in a single transaction (one SaveChanges).
    /// Totals and standings are recalculated from the stored deals and returned.
    /// </summary>
    public async Task<SaveDealResult> SaveDealAsync(Guid id, int dealNumber, SaveDealRequest request, CancellationToken ct = default)
    {
        var scores = ToScoreMap(request);
        var game = await LoadOwnedAsync(id, tracking: true, ct);

        // An identical replay (e.g. a retry after a lost response) is a no-op success, even if the version moved on.
        var existing = game.Deals.FirstOrDefault(d => d.Number == dealNumber);
        var isReplay = existing is not null && existing.Scores.Count == scores.Count &&
                       existing.Scores.All(s => scores.TryGetValue(s.PlayerId, out var v) && v == s.Score);
        if (!isReplay) EnsureVersion(game, request.ExpectedVersion);

        var kind = game.SaveDeal(dealNumber, scores, user.UserId, clock.GetUtcNow());
        if (kind != DealSaveKind.Unchanged) await SaveAsync(ct);

        logger.LogInformation("Deal {DealNumber} of game {GameId}: {Outcome}; status now {Status}",
            dealNumber, id, kind, game.Status);
        return new SaveDealResult(await ToStateAsync(game, ct), kind.ToString().ToLowerInvariant());
    }

    // ── helpers ────────────────────────────────────────────────────────────

    internal static IQueryable<Game> WithGraph(IQueryable<Game> games) =>
        games.Include(g => g.Players).Include(g => g.Deals).ThenInclude(d => d.Scores).AsSplitQuery();

    private async Task<Game> LoadOwnedAsync(Guid id, bool tracking, CancellationToken ct)
    {
        var query = WithGraph(db.Games.Where(g => g.Id == id && g.OwnerUserId == user.UserId));
        if (!tracking) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(ct) ?? throw new NotFoundException("Game not found.");
    }

    private async Task<GameStateDto> ToStateAsync(Game game, CancellationToken ct) =>
        GameMapper.ToState(game, await LoadPlayersAsync([game], ct));

    internal async Task<Dictionary<Guid, Player>> LoadPlayersAsync(IEnumerable<Game> games, CancellationToken ct)
    {
        var ids = games.SelectMany(g => g.Players.Select(p => p.PlayerId)).Distinct().ToList();
        return await db.Players.AsNoTracking().Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
    }

    private async Task EnsurePlayersOwnedAsync(IReadOnlyCollection<Guid> playerIds, CancellationToken ct)
    {
        var distinct = playerIds.Distinct().ToList();
        var owned = await db.Players.CountAsync(p => distinct.Contains(p.Id) && p.OwnerUserId == user.UserId, ct);
        if (owned != distinct.Count)
            throw RequestValidationException.For("playerIds", "One or more players were not found.");
    }

    private static void EnsureVersion(Game game, string? expectedVersion)
    {
        if (expectedVersion is null) return;
        if (expectedVersion != GameMapper.VersionString(game))
            throw new ConflictException(ConflictCodes.VersionConflict,
                "This game was changed on another device. Reload to see the latest scores.");
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException(ConflictCodes.VersionConflict,
                "This game was changed on another device. Reload to see the latest scores.");
        }
        catch (DbUpdateException ex) when (ex.InnerException?.GetType().Name == "PostgresException"
                                           && ex.InnerException.Message.StartsWith("23505", StringComparison.Ordinal))
        {
            // Unique violation, e.g. two devices creating the same deal at once.
            throw new ConflictException(ConflictCodes.VersionConflict,
                "This deal was saved on another device. Reload to see the latest scores.");
        }
    }

    private static Dictionary<Guid, int> ToScoreMap(SaveDealRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        for (var i = 0; i < request.Scores.Count; i++)
        {
            if (request.Scores[i].Score is null) errors[$"scores[{i}].score"] = ["Enter a score."];
        }

        if (request.Scores.Select(s => s.PlayerId).Distinct().Count() != request.Scores.Count)
            errors["scores"] = ["Each player can only have one score per deal."];
        if (errors.Count > 0) throw new RequestValidationException(errors);

        return request.Scores.ToDictionary(s => s.PlayerId, s => s.Score!.Value);
    }

    private static GameStatus? ParseStatus(string? status) => status?.ToLowerInvariant() switch
    {
        "draft" => GameStatus.Draft,
        "active" => GameStatus.Active,
        "completed" => GameStatus.Completed,
        _ => null,
    };

    private static string DefaultName(DateTimeOffset now) =>
        $"Porter · {now.ToString("d MMM", CultureInfo.InvariantCulture)}";

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
