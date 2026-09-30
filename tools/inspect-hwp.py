#!/usr/bin/env python3
"""Read HWP5 equation metadata without rendering or copying document text.

Requires olefile; Pillow is optional for reading the embedded preview dimensions.
Usage: python tools/inspect-hwp.py input.hwp --output artifacts/local-reference
The report contains hashes/lengths, not equation scripts or body text. The optional
embedded PrvImage remains local reference material and must not be committed.
"""

from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import statistics
import struct
import zlib

import olefile


class Reader:
    def __init__(self, data: bytes):
        self.data, self.offset = data, 0

    def number(self, fmt: str):
        count = struct.calcsize('<' + fmt)
        if self.offset + count > len(self.data):
            raise ValueError('truncated record field')
        value = struct.unpack_from('<' + fmt, self.data, self.offset)[0]
        self.offset += count
        return value

    def string(self) -> str:
        count = self.number('H') * 2
        if self.offset + count > len(self.data):
            raise ValueError('truncated UTF-16 string')
        result = self.data[self.offset:self.offset + count].decode('utf-16le')
        self.offset += count
        return result


def records(data: bytes):
    offset = 0
    while offset < len(data):
        start = offset
        if offset + 4 > len(data):
            raise ValueError(f'truncated record header at {offset}')
        header = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        tag, level, size = header & 1023, (header >> 10) & 1023, header >> 20
        if size == 4095:
            if offset + 4 > len(data):
                raise ValueError('truncated extended record length')
            size = struct.unpack_from('<I', data, offset)[0]
            offset += 4
        if offset + size > len(data):
            raise ValueError(f'truncated tag {tag} at {start}')
        yield tag, level, data[offset:offset + size], start
        offset += size


def equation_record(data: bytes) -> dict:
    reader = Reader(data)
    flags = reader.number('I')
    script = reader.string()
    font_size, color = reader.number('I'), reader.number('I')
    baseline, reserved = reader.number('h'), reader.number('H')
    version = reader.string() if reader.offset < len(data) else None
    font_name = reader.string() if reader.offset < len(data) else None
    return {
        'flags': flags, 'lineMode': bool(flags & 1),
        'scriptLength': len(script), 'scriptSha256': sha256(script.encode()).hexdigest(),
        'fontSizeHwpunit': font_size, 'fontSizePt': font_size / 100,
        'colorRef': color, 'baselineRaw': baseline, 'reservedU16': reserved,
        'version': version, 'fontName': font_name,
        'unparsedTrailingBytes': len(data) - reader.offset,
    }


def equation_object(data: bytes) -> dict | None:
    if len(data) < 28 or struct.unpack_from('<I', data)[0] != int.from_bytes(b'eqed', 'big'):
        return None
    attr, voff, hoff, width, height, zorder = struct.unpack_from('<IIIIIi', data, 4)
    return {
        'attr': attr, 'treatAsChar': bool(attr & 1),
        'affectLineSpacing': bool(attr & 4), 'widthHwpunit': width,
        'heightHwpunit': height, 'widthPt': width / 100, 'heightPt': height / 100,
        'verticalOffsetRaw': voff, 'horizontalOffsetRaw': hoff, 'zOrder': zorder,
    }


def distribution(values: list) -> dict:
    counts = Counter(values)
    return {str(key): value for key, value in sorted(counts.items(), key=lambda item: str(item[0]))}


def numeric_summary(values: list[int | float]) -> dict:
    if not values:
        return {}
    return {'min': min(values), 'max': max(values), 'median': statistics.median(values),
            'mean': round(statistics.mean(values), 6)}


