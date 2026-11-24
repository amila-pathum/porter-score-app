using Porter.Application.Statistics;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Application.Tests;

/// <summary>Pure computation tests: no database needed.</summary>
public sealed class StatisticsTests
{
    private static readonly Guid Owner = Guid.NewGuid();
    private static readonly DateTimeOffset T0 = new(2026, 11, 1, 18, 0, 0, TimeSpan.Zero);

    private static Player P(string name) => Player.Create(Guid.NewGuid(), Owner, name, null, T0);

    /// <summary>Builds a completed game where each player scores <paramref name="perDeal"/>[i] every deal.</summary>
    private static Game Completed(Player[] seats, int[] perDeal, int dayOffset)
    {
        var at = T0.AddDays(dayOffset);
        var game = Game.Create(Guid.NewGuid(), Owner, $"Game {dayOffset}", seats.Select(s => s.Id).ToList(), at);
        game.Start(at);
        for (var d = 1; d <= 13; d++)
            game.SaveDeal(d, seats.Select((s, i) => (s.Id, perDeal[i])).ToDictionary(x => x.Id, x => x.Item2), Owner, at.AddMinutes(d));
        return game;
    }

    [Fact]
    public void Counts_games_wins_averages_best_and_finishes()
    {
        Player kasun = P("Kasun"), amali = P("Amali"), nimal = P("Nimal");
        var players = new[] { kasun, amali, nimal }.ToDictionary(p => p.Id);
        var games = new[]
        {
            Completed([kasun, amali, nimal], [1, 2, 3], 1),   // Kasun 13 (1st)
            Completed([kasun, amali, nimal], [3, 1, 2], 2),   // Kasun 39 (3rd)
            Completed([kasun, amali], [2, 2, 0], 3),          // tie 26 (1st, shared)
        };

        var s = StatisticsService.Compute(kasun.Id, games, players);

        Assert.Equal(3, s.GamesPlayed);
        Assert.Equal(2, s.Wins);
        Assert.Equal(0.6667, s.WinRate);
        Assert.Equal(26.0, s.AverageFinalScore);
        Assert.Equal(13, s.BestFinalScore);
        Assert.Equal([2, 0, 1, 0], s.Finishes.Select(f => f.Count));
        Assert.Equal(39, s.DealsPlayed);
        Assert.Equal(0, s.ZeroScoreDeals);
        Assert.Equal("Game 3", s.RecentGames[0].GameName);          // newest first
        Assert.Equal("Game 1", s.Trend[0].GameName);                // oldest first for charts
        Assert.True(s.RecentGames[0].IsTied);
        Assert.Equal(("Amali", 3), (s.PlayedWith[0].Name, s.PlayedWith[0].Games));
    }

    [Fact]
    public void Player_without_completed_games_has_no_averages()
    {
        var solo = P("Solo");
        var s = StatisticsService.Compute(solo.Id, [], new Dictionary<Guid, Player> { [solo.Id] = solo });

        Assert.Equal(0, s.GamesPlayed);
        Assert.Null(s.WinRate);
        Assert.Null(s.AverageFinalScore);
        Assert.Null(s.BestFinalScore);
        Assert.Empty(s.RecentGames);
    }

    [Fact]
    public void Zero_score_deals_are_counted()
    {
        Player a = P("A"), b = P("B");
        var game = Completed([a, b], [0, 4], 1);
        var s = StatisticsService.Compute(a.Id, [game], new[] { a, b }.ToDictionary(p => p.Id));
        Assert.Equal(13, s.ZeroScoreDeals);
        Assert.Equal(1.0, s.WinRate);
    }
}
