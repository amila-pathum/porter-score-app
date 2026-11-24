using Porter.Application.Common;
using Porter.Application.Games;
using Porter.Application.Players;
using Porter.Domain.Common;

namespace Porter.Application.Tests;

[Collection(DbCollection.Name)]
public sealed class GameServiceTests(DatabaseFixture fixture)
{
    private async Task<(Guid User, List<Guid> Players)> SetupAsync(int playerCount = 2)
    {
        var user = await fixture.NewUserAsync();
        await using var s = new Services(fixture.NewContext(), user);
        var ids = new List<Guid>();
        for (var i = 0; i < playerCount; i++)
            ids.Add((await s.Players.CreateAsync(new CreatePlayerRequest { Name = $"P{i}" })).Player.Id);
        return (user, ids);
    }

    private static SaveDealRequest Deal(IReadOnlyList<Guid> players, string? version, params int[] scores) => new()
    {
        Scores = players.Select((p, i) => new SaveDealScoreRequest { PlayerId = p, Score = scores[i] }).ToList(),
        ExpectedVersion = version,
    };

    [Fact]
    public async Task Create_start_save_and_correct_flow()
    {
        var (user, players) = await SetupAsync(3);
        await using var s = new Services(fixture.NewContext(), user);

        var (game, created) = await s.Games.CreateAsync(new CreateGameRequest { Name = "G", PlayerIds = players });
        Assert.True(created);
        Assert.Equal("draft", game.Status);

        game = await s.Games.StartAsync(game.Id);
        var saved = await s.Games.SaveDealAsync(game.Id, 1, Deal(players, game.Version, 0, 4, 9));
        Assert.Equal("created", saved.Outcome);

        var corrected = await s.Games.SaveDealAsync(game.Id, 1, Deal(players, saved.Game.Version, 2, 0, 9));
        Assert.Equal("corrected", corrected.Outcome);
        Assert.Equal([2, 0, 9], corrected.Game.Players.Select(p => p.Total));
        Assert.Single(corrected.Game.Deals);
    }

    [Fact]
    public async Task Concurrent_saves_from_two_devices_conflict_instead_of_overwriting()
    {
        var (user, players) = await SetupAsync();
        Guid gameId;
        await using (var setup = new Services(fixture.NewContext(), user))
            gameId = (await setup.Games.CreateAsync(new CreateGameRequest { Name = "Race", PlayerIds = players, Start = true })).Game.Id;

        // Both devices loaded the game before either saved (same expected version) and save different scores.
        await using var phone = new Services(fixture.NewContext(), user);
        await using var tablet = new Services(fixture.NewContext(), user);
        var version = (await phone.Games.GetAsync(gameId)).Version;

        await phone.Games.SaveDealAsync(gameId, 1, Deal(players, version, 0, 5));
        var ex = await Assert.ThrowsAsync<ConflictException>(() => tablet.Games.SaveDealAsync(gameId, 1, Deal(players, version, 3, 0)));
        Assert.Equal(ConflictCodes.VersionConflict, ex.Code);

        await using var check = new Services(fixture.NewContext(), user);
        var state = await check.Games.GetAsync(gameId);
        Assert.Equal([0, 5], state.Players.Select(p => p.Total));
    }

    [Fact]
    public async Task Concurrent_writes_without_expected_version_are_caught_by_xmin()
    {
        var (user, players) = await SetupAsync();
        Guid gameId;
        await using (var setup = new Services(fixture.NewContext(), user))
            gameId = (await setup.Games.CreateAsync(new CreateGameRequest { Name = "Race", PlayerIds = players, Start = true })).Game.Id;

        // Simulate the race at the database level: both contexts track the same original row version.
        await using var a = fixture.NewContext();
        await using var b = fixture.NewContext();
        var gameA = await GameService.WithGraph(a.Games.Where(g => g.Id == gameId)).SingleAsyncSafe();
        var gameB = await GameService.WithGraph(b.Games.Where(g => g.Id == gameId)).SingleAsyncSafe();

        gameA.Rename("From A", DateTimeOffset.UtcNow);
        await a.SaveChangesAsync();
        gameB.Rename("From B", DateTimeOffset.UtcNow);

        await Assert.ThrowsAsync<Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException>(() => b.SaveChangesAsync());
    }

    [Fact]
    public async Task Services_only_see_the_callers_games()
    {
        var (owner, players) = await SetupAsync();
        var intruder = await fixture.NewUserAsync();
        Guid gameId;
        await using (var s = new Services(fixture.NewContext(), owner))
            gameId = (await s.Games.CreateAsync(new CreateGameRequest { Name = "Mine", PlayerIds = players })).Game.Id;

        await using var other = new Services(fixture.NewContext(), intruder);
        await Assert.ThrowsAsync<NotFoundException>(() => other.Games.GetAsync(gameId));
        await Assert.ThrowsAsync<NotFoundException>(() => other.Games.DeleteAsync(gameId));
        Assert.Equal(0, (await other.Games.ListAsync(new GameListQuery())).TotalCount);
    }

    [Fact]
    public async Task Sequential_rule_is_enforced_through_the_service()
    {
        var (user, players) = await SetupAsync();
        await using var s = new Services(fixture.NewContext(), user);
        var game = (await s.Games.CreateAsync(new CreateGameRequest { Name = "Seq", PlayerIds = players, Start = true })).Game;

        var ex = await Assert.ThrowsAsync<DomainException>(() => s.Games.SaveDealAsync(game.Id, 2, Deal(players, null, 0, 1)));
        Assert.Equal(DomainErrors.DealOutOfSequence, ex.Code);
    }

    [Fact]
    public async Task Duplicate_score_entries_for_one_player_are_rejected()
    {
        var (user, players) = await SetupAsync();
        await using var s = new Services(fixture.NewContext(), user);
        var game = (await s.Games.CreateAsync(new CreateGameRequest { Name = "Dup", PlayerIds = players, Start = true })).Game;

        var request = new SaveDealRequest
        {
            Scores = [new() { PlayerId = players[0], Score = 1 }, new() { PlayerId = players[0], Score = 2 }],
        };
        await Assert.ThrowsAsync<RequestValidationException>(() => s.Games.SaveDealAsync(game.Id, 1, request));
    }

    [Fact]
    public async Task Delete_is_soft_and_hides_the_game()
    {
        var (user, players) = await SetupAsync();
        await using var s = new Services(fixture.NewContext(), user);
        var game = (await s.Games.CreateAsync(new CreateGameRequest { Name = "Bye", PlayerIds = players, Start = true })).Game;

        await s.Games.DeleteAsync(game.Id);

        await using var check = new Services(fixture.NewContext(), user);
        await Assert.ThrowsAsync<NotFoundException>(() => check.Games.GetAsync(game.Id));
        // Players in a deleted game still can't be hard-deleted: their rows are referenced.
        await Assert.ThrowsAsync<ConflictException>(() => check.Players.DeleteAsync(players[0]));
    }

    [Fact]
    public async Task Player_rename_collision_is_a_conflict()
    {
        var (user, players) = await SetupAsync();
        await using var s = new Services(fixture.NewContext(), user);
        var ex = await Assert.ThrowsAsync<ConflictException>(() => s.Players.UpdateAsync(players[1], new UpdatePlayerRequest { Name = "p0" }));
        Assert.Equal(ConflictCodes.DuplicatePlayerName, ex.Code);
    }
}

internal static class QueryExtensions
{
    public static Task<T> SingleAsyncSafe<T>(this IQueryable<T> query) =>
        Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.SingleAsync(query);
}