def inspect(path: Path, output: Path, *, preview: bool = True) -> dict:
    source = path.read_bytes()
    output.mkdir(parents=True, exist_ok=True)
    equations, faces, errors = [], [], []
    preview_record = None
    with olefile.OleFileIO(path) as compound:
        header = compound.openstream('FileHeader').read()
        if not header.startswith(b'HWP Document File') or len(header) < 40:
            raise ValueError('not a supported HWP5 file')
        version = '.'.join(str(part) for part in header[32:36][::-1])
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 2:
            raise ValueError('password-encrypted HWP files are not supported')
        if flags & 4:
            raise ValueError('distribution-protected HWP files are not supported')
        compressed = bool(flags & 1)

        def stream(name):
            data = compound.openstream(name).read()
            return zlib.decompress(data, -15) if compressed else data

        for tag, level, data, offset in records(stream('DocInfo')):
            if tag == 19:  # HWPTAG_FACE_NAME
                try:
                    reader = Reader(data)
                    attr, name = reader.number('B'), reader.string()
                    faces.append({'name': name, 'flags': attr})
                except (ValueError, UnicodeError) as error:
                    errors.append({'stream': 'DocInfo', 'offset': offset, 'error': str(error)})
        section_names = sorted(parts for parts in compound.listdir() if len(parts) == 2 and parts[0] == 'BodyText')
        for parts in section_names:
            name = '/'.join(parts)
            ancestor_controls = []
            for tag, level, data, offset in records(stream(parts)):
                ancestor_controls = [(depth, obj) for depth, obj in ancestor_controls if depth < level]
                if tag == 71:  # HWPTAG_CTRL_HEADER
                    ancestor_controls.append((level, equation_object(data)))
                if tag != 88:  # HWPTAG_EQEDIT
                    continue
                try:
                    equation = equation_record(data)
                    equation.update({'index': len(equations), 'stream': name, 'recordOffset': offset, 'recordLevel': level})
                    parent = next((obj for _, obj in reversed(ancestor_controls) if obj is not None), None)
                    equation['savedObject'] = parent
                    equations.append(equation)
                except (ValueError, UnicodeError) as error:
                    errors.append({'stream': name, 'offset': offset, 'error': str(error)})
        if preview and compound.exists('PrvImage'):
            data = compound.openstream('PrvImage').read()
            extension = '.png' if data.startswith(b'\x89PNG\r\n\x1a\n') else '.jpg' if data.startswith(b'\xff\xd8') else '.bin'
            preview_path = output / ('embedded-preview' + extension)
            preview_path.write_bytes(data)
            preview_record = {'path': str(preview_path.resolve()), 'sha256': sha256(data).hexdigest(),
                              'bytes': len(data), 'source': 'HWP PrvImage stream, copied byte-for-byte',
                              'limitation': 'Saved thumbnail only; not a fresh Hancom render and not a full-page ground-truth output.'}
            try:
                from PIL import Image
                with Image.open(BytesIO(data)) as image:
                    preview_record.update({'pixelSize': list(image.size), 'mode': image.mode})
            except (ImportError, OSError):
                pass

    objects = [row['savedObject'] for row in equations if row['savedObject']]
    report = {
        'source': {'path': str(path.resolve()), 'sha256': sha256(source).hexdigest(), 'bytes': len(source),
                   'hwpVersion': version, 'flags': flags, 'compressed': compressed},
        'scope': 'Stored HWP5 metadata only; no inference of correct rendering, font availability, or embedding permission.',
        'equationCount': len(equations), 'parsedEquationErrors': errors,
        'equationFontNames': distribution([row['fontName'] for row in equations]),
        'equationFontSizePt': distribution([row['fontSizePt'] for row in equations]),
        'equationBaselineRaw': distribution([row['baselineRaw'] for row in equations]),
        'equationBaselineSummary': numeric_summary([row['baselineRaw'] for row in equations]),
        'equationColorRef': distribution([row['colorRef'] for row in equations]),
        'equationVersions': distribution([row['version'] for row in equations]),
        'lineModeCounts': distribution([row['lineMode'] for row in equations]),
        'savedObjectCount': len(objects), 'savedWidthPt': numeric_summary([o['widthPt'] for o in objects]),
        'savedHeightPt': numeric_summary([o['heightPt'] for o in objects]),
        'treatAsCharCounts': distribution([o['treatAsChar'] for o in objects]),
        'documentFontRecords': faces, 'embeddedPreview': preview_record,
        'equations': equations,
    }
    (output / 'metadata.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('artifacts/local-reference'))
    parser.add_argument('--no-preview', action='store_true')
    args = parser.parse_args()
    report = inspect(args.source, args.output, preview=not args.no_preview)
    compact = {key: value for key, value in report.items() if key not in ('equations', 'documentFontRecords')}
    compact['uniqueDocumentFontNames'] = sorted({item['name'] for item in report['documentFontRecords']})
    print(json.dumps(compact, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
