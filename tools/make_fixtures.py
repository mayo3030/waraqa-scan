"""Generates photographed-document test images (a page lying on a table)."""
import random, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
F = "/usr/share/fonts/truetype/dejavu/"
def font(name, size): return ImageFont.truetype(F + name, size)

def make_page():
    W, H = 1700, 2200
    p = Image.new("RGB", (W, H), (250, 249, 245))
    d = ImageDraw.Draw(p)
    d.text((120, 120), "BILL OF SALE", font=font("DejaVuSans-Bold.ttf", 78), fill=(20, 20, 30))
    d.text((120, 220), "Motor Vehicle  |  Example document for testing", font=font("DejaVuSans.ttf", 34), fill=(70, 70, 80))
    d.line((120, 290, 1580, 290), fill=(30, 30, 40), width=4)
    rows = [("Seller", "Example Motors LLC"), ("Buyer", "Sample Customer"), ("Vehicle", "2019 Toyota Camry SE"),
            ("VIN", "4T1B11HK5KU000000"), ("Odometer", "48,210 miles"), ("Sale price", "$17,450.00"), ("Date", "November 9, 2026")]
    y = 360
    for k, v in rows:
        d.text((120, y), k, font=font("DejaVuSans-Bold.ttf", 40), fill=(25, 25, 35))
        d.text((560, y), v, font=font("DejaVuSans.ttf", 40), fill=(25, 25, 35))
        d.line((560, y + 56, 1580, y + 56), fill=(180, 180, 185), width=2)
        y += 110
    para = ("The seller transfers ownership of the vehicle described above to the buyer for the sale price "
            "shown. The vehicle is sold as is, with no warranty, unless written otherwise below. Both parties "
            "confirm the odometer reading is accurate to the best of their knowledge.")
    words, line, y = para.split(), "", y + 40
    f = font("DejaVuSerif.ttf", 36)
    for w in words:
        t = (line + " " + w).strip()
        if d.textlength(t, font=f) > 1460:
            d.text((120, y), line, font=f, fill=(35, 35, 45)); y += 58; line = w
        else:
            line = t
    d.text((120, y), line, font=f, fill=(35, 35, 45))
    for i, lab in enumerate(["Seller signature", "Buyer signature"]):
        x = 120 + i * 760
        d.line((x, 2000, x + 680, 2000), fill=(30, 30, 40), width=3)
        d.text((x, 2015), lab, font=font("DejaVuSans.ttf", 30), fill=(70, 70, 80))
    d.line((140, 1985, 300, 1950), fill=(30, 50, 140), width=5)
    d.line((300, 1950, 420, 1990), fill=(30, 50, 140), width=5)
    return p

def coeffs(src, dst):
    # PIL PERSPECTIVE wants the mapping from output (dst) to input (src).
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()

def photo(page, size, corners, bg, light, name, seed):
    rnd = np.random.default_rng(seed)
    W, H = size
    yy, xx = np.mgrid[0:H, 0:W]
    base = np.zeros((H, W, 3), float)
    for c in range(3):
        base[..., c] = bg[c] + 18 * np.sin(xx / 37.0 + yy / 400.0) + rnd.normal(0, 6, (H, W))
    bgimg = Image.fromarray(np.clip(base, 0, 255).astype("uint8"))
    pw, ph = page.size
    src = [(0, 0), (pw, 0), (pw, ph), (0, ph)]
    warped = page.transform((W, H), Image.PERSPECTIVE, coeffs(src, corners), Image.BICUBIC)
    mask = Image.new("L", page.size, 255).transform((W, H), Image.PERSPECTIVE, coeffs(src, corners), Image.BICUBIC)
    shadow = ImageChops.offset(mask, 18, 24).filter(ImageFilter.GaussianBlur(22))
    sh = Image.new("RGB", (W, H), (0, 0, 0))
    bgimg = Image.composite(sh, bgimg, shadow.point(lambda v: int(v * 0.35))).copy()
    bgimg.paste(warped, (0, 0), mask)
    arr = np.asarray(bgimg).astype(float)
    # uneven lighting: darker toward one corner, like a phone shadow
    g = light[0] + (light[1] - light[0]) * ((xx / W) * 0.6 + (yy / H) * 0.4)
    arr *= g[..., None]
    arr += rnd.normal(0, 3, arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(0.8))
    img.save(os.path.join(out, name), quality=88)
    return corners

page = make_page()
page.save(os.path.join(out, "page-flat.png"))
truth = {}
truth["photo-wood.jpg"] = photo(page, (1500, 2000), [(230, 250), (1290, 330), (1350, 1760), (170, 1690)], (120, 82, 50), (1.0, 0.72), "photo-wood.jpg", 1)
truth["photo-desk.jpg"] = photo(page, (2000, 1500), [(520, 120), (1500, 190), (1640, 1390), (360, 1330)], (72, 76, 84), (0.95, 0.8), "photo-desk.jpg", 2)
truth["photo-light.jpg"] = photo(page, (1500, 2000), [(160, 210), (1330, 160), (1400, 1850), (110, 1880)], (200, 196, 188), (1.0, 0.85), "photo-light.jpg", 3)
import json
json.dump(truth, open(os.path.join(out, "truth.json"), "w"))
print("done")
