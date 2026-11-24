using Microsoft.EntityFrameworkCore;
using Porter.Application.Abstractions;
using Porter.Application.Games;
using Porter.Application.Statistics;
using Porter.Domain.Games;

namespace Porter.Application.Dashboard;

/// <param name="Kind">deal_saved | deal_corrected | game_started | game_completed | game_created | player_added</param>
public sealed record ActivityDto(string Kind, DateTimeOffset At, Guid? GameId, string? GameName, int? DealNumber, string? PlayerName);

public sealed record DashboardDto(
    string DisplayName,
    IReadOnlyList<GameSummaryDto> ActiveGames,
    IReadOnlyList<GameSummaryDto> DraftGames,
    IReadOnlyList<GameSummaryDto> RecentGames,
    MyStatsDto My,
    int TotalGames,
    int PlayerCount,
    IReadOnlyList<ActivityDto> Activity);

public sealed class DashboardService(
    IPorterDbContext db,
    ICurrentUser user,
    IUserDirectory users,
    GameService games,
    StatisticsService stats)
{
    private const int RecentGames = 5;
    private const int ActivityItems = 8;

    public async Task<DashboardDto> GetAsync(CancellationToken ct = default)
    {
        var profile = await users.FindAsync(user.UserId, ct);
        var owned = db.Games.AsNoTracking().Where(g => g.OwnerUserId == user.UserId);

        var open = await GameService.WithGraph(owned.Where(g => g.Status != GameStatus.Completed))
            .OrderByDescending(g => g.UpdatedAt).ToListAsync(ct);
        var recent = await GameService.WithGraph(owned.Where(g => g.Status == GameStatus.Completed))
            .OrderByDescending(g => g.CompletedAt).Take(RecentGames).ToListAsync(ct);

        var players = await games.LoadPlayersAsync(open.Concat(recent), ct);
        GameSummaryDto Map(Game g) => GameMapper.ToSummary(g, players);

        return new DashboardDto(
            profile?.DisplayName ?? string.Empty,
            open.Where(g => g.Status == GameStatus.Active).Select(Map).ToList(),
            open.Where(g => g.Status == GameStatus.Draft).Select(Map).ToList(),
            recent.Select(Map).ToList(),
            await stats.GetMyStatsAsync(ct),
            await owned.CountAsync(ct),
            await db.Players.CountAsync(p => p.OwnerUserId == user.UserId, ct),
            await GetActivityAsync(ct));
    }

    /// <summary>Recent activity derived from stored timestamps; nothing is fabricated.</summary>
    private async Task<IReadOnlyList<ActivityDto>> GetActivityAsync(CancellationToken ct)
    {
        var uid = user.UserId;

        var deals = await (
                from d in db.Deals
                join g in db.Games on d.GameId equals g.Id
                where g.OwnerUserId == uid
                orderby d.UpdatedAt descending
                select new { g.Id, g.Name, d.Number, d.CreatedAt, d.UpdatedAt })
            .Take(ActivityItems).ToListAsync(ct);

        var gameEvents = await db.Games.AsNoTracking().Where(g => g.OwnerUserId == uid)
            .OrderByDescending(g => g.UpdatedAt).Take(ActivityItems)
            .Select(g => new { g.Id, g.Name, g.CreatedAt, g.StartedAt, g.CompletedAt })
            .ToListAsync(ct);

        var newPlayers = await db.Players.AsNoTracking().Where(p => p.OwnerUserId == uid)
            .OrderByDescending(p => p.CreatedAt).Take(ActivityItems)
            .Select(p => new { p.Name, p.CreatedAt })
            .ToListAsync(ct);

        var items = new List<ActivityDto>();
        items.AddRange(deals.Select(d => d.UpdatedAt > d.CreatedAt
            ? new ActivityDto("deal_corrected", d.UpdatedAt, d.Id, d.Name, d.Number, null)
            : new ActivityDto("deal_saved", d.CreatedAt, d.Id, d.Name, d.Number, null)));
        foreach (var g in gameEvents)
        {
            items.Add(new ActivityDto("game_created", g.CreatedAt, g.Id, g.Name, null, null));
            if (g.StartedAt is { } s && s != g.CreatedAt) items.Add(new ActivityDto("game_started", s, g.Id, g.Name, null, null));
            if (g.CompletedAt is { } c) items.Add(new ActivityDto("game_completed", c, g.Id, g.Name, null, null));
        }

        items.AddRange(newPlayers.Select(p => new ActivityDto("player_added", p.CreatedAt, null, null, null, p.Name)));

        return items.OrderByDescending(i => i.At).Take(ActivityItems).ToList();
    }
}
