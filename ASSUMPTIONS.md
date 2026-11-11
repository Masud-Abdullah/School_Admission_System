# Assumptions

1. **One Active Application Per Student:**
   - **Assumption:** A student (17-digit Birth Registration Number) can have only **one** active (HELD) or CONFIRMED application across the entire school at a time.
   - **Why:** The spec does not state whether a student can hold seats in multiple classes simultaneously. Blocking multiple active holds prevents one student from occupying seats in several classes at once, while still allowing them to apply again if their previous hold becomes CANCELLED or EXPIRED.

2. **Class & Shift Name Validation:**
   - **Assumption:** Class names must follow the format Class [1-12] - Morning Shift or Class [1-12] - Day Shift (case-insensitive, saved as Class 6 - Morning Shift), and duplicate class names return 409 Conflict.
   - **Why:** Keeps class and shift names consistent with Section 1.1 and prevents invalid or duplicate class entries.

3. **Confirm and Cancel Buttons Only on the Application Page:**
   - **Assumption:** The আমার আবেদন (My Applications) page shows the status table with a [বিস্তারিত] (Details) button, while the [ভর্তি ফি দিন] (Confirm) and [বাতিল] (Cancel) buttons are placed only on the আবেদন (Application Details) page.
   - **Why:** Keeps the UI clean and avoids showing duplicate action buttons on two different pages at the same time.
