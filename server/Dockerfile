# syntax=docker/dockerfile:1
# Porter API — multi-stage build. Context: ./server
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props Porter.sln ./
COPY src/Porter.Domain/Porter.Domain.csproj src/Porter.Domain/
COPY src/Porter.Application/Porter.Application.csproj src/Porter.Application/
COPY src/Porter.Infrastructure/Porter.Infrastructure.csproj src/Porter.Infrastructure/
COPY src/Porter.Api/Porter.Api.csproj src/Porter.Api/
RUN dotnet restore src/Porter.Api/Porter.Api.csproj
COPY src/ src/
RUN dotnet publish src/Porter.Api/Porter.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
# Npgsql probes for GSSAPI (Kerberos) at startup; install it to avoid a noisy load error.
RUN apt-get update && apt-get install -y --no-install-recommends libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app .
USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /health/live HTTP/1.0\r\n\r\n" >&3 && grep -q "200 OK" <&3' || exit 1
ENTRYPOINT ["dotnet", "Porter.Api.dll"]
