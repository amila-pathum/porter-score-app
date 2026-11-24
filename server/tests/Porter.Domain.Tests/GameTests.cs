using Porter.Domain.Common;
using Porter.Domain.Games;

namespace Porter.Domain.Tests;

public class GameTests
{
    private static readonly DateTimeOffset T0 = new(2026, 11, 22, 20, 0, 0, TimeSpan.Zero);
    private static readonly Guid Owner = Guid.NewGuid();

    private static List<Guid> Players(int n) => Enumerable.Range(0, n).Select(_ => Guid.NewGuid()).ToList();

    private static Game ActiveGame(IReadOnlyList<Guid> players)
    {
        var game = Game.Create(Guid.NewGuid(), Owner, "Friday Night Porter", players, T0);
        game.Start(T0);
        return game;
    }

    private static Dictionary<Guid, int> Scores(IReadOnlyList<Guid> players, params int[] values) =>
        players.Select((p, i) => (p, values[i])).ToDictionary(x => x.p, x => x.Item2);

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void Create_accepts_two_to_four_players_in_seat_order(int count)
    {
        var ids = Players(count);
        var game = Game.Create(Guid.NewGuid(), Owner, "Game", ids, T0);

        Assert.Equal(GameStatus.Draft, game.Status);
        Assert.Equal(ids, game.Players.Select(p => p.PlayerId));
        Assert.Equal(Enumerable.Range(1, count), game.Players.Select(p => p.Seat));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(5)]
    public void Create_rejects_invalid_player_count(int count)
    {
        var ex = Assert.Throws<DomainException>(() => Game.Create(Guid.NewGuid(), Owner, "Game", Players(count), T0));
        Assert.Equal(DomainErrors.PlayerCount, ex.Code);
    }

    [Fact]
    public void Create_rejects_duplicate_players()
    {
        var p = Guid.NewGuid();
        var ex = Assert.Throws<DomainException>(() => Game.Create(Guid.NewGuid(), Owner, "Game", [p, p], T0));
        Assert.Equal(DomainErrors.DuplicatePlayer, ex.Code);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_name(string name)
    {
        var ex = Assert.Throws<DomainException>(() => Game.Create(Guid.NewGuid(), Owner, name, Players(2), T0));
        Assert.Equal(DomainErrors.GameNameInvalid, ex.Code);
    }

    [Fact]
    public void Create_rejects_name_longer_than_60()
    {
        Assert.Throws<DomainException>(() => Game.Create(Guid.NewGuid(), Owner, new string('x', 61), Players(2), T0));
    }

    [Fact]
    public void Start_moves_draft_to_active_and_cannot_start_twice()
    {
        var game = Game.Create(Guid.NewGuid(), Owner, "Game", Players(2), T0);
        game.Start(T0);

        Assert.Equal(GameStatus.Active, game.Status);
        Assert.Equal(1, game.NextDealNumber);
        Assert.Equal(DomainErrors.NotDraft, Assert.Throws<DomainException>(() => game.Start(T0)).Code);
    }

    [Fact]
    public void Players_can_be_changed_in_draft_but_not_after_start()
    {
        var ids = Players(3);
        var game = Game.Create(Guid.NewGuid(), Owner, "Game", ids, T0);
        var reordered = new List<Guid> { ids[2], ids[0] };

        game.SetPlayers(reordered, T0);
        Assert.Equal(reordered, game.Players.Select(p => p.PlayerId));

        game.Start(T0);
        Assert.Equal(DomainErrors.NotDraft,
            Assert.Throws<DomainException>(() => game.SetPlayers(ids, T0)).Code);
    }

    [Fact]
    public void Draft_game_rejects_scores()
    {
        var ids = Players(2);
        var game = Game.Create(Guid.NewGuid(), Owner, "Game", ids, T0);
        var ex = Assert.Throws<DomainException>(() => game.SaveDeal(1, Scores(ids, 0, 5), Owner, T0));
        Assert.Equal(DomainErrors.NotStarted, ex.Code);
    }

    [Fact]
    public void Deals_progress_sequentially()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);

