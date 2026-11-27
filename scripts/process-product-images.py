from pathlib import Path
import shutil
import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "خلفية بيضاء جديدة"
BACKGROUND = ROOT / "خلفية المنتجات.png"
READY = ROOT / "جاهز للرفع"
ARCHIVE = ROOT / "خلفية بيضاء مكتملة"

READY.mkdir(exist_ok=True)
ARCHIVE.mkdir(exist_ok=True)

bg = Image.open(BACKGROUND).convert("RGBA")

def remove_edge_white(im: Image.Image) -> Image.Image:
    rgba = np.array(im.convert("RGBA"))
    rgb = rgba[:, :, :3]
    # Only remove near-white pixels connected to the outer canvas, preserving white labels.
    near_white = ((rgb.min(axis=2) >= 238) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 18)).astype(np.uint8)
    flood = near_white.copy()
    h, w = near_white.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[y, x]:
            cv2.floodFill(flood, mask, (x, y), 2)
            mask.fill(0)
    edge_bg = flood == 2
    alpha = np.where(edge_bg, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.0)
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")

def make_composite(src: Path) -> Image.Image:
    src_im = Image.open(src).convert("RGBA")
    cutout = remove_edge_white(src_im)
    # Fit the source consistently while retaining the original product proportions.
    max_side = 1060
    scale = min(max_side / cutout.width, max_side / cutout.height, 1.0)
    if scale != 1.0:
        cutout = cutout.resize((round(cutout.width * scale), round(cutout.height * scale)), Image.Resampling.LANCZOS)
    canvas = bg.resize((1240, 1240), Image.Resampling.LANCZOS)
    x = (canvas.width - cutout.width) // 2
    y = (canvas.height - cutout.height) // 2 + 10
    # A restrained grounding shadow keeps the generated catalog look consistent.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ellipse = Image.new("L", (max(80, cutout.width // 2), max(20, cutout.height // 18)), 0)
    ellipse = ellipse.filter(ImageFilter.GaussianBlur(12))
    shadow.paste((80, 30, 70, 55), ((canvas.width - ellipse.width) // 2, min(canvas.height - ellipse.height - 40, y + cutout.height - 15)), ellipse)
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(cutout, (x, y))
    return canvas

processed = 0
skipped = 0
for src in sorted(SOURCE.iterdir()):
    if not src.is_file() or src.suffix.lower() not in {".webp", ".png", ".jpg", ".jpeg"}:
        continue
    out = READY / f"{src.stem}.webp"
    try:
        make_composite(src).convert("RGB").save(out, "WEBP", quality=92, method=6)
        shutil.move(str(src), str(ARCHIVE / src.name))
        processed += 1
    except Exception as exc:
        skipped += 1
        print(f"SKIP {src.name}: {exc}")

print(f"processed={processed} skipped={skipped} ready={len(list(READY.iterdir()))} archived={len(list(ARCHIVE.iterdir()))}")
