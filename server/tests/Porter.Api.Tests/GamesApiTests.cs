using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Porter.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class GamesApiTests(PorterApiFactory factory)
{
    private static readonly int[][] FridayDeals = [[0, 12, 5, 18], [18, 0, 7, 25], [5, 9, 0, 12], [12, 33, 14, 0]];

    [Fact]
    public async Task Create_and_start_returns_active_game_in_seat_order()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("Kasun", "Nimal", "Amali", "Tharindu");

        var game = await user.CreateGameAsync(ids, start: true, name: "Friday Night Porter");

        Assert.Equal("active", game["status"]!.GetValue<string>());
        Assert.Equal(1, game["nextDealNumber"]!.GetValue<int>());
        Assert.Equal("Ace", game["nextWildCard"]!.GetValue<string>());
        Assert.Equal(ids.Select(i => i.ToString()), game["players"]!.AsArray().Select(p => p!["playerId"]!.GetValue<string>()));
        Assert.Equal([1, 2, 3, 4], game["players"]!.AsArray().Select(p => p!["seat"]!.GetValue<int>()));
    }

    [Fact]
    public async Task Create_is_idempotent_on_client_id()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("A", "B");
        var id = Guid.NewGuid();

        await user.CreateGameAsync(ids, id: id);
        var replay = await user.Http.PostAsJsonAsync("/api/games", new { id, name = "Test Game", playerIds = ids, start = true });

        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        var list = await user.Http.GetFromJsonAsync<JsonObject>("/api/games");
        Assert.Equal(1, list!["totalCount"]!.GetValue<int>());
    }

    [Fact]
    public async Task Create_defaults_the_name_when_blank()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("A", "B");
        var res = await user.Http.PostAsJsonAsync("/api/games", new { name = "", playerIds = ids });
        var game = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.StartsWith("Porter · ", game!["name"]!.GetValue<string>());
        Assert.Equal("draft", game["status"]!.GetValue<string>());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    public async Task Create_rejects_invalid_player_counts(int count)
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync(Enumerable.Range(1, count).Select(i => $"P{i}").ToArray());
        var res = await user.Http.PostAsJsonAsync("/api/games", new { name = "x", playerIds = ids });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("game.player_count", (await Json.ProblemAsync(res))["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task Create_rejects_duplicate_and_foreign_players()
    {
        var user = await factory.NewUserAsync();
        var other = await factory.NewUserAsync();
        var mine = await user.CreatePlayersAsync("A");
        var theirs = await other.CreatePlayersAsync("B");

        var dup = await user.Http.PostAsJsonAsync("/api/games", new { name = "x", playerIds = new[] { mine[0], mine[0] } });
        Assert.Equal(HttpStatusCode.BadRequest, dup.StatusCode);

        var foreign = await user.Http.PostAsJsonAsync("/api/games", new { name = "x", playerIds = new[] { mine[0], theirs[0] } });
        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
    }

    [Fact]
    public async Task Other_users_cannot_see_or_change_a_game()
    {
        var owner = await factory.NewUserAsync();
        var intruder = await factory.NewUserAsync();
        var game = await owner.CreateGameAsync(await owner.CreatePlayersAsync("A", "B"));

        Assert.Equal(HttpStatusCode.NotFound, (await intruder.Http.GetAsync($"/api/games/{game["id"]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SaveDealAsync(game, 1, [0, 1])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.Http.DeleteAsync($"/api/games/{game["id"]}")).StatusCode);
    }

    [Fact]
    public async Task Saving_deals_recalculates_totals_and_standings_on_the_server()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("Kasun", "Nimal", "Amali", "Tharindu"));

        for (var d = 0; d < FridayDeals.Length; d++) game = await user.SaveDealOkAsync(game, d + 1, FridayDeals[d]);

        Assert.Equal([35, 54, 26, 55], Json.Totals(game));
        Assert.Equal([2, 3, 1, 4], Json.SeatRanks(game));
        Assert.Equal(["Amali", "Kasun", "Nimal", "Tharindu"],
            game["standings"]!.AsArray().Select(s => s!["name"]!.GetValue<string>()));
        Assert.Equal(5, game["nextDealNumber"]!.GetValue<int>());
        Assert.Equal("5", game["nextWildCard"]!.GetValue<string>());
        Assert.Equal(4, game["deals"]!.AsArray().Count);
    }

    [Fact]
    public async Task Draft_games_reject_scores()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B"), start: false);
        var res = await user.SaveDealAsync(game, 1, [0, 1]);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("game.not_started", (await Json.ProblemAsync(res))["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task Skipped_future_deals_are_rejected()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B"));
        var res = await user.SaveDealAsync(game, 3, [0, 1]);
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("deal.out_of_sequence", (await Json.ProblemAsync(res))["code"]!.GetValue<string>());
    }

    [Fact]
    public async Task Invalid_scores_return_field_errors()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B", "C"));

        var negative = await user.SaveDealAsync(game, 1, [0, -2, 4]);
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
        Assert.NotNull((await Json.ProblemAsync(negative))["errors"]!["scores[1].score"]);

        var players = game["players"]!.AsArray();
        var missing = await user.Http.PutAsJsonAsync($"/api/games/{game["id"]}/deals/1", new
        {
            scores = new object[]
            {
                new { playerId = players[0]!["playerId"]!.GetValue<string>(), score = 0 },
                new { playerId = players[1]!["playerId"]!.GetValue<string>(), score = (int?)null },
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);

        var decimalBody = new StringContent(
            $$"""{"scores":[{"playerId":"{{players[0]!["playerId"]}}","score":2.5}]}""", System.Text.Encoding.UTF8, "application/json");
        var dec = await user.Http.PutAsync($"/api/games/{game["id"]}/deals/1", decimalBody);
        Assert.Equal(HttpStatusCode.BadRequest, dec.StatusCode);
        Assert.NotNull((await Json.ProblemAsync(dec))["errors"]!["scores[0].score"]);

        // Nothing was saved by any of the failed attempts.
        Assert.Equal(0, (await user.GetGameAsync(game["id"]!))["completedDeals"]!.GetValue<int>());
    }

    [Fact]
    public async Task Very_large_scores_are_accepted()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B"));
        game = await user.SaveDealOkAsync(game, 1, 0, 1500);
        Assert.Equal([0, 1500], Json.Totals(game));
    }

    [Fact]
    public async Task Stale_expected_version_returns_409_and_identical_replay_is_idempotent()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B"));
        var v0 = game["version"]!.GetValue<string>();

        var first = await user.SaveDealAsync(game, 1, [0, 7], v0);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // Same request again (lost response retry) → success, no duplicate.
        var replay = await user.SaveDealAsync(game, 1, [0, 7], v0);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal("unchanged", (await replay.Content.ReadFromJsonAsync<JsonObject>())!["outcome"]!.GetValue<string>());

        // A different edit based on the old version → conflict, not a silent overwrite.
        var stale = await user.SaveDealAsync(game, 1, [3, 0], v0);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("game.version_conflict", (await Json.ProblemAsync(stale))["code"]!.GetValue<string>());

        var stored = await user.GetGameAsync(game["id"]!);
        Assert.Equal(1, stored["completedDeals"]!.GetValue<int>());
        Assert.Equal([0, 7], Json.Totals(stored));
    }

    [Fact]
    public async Task Correcting_a_deal_recalculates_without_duplicating()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("Kasun", "Nimal", "Amali", "Tharindu"));
        for (var d = 0; d < FridayDeals.Length; d++) game = await user.SaveDealOkAsync(game, d + 1, FridayDeals[d]);

        var res = await user.SaveDealAsync(game, 3, [5, 19, 0, 12], game["version"]!.GetValue<string>());
        var body = await res.Content.ReadFromJsonAsync<JsonObject>();
        var corrected = body!["game"]!.AsObject();

        Assert.Equal("corrected", body["outcome"]!.GetValue<string>());
        Assert.Equal([35, 64, 26, 55], Json.Totals(corrected));
        Assert.Equal([2, 4, 1, 3], Json.SeatRanks(corrected)); // Nimal 3rd → 4th, Tharindu 4th → 3rd
        Assert.Equal(4, corrected["deals"]!.AsArray().Count);
        Assert.True(corrected["deals"]![2]!["isEdited"]!.GetValue<bool>());
        Assert.Equal(5, corrected["nextDealNumber"]!.GetValue<int>());
    }

    [Fact]
    public async Task Deal_13_completes_the_game_with_final_standings()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("Kasun", "Nimal", "Amali", "Tharindu"));
        int[][] poya =
        [
            [0, 14, 6, 21], [9, 0, 12, 5], [17, 8, 0, 11], [4, 22, 9, 0], [0, 6, 15, 13], [12, 0, 3, 27], [7, 10, 0, 8],
            [0, 5, 18, 16], [25, 12, 7, 0], [3, 0, 11, 9], [0, 19, 6, 14], [10, 7, 0, 5], [6, 13, 12, 0],
        ];
        for (var d = 0; d < 12; d++) game = await user.SaveDealOkAsync(game, d + 1, poya[d]);
        Assert.Equal("active", game["status"]!.GetValue<string>());

        game = await user.SaveDealOkAsync(game, 13, poya[12]);

        Assert.Equal("completed", game["status"]!.GetValue<string>());
        Assert.NotNull(game["completedAt"]);
        Assert.Null(game["nextDealNumber"]);
        Assert.Equal([93, 116, 99, 129], Json.Totals(game));
        Assert.Single(game["winnerIds"]!.AsArray());
        Assert.Equal("King", game["deals"]![12]!["wildCard"]!.GetValue<string>());

        var after = await user.SaveDealAsync(game, 14, [0, 0, 0, 0]);
        Assert.Equal(HttpStatusCode.BadRequest, after.StatusCode);

        // Results remain correctable.
        var fix = await user.SaveDealAsync(game, 1, [1, 14, 6, 21]);
        Assert.Equal(HttpStatusCode.OK, fix.StatusCode);
    }

    [Fact]
    public async Task Tied_totals_share_rank_1_and_are_joint_winners()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("Kasun", "Nimal"));
        int[][] avurudu =
        [
            [0, 9], [12, 0], [7, 0], [0, 13], [15, 0], [9, 0], [0, 17], [11, 0], [8, 0], [0, 22], [14, 0], [10, 25], [15, 15],
        ];
        for (var d = 0; d < 13; d++) game = await user.SaveDealOkAsync(game, d + 1, avurudu[d]);

        Assert.Equal([101, 101], Json.Totals(game));
        Assert.Equal([1, 1], Json.SeatRanks(game));
        Assert.Equal(2, game["winnerIds"]!.AsArray().Count);
        Assert.All(game["standings"]!.AsArray(), s => Assert.True(s!["isTied"]!.GetValue<bool>()));
    }

    [Fact]
    public async Task Players_can_change_in_draft_but_not_after_start()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("A", "B", "C");
        var game = await user.CreateGameAsync(ids.Take(2), start: false);

        var patched = await user.Http.PatchAsJsonAsync($"/api/games/{game["id"]}", new { name = "Renamed", playerIds = new[] { ids[2], ids[0] } });
        var state = await patched.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("Renamed", state!["name"]!.GetValue<string>());
        Assert.Equal(ids[2].ToString(), state["players"]![0]!["playerId"]!.GetValue<string>());

        Assert.Equal(HttpStatusCode.OK, (await user.Http.PostAsync($"/api/games/{game["id"]}/start", null)).StatusCode);
        var locked = await user.Http.PatchAsJsonAsync($"/api/games/{game["id"]}", new { playerIds = ids });
        Assert.Equal(HttpStatusCode.Conflict, locked.StatusCode);
    }

    [Fact]
    public async Task Deleted_games_disappear()
    {
        var user = await factory.NewUserAsync();
        var game = await user.CreateGameAsync(await user.CreatePlayersAsync("A", "B"));

        Assert.Equal(HttpStatusCode.NoContent, (await user.Http.DeleteAsync($"/api/games/{game["id"]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.Http.GetAsync($"/api/games/{game["id"]}")).StatusCode);
    }

    [Fact]
    public async Task List_supports_status_filter_search_and_counts()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("Amali", "Kasun", "Ruwan");
        await user.CreateGameAsync(ids.Take(2), name: "Friday Night Porter");
        await user.CreateGameAsync([ids[1], ids[2]], start: false, name: "Office Lunch");

        var all = await user.Http.GetFromJsonAsync<JsonObject>("/api/games");
        Assert.Equal(2, all!["counts"]!["all"]!.GetValue<int>());
        Assert.Equal(1, all["counts"]!["draft"]!.GetValue<int>());

        var active = await user.Http.GetFromJsonAsync<JsonObject>("/api/games?status=active");
        Assert.Equal("Friday Night Porter", active!["items"]![0]!["name"]!.GetValue<string>());

        var byPlayer = await user.Http.GetFromJsonAsync<JsonObject>("/api/games?q=ruwan");
        Assert.Equal("Office Lunch", Assert.Single(byPlayer!["items"]!.AsArray())!["name"]!.GetValue<string>());

        var byName = await user.Http.GetFromJsonAsync<JsonObject>("/api/games?q=FRIDAY");
        Assert.Single(byName!["items"]!.AsArray());
    }
}
