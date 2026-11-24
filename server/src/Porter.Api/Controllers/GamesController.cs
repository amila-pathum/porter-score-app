using Microsoft.AspNetCore.Mvc;
using Porter.Application.Games;

namespace Porter.Api.Controllers;

[ApiController]
[Route("api/games")]
public sealed class GamesController(GameService games) : ControllerBase
{
    [HttpGet]
    public Task<GameListResult> List([FromQuery] GameListQuery query, CancellationToken ct) => games.ListAsync(query, ct);

    /// <summary>Creates a game. Idempotent on the client-supplied id: a replay returns 200 with the existing game.</summary>
    [HttpPost]
    [ProducesResponseType<GameStateDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<GameStateDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<GameStateDto>> Create(CreateGameRequest request, CancellationToken ct)
    {
        var (game, created) = await games.CreateAsync(request, ct);
        return created ? CreatedAtAction(nameof(Get), new { id = game.Id }, game) : Ok(game);
    }

    [HttpGet("{id:guid}")]
    public Task<GameStateDto> Get(Guid id, CancellationToken ct) => games.GetAsync(id, ct);

    /// <summary>Rename (any status) or replace players (draft only).</summary>
    [HttpPatch("{id:guid}")]
    public Task<GameStateDto> Update(Guid id, UpdateGameRequest request, CancellationToken ct) => games.UpdateAsync(id, request, ct);

    [HttpPost("{id:guid}/start")]
    public Task<GameStateDto> Start(Guid id, CancellationToken ct) => games.StartAsync(id, ct);

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await games.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>
    /// Saves the next deal or corrects an existing one. Idempotent. Returns the full recalculated game state.
    /// 409 when <c>expectedVersion</c> is stale or the deal is out of sequence.
    /// </summary>
    [HttpPut("{id:guid}/deals/{dealNumber:int}")]
    [ProducesResponseType<SaveDealResult>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<SaveDealResult> SaveDeal(Guid id, int dealNumber, SaveDealRequest request, CancellationToken ct) =>
        games.SaveDealAsync(id, dealNumber, request, ct);
}
