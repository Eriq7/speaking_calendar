#!/usr/bin/env python3
"""
AI Reminders CI 脚本。
运行所有质量检查：黄金规则 + TypeScript 类型检查（如果 frontend/ 存在）。

用法：
    cd /Users/vivianbb/Downloads/AI_Reminders
    python scripts/run_ci.py
"""
import subprocess
import sys
import os
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# 源代码目录（用于黄金原则检查）
SRC_DIRS = ["frontend/app", "frontend/components", "frontend/lib", "supabase/functions"]

# docs 目录（用于文档新鲜度检查）
DOCS_DIR = ".plans/ai-reminders/docs"


def run_golden_rules():
    """运行黄金原则检查。"""
    print("\n" + "=" * 60)
    print("步骤 1: 黄金原则检查")
    print("=" * 60)

    # 过滤存在的目录
    existing_dirs = [d for d in SRC_DIRS if (PROJECT_ROOT / d).exists()]

    if not existing_dirs:
        print("  [SKIP] 源代码目录尚不存在（项目初始化中）。")
        return 0, 0, 0

    sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
    from golden_rules import check_all

    os.chdir(PROJECT_ROOT)
    fails, warns, infos = check_all(existing_dirs, docs_dir=DOCS_DIR)
    return fails, warns, infos


def run_typescript_check():
    """运行 TypeScript 类型检查。"""
    print("\n" + "=" * 60)
    print("步骤 2: TypeScript 类型检查")
    print("=" * 60)

    if not FRONTEND_DIR.exists():
        print("  [SKIP] frontend/ 目录尚不存在（项目初始化中）。")
        return True

    result = subprocess.run(
        ["npx", "tsc", "--noEmit"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        timeout=120
    )

    if result.returncode == 0:
        print("  [OK] TypeScript 检查通过。")
        return True
    else:
        print("  [FAIL] TypeScript 错误：")
        print(result.stdout)
        print(result.stderr)
        return False


def main():
    print("=" * 60)
    print("AI Reminders CI")
    print("=" * 60)

    os.chdir(PROJECT_ROOT)

    total_fails = 0

    # 步骤 1: 黄金原则
    fails, warns, infos = run_golden_rules()
    total_fails += fails

    # 步骤 2: TypeScript 类型检查
    ts_ok = run_typescript_check()
    if not ts_ok:
        total_fails += 1

    # 汇总
    print("\n" + "=" * 60)
    print("CI 汇总")
    print("=" * 60)
    if total_fails == 0:
        print("✓ 所有检查通过")
        sys.exit(0)
    else:
        print(f"✗ {total_fails} 项检查失败 — 提交审查前必须修复")
        sys.exit(1)


if __name__ == "__main__":
    main()
