"""Lab_Stock 개발 하네스 판정 스크립트 (읽기 전용 판정자).

사용:
  python harness/scripts/judge.py --gate {D0|D1|D2|D3|D4} --run runs/{id} [--screen N]
  python harness/scripts/judge.py --hash

규칙 값: design/rules.json(디자인 하네스 사본) + harness/dev-rules.json
결과: {run}/judge/gate-{X}.json  (D3은 gate-D3-S{N}.json)
종료 코드: 0 통과 / 1 위반 있음 / 2 판정 불가
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEV_RULES = ROOT / "harness" / "dev-rules.json"
DESIGN_RULES = ROOT / "design" / "rules.json"
SOURCE = ROOT / "design" / "source.json"


class CannotJudge(Exception):
    pass


def v(rule, where, actual, allowed):
    return {"rule": rule, "where": where, "actual": actual, "allowed": allowed}


def read_json(path):
    if not path.exists():
        raise CannotJudge(f"파일 없음: {path.relative_to(ROOT) if ROOT in path.parents else path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise CannotJudge(f"JSON 형식 오류: {path.name} ({e})")


def run_cmd(cmd, timeout=900):
    """명령 실행 → (exit, 출력 끝부분). npm/npx는 Windows에서 shell 필요."""
    p = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    tail = (p.stdout + p.stderr).strip().splitlines()[-15:]
    return p.returncode, "\n".join(tail)


def walk(dirs, exts, skip):
    for d in dirs:
        base = ROOT / d
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in exts and not any(s in p.parts for s in skip):
                yield p


def rel(p):
    return p.relative_to(ROOT).as_posix()


# ---------- S·F (출처·해시) ----------

def check_S1(ctx):
    src = read_json(SOURCE)
    if not DESIGN_RULES.exists():
        raise CannotJudge("design/rules.json 없음")
    now = hashlib.sha256(DESIGN_RULES.read_bytes()).hexdigest()
    return [] if now == src.get("sha256") else [v("S1", "design/rules.json", now[:12], src.get("sha256", "")[:12])]


def tree_hash(dr):
    hs = dr["hash_scope"]
    h = hashlib.sha256()
    files = []
    for inc in hs["include"]:
        base = ROOT / inc
        cands = [base] if base.is_file() else (base.rglob("*") if base.exists() else [])
        for p in cands:
            r = rel(p)
            if not p.is_file() or any(r == e or r.startswith(e + "/") for e in hs["exclude"]):
                continue
            if any(part in hs["exclude_names"] for part in p.parts):
                continue
            files.append((r, p))
    for r, p in sorted(files):
        h.update(r.encode("utf-8") + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()


def check_F2(ctx):
    base = ctx["state"].get("baseline_hash")
    if not base:
        raise CannotJudge("state.json에 baseline_hash 없음")
    now = tree_hash(ctx["dev"])
    return [] if now == base else [v("F2", "harness/ + design/ + CLAUDE.md", now[:12], base[:12])]


# ---------- Q (품질) ----------

def require_package():
    if not (ROOT / "package.json").exists():
        raise CannotJudge("package.json 없음 (D0 셋업 전)")


def check_Q(rule):
    def check(ctx):
        require_package()
        out = []
        for cmd in ctx["dev"]["commands"][rule]:
            code, tail = run_cmd(cmd)
            if code != 0:
                out.append(v(rule, cmd, f"exit {code}", "exit 0"))
                ctx["logs"][cmd] = tail
        return out
    return check


# ---------- T (토큰) ----------

def check_T1(ctx):
    require_package()
    if not (ROOT / "scripts" / "gen-tokens.mjs").exists():
        return [v("T1", "scripts/gen-tokens.mjs", "없음", "rules.json → styles/tokens.css 생성기")]
    code, tail = run_cmd(ctx["dev"]["commands"]["T1"])
    if code != 0:
        ctx["logs"]["T1"] = tail
        return [v("T1", "styles/tokens.css", "rules.json 생성 결과와 다름", "diff 0")]
    return []


def check_T2(ctx):
    sc = ctx["dev"]["scan"]
    pats = {k: re.compile(p) for k, p in sc["T2_patterns"].items()}
    exempt = set(sc["T2_exempt_files"])
    out = []
    for p in walk(sc["T2_dirs"], set(sc["T2_exts"]), set(sc["skip_dirs"])):
        if rel(p) in exempt:
            continue
        for i, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if sc["T2_allow_line"] in line:
                continue
            for k, pat in pats.items():
                m = pat.search(line)
                if m:
                    out.append(v("T2", f"{rel(p)}:{i}", m.group(0), "토큰(var(--…))만"))
    return out


# ---------- K (컴포넌트) ----------

def check_K1(ctx):
    out = []
    for name, screens in ctx["dev"]["components"].items():
        if not set(screens) & set(ctx["screens"]):
            continue
        folder = ROOT / "components" / name
        if not folder.is_dir():
            out.append(v("K1", f"components/{name}/", "없음", "폴더 + data-component"))
            continue
        marker = f'data-component="{name}"'
        if not any(marker in f.read_text(encoding="utf-8", errors="replace")
                   for f in folder.rglob("*") if f.is_file() and f.suffix in (".tsx", ".ts")):
            out.append(v("K1", f"components/{name}/", "data-component 속성 없음", marker))
    return out


# ---------- N2 (키 서버 전용) ----------

def check_N2env(ctx):
    sc = ctx["dev"]["scan"]
    out = []
    pub = re.compile(r"NEXT_PUBLIC_[A-Z0-9_]+")
    allowed_dirs = tuple(d + "/" for d in sc["secret_allowed_dirs"])
    for p in walk(["."], {".ts", ".tsx", ".js", ".mjs", ".example"}, set(sc["skip_dirs"]) | {"harness"}):
        r = rel(p)
        text = p.read_text(encoding="utf-8", errors="replace")
        for m in set(pub.findall(text)):
            if m not in sc["public_env_allowed"] and re.search(r"KEY|SECRET|TOKEN", m):
                out.append(v("N2-env", r, m, "키 변수에 NEXT_PUBLIC_ 금지"))
        for name in sc["secret_env_names"]:
            if name in text and not r.startswith(allowed_dirs) and not r.endswith(".example"):
                out.append(v("N2-env", r, name, f"{sc['secret_allowed_dirs']} 안에서만"))
    return out


def secret_values():
    """로컬 .env.local의 실제 키 값 (출력하지 않는다)."""
    vals = []
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            k, _, val = line.partition("=")
            if k.strip() in ("NEIS_API_KEY", "GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY") and len(val.strip()) >= 16:
                vals.append((k.strip(), val.strip()))
    return vals


def check_N2bundle(ctx):
    sc = ctx["dev"]["scan"]
    base = ROOT / sc["bundle_dir"]
    if not base.exists():
        raise CannotJudge(f"{sc['bundle_dir']} 없음 (npm run build 먼저)")
    pats = {k: re.compile(p) for k, p in sc["bundle_patterns"].items()}
    secrets = secret_values()
    out = []
    for p in base.rglob("*"):
        if not p.is_file() or p.suffix not in (".js", ".json", ".html", ".txt"):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        for k, pat in pats.items():
            if pat.search(text):
                out.append(v("N2-bundle", rel(p), k, "0"))
        for name in sc["secret_env_names"]:
            if name in text:
                out.append(v("N2-bundle", rel(p), f"변수 이름 {name}", "0"))
        for name, val in secrets:
            if val in text:
                out.append(v("N2-bundle", rel(p), f"{name} 실제 값", "0"))
    return out


# ---------- 테스트 기반 규칙 (Playwright 제목의 [규칙ID]) ----------

def e2e_results(ctx):
    if "e2e" in ctx:
        return ctx["e2e"]
    require_package()
    out_file = ROOT / "test-results" / "judge-e2e.json"
    out_file.parent.mkdir(exist_ok=True)
    cmd = ctx["dev"]["commands"]["e2e"]
    if ctx.get("screen"):
        cmd += f' --grep "\\[S{ctx["screen"]}g?\\]|\\[S\\*\\]"'
    env = dict(os.environ, PLAYWRIGHT_JSON_OUTPUT_NAME=str(out_file))
    p = subprocess.run(cmd, cwd=ROOT, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env, timeout=5400)
    if not out_file.exists():
        raise CannotJudge("Playwright JSON 결과 없음: " + "\n".join((p.stdout + p.stderr).splitlines()[-5:]))
    data = json.loads(out_file.read_text(encoding="utf-8"))
    tests = []

    def visit(suite, prefix=""):
        for s in suite.get("suites", []):
            visit(s, prefix + s.get("title", "") + " ")
        for spec in suite.get("specs", []):
            title = prefix + spec.get("title", "")
            ok = all(r.get("status") in ("passed", "skipped") for t in spec.get("tests", []) for r in t.get("results", [])) \
                and spec.get("ok", True)
            tests.append((title, ok))
    for s in data.get("suites", []):
        visit(s)
    ctx["e2e"] = tests
    return tests


def check_test_rule(rule):
    def check(ctx):
        if rule == "N1-d" and 14 not in ctx["screens"]:
            return []
        if rule.startswith("GM-") and not set(ctx["dev"].get("guest_screens", [])) & set(ctx["screens"]):
            return []
        tests = [(t, ok) for t, ok in e2e_results(ctx) if f"[{rule}]" in t]
        if not tests:
            return [v(rule, "tests/", "테스트 없음", f"제목에 [{rule}] 포함 테스트 ≥ 1")]
        return [v(rule, t, "실패", "통과") for t, ok in tests if not ok]
    return check


def check_V1(ctx):
    """보고만: tests가 남긴 스크린샷 수. 실패로 세지 않는다."""
    shots = sorted(rel(p) for p in (ROOT / "test-results").rglob("v1-*.png")) if (ROOT / "test-results").exists() else []
    ctx["report"]["V1"] = {"screenshots": shots, "figma_page": read_json(SOURCE).get("figma_file")}
    return []


CHECKS = {
    "S1": check_S1, "F2": check_F2, "Q1": check_Q("Q1"), "Q2": check_Q("Q2"),
    "T1": check_T1, "T2": check_T2, "K1": check_K1,
    "N2-env": check_N2env, "N2-bundle": check_N2bundle, "V1": check_V1,
}
for _r in ("N1-db", "R-db", "R-ui", "C1", "C2", "N1-ui", "N1-d", "GM-ui", "GM-db"):
    CHECKS[_r] = check_test_rule(_r)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--gate", choices=["D0", "D1", "D2", "D3", "D4"])
    ap.add_argument("--run")
    ap.add_argument("--screen", type=int)
    ap.add_argument("--hash", action="store_true")
    a = ap.parse_args()

    dev = json.loads(DEV_RULES.read_text(encoding="utf-8"))
    if a.hash:
        print(tree_hash(dev))
        return 0
    if not (a.gate and a.run):
        ap.error("--gate 와 --run 이 필요하다")
    run = Path(a.run)
    if not run.is_absolute():
        run = ROOT / run
    name = f"gate-{a.gate}" + (f"-S{a.screen}" if a.gate == "D3" and a.screen else "")
    out_path = run / "judge" / f"{name}.json"

    def write(result):
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        if not run.is_dir():
            raise CannotJudge(f"실행 폴더 없음 {run}")
        inp = read_json(run / "input.json")
        ctx = {"dev": dev, "state": read_json(run / "state.json"), "logs": {}, "report": {},
               "screen": a.screen,
               "screens": [a.screen] if a.screen else inp.get("screens", dev["mvp_screens"])}
        if a.gate == "D3" and not a.screen:
            raise CannotJudge("D3은 --screen 필요")
        violations = []
        for rule in dev["gates"][a.gate]:
            violations += CHECKS[rule](ctx)
    except CannotJudge as e:
        write({"gate": name, "pass": False, "exit": 2, "reason": str(e), "violations": []})
        print(f"{name}: 판정 불가 — {e}\n결과: {out_path}")
        return 2
    code = 0 if not violations else 1
    write({"gate": name, "pass": code == 0, "exit": code, "violations": violations,
           "logs": ctx["logs"], "report": ctx["report"]})
    print(f"{name}: {'통과' if code == 0 else '실패'} · 위반 {len(violations)}건\n결과: {out_path}")
    return code


if __name__ == "__main__":
    sys.exit(main())
