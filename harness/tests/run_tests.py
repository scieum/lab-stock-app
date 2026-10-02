"""개발 하네스 judge.py 자체 검증.

사용: python harness/tests/run_tests.py
임시 폴더에 가짜 저장소를 만들고 judge 모듈의 ROOT를 바꿔 정적 규칙(S1·F2·T2·K1·N2-env·N2-bundle)과
종료 코드(판정 불가 = 2)를 확인한다. 실제 npm·Playwright는 돌리지 않는다.
"""
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
failures = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        failures.append(msg)


def load_judge(root):
    spec = importlib.util.spec_from_file_location("judge", REPO / "harness" / "scripts" / "judge.py")
    j = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(j)
    j.ROOT = root
    j.DEV_RULES = root / "harness" / "dev-rules.json"
    j.DESIGN_RULES = root / "design" / "rules.json"
    j.SOURCE = root / "design" / "source.json"
    return j


def write(root, rel, text):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def rules_of(found):
    return sorted({x["rule"] for x in found})


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for d in ("harness", "design"):
            shutil.copytree(REPO / d, root / d, ignore=shutil.ignore_patterns("tests", "__pycache__"))
        shutil.copyfile(REPO / "CLAUDE.md", root / "CLAUDE.md")
        j = load_judge(root)
        dev = json.loads(j.DEV_RULES.read_text(encoding="utf-8"))
        ctx = {"dev": dev, "state": {"baseline_hash": j.tree_hash(dev)}, "logs": {}, "report": {},
               "screen": None, "screens": dev["mvp_screens"]}

        print("[S1·F2]")
        check(j.check_S1(ctx) == [], "S1 사본 해시 일치 → 위반 0")
        check(j.check_F2(ctx) == [], "F2 기준 해시 일치 → 위반 0")
        (root / "design" / "rules.json").write_text("{}", encoding="utf-8")
        check(rules_of(j.check_S1(ctx)) == ["S1"], "S1 사본 수정 → 위반")
        check(rules_of(j.check_F2(ctx)) == ["F2"], "F2 design 변경 → 위반")

        print("[T2]")
        write(root, "styles/tokens.css", ":root{--ink:#141414;--space-16:16px}")
        write(root, "components/tab-bar/TabBar.tsx", 'export const T=()=> <nav data-component="tab-bar" style={{color:"var(--ink)"}} />')
        write(root, "app/page.module.css", "@media (min-width: 1024px){.a{color:var(--ink)}}")
        check(j.check_T2(ctx) == [], "토큰만 사용 + @media px → 위반 0")
        write(root, "app/bad.module.css", ".a{color:#ff0000;padding:12px;background:rgba(0,0,0,.5)}")
        found = j.check_T2(ctx)
        check(len(found) == 3 and rules_of(found) == ["T2"], f"hex·px·rgba 직접 사용 → 위반 3 (실제 {len(found)})")

        print("[K1]")
        found = j.check_K1(ctx)
        names = {x["where"] for x in found}
        check("components/tab-bar/" not in names, "tab-bar 폴더 + data-component → 통과")
        check("components/nav-pill/" in names, "nav-pill 없음 → 위반")
        write(root, "components/nav-pill/NavPill.tsx", "export const N=()=> <nav />")
        found = [x for x in j.check_K1(ctx) if x["where"] == "components/nav-pill/"]
        check(found and found[0]["actual"] == "data-component 속성 없음", "폴더는 있지만 data-component 없음 → 위반")

        print("[N2-env]")
        write(root, "app/api/neis/route.ts", "const k = process.env.NEIS_API_KEY")
        write(root, "lib/supabase.ts", "process.env.NEXT_PUBLIC_SUPABASE_URL; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY")
        check(j.check_N2env(ctx) == [], "서버 경로에서만 키 + 허용된 공개 변수 → 위반 0")
        write(root, "components/x/X.tsx", "process.env.NEIS_API_KEY; process.env.NEXT_PUBLIC_GEMINI_KEY")
        found = j.check_N2env(ctx)
        check(len(found) == 2, f"클라이언트에서 키 + NEXT_PUBLIC_ 키 → 위반 2 (실제 {len(found)})")

        print("[N2-bundle]")
        try:
            j.check_N2bundle(ctx)
            check(False, "빌드 폴더 없음 → 판정 불가")
        except j.CannotJudge:
            check(True, "빌드 폴더 없음 → 판정 불가")
        write(root, ".next/static/chunks/a.js", "console.log('ok')")
        check(j.check_N2bundle(ctx) == [], "깨끗한 번들 → 위반 0")
        write(root, ".env.local", "NEIS_API_KEY=" + "ab" * 16 + "\n")
        write(root, ".next/static/chunks/b.js", "var x='" + "ab" * 16 + "'")
        found = j.check_N2bundle(ctx)
        check(any("실제 값" in str(x["actual"]) for x in found), "실제 키 값이 번들에 있음 → 위반")
        write(root, ".next/static/chunks/c.js", "var g='AIza" + "x" * 35 + "'")
        check(any(x["actual"] == "gemini_key" for x in j.check_N2bundle(ctx)), "Gemini 키 형식 → 위반")

        print("[종료 코드]")
        run = root / "runs" / "t"
        write(root, "runs/t/input.json", json.dumps({"screens": [1]}))
        write(root, "runs/t/state.json", json.dumps({"baseline_hash": "x"}))
        p = subprocess.run([sys.executable, str(REPO / "harness" / "scripts" / "judge.py"), "--gate", "D3",
                            "--run", str(run)], capture_output=True, text=True, encoding="utf-8")
        check(p.returncode == 2, f"D3에 --screen 없음 → exit 2 (실제 {p.returncode})")

    print(f"\n{'PASS' if not failures else 'FAIL'} · 실패 {len(failures)}건")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
