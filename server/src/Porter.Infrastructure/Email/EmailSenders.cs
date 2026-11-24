using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Porter.Infrastructure.Email;

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body, CancellationToken ct = default);
}

public sealed class SmtpOptions
{
    public const string Section = "Email:Smtp";
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "Porter <no-reply@porter.local>";
}

/// <summary>Sends via SMTP. Registered only when <c>Email:Smtp:Host</c> is configured.</summary>
public sealed class SmtpEmailSender(IOptions<SmtpOptions> options) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        var o = options.Value;
        using var client = new SmtpClient(o.Host, o.Port) { EnableSsl = o.EnableSsl };
        if (!string.IsNullOrEmpty(o.Username)) client.Credentials = new NetworkCredential(o.Username, o.Password);
        using var message = new MailMessage { From = new MailAddress(o.From), Subject = subject, Body = body };
        message.To.Add(to);
        await client.SendMailAsync(message, ct);
    }
}

/// <summary>
/// Development fallback: writes the email (including reset links) to the log instead of sending it.
/// No mail is delivered; configure SMTP for real deployments.
/// </summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string body, CancellationToken ct = default)
    {
        logger.LogWarning("Email not sent (no SMTP configured). To: {To} Subject: {Subject}\n{Body}", to, subject, body);
        return Task.CompletedTask;
    }
}
