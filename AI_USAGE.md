# AI Usage

## AI Tool Used
- **Tool:** Google Gemini
- **Where Used:**
  - Understanding how to handle concurrent requests and database locking in Entity Framework Core and PostgreSQL.
  - Designing the React frontend components, Tailwind CSS styling, and the live countdown timer.
  - Writing the Dockerfile and docker-compose.yml setup.

## Where AI Made Mistakes & How I Caught Them

1. **In-Memory Lock Instead of Database Lock for Concurrency:**
   - **Mistake:** Gemini initially suggested using C# SemaphoreSlim alone to prevent overbooking when multiple requests arrive together.
   - **How I caught it:** I checked the requirement which says the seat limit must work even if multiple backend servers run on different ports sharing the same database (SemaphoreSlim only works inside a single process).
   - **Fix:** Added a PostgreSQL database transaction with row-level locking (SELECT ... FOR UPDATE) on the class row before checking available seats.

2. **Wrong Status Code in Unit Test (200 OK vs 204 No Content):**
   - **Mistake:** In AdmissionTests.cs, Gemini wrote Assert.Equal(HttpStatusCode.OK, cancelRes.StatusCode) for the DELETE /holds/{id} test, even though the API specification requires 204 No Content.
   - **How I caught it:** When I ran dotnet test, the test failed with Expected: OK, Actual: NoContent.
   - **Fix:** Updated the test assertion to HttpStatusCode.NoContent.

3. **Allowing One Student to Hold Seats in Multiple Classes:**
   - **Mistake:** Initially, the duplicate hold check only checked if the student had a hold in the same class (ClassId == classId && StudentId == studentId), which allowed the same student to hold seats in multiple different classes at the same time.
   - **How I caught it:** While manually testing the application on localhost, I applied to a second class using the same 17-digit student ID while the first hold was still HELD.
   - **Fix:** Updated the check to block new holds if the student already has an active HELD or CONFIRMED seat in any class, and kept only the details button in the "আমার আবেদন" list so confirm/cancel actions happen cleanly in one place.

4. **UI Timer Label & Pre-filled Default Inputs:**
   - **Mistake:** The dark status box on the application details page always showed the label "বাকি সময়" (Remaining Time) even after the status changed to "CONFIRMED" or "CANCELLED". Also, the student ID and seat count inputs had hardcoded default values (20152691234567890 and 120).
   - **How I caught it:** Spotted these issues while testing the UI screens in the browser.
   - **Fix:** Changed the box label to show "চূড়ান্ত অবস্থা" (Final Status) when a hold is CONFIRMED or CANCELLED, and made the input fields start empty.
