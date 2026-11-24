using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Porter.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class PlayersApiTests(PorterApiFactory factory)
{
    [Fact]
    public async Task Player_names_are_unique_per_owner_case_insensitively()
    {
        var user = await factory.NewUserAsync();
        await user.CreatePlayerAsync("Amali");

        var dup = await user.Http.PostAsJsonAsync("/api/players", new { name = "  amali " });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
        Assert.Equal("player.duplicate_name", (await Json.ProblemAsync(dup))["code"]!.GetValue<string>());

        // Another account can use the same name.
        var other = await factory.NewUserAsync();
        await other.CreatePlayerAsync("Amali");
    }

    [Fact]
    public async Task Player_name_length_is_validated()
    {
        var user = await factory.NewUserAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await user.Http.PostAsJsonAsync("/api/players", new { name = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.Http.PostAsJsonAsync("/api/players", new { name = new string('x', 41) })).StatusCode);
    }

    [Fact]
    public async Task Players_with_games_cannot_be_deleted_but_unused_ones_can()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("A", "B", "Unused");
        await user.CreateGameAsync(ids.Take(2));

        var blocked = await user.Http.DeleteAsync($"/api/players/{ids[0]}");
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await user.Http.DeleteAsync($"/api/players/{ids[2]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.Http.GetAsync($"/api/players/{ids[2]}")).StatusCode);
    }

    [Fact]
    public async Task Players_can_be_renamed_and_list_is_searchable()
    {
        var user = await factory.NewUserAsync();
        var id = (await user.CreatePlayersAsync("Tharindu"))[0];
        await user.CreatePlayerAsync("Nimal");

        var renamed = await (await user.Http.PatchAsJsonAsync($"/api/players/{id}", new { name = "Thari", avatarColor = "plum" }))
            .Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("Thari", renamed!["name"]!.GetValue<string>());
        Assert.Equal("plum", renamed["avatarColor"]!.GetValue<string>());

        var found = await user.Http.GetFromJsonAsync<JsonArray>("/api/players?q=thar");
        Assert.Single(found!);
    }

    [Fact]
    public async Task Stats_count_completed_games_wins_and_ties()
    {
        var user = await factory.NewUserAsync();
        var ids = await user.CreatePlayersAsync("Kasun", "Nimal");

        // Game 1: Kasun wins 13 vs 26. Game 2: tie 13–13 (both win).
        var g1 = await user.CreateGameAsync(ids);
        for (var d = 1; d <= 13; d++) g1 = await user.SaveDealOkAsync(g1, d, 1, 2);
        var g2 = await user.CreateGameAsync(ids);
        for (var d = 1; d <= 13; d++) g2 = await user.SaveDealOkAsync(g2, d, 1, 1);
        // An unfinished game never counts.
        var g3 = await user.CreateGameAsync(ids);
        await user.SaveDealOkAsync(g3, 1, 50, 0);

        var kasun = await user.Http.GetFromJsonAsync<JsonObject>($"/api/players/{ids[0]}/stats");
        Assert.Equal(2, kasun!["gamesPlayed"]!.GetValue<int>());
        Assert.Equal(2, kasun["wins"]!.GetValue<int>());
        Assert.Equal(13, kasun["bestFinalScore"]!.GetValue<int>());
        Assert.Equal(13.0, kasun["averageFinalScore"]!.GetValue<double>());

        var nimal = await user.Http.GetFromJsonAsync<JsonObject>($"/api/players/{ids[1]}/stats");
        Assert.Equal(1, nimal!["wins"]!.GetValue<int>());
        Assert.Equal(19.5, nimal["averageFinalScore"]!.GetValue<double>());
        Assert.Equal(1, nimal["finishes"]![1]!["count"]!.GetValue<int>()); // one 2nd place

        var list = await user.Http.GetFromJsonAsync<JsonArray>("/api/players");
        Assert.Equal(2, list!.First(p => p!["name"]!.GetValue<string>() == "Kasun")!["gamesPlayed"]!.GetValue<int>());
    }

    [Fact]
    public async Task New_player_has_empty_stats_not_fake_ones()
    {
        var user = await factory.NewUserAsync();
        var id = (await user.CreatePlayersAsync("Solo"))[0];
        var stats = await user.Http.GetFromJsonAsync<JsonObject>($"/api/players/{id}/stats");
        Assert.Equal(0, stats!["gamesPlayed"]!.GetValue<int>());
        Assert.Null(stats["winRate"]);
        Assert.Null(stats["averageFinalScore"]);
    }

    [Fact]
    public async Task Dashboard_reflects_real_activity()
    {
        var user = await factory.NewUserAsync("Kasun");
        var empty = await user.Http.GetFromJsonAsync<JsonObject>("/api/dashboard");
        Assert.Equal(0, empty!["totalGames"]!.GetValue<int>());
        Assert.Equal("Kasun", empty["displayName"]!.GetValue<string>());

        var ids = await user.CreatePlayersAsync("Kasun", "Nimal");
        var game = await user.CreateGameAsync(ids, name: "Friday Night Porter");
        await user.SaveDealOkAsync(game, 1, 0, 5);

        var dash = await user.Http.GetFromJsonAsync<JsonObject>("/api/dashboard");
        Assert.Equal("Friday Night Porter", dash!["activeGames"]![0]!["name"]!.GetValue<string>());
        Assert.Equal("deal_saved", dash["activity"]![0]!["kind"]!.GetValue<string>());
        Assert.Null(dash["my"]!["stats"]);
    }
}
