"""Fix all escaped quotes in source files."""
import glob
import os

src_dir = "src"
fixed_files = []

for filepath in glob.glob(os.path.join(src_dir, "**", "*.py"), recursive=True):
    with open(filepath, "rb") as f:
        data = f.read()
    
    # Fix backslash-quote: \" -> "
    # In the raw bytes this is b'\x5c\x22'
    bad_seq = bytes([0x5c, 0x22])  # \"
    if bad_seq in data:
        fixed = data.replace(bad_seq, bytes([0x22]))  # replace with just "
        with open(filepath, "wb") as f:
            f.write(fixed)
        fixed_files.append(filepath)
        print(f"Fixed: {filepath} ({data.count(bad_seq)} replacements)")

print(f"\nTotal files fixed: {len(fixed_files)}")
