using Microsoft.AspNetCore.Mvc;
using Porter.Application.Account;
using Porter.Application.Dashboard;
using Porter.Application.Players;
using Porter.Application.Statistics;

namespace Porter.Api.Controllers;

[ApiController]
[Route("api/players")]
public sealed class PlayersController(PlayerService players, StatisticsService stats) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<PlayerDto>> List([FromQuery] string? q, CancellationToken ct) => players.ListAsync(q, ct);

    [HttpPost]
    [ProducesResponseType<PlayerDto>(StatusCodes.Status201Created)]
    public async Task<ActionResult<PlayerDto>> Create(CreatePlayerRequest request, CancellationToken ct)
    {
        var (player, created) = await players.CreateAsync(request, ct);
        return created ? CreatedAtAction(nameof(Get), new { id = player.Id }, player) : Ok(player);
    }

    [HttpGet("{id:guid}")]
    public Task<PlayerDto> Get(Guid id, CancellationToken ct) => players.GetAsync(id, ct);

    [HttpPatch("{id:guid}")]
    public Task<PlayerDto> Update(Guid id, UpdatePlayerRequest request, CancellationToken ct) => players.UpdateAsync(id, request, ct);

    /// <summary>409 when the player appears in any saved game (history is never deleted silently).</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await players.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/stats")]
    public Task<PlayerStatsDto> Stats(Guid id, CancellationToken ct) => stats.GetPlayerStatsAsync(id, ct);
}

[ApiController]
[Route("api")]
public sealed class OverviewController(DashboardService dashboard, StatisticsService stats) : ControllerBase
{
    [HttpGet("dashboard")]
    public Task<DashboardDto> Dashboard(CancellationToken ct) => dashboard.GetAsync(ct);

    [HttpGet("statistics/me")]
    public Task<MyStatsDto> MyStatistics(CancellationToken ct) => stats.GetMyStatsAsync(ct);
}

[ApiController]
[Route("api/account")]
public sealed class AccountController(IAccountService account) : ControllerBase
{
    [HttpGet]
    public Task<AccountDto> Get(CancellationToken ct) => account.GetAsync(ct);

    [HttpPatch]
    public Task<AccountDto> Update(UpdateAccountRequest request, CancellationToken ct) => account.UpdateAsync(request, ct);

    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken ct)
    {
        await account.ChangePasswordAsync(request, ct);
        return NoContent();
    }

    /// <summary>Permanently deletes the account and all its games and players.</summary>
    [HttpPost("delete")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(DeleteAccountRequest request, CancellationToken ct)
    {
        await account.DeleteAsync(request, ct);
        Response.Cookies.Delete(AuthController.RefreshCookie, new CookieOptions { Path = "/api/auth" });
        return NoContent();
    }
}
