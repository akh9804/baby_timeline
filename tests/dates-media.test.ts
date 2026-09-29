import { describe, it, expect } from "vitest";
import { ageLabel, calendarDate } from "@/shared/utils/dates";
import { validateFile, MAX_FILE_SIZE, storagePath } from "@/shared/utils/media";
describe("family calendar", () => {
  it("uses the due date for pregnancy weeks", () => {
    expect(
      ageLabel("2026-09-28T10:00:00+09:00", {
        birth_date: null,
        due_date: "2027-04-16",
      }),
    ).toBe("임신 11주 3일");
  });
  it("shows D+0 on birth day and D+1 across a Korean midnight", () => {
    const child = { birth_date: "2026-09-28", due_date: null };
    expect(ageLabel("2026-09-28T14:59:00Z", child)).toBe("D+0");
    expect(ageLabel("2026-09-28T15:01:00Z", child)).toBe("D+1");
    expect(calendarDate("2026-12-31T15:01:00Z")).toBe("2027-01-01");
  });
  it("handles leap years and preconception dates", () => {
    expect(
      ageLabel("2028-03-01", { birth_date: "2028-02-28", due_date: null }),
    ).toBe("D+2");
    expect(
      ageLabel("2020-01-01", { birth_date: null, due_date: "2027-04-16" }),
    ).toBe("소중한 하루");
  });
});
describe("file validation", () => {
  it("enforces type, zero bytes and 500MB limit", () => {
    expect(() =>
      validateFile({ type: "video/mp4", size: MAX_FILE_SIZE }),
    ).not.toThrow();
    expect(() =>
      validateFile({ type: "video/mp4", size: MAX_FILE_SIZE + 1 }),
    ).toThrow();
    expect(() => validateFile({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() => validateFile({ type: "image/jpeg", size: 0 })).toThrow();
  });
  it("never uses the original filename for object paths", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    expect(storagePath(uuid, uuid, uuid, "image/jpeg")).toBe(
      `children/${uuid}/moments/${uuid}/${uuid}.jpg`,
    );
    expect(() => storagePath("../private", uuid, uuid, "image/jpeg")).toThrow();
  });
});
