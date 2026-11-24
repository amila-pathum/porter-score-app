using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;

namespace Porter.Api.Tests;

/// <summary>Boots the real API against a throwaway PostgreSQL container (migrations applied on startup).</summary>
public sealed class PorterApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async Task InitializeAsync() => await _db.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Postgres", _db.GetConnectionString());
        builder.UseSetting("Jwt:SigningKey", "integration-test-signing-key-0123456789abcdef");
        builder.UseSetting("Database:MigrateOnStartup", "true");
        builder.UseSetting("Seed:DemoData", "false");
        builder.UseSetting("Auth:SecureCookies", "false");
        builder.UseSetting("RateLimiting:AuthPermitPerMinute", "1000");
        builder.UseSetting("App:PublicUrl", "http://localhost:4200");
    }

    /// <summary>Registers a fresh user and returns an authenticated client (bearer + refresh cookie).</summary>
    public async Task<ApiClient> NewUserAsync(string? name = null)
    {
        var http = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var email = $"{Guid.NewGuid():N}@test.local";
        var res = await http.PostAsJsonAsync("/api/auth/register",
            new { displayName = name ?? "Tester", email, password = "Password1" });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonObject>();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!["accessToken"]!.GetValue<string>());
        return new ApiClient(http, email);
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<PorterApiFactory>
{
    public const string Name = "api";
}

public sealed record ApiClient(HttpClient Http, string Email)
{
    public async Task<JsonObject> CreatePlayerAsync(string name)
    {
        var res = await Http.PostAsJsonAsync("/api/players", new { name });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonObject>())!;
    }

    public async Task<List<Guid>> CreatePlayersAsync(params string[] names)
    {
        var ids = new List<Guid>();
        foreach (var n in names) ids.Add(Guid.Parse((await CreatePlayerAsync(n))["id"]!.GetValue<string>()));
        return ids;
    }

    public async Task<JsonObject> CreateGameAsync(IEnumerable<Guid> playerIds, bool start = true, string name = "Test Game", Guid? id = null)
    {
        var res = await Http.PostAsJsonAsync("/api/games", new { id, name, playerIds, start });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonObject>())!;
    }

    public Task<HttpResponseMessage> SaveDealAsync(JsonObject game, int deal, int[] scores, string? expectedVersion = null)
    {
        var players = game["players"]!.AsArray();
        var body = new
        {
            scores = players.Select((p, i) => new { playerId = p!["playerId"]!.GetValue<string>(), score = scores[i] }),
            expectedVersion,
        };
        return Http.PutAsJsonAsync($"/api/games/{game["id"]}/deals/{deal}", body);
    }

    /// <summary>Saves a deal and returns the new game state; fails the test on a non-2xx.</summary>
    public async Task<JsonObject> SaveDealOkAsync(JsonObject game, int deal, params int[] scores)
    {
        var res = await SaveDealAsync(game, deal, scores);
        if (!res.IsSuccessStatusCode) Assert.Fail($"Deal {deal} failed: {(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<JsonObject>())!["game"]!.AsObject();
    }

    public async Task<JsonObject> GetGameAsync(object id) =>
        (await Http.GetFromJsonAsync<JsonObject>($"/api/games/{id}"))!;
}

public static class Json
{
    public static int[] Totals(JsonObject game) =>
        game["players"]!.AsArray().Select(p => p!["total"]!.GetValue<int>()).ToArray();

    public static int[] SeatRanks(JsonObject game) =>
        game["players"]!.AsArray().Select(p => p!["rank"]!.GetValue<int>()).ToArray();

    public static async Task<JsonObject> ProblemAsync(HttpResponseMessage res) =>
        JsonSerializer.Deserialize<JsonObject>(await res.Content.ReadAsStringAsync())!;
}
