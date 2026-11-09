"""Converts fixture JPGs to raw RGBA (width, height header) for Node tests."""
import sys, struct
from PIL import Image
for p in sys.argv[1:]:
    im = Image.open(p).convert("RGBA")
    with open(p + ".rgba", "wb") as f:
        f.write(struct.pack("<II", *im.size)); f.write(im.tobytes())
