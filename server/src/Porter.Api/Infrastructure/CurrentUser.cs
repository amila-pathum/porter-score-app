using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using Porter.Application.Abstractions;

namespace Porter.Api.Infrastructure;

/// <summary>Resolves the caller from the validated JWT. Only used behind [Authorize].</summary>
public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid UserId
    {
        get
        {
            var principal = accessor.HttpContext?.User;
            var sub = principal?.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(sub, out var id)
                ? id
                : throw new UnauthorizedAccessException("No authenticated user.");
        }
    }
}
