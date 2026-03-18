"""Generate favicon files programmatically with Pillow."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import math
import os

BASE_DIR = r"c:\Users\Educacross\Dev\Senhas\frontend\public"


def lerp_color(c1, c2, t):
    """Linearly interpolate between two RGB colors."""
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_favicon(size):
    """Draw the Senhas favicon at the given size."""
    # Brand colors
    indigo_start = (99, 102, 241)   # #6366f1
    indigo_end = (129, 140, 248)    # #818cf8
    pink = (236, 72, 153)           # #ec4899

    # Scale factor
    s = size / 512.0
    corner_r = int(96 * s)

    # --- Background gradient using numpy (fast) ---
    y_arr = np.linspace(0, 1, size).reshape(size, 1)
    x_arr = np.linspace(0, 1, size).reshape(1, size)
    t = (x_arr + y_arr) / 2.0  # diagonal gradient factor

    r = (indigo_start[0] + (indigo_end[0] - indigo_start[0]) * t).astype(np.uint8)
    g = (indigo_start[1] + (indigo_end[1] - indigo_start[1]) * t).astype(np.uint8)
    b = (indigo_start[2] + (indigo_end[2] - indigo_start[2]) * t).astype(np.uint8)
    a = np.full((size, size), 255, dtype=np.uint8)

    pixels = np.stack([r, g, b, a], axis=-1)
    bg_img = Image.fromarray(pixels, "RGBA")

    # Create rounded rectangle mask
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner_r, fill=255)

    # Apply mask
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(bg_img, mask=mask)
    draw = ImageDraw.Draw(img)

    # --- Ticket body (white rounded rect) ---
    cx, cy = size // 2, size // 2
    tw, th = int(300 * s), int(240 * s)  # ticket width/height
    tr = int(24 * s)  # ticket corner radius
    tx1, ty1 = cx - tw // 2, cy - th // 2
    tx2, ty2 = cx + tw // 2, cy + th // 2
    draw.rounded_rectangle([tx1, ty1, tx2, ty2], radius=tr, fill=(255, 255, 255, 242))

    # --- Ticket notches (semicircles on left and right) ---
    notch_r = int(22 * s)
    # Left notch
    draw.ellipse(
        [tx1 - notch_r, cy - notch_r, tx1 + notch_r, cy + notch_r],
        fill=lerp_color(indigo_start, indigo_end, 0.3) + (255,),
    )
    # Right notch
    draw.ellipse(
        [tx2 - notch_r, cy - notch_r, tx2 + notch_r, cy + notch_r],
        fill=lerp_color(indigo_start, indigo_end, 0.7) + (255,),
    )

    # --- Dashed separator lines ---
    dash_y = cy
    dash_color = (199, 210, 254, 255)  # #c7d2fe
    dash_w = max(int(3 * s), 1)
    dash_len = int(8 * s)
    dash_gap = int(6 * s)

    # Left dashes
    x = tx1 + int(30 * s)
    end_x = cx - int(50 * s)
    while x < end_x:
        x2 = min(x + dash_len, end_x)
        draw.line([(x, dash_y), (x2, dash_y)], fill=dash_color, width=dash_w)
        x += dash_len + dash_gap

    # Right dashes
    x = cx + int(50 * s)
    end_x = tx2 - int(30 * s)
    while x < end_x:
        x2 = min(x + dash_len, end_x)
        draw.line([(x, dash_y), (x2, dash_y)], fill=dash_color, width=dash_w)
        x += dash_len + dash_gap

    # --- Big "S" letter ---
    font_size = int(140 * s)
    try:
        font = ImageFont.truetype("arialbd.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Draw S with gradient effect (indigo)
    s_color = lerp_color(indigo_start, indigo_end, 0.3)
    bbox = draw.textbbox((0, 0), "S", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = cx - text_w // 2 - bbox[0]
    text_y = cy - text_h // 2 - bbox[1] - int(8 * s)
    draw.text((text_x, text_y), "S", fill=s_color + (255,), font=font)

    # --- Pink sparkle accent (top-right) ---
    sparkle_cx = cx + int(90 * s)
    sparkle_cy = cy - int(70 * s)
    sp_size = int(18 * s)
    sparkle_points = []
    for i in range(8):
        angle = math.pi * i / 4
        r = sp_size if i % 2 == 0 else int(sp_size * 0.35)
        px = sparkle_cx + r * math.sin(angle)
        py = sparkle_cy - r * math.cos(angle)
        sparkle_points.append((px, py))
    if len(sparkle_points) >= 3:
        draw.polygon(sparkle_points, fill=pink + (230,))

    # --- Detail lines (bottom section) ---
    line_color = (224, 231, 255, 255)  # #e0e7ff
    line_h = max(int(8 * s), 2)
    line_r = max(int(4 * s), 1)
    line_y = cy + int(40 * s)
    draw.rounded_rectangle(
        [cx - int(100 * s), line_y, cx - int(20 * s), line_y + line_h],
        radius=line_r, fill=line_color,
    )
    draw.rounded_rectangle(
        [cx - int(100 * s), line_y + int(18 * s), cx - int(45 * s), line_y + int(18 * s) + line_h],
        radius=line_r, fill=line_color,
    )

    return img


# Generate all sizes
output_sizes = {
    "favicon-16x16.png": 16,
    "favicon-32x32.png": 32,
    "apple-touch-icon.png": 180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
}

images = {}
for filename, sz in output_sizes.items():
    img = draw_favicon(sz)
    path = os.path.join(BASE_DIR, filename)
    img.save(path, "PNG")
    images[sz] = img
    print(f"Created {filename} ({sz}x{sz})")

# Generate ICO
ico_path = os.path.join(BASE_DIR, "favicon.ico")
img32 = images[32].copy()
img16 = images[16].copy()
img32.save(ico_path, format="ICO", sizes=[(32, 32), (16, 16)], append_images=[img16])
print(f"Created favicon.ico (16x16 + 32x32)")

print("\nAll favicon files generated successfully!")
