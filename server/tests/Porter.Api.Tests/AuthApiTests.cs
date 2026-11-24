using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Porter.Api.Tests;

[Collection(ApiCollection.Name)]
public sealed class AuthApiTests(PorterApiFactory factory)
{
    private HttpClient NewClient() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    [Fact]
    public async Task Register_returns_access_token_and_sets_httponly_refresh_cookie()
    {
        var http = NewClient();
        var res = await http.PostAsJsonAsync("/api/auth/register",
            new { displayName = "Kasun", email = $"{Guid.NewGuid():N}@test.local", password = "Password1" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.False(string.IsNullOrEmpty(body!["accessToken"]!.GetValue<string>()));
        Assert.Null(body["refreshToken"]); // never in the body

        var cookie = Assert.Single(res.Headers.GetValues("Set-Cookie"), c => c.StartsWith("porter_refresh="));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/auth", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Register_validates_password_and_rejects_duplicate_email()
    {
        var http = NewClient();
        var email = $"{Guid.NewGuid():N}@test.local";

        var weak = await http.PostAsJsonAsync("/api/auth/register", new { displayName = "A", email, password = "12345678" });
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.NotNull((await Json.ProblemAsync(weak))["errors"]!["password"]);

        (await http.PostAsJsonAsync("/api/auth/register", new { displayName = "A", email, password = "Password1" })).EnsureSuccessStatusCode();
        var dup = await http.PostAsJsonAsync("/api/auth/register", new { displayName = "B", email, password = "Password1" });
        Assert.Equal(HttpStatusCode.Conflict, dup.StatusCode);
    }

    [Fact]
    public async Task Login_failures_are_generic()
    {
        var user = await factory.NewUserAsync();
        var http = NewClient();

        var wrongPassword = await http.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = "Wrong1234" });
        var unknownEmail = await http.PostAsJsonAsync("/api/auth/login", new { email = "nobody@test.local", password = "Wrong1234" });

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);
        Assert.Equal((await Json.ProblemAsync(wrongPassword))["detail"]!.ToString(),
            (await Json.ProblemAsync(unknownEmail))["detail"]!.ToString());

        var ok = await http.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password = "Password1" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_the_token_and_detects_reuse()
    {
        var http = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        var reg = await http.PostAsJsonAsync("/api/auth/register",
            new { displayName = "R", email = $"{Guid.NewGuid():N}@test.local", password = "Password1" });
        var first = ExtractCookie(reg);

        var r1 = await Refresh(http, first);
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        var second = ExtractCookie(r1);
        Assert.NotEqual(first, second);

        // Re-using the rotated token fails and revokes the family, so the newer token dies too.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(http, first)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Refresh(http, second)).StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        var user = await factory.NewUserAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await user.Http.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await user.Http.PostAsync("/api/auth/refresh", null)).StatusCode);
    }

    [Fact]
    public async Task Forgot_password_is_202_for_known_and_unknown_emails()
    {
        var user = await factory.NewUserAsync();
        var http = NewClient();
        Assert.Equal(HttpStatusCode.Accepted, (await http.PostAsJsonAsync("/api/auth/forgot-password", new { email = user.Email })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await http.PostAsJsonAsync("/api/auth/forgot-password", new { email = "ghost@test.local" })).StatusCode);
    }

    [Fact]
    public async Task Reset_password_rejects_invalid_token()
    {
        var user = await factory.NewUserAsync();
        var res = await NewClient().PostAsJsonAsync("/api/auth/reset-password",
            new { email = user.Email, token = "bogus", password = "NewPassword1" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.NotNull((await Json.ProblemAsync(res))["errors"]!["token"]);
    }

    [Theory]
    [InlineData("/api/games")]
    [InlineData("/api/players")]
    [InlineData("/api/dashboard")]
    [InlineData("/api/account")]
    public async Task Protected_endpoints_require_authentication(string url) =>
        Assert.Equal(HttpStatusCode.Unauthorized, (await NewClient().GetAsync(url)).StatusCode);

    [Fact]
    public async Task Health_endpoints_are_public()
    {
        Assert.Equal(HttpStatusCode.OK, (await NewClient().GetAsync("/health/ready")).StatusCode);
    }

    [Fact]
    public async Task Account_can_link_me_player_and_change_password()
    {
        var user = await factory.NewUserAsync("Kasun");
        var kasun = (await user.CreatePlayersAsync("Kasun"))[0];

        var updated = await (await user.Http.PatchAsJsonAsync("/api/account", new { mePlayerId = kasun })).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(kasun.ToString(), updated!["mePlayerId"]!.GetValue<string>());

        var bad = await user.Http.PostAsJsonAsync("/api/account/change-password", new { currentPassword = "nope", newPassword = "Password2" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var ok = await user.Http.PostAsJsonAsync("/api/account/change-password", new { currentPassword = "Password1", newPassword = "Password2" });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
    }

    private static Task<HttpResponseMessage> Refresh(HttpClient http, string cookie)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        req.Headers.Add("Cookie", cookie);
        return http.SendAsync(req);
    }

    private static string ExtractCookie(HttpResponseMessage res) =>
        res.Headers.GetValues("Set-Cookie").First(c => c.StartsWith("porter_refresh=")).Split(';')[0];
}
