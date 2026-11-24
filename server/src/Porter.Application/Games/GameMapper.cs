using Porter.Domain.Common;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Application.Games;

internal static class GameMapper
{
    public static string StatusName(GameStatus status) => status.ToString().ToLowerInvariant();

    public static string VersionString(Game game) => game.Version.ToString(System.Globalization.CultureInfo.InvariantCulture);

    public static GameStateDto ToState(Game game, IReadOnlyDictionary<Guid, Player> players)
    {
        var standings = game.Standings();
        var standingById = standings.ToDictionary(s => s.PlayerId);
        var leaderTotal = standings.Count > 0 ? standings[0].Total : 0;

        var seatPlayers = game.Players.Select(gp =>
        {
            var p = players[gp.PlayerId];
            var s = standingById[gp.PlayerId];
            return new GamePlayerStateDto(p.Id, p.Name, p.AvatarColor, gp.Seat, s.Total, s.Rank, s.IsTied);
        }).ToList();

        var standingDtos = standings.Select(s =>
        {
            var p = players[s.PlayerId];
            return new StandingDto(p.Id, p.Name, p.AvatarColor, s.Total, s.Rank, s.IsTied, s.Total - leaderTotal);
        }).ToList();

        var seatOrder = game.Players.Select(gp => gp.PlayerId).ToList();
        var deals = game.Deals.Select(d => new DealDto(
            d.Number,
            WildCard.ForDeal(d.Number),
            seatOrder.Select(id => new DealScoreDto(id, d.ScoreFor(id))).ToList(),
            d.Scores.Sum(s => s.Score),
            d.CreatedAt,
            d.UpdatedAt,
            d.IsEdited)).ToList();

        var winners = game.Status == GameStatus.Completed
            ? standings.Where(s => s.Rank == 1).Select(s => s.PlayerId).ToList()
            : [];

        return new GameStateDto(
            game.Id,
            game.Name,
            StatusName(game.Status),
            VersionString(game),
            game.CreatedAt,
            game.UpdatedAt,
            game.StartedAt,
            game.CompletedAt,
            GameRules.DealsPerGame,
            game.CompletedDealCount,
            game.NextDealNumber,
            game.NextDealNumber is { } n ? WildCard.ForDeal(n) : null,
            seatPlayers,
            standingDtos,
            deals,
            winners);
    }

    public static GameSummaryDto ToSummary(Game game, IReadOnlyDictionary<Guid, Player> players)
    {
        var refs = game.Players
            .Select(gp => players[gp.PlayerId])
            .Select(p => new PlayerRefDto(p.Id, p.Name, p.AvatarColor))
            .ToList();

        GameLeaderDto? leader = null;
        if (game.CompletedDealCount > 0)
        {
            var leaders = game.Standings().Where(s => s.Rank == 1).ToList();
            leader = new GameLeaderDto(leaders.Select(s => players[s.PlayerId].Name).ToList(), leaders[0].Total);
        }

        return new GameSummaryDto(game.Id, game.Name, StatusName(game.Status), game.CreatedAt, game.UpdatedAt,
            game.CompletedAt, game.CompletedDealCount, game.NextDealNumber, refs, leader);
    }
}
