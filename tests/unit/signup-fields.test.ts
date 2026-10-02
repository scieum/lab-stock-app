// 화면 14 가입 입력 정리 (lib/auth/signup-rules): 클라이언트가 보낸 학교명·역할 등은 버리고 neisCode 만 학교 정보로 남긴다.
import { describe, expect, it } from "vitest";
import { PASSWORD_MIN, signupProblem, toSignupFields } from "../../lib/auth/signup-rules";

const FIELD_KEYS = ["agreePrivacy", "agreeTerms", "displayName", "email", "neisCode", "password", "passwordConfirm"];
const pw = "p".repeat(PASSWORD_MIN);
const valid = {
  neisCode: "E2E0000000",
  displayName: "이름",
  email: "a@example.com",
  password: pw,
  passwordConfirm: pw,
  agreeTerms: true,
  agreePrivacy: true,
};

describe("signup fields", () => {
  it("[N1-d][S14] toSignupFields 는 학교명·시/도·지역·school_id·역할 필드를 버린다", () => {
    const f = toSignupFields({
      ...valid,
      schoolName: "남의고등학교",
      school_id: "b0000000-0000-4000-8000-000000000001",
      sido: "x",
      region: "y",
      role: "admin",
      officeCode: "M10",
    });
    expect(Object.keys(f).sort()).toEqual(FIELD_KEYS);
    expect(JSON.stringify(f)).not.toContain("남의고등학교");
    expect(JSON.stringify(f)).not.toContain("admin");
  });

  it("[N1-d][S14] neisCode 가 문자열이 아니면 빈 값 → 학교 선택 문제", () => {
    for (const neisCode of [undefined, null, 7010000, { code: "x" }, ["x"]]) {
      const f = toSignupFields({ ...valid, neisCode });
      expect(f.neisCode).toBe("");
      expect(signupProblem(f)).not.toBeNull();
    }
  });

  it("[C1][S14] 동의 값은 true(불리언)만 인정", () => {
    for (const v of ["true", 1, "yes", null]) {
      expect(signupProblem(toSignupFields({ ...valid, agreeTerms: v }))).not.toBeNull();
      expect(signupProblem(toSignupFields({ ...valid, agreePrivacy: v }))).not.toBeNull();
    }
    expect(signupProblem(toSignupFields(valid))).toBeNull();
  });

  it("[C1][S14] 본문이 객체가 아니면 모든 필드 빈 값 → 문제", () => {
    for (const b of [null, undefined, "x", 3, []]) expect(signupProblem(toSignupFields(b))).not.toBeNull();
  });
});