        Assert.Equal(DealSaveKind.Created, game.SaveDeal(1, Scores(ids, 0, 7), Owner, T0));
        Assert.Equal(2, game.NextDealNumber);
        Assert.Equal(1, game.CompletedDealCount);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(13)]
    public void Skipping_ahead_is_rejected(int number)
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        game.SaveDeal(1, Scores(ids, 0, 7), Owner, T0);

        var ex = Assert.Throws<DomainException>(() => game.SaveDeal(number, Scores(ids, 0, 1), Owner, T0));
        Assert.Equal(DomainErrors.DealOutOfSequence, ex.Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(14)]
    public void Invalid_deal_numbers_are_rejected(int number)
    {
        var ids = Players(2);
        var ex = Assert.Throws<DomainException>(() => ActiveGame(ids).SaveDeal(number, Scores(ids, 0, 1), Owner, T0));
        Assert.Equal(DomainErrors.DealNumberInvalid, ex.Code);
    }

    [Fact]
    public void Negative_score_is_rejected_and_names_the_field()
    {
        var ids = Players(3);
        var ex = Assert.Throws<DomainException>(() => ActiveGame(ids).SaveDeal(1, Scores(ids, 0, -4, 3), Owner, T0));
        Assert.Equal(DomainErrors.ScoreNegative, ex.Code);
        Assert.Equal("scores[1].score", ex.Field);
    }

    [Fact]
    public void Missing_score_is_rejected()
    {
        var ids = Players(3);
        var scores = Scores(ids, 0, 4, 3);
        scores.Remove(ids[2]);

        var ex = Assert.Throws<DomainException>(() => ActiveGame(ids).SaveDeal(1, scores, Owner, T0));
        Assert.Equal(DomainErrors.ScoreMissing, ex.Code);
        Assert.Equal("scores[2].score", ex.Field);
    }

    [Fact]
    public void Score_for_non_participant_is_rejected()
    {
        var ids = Players(2);
        var scores = Scores(ids, 0, 4);
        scores[Guid.NewGuid()] = 1;

        Assert.Equal(DomainErrors.UnknownPlayer,
            Assert.Throws<DomainException>(() => ActiveGame(ids).SaveDeal(1, scores, Owner, T0)).Code);
    }

    [Fact]
    public void Large_scores_are_valid_there_is_no_upper_limit()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        game.SaveDeal(1, Scores(ids, 0, 5000), Owner, T0);
        Assert.Equal(5000, game.Totals()[1].Total);
    }

    [Fact]
    public void Totals_accumulate_across_deals_in_seat_order()
    {
        // Friday Night Porter sample data
        var ids = Players(4); // Kasun, Nimal, Amali, Tharindu
        var game = ActiveGame(ids);
        game.SaveDeal(1, Scores(ids, 0, 12, 5, 18), Owner, T0);
        game.SaveDeal(2, Scores(ids, 18, 0, 7, 25), Owner, T0);
        game.SaveDeal(3, Scores(ids, 5, 9, 0, 12), Owner, T0);
        game.SaveDeal(4, Scores(ids, 12, 33, 14, 0), Owner, T0);

        Assert.Equal([35, 54, 26, 55], game.Totals().Select(t => t.Total));
        var standings = game.Standings();
        Assert.Equal([ids[2], ids[0], ids[1], ids[3]], standings.Select(s => s.PlayerId));
        Assert.Equal([1, 2, 3, 4], standings.Select(s => s.Rank));
        Assert.Equal(5, game.NextDealNumber);
    }

    [Fact]
    public void Game_is_not_completed_before_deal_13()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        for (var n = 1; n <= 12; n++) game.SaveDeal(n, Scores(ids, 0, n), Owner, T0);

        Assert.Equal(GameStatus.Active, game.Status);
        Assert.Null(game.CompletedAt);
        Assert.Equal(13, game.NextDealNumber);
    }

    [Fact]
    public void Deal_13_completes_the_game_and_no_further_deals_are_accepted()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        var done = T0.AddHours(2);
        for (var n = 1; n <= 13; n++) game.SaveDeal(n, Scores(ids, 0, 1), Owner, n == 13 ? done : T0);

        Assert.Equal(GameStatus.Completed, game.Status);
        Assert.Equal(done, game.CompletedAt);
        Assert.Null(game.NextDealNumber);
        Assert.Equal(DomainErrors.DealNumberInvalid,
            Assert.Throws<DomainException>(() => game.SaveDeal(14, Scores(ids, 0, 1), Owner, T0)).Code);
    }

    [Fact]
    public void Correcting_a_deal_updates_scores_recalculates_and_does_not_duplicate()
    {
        var ids = Players(4);
        var game = ActiveGame(ids);
        game.SaveDeal(1, Scores(ids, 0, 12, 5, 18), Owner, T0);
        game.SaveDeal(2, Scores(ids, 18, 0, 7, 25), Owner, T0);
        game.SaveDeal(3, Scores(ids, 5, 9, 0, 12), Owner, T0);
        game.SaveDeal(4, Scores(ids, 12, 33, 14, 0), Owner, T0);

        var later = T0.AddMinutes(30);
        var kind = game.SaveDeal(3, Scores(ids, 5, 19, 0, 12), Owner, later);

        Assert.Equal(DealSaveKind.Corrected, kind);
        Assert.Equal(4, game.CompletedDealCount);
        Assert.Equal(64, game.Totals()[1].Total);
        var standings = game.Standings();
        Assert.Equal(4, standings.Single(s => s.PlayerId == ids[1]).Rank); // Nimal 3rd → 4th
        Assert.Equal(3, standings.Single(s => s.PlayerId == ids[3]).Rank); // Tharindu 4th → 3rd
        Assert.True(game.Deals[2].IsEdited);
        Assert.Equal(5, game.NextDealNumber);
    }

    [Fact]
    public void Correcting_with_identical_scores_is_unchanged()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        game.SaveDeal(1, Scores(ids, 0, 7), Owner, T0);

        Assert.Equal(DealSaveKind.Unchanged, game.SaveDeal(1, Scores(ids, 0, 7), Owner, T0.AddMinutes(1)));
        Assert.False(game.Deals[0].IsEdited);
    }

    [Fact]
    public void Completed_games_can_still_be_corrected()
    {
        var ids = Players(2);
        var game = ActiveGame(ids);
        for (var n = 1; n <= 13; n++) game.SaveDeal(n, Scores(ids, 0, 1), Owner, T0);

        Assert.Equal(DealSaveKind.Corrected, game.SaveDeal(5, Scores(ids, 3, 0), Owner, T0.AddMinutes(5)));
        Assert.Equal(GameStatus.Completed, game.Status);
        Assert.Equal([3, 12], game.Totals().Select(t => t.Total));
    }
}
