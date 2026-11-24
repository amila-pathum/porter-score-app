using Microsoft.EntityFrameworkCore;
using Porter.Application.Abstractions;
using Porter.Application.Common;
using Porter.Application.Games;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Application.Statistics;

public sealed record FinishCountDto(int Position, int Count);

public sealed record PlayerGameResultDto(Guid GameId, string GameName, DateTimeOffset CompletedAt, int PlayerCount,
    int Rank, bool IsTied, int Total, bool Won);

public sealed record PlayedWithDto(Guid PlayerId, string Name, string AvatarColor, int Games);

/// <summary>
/// Statistics derived only from completed games. A win is finishing rank 1, including shared rank 1 (ties).
/// Average and best are null until the player has completed a game.
/// </summary>
public sealed record PlayerStatsDto(
    Guid PlayerId,
    int GamesPlayed,
    int Wins,
    double? WinRate,
    double? AverageFinalScore,
    int? BestFinalScore,
    int DealsPlayed,
    int ZeroScoreDeals,
    IReadOnlyList<FinishCountDto> Finishes,
    IReadOnlyList<PlayerGameResultDto> RecentGames,
    IReadOnlyList<PlayerGameResultDto> Trend,
    IReadOnlyList<PlayedWithDto> PlayedWith);

public sealed record MyStatsDto(PlayerRefDto? MePlayer, PlayerStatsDto? Stats);

public sealed record PlayerRecord(int GamesPlayed, int Wins);

public sealed class StatisticsService(IPorterDbContext db, ICurrentUser user, IUserDirectory users)
{
    private const int RecentCount = 10;

    public async Task<PlayerStatsDto> GetPlayerStatsAsync(Guid playerId, CancellationToken ct = default)
    {
        var owns = await db.Players.AnyAsync(p => p.Id == playerId && p.OwnerUserId == user.UserId, ct);
        if (!owns) throw new NotFoundException("Player not found.");

        var games = await LoadCompletedGamesAsync(ct);
        var players = await db.Players.AsNoTracking().Where(p => p.OwnerUserId == user.UserId).ToDictionaryAsync(p => p.Id, ct);
        return Compute(playerId, games, players);
    }

    public async Task<MyStatsDto> GetMyStatsAsync(CancellationToken ct = default)
    {
        var profile = await users.FindAsync(user.UserId, ct);
        if (profile?.MePlayerId is not { } meId) return new MyStatsDto(null, null);

        var me = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == meId && p.OwnerUserId == user.UserId, ct);
        if (me is null) return new MyStatsDto(null, null);

        return new MyStatsDto(new PlayerRefDto(me.Id, me.Name, me.AvatarColor), await GetPlayerStatsAsync(me.Id, ct));
    }

    /// <summary>Games played and wins for every owned player, for list views.</summary>
    public async Task<Dictionary<Guid, PlayerRecord>> GetRecordsAsync(CancellationToken ct = default)
    {
        var games = await LoadCompletedGamesAsync(ct);
        return games
            .SelectMany(g => g.Standings())
            .GroupBy(s => s.PlayerId)
            .ToDictionary(x => x.Key, x => new PlayerRecord(x.Count(), x.Count(s => s.Rank == 1)));
    }

    private async Task<List<Game>> LoadCompletedGamesAsync(CancellationToken ct) =>
        await GameService.WithGraph(db.Games.AsNoTracking()
                .Where(g => g.OwnerUserId == user.UserId && g.Status == GameStatus.Completed))
            .ToListAsync(ct);

    internal static PlayerStatsDto Compute(Guid playerId, IReadOnlyList<Game> completedGames, IReadOnlyDictionary<Guid, Player> players)
    {
        var mine = completedGames.Where(g => g.Players.Any(p => p.PlayerId == playerId)).ToList();

        var results = mine
            .Select(g =>
            {
                var s = g.Standings().Single(x => x.PlayerId == playerId);
                return new PlayerGameResultDto(g.Id, g.Name, g.CompletedAt!.Value, g.Players.Count, s.Rank, s.IsTied, s.Total, s.Rank == 1);
            })
            .OrderByDescending(r => r.CompletedAt)
            .ToList();

        var played = results.Count;
        var wins = results.Count(r => r.Won);

        var finishes = Enumerable.Range(1, Domain.Common.GameRules.MaxPlayers)
            .Select(pos => new FinishCountDto(pos, results.Count(r => r.Rank == pos)))
            .ToList();

        var playedWith = mine
            .SelectMany(g => g.Players.Where(p => p.PlayerId != playerId).Select(p => p.PlayerId))
            .GroupBy(id => id)
            .Where(x => players.ContainsKey(x.Key))
            .Select(x => new PlayedWithDto(x.Key, players[x.Key].Name, players[x.Key].AvatarColor, x.Count()))
            .OrderByDescending(x => x.Games).ThenBy(x => x.Name)
            .Take(5)
            .ToList();

        var deals = mine.SelectMany(g => g.Deals).ToList();

        return new PlayerStatsDto(
            playerId,
            played,
            wins,
            played == 0 ? null : Math.Round((double)wins / played, 4),
            played == 0 ? null : Math.Round(results.Average(r => r.Total), 1),
            played == 0 ? null : results.Min(r => r.Total),
            deals.Count,
            deals.Count(d => d.ScoreFor(playerId) == 0),
            finishes,
            results.Take(RecentCount).ToList(),
            results.Take(RecentCount).Reverse().ToList(),
            playedWith);
    }
}
