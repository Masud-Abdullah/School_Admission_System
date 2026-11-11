using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Dtos;
using SchoolAdmission.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var rawConnectionString =
    Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Port=5432;Database=school_admission;Username=postgres;Password=postgres";

static string NormalizeConnectionString(string raw)
{
    var trimmed = raw.Trim();
    if (trimmed.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        trimmed.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(trimmed);
        var userInfo = uri.UserInfo.Split(':', 2);
        var user = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "postgres";
        var pass = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "postgres";
        var db = uri.AbsolutePath.Trim('/');
        var port = uri.Port > 0 ? uri.Port : 5432;
        return $"Host={uri.Host};Port={port};Database={db};Username={user};Password={pass}";
    }
    return trimmed;
}

var connectionString = NormalizeConnectionString(rawConnectionString);

builder.Services.AddDbContext<AdmissionDbContext>(options =>
{
    options.UseNpgsql(connectionString);
});

builder.Services.AddScoped<AdmissionService>();
builder.Services.AddHostedService<HoldExpirationWorker>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true
};

static IResult RespondJson(object? value, int statusCode, JsonSerializerOptions options) =>
    new JsonBytesResult(value, statusCode, options);

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exceptionFeature = context.Features.Get<IExceptionHandlerFeature>();
        var ex = exceptionFeature?.Error;

        if (ex is BadHttpRequestException || ex is JsonException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json; charset=utf-8";
            var badBytes = JsonSerializer.SerializeToUtf8Bytes(
                new ApiErrorResponse("Invalid JSON request payload."),
                jsonOptions);
            await context.Response.Body.WriteAsync(badBytes);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json; charset=utf-8";
        var errBytes = JsonSerializer.SerializeToUtf8Bytes(
            new ApiErrorResponse("An unexpected server error occurred."),
            jsonOptions);
        await context.Response.Body.WriteAsync(errBytes);
    });
});

app.UseCors();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AdmissionDbContext>();
    var retries = 10;
    while (retries > 0)
    {
        try
        {
            db.Database.EnsureCreated();
            break;
        }
        catch
        {
            retries--;
            if (retries == 0) throw;
            Thread.Sleep(1500);
        }
    }
}

app.MapPost("/classes", async (
    HttpContext httpContext,
    AdmissionService service,
    CancellationToken ct) =>
{
    CreateClassRequest? request;
    try
    {
        using var reader = new StreamReader(httpContext.Request.Body);
        var raw = await reader.ReadToEndAsync(ct);
        request = string.IsNullOrWhiteSpace(raw)
            ? null
            : JsonSerializer.Deserialize<CreateClassRequest>(raw, jsonOptions);
    }
    catch
    {
        return RespondJson(new ApiErrorResponse("Invalid JSON body."), StatusCodes.Status400BadRequest, jsonOptions);
    }

    var (status, data, error) = await service.CreateClassAsync(request, ct);
    return status switch
    {
        201 => RespondJson(data, StatusCodes.Status201Created, jsonOptions),
        409 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status409Conflict, jsonOptions),
        _ => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status400BadRequest, jsonOptions)
    };
});

app.MapGet("/classes", async (AdmissionService service, CancellationToken ct) =>
{
    var list = await service.GetAllClassesAsync(ct);
    return RespondJson(list, StatusCodes.Status200OK, jsonOptions);
});

app.MapGet("/classes/{classId}", async (
    string classId,
    AdmissionService service,
    CancellationToken ct) =>
{
    var item = await service.GetClassByIdAsync(classId, ct);
    return item == null
        ? RespondJson(new ApiErrorResponse("Class not found."), StatusCodes.Status404NotFound, jsonOptions)
        : RespondJson(item, StatusCodes.Status200OK, jsonOptions);
});

app.MapPost("/classes/{classId}/holds", async (
    string classId,
    HttpContext httpContext,
    AdmissionService service,
    CancellationToken ct) =>
{
    var studentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (status, data, error) = await service.CreateHoldAsync(classId, studentId, ct);

    return status switch
    {
        201 => RespondJson(data, StatusCodes.Status201Created, jsonOptions),
        404 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status404NotFound, jsonOptions),
        409 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status409Conflict, jsonOptions),
        _ => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status400BadRequest, jsonOptions)
    };
});

app.MapGet("/holds/{holdId}", async (
    string holdId,
    AdmissionService service,
    CancellationToken ct) =>
{
    var hold = await service.GetHoldByIdAsync(holdId, ct);
    return hold == null
        ? RespondJson(new ApiErrorResponse("Hold not found."), StatusCodes.Status404NotFound, jsonOptions)
        : RespondJson(hold, StatusCodes.Status200OK, jsonOptions);
});

app.MapPost("/holds/{holdId}/confirm", async (
    string holdId,
    HttpContext httpContext,
    AdmissionService service,
    CancellationToken ct) =>
{
    var studentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (status, data, error) = await service.ConfirmHoldAsync(holdId, studentId, ct);

    return status switch
    {
        200 => RespondJson(data, StatusCodes.Status200OK, jsonOptions),
        403 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status403Forbidden, jsonOptions),
        404 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status404NotFound, jsonOptions),
        409 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status409Conflict, jsonOptions),
        _ => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status400BadRequest, jsonOptions)
    };
});

app.MapDelete("/holds/{holdId}", async (
    string holdId,
    HttpContext httpContext,
    AdmissionService service,
    CancellationToken ct) =>
{
    var studentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (status, error) = await service.CancelHoldAsync(holdId, studentId, ct);

    return status switch
    {
        204 => Results.StatusCode(StatusCodes.Status204NoContent),
        403 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status403Forbidden, jsonOptions),
        404 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status404NotFound, jsonOptions),
        409 => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status409Conflict, jsonOptions),
        _ => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status400BadRequest, jsonOptions)
    };
});

app.MapGet("/me/holds", async (
    HttpContext httpContext,
    AdmissionService service,
    CancellationToken ct) =>
{
    var studentId = httpContext.Request.Headers["X-Student-Id"].FirstOrDefault();
    var (status, data, error) = await service.GetStudentHoldsAsync(studentId, ct);

    return status switch
    {
        200 => RespondJson(data, StatusCodes.Status200OK, jsonOptions),
        _ => RespondJson(new ApiErrorResponse(error!), StatusCodes.Status400BadRequest, jsonOptions)
    };
});

app.Run();

public partial class Program { }

internal sealed class JsonBytesResult(object? value, int statusCode, JsonSerializerOptions options) : IResult
{
    public async Task ExecuteAsync(HttpContext httpContext)
    {
        httpContext.Response.StatusCode = statusCode;
        httpContext.Response.ContentType = "application/json; charset=utf-8";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, options);
        await httpContext.Response.Body.WriteAsync(bytes, httpContext.RequestAborted);
    }
}
