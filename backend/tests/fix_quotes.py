"""Fix escaped triple quotes in source files."""
import os
import glob

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(root, "src")

fixed_count = 0

for pattern in ["**/*.py"]:
    for filepath in glob.glob(os.path.join(src_dir, pattern), recursive=True):
        with open(filepath, "rb") as f:
            data = f.read()
        
        # Check for escaped triple quotes: \"\"\" (literal backslash-quote sequences)
        bad = b'\\"\\"\\"'
        if bad in data:
            fixed = data.replace(bad, b'"""')
            with open(filepath, "wb") as f:
                f.write(fixed)
            fixed_count += 1
            print(f"Fixed: {filepath}")

print(f"\nTotal files fixed: {fixed_count}")
