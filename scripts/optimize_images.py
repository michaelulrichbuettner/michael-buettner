"""Regenerate web images from retained originals. Requires Pillow."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    'automatisierter-portfolio-tracker-datenfluss.png',
    'ki-automatisierung-effiziente-workflows.png',
    'low-code-ki-entwicklungspfad.jpg',
    'weg-zu-207-millionen-visits.jpg',
    'kampf-um-die-distributionshoheit-medien.png',
    'workflow-automatisierter-stellen-check.png',
]

def main():
    output = ROOT / 'assets/img/optimized'
    output.mkdir(exist_ok=True)
    for filename in SOURCES:
        source = ROOT / 'assets/img' / filename
        with Image.open(source) as image:
            target = output / (source.stem + '.webp')
            image.save(target, 'WEBP', quality=92, method=6)
            print(f'{filename}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes', flush=True)
            if filename == SOURCES[-1]:
                continue
            for width in (640, 1280):
                if width >= image.width:
                    continue
                height = round(image.height * width / image.width)
                thumbnail = image.resize((width, height), Image.Resampling.LANCZOS)
                thumbnail.save(output / f'{source.stem}-{width}.webp', 'WEBP', quality=90, method=6)

if __name__ == '__main__':
    main()
