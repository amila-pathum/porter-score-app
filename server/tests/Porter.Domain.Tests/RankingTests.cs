using Porter.Domain.Common;
using Porter.Domain.Games;
using Porter.Domain.Players;

namespace Porter.Domain.Tests;

public class RankingTests
{
    private static IReadOnlyList<Standing> Rank(params int[] totals) =>
        Ranking.Rank(totals.Select(t => new PlayerTotal(Guid.NewGuid(), t)).ToList());

    [Theory]
    [InlineData(new[] { 20, 20, 25, 30 }, new[] { 1, 1, 3, 4 })]
    [InlineData(new[] { 10, 15, 15, 20 }, new[] { 1, 2, 2, 4 })]
    [InlineData(new[] { 10, 10, 15, 20 }, new[] { 1, 1, 3, 4 })]
    [InlineData(new[] { 30, 20, 25, 20 }, new[] { 1, 1, 3, 4 })]
    [InlineData(new[] { 7, 7, 7 }, new[] { 1, 1, 1 })]
    [InlineData(new[] { 101, 101 }, new[] { 1, 1 })]
    [InlineData(new[] { 93, 116, 99, 129 }, new[] { 1, 2, 3, 4 })]
    public void Uses_competition_ranking_lowest_first(int[] totals, int[] expectedRanksInOrder)
    {
        Assert.Equal(expectedRanksInOrder, Rank(totals).Select(s => s.Rank));
    }

    [Fact]
    public void Lowest_total_wins()
    {
        var standings = Rank(93, 116, 99, 129);
        Assert.Equal(93, standings[0].Total);
        Assert.Equal(1, standings[0].Rank);
    }

    [Fact]
    public void Ties_are_flagged_and_keep_input_order()
    {
        var a = new PlayerTotal(Guid.NewGuid(), 20);
        var b = new PlayerTotal(Guid.NewGuid(), 20);
        var c = new PlayerTotal(Guid.NewGuid(), 25);

        var standings = Ranking.Rank([c, a, b]);

        Assert.Equal([a.PlayerId, b.PlayerId, c.PlayerId], standings.Select(s => s.PlayerId));
        Assert.True(standings[0].IsTied);
        Assert.True(standings[1].IsTied);
        Assert.False(standings[2].IsTied);
    }

    [Fact]
    public void All_zero_before_any_deal_means_everyone_shares_rank_1()
    {
        Assert.All(Rank(0, 0, 0, 0), s => Assert.Equal(1, s.Rank));
    }
}

public class WildCardTests
{
    [Theory]
    [InlineData(1, "Ace")]
    [InlineData(2, "2")]
    [InlineData(5, "5")]
    [InlineData(10, "10")]
    [InlineData(11, "Jack")]
    [InlineData(12, "Queen")]
    [InlineData(13, "King")]
    public void Follows_confirmed_progression(int deal, string expected) =>
        Assert.Equal(expected, WildCard.ForDeal(deal));

    [Theory]
    [InlineData(0)]
    [InlineData(14)]
    public void Rejects_out_of_range(int deal) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => WildCard.ForDeal(deal));
}

public class PlayerTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UnixEpoch;

    [Fact]
    public void Trims_and_normalizes_name()
    {
        var p = Player.Create(Guid.NewGuid(), Guid.NewGuid(), "  Amali ", null, Now);
        Assert.Equal("Amali", p.Name);
        Assert.Equal("AMALI", p.NormalizedName);
        Assert.Contains(p.AvatarColor, Player.AvatarColors);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void Rejects_blank_names(string name) =>
        Assert.Equal(DomainErrors.PlayerNameInvalid,
            Assert.Throws<DomainException>(() => Player.Create(Guid.NewGuid(), Guid.NewGuid(), name, null, Now)).Code);

    [Fact]
    public void Rejects_names_over_40_characters() =>
        Assert.Throws<DomainException>(() => Player.Create(Guid.NewGuid(), Guid.NewGuid(), new string('a', 41), null, Now));

    [Fact]
    public void Unknown_avatar_color_falls_back_to_default()
    {
        var p = Player.Create(Guid.NewGuid(), Guid.NewGuid(), "Kasun", "neon", Now);
        Assert.Equal(Player.AvatarColors[0], p.AvatarColor);
    }
}
