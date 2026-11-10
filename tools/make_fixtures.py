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

# ---- Harder scenes: a card held in a hand, the way people really scan IDs ----
def make_card():
    """An ID-style card: cream face with text and a picture, a white strip with a dense code block."""
    W, H = 1012, 638
    c = Image.new("RGB", (W, H), (236, 222, 196))
    d = ImageDraw.Draw(c)
    d.rectangle((640, 0, W, H), fill=(246, 246, 244))
    rnd = random.Random(7)
    for y in range(40, H - 40, 9):
        for x in range(680, W - 40, 9):
            if rnd.random() < 0.5: d.rectangle((x, y, x + 8, y + 8), fill=(20, 20, 24))
    d.rectangle((40, 60, 210, 280), fill=(60, 80, 130)); d.ellipse((80, 90, 170, 190), fill=(205, 170, 80))
    for i, wdt in enumerate([360, 300, 420, 260, 380]):
        d.rectangle((250, 80 + i * 64, 250 + wdt, 104 + i * 64), fill=(40, 34, 30))
    d.rectangle((60, 380, 560, 410), fill=(60, 50, 44)); d.rectangle((60, 450, 420, 476), fill=(60, 50, 44))
    d.ellipse((440, 440, 600, 600), outline=(170, 110, 80), width=10)
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, W - 1, H - 1), radius=34, fill=255)
    return c, m

def hand_photo(size, corners, fingers, name, seed, bg=(34, 30, 34), skin=(150, 104, 84), light=(1.0, 0.7)):
    """corners: where the card's four corners land, in order top-left, top-right, bottom-right, bottom-left
    of the card itself. fingers: ellipses (cx, cy, rx, ry, angle) drawn over the card, sticking out past its edge."""
    rnd = np.random.default_rng(seed)
    W, H = size
    yy, xx = np.mgrid[0:H, 0:W]
    base = np.zeros((H, W, 3), float)
    for c in range(3):
        base[..., c] = bg[c] + 14 * np.sin(xx / 90.0 + yy / 130.0) + 10 * np.cos(yy / 57.0) + rnd.normal(0, 5, (H, W))
    img = Image.fromarray(np.clip(base, 0, 255).astype("uint8"))
    # the palm behind the card
    palm = Image.new("L", (W, H), 0)
    xs = [p[0] for p in corners]; ys = [p[1] for p in corners]
    cx, cy = sum(xs) / 4, sum(ys) / 4
    ImageDraw.Draw(palm).ellipse((cx - (max(xs) - min(xs)) * 0.62, cy - (max(ys) - min(ys)) * 0.5, cx + (max(xs) - min(xs)) * 0.66, cy + (max(ys) - min(ys)) * 0.72), fill=255)
    palm = palm.filter(ImageFilter.GaussianBlur(14))
    img = Image.composite(Image.new("RGB", (W, H), skin), img, palm)
    card, cm = make_card()
    cw, ch = card.size
    src = [(0, 0), (cw, 0), (cw, ch), (0, ch)]
    k = coeffs(src, corners)
    warped = card.transform((W, H), Image.PERSPECTIVE, k, Image.BICUBIC)
    mask = cm.transform((W, H), Image.PERSPECTIVE, k, Image.BICUBIC)
    img.paste(warped, (0, 0), mask)
    # fingers on top, each a little lighter along one side like real knuckles
    for (fx, fy, rx, ry, ang) in fingers:
        f = Image.new("L", (W, H), 0)
        e = Image.new("L", (int(rx * 2), int(ry * 2)), 0)
        ImageDraw.Draw(e).ellipse((0, 0, rx * 2 - 1, ry * 2 - 1), fill=255)
        e = e.rotate(ang, expand=True)
        f.paste(e, (int(fx - e.size[0] / 2), int(fy - e.size[1] / 2)))
        f = f.filter(ImageFilter.GaussianBlur(3))
        tone = tuple(int(v * rnd.uniform(0.92, 1.1)) for v in skin)
        img = Image.composite(Image.new("RGB", (W, H), tone), img, f)
    arr = np.asarray(img).astype(float)
    g = light[0] + (light[1] - light[0]) * ((xx / W) * 0.5 + (yy / H) * 0.5)
    arr *= g[..., None]
    arr += rnd.normal(0, 4, arr.shape)
    out_img = Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1.6))
    out_img.save(os.path.join(out, name), quality=86)

def ordered(corners):
    """The same corners in image order: top-left, top-right, bottom-right, bottom-left."""
    cx = sum(p[0] for p in corners) / 4; cy = sum(p[1] for p in corners) / 4
    import math
    pts = sorted(corners, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    i = min(range(4), key=lambda j: pts[j][0] + pts[j][1])
    return [list(pts[(i + j) % 4]) for j in range(4)]

# A card held upright (turned a quarter), a thumb over its right edge near the top and fingertips at the bottom left.
c1 = [(1180, 330), (1230, 1660), (330, 1700), (300, 370)]
hand_photo((1500, 2000), c1, [(1330, 560, 230, 100, 12), (1310, 1250, 200, 90, -6), (270, 1540, 190, 90, 30)], "photo-hand-1.jpg", 11)
truth["photo-hand-1.jpg"] = ordered(c1)
# Lying flat and tilted, in poorer light, pale skin close to the card's own colour, a thumb from below.
c2 = [(260, 520), (1650, 430), (1730, 1260), (310, 1390)]
hand_photo((2000, 1500), c2, [(1000, 1440, 240, 100, 80), (1820, 700, 220, 95, 0), (200, 980, 200, 90, 5)], "photo-hand-2.jpg", 12, bg=(52, 46, 40), skin=(206, 172, 142), light=(0.95, 0.6))
truth["photo-hand-2.jpg"] = ordered(c2)
# Filling the photo, close to its right edge, fingers along the right side, on a lighter cloth.
c3 = [(1440, 150), (1462, 1850), (380, 1880), (350, 190)]
hand_photo((1500, 2000), c3, [(1470, 700, 180, 92, 4), (1480, 1300, 170, 88, -3), (330, 1100, 210, 92, 3)], "photo-hand-3.jpg", 13, bg=(96, 92, 88), skin=(176, 130, 104), light=(1.0, 0.8))
truth["photo-hand-3.jpg"] = ordered(c3)

# A long narrow receipt on a dark counter, turned a little.
receipt = page.crop((100, 100, 800, 2100))
truth["photo-receipt.jpg"] = photo(receipt, (1500, 2000), [(560, 180), (1010, 215), (960, 1830), (500, 1800)], (58, 54, 52), (1.0, 0.75), "photo-receipt.jpg", 4)

import json
json.dump(truth, open(os.path.join(out, "truth.json"), "w"))
print("done")
