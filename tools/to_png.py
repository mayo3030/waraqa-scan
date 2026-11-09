"""Converts the pipeline test's raw outputs (tests/fixtures/out/*.rgba) to PNG."""
import struct, glob
from PIL import Image
for p in glob.glob("tests/fixtures/out/*.rgba"):
    b = open(p, "rb").read(); w, h = struct.unpack("<II", b[:8])
    Image.frombytes("RGBA", (w, h), b[8:]).convert("RGB").save(p[:-5] + ".png")
