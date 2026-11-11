using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Dtos;
using Xunit;

namespace SchoolAdmission.Tests;

public class AdmissionTestFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _connectionString = $"Data Source=file:testdb_{Guid.NewGuid():N}?mode=memory&cache=shared";
    private SqliteConnection? _keepAliveConnection;

    public async Task InitializeAsync()
    {
        _keepAliveConnection = new SqliteConnection(_connectionString);
        await _keepAliveConnection.OpenAsync();
    }

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll(typeof(DbContextOptions<AdmissionDbContext>));
            services.AddDbContext<AdmissionDbContext>(options =>
            {
                options.UseSqlite(_connectionString);
            });
        });
    }

    public new async Task DisposeAsync()
    {
        if (_keepAliveConnection != null)
        {
            await _keepAliveConnection.DisposeAsync();
        }
        await base.DisposeAsync();
    }
}

public class AdmissionTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static StringContent ToJsonContent(object payload) =>
        new(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json");

    private static async Task<T> ReadJsonAsync<T>(HttpResponseMessage response)
    {
        var raw = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<T>(raw, JsonOptions)!;
    }

    [Fact]
    public async Task ConcurrentHolds_ShouldNeverExceedTotalSeats()
    {
        await using var factory = new AdmissionTestFactory();
        await factory.InitializeAsync();
        var client = factory.CreateClient();

        var createRes = await client.PostAsync("/classes", ToJsonContent(new { name = "Class 6 - Morning Shift", totalSeats = 5 }));
        Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
        var createdClass = await ReadJsonAsync<CreateClassResponse>(createRes);
        Assert.NotNull(createdClass);

        var totalConcurrentRequests = 50;
        var tasks = Enumerable.Range(1, totalConcurrentRequests).Select(async i =>
        {
            var studentId = (20152691234560000L + i).ToString();
            var req = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
            req.Headers.Add("X-Student-Id", studentId);
            return await client.SendAsync(req);
        });

        var responses = await Task.WhenAll(tasks);

        var createdCount = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var conflictCount = responses.Count(r => r.StatusCode == HttpStatusCode.Conflict);

        Assert.Equal(5, createdCount);
        Assert.Equal(45, conflictCount);

        var getRes = await client.GetAsync($"/classes/{createdClass.Id}");
        Assert.Equal(HttpStatusCode.OK, getRes.StatusCode);
        var summary = await ReadJsonAsync<ClassSeatSummaryResponse>(getRes);
        Assert.NotNull(summary);
        Assert.Equal(5, summary.TotalSeats);
        Assert.Equal(5, summary.HeldSeats);
        Assert.Equal(0, summary.ConfirmedSeats);
        Assert.Equal(0, summary.AvailableSeats);
    }

    [Fact]
    public async Task ConfirmHold_ShouldBeIdempotentAndEnforceStudentOwnership()
    {
        await using var factory = new AdmissionTestFactory();
        await factory.InitializeAsync();
        var client = factory.CreateClient();

        var createRes = await client.PostAsync("/classes", ToJsonContent(new { name = "Class 7 - Day Shift", totalSeats = 10 }));
        Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
        var createdClass = await ReadJsonAsync<CreateClassResponse>(createRes);

        var studentOwner = "20152691234567890";
        var otherStudent = "20152691234567999";

        var holdReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        holdReq.Headers.Add("X-Student-Id", studentOwner);
        var holdRes = await client.SendAsync(holdReq);
        Assert.Equal(HttpStatusCode.Created, holdRes.StatusCode);
        var holdData = await ReadJsonAsync<CreateHoldResponse>(holdRes);

        var forbiddenReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdData.HoldId}/confirm");
        forbiddenReq.Headers.Add("X-Student-Id", otherStudent);
        var forbiddenRes = await client.SendAsync(forbiddenReq);
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenRes.StatusCode);

        for (int attempt = 0; attempt < 3; attempt++)
        {
            var confirmReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdData.HoldId}/confirm");
            confirmReq.Headers.Add("X-Student-Id", studentOwner);
            var confirmRes = await client.SendAsync(confirmReq);
            Assert.Equal(HttpStatusCode.OK, confirmRes.StatusCode);
        }

        var getRes = await client.GetAsync($"/classes/{createdClass.Id}");
        var summary = await ReadJsonAsync<ClassSeatSummaryResponse>(getRes);
        Assert.Equal(0, summary.HeldSeats);
        Assert.Equal(1, summary.ConfirmedSeats);
        Assert.Equal(9, summary.AvailableSeats);
    }

    [Fact]
    public async Task ExpiredHold_ShouldAutomaticallyReleaseSeatAndBlockConfirmation()
    {
        Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", "1");
        try
        {
            await using var factory = new AdmissionTestFactory();
            await factory.InitializeAsync();
            var client = factory.CreateClient();

            var createRes = await client.PostAsync("/classes", ToJsonContent(new { name = "Class 8 - Morning Shift", totalSeats = 1 }));
            Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
            var createdClass = await ReadJsonAsync<CreateClassResponse>(createRes);

            var student1 = "20152691234567890";
            var holdReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
            holdReq.Headers.Add("X-Student-Id", student1);
            var holdRes = await client.SendAsync(holdReq);
            Assert.Equal(HttpStatusCode.Created, holdRes.StatusCode);
            var holdData = await ReadJsonAsync<CreateHoldResponse>(holdRes);

            await Task.Delay(1500);

            var getRes = await client.GetAsync($"/classes/{createdClass.Id}");
            var summary = await ReadJsonAsync<ClassSeatSummaryResponse>(getRes);
            Assert.Equal(0, summary.HeldSeats);
            Assert.Equal(1, summary.AvailableSeats);

            var confirmReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{holdData.HoldId}/confirm");
            confirmReq.Headers.Add("X-Student-Id", student1);
            var confirmRes = await client.SendAsync(confirmReq);
            Assert.Equal(HttpStatusCode.Conflict, confirmRes.StatusCode);
        }
        finally
        {
            Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", "600");
        }
    }

    [Fact]
    public async Task InvalidInputs_ShouldReturn4xxAndPreventDuplicateActiveHolds()
    {
        await using var factory = new AdmissionTestFactory();
        await factory.InitializeAsync();
        var client = factory.CreateClient();

        var badClassRes = await client.PostAsync("/classes", ToJsonContent(new { name = "", totalSeats = -10 }));
        Assert.Equal(HttpStatusCode.BadRequest, badClassRes.StatusCode);

        var randomNameRes = await client.PostAsync("/classes", ToJsonContent(new { name = "hello everyone!", totalSeats = 50 }));
        Assert.Equal(HttpStatusCode.BadRequest, randomNameRes.StatusCode);

        var negativeClassRes = await client.PostAsync("/classes", ToJsonContent(new { name = "class -4 - Morning Shift", totalSeats = 50 }));
        Assert.Equal(HttpStatusCode.BadRequest, negativeClassRes.StatusCode);

        var validClassRes = await client.PostAsync("/classes", ToJsonContent(new { name = "cLaSs 9 - mOrNiNg sHiFt", totalSeats = 5 }));
        Assert.Equal(HttpStatusCode.Created, validClassRes.StatusCode);
        var createdClass = await ReadJsonAsync<CreateClassResponse>(validClassRes);
        Assert.Equal("Class 9 - Morning Shift", createdClass.Name);

        var dupClassRes = await client.PostAsync("/classes", ToJsonContent(new { name = "CLASS 9 - MORNING SHIFT", totalSeats = 5 }));
        Assert.Equal(HttpStatusCode.Conflict, dupClassRes.StatusCode);

        var badHoldReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        badHoldReq.Headers.Add("X-Student-Id", "12345");
        var badHoldRes = await client.SendAsync(badHoldReq);
        Assert.Equal(HttpStatusCode.BadRequest, badHoldRes.StatusCode);

        var secondClassRes = await client.PostAsync("/classes", ToJsonContent(new { name = "Class 9 - Day Shift", totalSeats = 5 }));
        Assert.Equal(HttpStatusCode.Created, secondClassRes.StatusCode);
        var secondClass = await ReadJsonAsync<CreateClassResponse>(secondClassRes);

        var studentId = "20152691234567890";
        var firstHoldReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        firstHoldReq.Headers.Add("X-Student-Id", studentId);
        var firstHoldRes = await client.SendAsync(firstHoldReq);
        Assert.Equal(HttpStatusCode.Created, firstHoldRes.StatusCode);
        var firstHold = await ReadJsonAsync<CreateHoldResponse>(firstHoldRes);

        var secondHoldWhileActiveReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{secondClass.Id}/holds");
        secondHoldWhileActiveReq.Headers.Add("X-Student-Id", studentId);
        var secondHoldWhileActiveRes = await client.SendAsync(secondHoldWhileActiveReq);
        Assert.Equal(HttpStatusCode.Conflict, secondHoldWhileActiveRes.StatusCode);

        var cancelReq = new HttpRequestMessage(HttpMethod.Delete, $"/holds/{firstHold.HoldId}");
        cancelReq.Headers.Add("X-Student-Id", studentId);
        var cancelRes = await client.SendAsync(cancelReq);
        Assert.Equal(HttpStatusCode.NoContent, cancelRes.StatusCode);

        var secondHoldAfterCancelReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{secondClass.Id}/holds");
        secondHoldAfterCancelReq.Headers.Add("X-Student-Id", studentId);
        var secondHoldAfterCancelRes = await client.SendAsync(secondHoldAfterCancelReq);
        Assert.Equal(HttpStatusCode.Created, secondHoldAfterCancelRes.StatusCode);
    }
}
