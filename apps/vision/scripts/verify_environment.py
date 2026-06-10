import sys
import platform


def check_python_version():
    version = sys.version_info
    major, minor = version.major, version.minor
    if major >= 3 and minor >= 11:
        return True, f"Python {major}.{minor}.{version.micro}"
    return False, f"Python {major}.{minor}.{version.micro} (requires >= 3.11)"


def check_import(name):
    try:
        __import__(name)
        return True, f"{name} imported successfully"
    except ImportError as e:
        return False, f"{name} import failed: {e}"


def main():
    print("=" * 50)
    print("  EXAMSHIELD Vision - Environment Verification")
    print("=" * 50)
    print()

    results = []

    ok, msg = check_python_version()
    results.append(("Python Version", ok, msg))

    packages = [
        ("ultralytics", "ultralytics"),
        ("supervision", "supervision"),
        ("cv2", "opencv-python"),
        ("numpy", "numpy"),
        ("PIL", "pillow"),
        ("psutil", "psutil"),
    ]

    for import_name, display_name in packages:
        ok, msg = check_import(import_name)
        results.append((display_name, ok, msg))

    print(f"{'CHECK':<20} {'STATUS':<8} {'DETAILS'}")
    print("-" * 50)

    all_pass = True
    for name, ok, msg in results:
        status = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"{name:<20} {status:<8} {msg}")

    print("-" * 50)
    if all_pass:
        print("RESULT: ALL CHECKS PASSED")
    else:
        print("RESULT: SOME CHECKS FAILED")
        sys.exit(1)

    print()
    print(f"Platform: {platform.platform()}")
    print(f"Processor: {platform.processor()}")


if __name__ == "__main__":
    main()
